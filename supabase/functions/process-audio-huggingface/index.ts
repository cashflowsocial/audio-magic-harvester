
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { HfInference } from "https://esm.sh/@huggingface/inference@2.6.4";
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
    console.log('Processing with HuggingFace:', { recordingId, type });

    const HUGGING_FACE_API_KEY = Deno.env.get('HUGGING_FACE_API_KEY');
    if (!HUGGING_FACE_API_KEY) {
      throw new Error('HUGGING_FACE_API_KEY is not set');
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

    const hf = new HfInference(HUGGING_FACE_API_KEY);

    // We'll need to implement the actual audio processing here
    // For now, this is a placeholder that demonstrates the flow
    const output = publicUrl; // Replace with actual HF processing

    // Update recording with the processed audio URL
    await supabase
      .from('recordings')
      .update({
        status: 'completed',
        processed_audio_url: output,
      })
      .eq('id', recordingId);

    return new Response(
      JSON.stringify({ output }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in HuggingFace processing:', error);
    
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
