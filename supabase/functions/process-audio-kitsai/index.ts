import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      const { error: updateError } = await supabase
        .from('recordings')
        .update({
          status: 'failed',
          error_message: `Error in Kits.ai processing: ${errorMessage}`
        })
        .eq('id', recordingId)
        .select();

      if (updateError) {
        console.error('Failed to update recording status:', updateError);
      }
    } catch (updateError) {
      console.error('Error updating recording status:', updateError);
    }
  }

  return new Response(
    JSON.stringify({ error: errorMessage }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 500 
    }
  );
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let recordingId: string | null = null;
  let supabase: any;

  try {
    const { recordingId: reqRecordingId, type, prompt } = await req.json();
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
    const { data: updatedRecording, error: updateError } = await supabase
      .from('recordings')
      .update({
        status: 'processing',
        processing_type: type,
        prompt: prompt || null,
        error_message: null 
      })
      .eq('id', recordingId)
      .select()
      .maybeSingle();

    if (updateError) {
      throw new Error(`Failed to update recording status: ${updateError.message}`);
    }

    if (!updatedRecording) {
      throw new Error('Recording not found in database.');
    }

    // Download recording file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('recordings')
      .download(updatedRecording.filename);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download audio file: ${downloadError?.message || 'File not found'}`);
    }

    console.log(`Downloaded recording ${updatedRecording.filename}, size: ${fileData.size} bytes`);

    // Validate file format
    if (!updatedRecording.filename.toLowerCase().endsWith('.wav') || fileData.type !== 'audio/wav') {
      throw new Error(`Invalid file format. Expected WAV but received ${fileData.type}`);
    }

    // Send file for processing
    const formData = new FormData();
    formData.append('voiceModelId', voiceModelId);
    const fileName = updatedRecording.filename.split('/').pop() || "recording.wav";
    const soundFile = new File([fileData], fileName, { type: "audio/wav" });
    formData.append('soundFile', soundFile);

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

    // Polling for conversion completion
    let outputFileUrl: string | null = null;
    const maxAttempts = 30;
    let delay = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      console.log(`Polling conversion ${conversionId}, attempt ${attempt + 1}`);

      const statusResponse = await fetch(
        `https://arpeggi.io/api/kits/v1/voice-conversions/${conversionId}`,
        {
          headers: {
            'Authorization': `Bearer ${kitsApiKey}`,
            'Content-Type': 'application/json'
          }
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

    // Update recording status
    const { error: finalUpdateError } = await supabase
      .from('recordings')
      .update({
        status: 'completed',
        processed_audio_url: outputFileUrl,
        error_message: null
      })
      .eq('id', recordingId)
      .select()
      .maybeSingle();

    if (finalUpdateError) {
      throw new Error(`Failed to update recording with processed URL: ${finalUpdateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `${type} conversion completed`,
        url: outputFileUrl
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    return handleError(recordingId, error, supabase);
  }
});
