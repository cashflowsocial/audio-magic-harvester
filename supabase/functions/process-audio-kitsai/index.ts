
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handleError = async (recordingId: string | null, error: unknown, supabase: any) => {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  console.error('Error in Kits.ai processing:', errorMessage);
  if (error instanceof Error && error.stack) {
    console.error('Error stack:', error.stack);
  }

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const kitsApiKey = Deno.env.get('KITS_API_KEY');

    if (!supabaseUrl || !supabaseKey || !kitsApiKey) {
      throw new Error('Missing required environment variables');
    }

    supabase = createClient(supabaseUrl, supabaseKey);
    console.log(`Processing recording ${recordingId} with Kits.ai for ${type}`);

    // Update recording status to processing using upsert pattern
    const { data: updatedRecording, error: updateError } = await supabase
      .from('recordings')
      .update({
        status: 'processing',
        processing_type: type,
        prompt: prompt || null,
        error_message: null // Clear any previous errors
      })
      .eq('id', recordingId)
      .select()
      .maybeSingle();

    if (updateError) {
      throw new Error(`Failed to update recording status: ${updateError.message}`);
    }

    if (!updatedRecording) {
      throw new Error('Recording not found');
    }

    // Get recording file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('recordings')
      .download(updatedRecording.filename);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download audio file: ${downloadError?.message || 'File not found'}`);
    }

    console.log(`Downloaded recording ${updatedRecording.filename}, size: ${fileData.size} bytes`);

    // Verify file extension
    if (!updatedRecording.filename.toLowerCase().endsWith('.wav')) {
      console.warn(`File doesn't have .wav extension: ${updatedRecording.filename}. Will fix extension for Kits.ai processing.`);
    }

    // Create a file with proper extension for Kits.ai
    // Using a explicit .wav extension and mimetype
    const wavFilename = `recording.wav`;

    // Prepare Kits.ai request with the updated model IDs
    const voiceModelId = type === 'kits-drums' ? '212569' : '221129';
    console.log(`Using Kits.ai model ID: ${voiceModelId} for ${type}`);
    
    const formData = new FormData();
    formData.append('voiceModelId', voiceModelId);
    
    // Create a proper WAV file with correct extension and MIME type
    const wavBlob = new Blob([fileData], { type: 'audio/wav' });
    formData.append('soundFile', wavBlob, wavFilename);
    
    console.log(`Sending to Kits.ai: model=${voiceModelId}, filename=${wavFilename}, size=${wavBlob.size} bytes`);

    // Call Kits.ai API
    const conversionResponse = await fetch('https://arpeggi.io/api/kits/v1/voice-conversions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${kitsApiKey}` },
      body: formData
    });

    if (!conversionResponse.ok) {
      const errorText = await conversionResponse.text();
      console.error(`Kits.ai API error response: ${errorText}`);
      throw new Error(`Kits.ai API error: ${conversionResponse.status} - ${errorText}`);
    }

    const conversionData = await conversionResponse.json();
    const conversionId = conversionData.id;

    if (!conversionId) {
      throw new Error('No conversion ID returned from Kits.ai API');
    }

    // Poll for completion
    let outputFileUrl: string | null = null;
    const maxAttempts = 30;
    
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
        break;
      } else if (statusData.status === 'error' || statusData.status === 'failed') {
        throw new Error(`Conversion failed: ${statusData.error || 'Unknown error'}`);
      }

      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    if (!outputFileUrl) {
      throw new Error('Conversion timed out or no output URL provided');
    }

    // Download converted audio
    const audioResponse = await fetch(outputFileUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download converted audio: ${audioResponse.status}`);
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const processedFilename = `${type}-${Date.now()}.wav`;

    // Upload processed audio
    const { error: uploadError } = await supabase.storage
      .from('recordings')
      .upload(processedFilename, audioBuffer, {
        contentType: 'audio/wav',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Failed to upload processed audio: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = await supabase.storage
      .from('recordings')
      .getPublicUrl(processedFilename);

    if (!urlData?.publicUrl) {
      throw new Error('Failed to get public URL for processed audio');
    }

    // Update recording with final status
    const { error: finalUpdateError } = await supabase
      .from('recordings')
      .update({
        status: 'completed',
        processed_audio_url: urlData.publicUrl,
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
        message: `${type === 'kits-drums' ? 'Drum' : 'Melody'} conversion completed`,
        url: urlData.publicUrl
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    return handleError(recordingId, error, supabase);
  }
});
