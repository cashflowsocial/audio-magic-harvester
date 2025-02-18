
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { HfInference } from 'https://esm.sh/@huggingface/inference@2.6.4';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { recordingId, type } = await req.json();
    console.log('Processing with MusicGen:', { recordingId, type });

    // Initialize Hugging Face client with API key
    const hf = new HfInference(Deno.env.get('HUGGING_FACE_API_KEY'));

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the recording
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single();

    if (recordingError || !recording) {
      throw new Error('Recording not found');
    }

    // Update status to processing
    await supabase
      .from('recordings')
      .update({ 
        status: 'processing',
        processing_type: type 
      })
      .eq('id', recordingId);

    // Get the public URL for the recording
    const { data: { publicUrl } } = await supabase.storage
      .from('recordings')
      .getPublicUrl(recording.filename);

    const prompt = type === 'drums' 
      ? "Create a dynamic drum beat that matches this audio" 
      : "Create a melodic accompaniment that complements this audio";

    // Process with MusicGen using Hugging Face
    console.log('Starting MusicGen processing with prompt:', prompt);
    const output = await hf.audioToAudio({
      model: 'facebook/musicgen-small',
      data: publicUrl,
      parameters: {
        prompt,
      }
    });

    if (!output) {
      throw new Error('MusicGen processing failed to return output');
    }

    // Convert the audio output to a URL
    const audioBlob = new Blob([output], { type: 'audio/wav' });
    const processedFilename = `processed-${recording.filename}`;
    
    // Upload processed audio to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('recordings')
      .upload(processedFilename, audioBlob);

    if (uploadError) {
      throw new Error(`Failed to upload processed audio: ${uploadError.message}`);
    }

    // Get the URL for the processed audio
    const { data: { publicUrl: processedUrl } } = await supabase.storage
      .from('recordings')
      .getPublicUrl(processedFilename);

    // Update recording with the processed audio URL
    await supabase
      .from('recordings')
      .update({
        status: 'completed',
        processed_audio_url: processedUrl,
        prompt
      })
      .eq('id', recordingId);

    return new Response(
      JSON.stringify({ 
        success: true,
        processedUrl 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in MusicGen processing:', error);
    
    // Update recording status to failed if we have the recordingId
    try {
      const { recordingId } = await req.json();
      if (recordingId) {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
        
        await supabase
          .from('recordings')
          .update({
            status: 'failed',
            error_message: error.message
          })
          .eq('id', recordingId);
      }
    } catch (updateError) {
      console.error('Error updating recording status:', updateError);
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
