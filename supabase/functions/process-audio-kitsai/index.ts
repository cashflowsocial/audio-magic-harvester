import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Define model IDs
const MODEL_IDS: Record<string, string> = {
    "drumstick": "212569",  // Drumstick processing
    "melody": "221129"      // Melody conversion
};

// Error handling function
const handleError = async (recordingId: string | null, error: unknown, supabase: any) => {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error('Error in Kits.ai processing:', errorMessage);

  if (recordingId) {
    try {
      await supabase
        .from('recordings')
        .update({
          status: 'failed',
          error_message: `Error in Kits.ai processing: ${errorMessage}`
        })
        .eq('id', recordingId);
    } catch (updateError) {
      console.error('Error updating recording status:', updateError);
    }
  }

  return new Response(
    JSON.stringify({ error: errorMessage }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
  );
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let recordingId: string | null = null;
  let supabase: any;

  try {
    const { recordingId: reqRecordingId, type, conversionStrength = 0.5, modelVolumeMix = 0.5, pitchShift = 0 } = await req.json();
    recordingId = reqRecordingId;

    if (!recordingId) {
      throw new Error('Recording ID is required');
    }

    if (!MODEL_IDS[type]) {
      throw new Error(`Invalid processing type. Expected "drumstick" or "melody", received: ${type}`);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const kitsApiKey = Deno.env.get('KITS_API_KEY');

    if (!supabaseUrl || !supabaseKey || !kitsApiKey) {
      throw new Error('Missing required environment variables');
    }

    supabase = createClient(supabaseUrl, supabaseKey);
    console.log(`Processing recording ${recordingId} for ${type}`);

    const voiceModelId = MODEL_IDS[type];
    console.log(`Using Kits.ai voice model ID: ${voiceModelId}`);

    // Update recording status
    await supabase
      .from('recordings')
      .update({ status: 'processing', processing_type: type, error_message: null })
      .eq('id', recordingId);

    // Download file from Supabase
    const { data: recording, error: fetchError } = await supabase
      .from('recordings')
      .select('filename')
      .eq('id', recordingId)
      .maybeSingle();

    if (fetchError || !recording) {
      throw new Error(`Failed to fetch recording metadata: ${fetchError?.message || 'Recording not found'}`);
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('recordings')
      .download(recording.filename);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download audio file: ${downloadError?.message || 'File not found'}`);
    }

    // Validate file format
    const fileName = recording.filename.split('/').pop() || "recording.wav";
    const fileExtension = fileName.split('.').pop()?.toLowerCase();
    const allowedExtensions = ["wav", "mp3", "flac"];
    
    if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
      throw new Error(`Invalid file format. Allowed formats: ${allowedExtensions.join(", ")}`);
    }

    const soundFile = new File([fileData], fileName, { type: `audio/${fileExtension}` });

    // Prepare API request
    const formData = new FormData();
    formData.append('voiceModelId', voiceModelId);
    formData.append('soundFile', soundFile);
    formData.append('conversionStrength', conversionStrength.toString());
    formData.append('modelVolumeMix', modelVolumeMix.toString());
    formData.append('pitchShift', pitchShift.toString());

    // Send request to Kits.ai
    const conversionResponse = await fetch('https://arpeggi.io/api/kits/v1/voice-conversions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${kitsApiKey}` },
      body: formData
    });

    if (!conversionResponse.ok) {
      const errorText = await conversionResponse.text();
      throw new Error(`Kits.ai conversion API error: ${errorText}`);
    }

    const conversionData = await conversionResponse.json();
    const conversionId = conversionData.id;

    if (!conversionId) {
      throw new Error('No conversion ID returned from Kits.ai API');
    }

    console.log(`Created conversion with ID: ${conversionId}`);

    // Poll conversion status
    let outputFileUrl: string | null = null;
    const maxAttempts = 30;
    let delay = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      console.log(`Polling conversion ${conversionId}, attempt ${attempt + 1}`);

      const statusResponse = await fetch(
        `https://arpeggi.io/api/kits/v1/voice-conversions/${conversionId}`,
        {
          headers: { 'Authorization': `Bearer ${kitsApiKey}`, 'Content-Type': 'application/json' }
        }
      );

      if (!statusResponse.ok) {
        throw new Error(`Failed to check conversion status: ${statusResponse.status}`);
      }

      const statusData = await statusResponse.json();

      if (statusData.status === 'success') {
        outputFileUrl = statusData.outputFileUrl || statusData.lossyOutputFileUrl;
        console.log(`Conversion successful. Output URL: ${outputFileUrl}`);
        break;
      } else if (statusData.status === 'error' || statusData.status === 'failed') {
        throw new Error(`Conversion failed: ${statusData.error || 'Unknown error'}`);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 1.5, 30000);
    }

    if (!outputFileUrl) {
      throw new Error('Conversion timed out or no output URL provided');
    }

    // Update Supabase with processed file URL
    await supabase
      .from('recordings')
      .update({ status: 'completed', processed_audio_url: outputFileUrl })
      .eq('id', recordingId);

    return new Response(
      JSON.stringify({ success: true, message: `${type} conversion completed`, url: outputFileUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    return handleError(recordingId, error, supabase);
  }
});
