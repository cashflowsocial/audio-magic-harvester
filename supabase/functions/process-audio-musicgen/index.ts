
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
    console.log('Processing audio to MIDI:', { recordingId, type });

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

    // Use basic-pitch model for MIDI extraction
    // This model focuses solely on monophonic melody extraction to MIDI
    const output = await replicate.run(
      "spotify/basic-pitch:ee980ff5937c5936cf5c6c96da5d6d1c0befeca9bd6eda0c88d3da3985ea656f",
      {
        input: {
          audio: publicUrl,
          sampleRate: 44100,
          model: "melody",  // Focus on melody only
          minNoteLength: 0.05,  // Capture short notes
          inferOnsets: true,  // Better note start detection
          onlyMonophonic: true  // Force single-note melody
        }
      }
    );

    console.log('MIDI extraction completed:', output);

    // Update recording with the processed MIDI URL
    await supabase
      .from('recordings')
      .update({
        status: 'completed',
        processed_audio_url: output,
        prompt: "MIDI melody extraction"
      })
      .eq('id', recordingId);

    return new Response(
      JSON.stringify({ output }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in MIDI processing:', error);
    
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
