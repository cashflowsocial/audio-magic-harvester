
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map our frontend type names to Kits.ai model IDs
const MODEL_IDS: Record<string, string> = {
  "kits-drums": "212569",    // Gritty Tape Drums
  "kits-melody": "221129"    // Female Rock/Pop
};

// Error handling function
const handleError = async (recordingId: string | null, error: unknown, supabase: any | null) => {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error('Error in Kits.ai processing:', errorMessage);

  if (supabase && recordingId) {
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
  let supabase: any = null;

  try {
    // Parse JSON input
    const body = await req.json();
    console.log("Received request body:", JSON.stringify(body));

    const { recordingId: reqRecordingId, type, prompt, conversionStrength = 0.5, modelVolumeMix = 0.5, pitchShift = 0 } = body;
    recordingId = reqRecordingId;

    if (!recordingId) {
      throw new Error('Recording ID is required');
    }

    // Check if we have a model ID for this type
    if (!MODEL_IDS[type]) {
      throw new Error(`Invalid processing type. Expected "kits-drums" or "kits-melody", received: ${type}`);
    }
    
    const voiceModelId = MODEL_IDS[type];
    console.log(`Using voice model ID: ${voiceModelId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const kitsApiKey = Deno.env.get('KITS_API_KEY') || Deno.env.get('KITS.AI_API_KEY');

    if (!supabaseUrl || !supabaseKey || !kitsApiKey) {
      throw new Error('Missing required environment variables');
    }

    supabase = createClient(supabaseUrl, supabaseKey);
    console.log(`Processing recording ${recordingId} for ${type}`);

    // Update recording status to processing
    await supabase
      .from('recordings')
      .update({
        status: 'processing',
        processing_type: type,
        prompt: prompt || null
      })
      .eq('id', recordingId);

    // Fetch recording metadata
    const { data: recording, error: fetchError } = await supabase
      .from('recordings')
      .select('filename')
      .eq('id', recordingId)
      .maybeSingle();

    if (fetchError || !recording) {
      throw new Error(`Failed to fetch recording metadata: ${fetchError?.message || 'Recording not found'}`);
    }

    // Download file from Supabase
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('recordings')
      .download(recording.filename);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download audio file: ${downloadError?.message || 'File not found'}`);
    }

    // Validate file format and extract filename/extension
    const fileName = recording.filename;
    const fileExtension = fileName.split('.').pop()?.toLowerCase();

    if (fileExtension !== 'wav') {
      throw new Error(`Kits.ai requires WAV format. Current file extension: ${fileExtension || 'unknown'}`);
    }

    // Explicitly set the MIME type to audio/wav
    console.log(`File details before upload to Kits.ai:`);
    console.log(`- Filename: ${fileName}`);
    console.log(`- File size: ${fileData.size} bytes`);
    console.log(`- File extension: ${fileExtension}`);
    
    // Create a proper File object with the WAV data for the API
    const soundFile = new File([fileData], `recording.wav`, { 
      type: 'audio/wav'
    });

    // Prepare the form data with the correct parameters
    const formData = new FormData();
    formData.append('voiceModelId', voiceModelId);
    formData.append('soundFile', soundFile);
    formData.append('conversionStrength', conversionStrength.toString());
    formData.append('modelVolumeMix', modelVolumeMix.toString());
    formData.append('pitchShift', pitchShift.toString());

    // Log the request details
    console.log('Sending request to Kits.ai:');
    console.log(`- API endpoint: https://arpeggi.io/api/kits/v1/voice-conversions`);
    console.log(`- Voice model ID: ${voiceModelId}`);
    console.log(`- File size being sent: ${soundFile.size} bytes`);

    // Send the request to Kits.ai
    const conversionResponse = await fetch('https://arpeggi.io/api/kits/v1/voice-conversions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${kitsApiKey}` },
      body: formData
    });

    if (!conversionResponse.ok) {
      const errorText = await conversionResponse.text();
      console.error(`Kits.ai API response (${conversionResponse.status}):`, errorText);
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
      } else if (statusData.status === 'failed') {
        throw new Error(`Kits.ai conversion failed: ${statusData.errorMessage || 'Unknown error'}`);
      }

      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 1.5, 30000);
    }

    if (!outputFileUrl) {
      throw new Error('Failed to get output URL after maximum polling attempts');
    }

    // Download the processed audio from Kits.ai
    console.log(`Downloading processed audio from: ${outputFileUrl}`);
    const processedAudioResponse = await fetch(outputFileUrl);
    if (!processedAudioResponse.ok) {
      throw new Error(`Failed to download processed audio: ${processedAudioResponse.status}`);
    }

    const processedAudioBlob = await processedAudioResponse.blob();
    
    // Upload processed audio to Supabase Storage with appropriate file extension
    const processedFileName = `${type}-${Date.now()}.wav`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('recordings')
      .upload(processedFileName, processedAudioBlob, {
        contentType: 'audio/wav'
      });

    if (uploadError) {
      throw new Error(`Failed to upload processed audio: ${uploadError.message}`);
    }

    // Get public URL for the processed audio
    const { data: urlData } = await supabase.storage
      .from('recordings')
      .getPublicUrl(processedFileName);

    // Update recording with processed audio URL and status
    await supabase
      .from('recordings')
      .update({
        status: 'completed',
        processed_audio_url: urlData.publicUrl,
        processing_type: type
      })
      .eq('id', recordingId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${type} conversion completed`, 
        url: urlData.publicUrl 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    return handleError(recordingId, error, supabase);
  }
});
