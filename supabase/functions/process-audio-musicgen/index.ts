
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Replicate from "https://esm.sh/replicate@0.25.2";
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

    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) {
      throw new Error('REPLICATE_API_KEY is not set');
    }

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

    const replicate = new Replicate({
      auth: REPLICATE_API_KEY,
    });

    // More specific prompts focusing on exact reproduction
    const prompt = type === 'drums' 
      ? "Replicate this exact rhythm pattern. Keep the same tempo and intensity, just clean up the timing." 
      : "Replicate this exact melody note for note. Keep the same melody line but adjust the pitch to the nearest musical note and quantize the timing. Do not add harmonies or change the melody in any way.";

    // Run the MusicGen model with fine-tuned parameters
    const output = await replicate.run(
      "meta/musicgen:b05b1dff1d8c6dc63d14b0cdb42135378dcb87f6373b0d3d341ede46e59e2b38",
      {
        input: {
          model_version: "melody-large",
          prompt,
          melody_url: publicUrl,
          duration: 8,
          continuation: false,
          normalization_strategy: "loudness",
          output_format: "wav",
          temperature: 0.4,  // Further reduced temperature for even more precise reproduction
          classifier_free_guidance: 15,  // Increased guidance for closer adherence to input
          top_k: 50,  // Reduced from default to maintain closer similarity
          top_p: 0.7   // Reduced from default to maintain closer similarity
        }
      }
    );

    console.log('MusicGen generation completed:', output);

    // Update recording with the processed audio URL
    await supabase
      .from('recordings')
      .update({
        status: 'completed',
        processed_audio_url: output,
        prompt
      })
      .eq('id', recordingId);

    return new Response(
      JSON.stringify({ output }),
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
