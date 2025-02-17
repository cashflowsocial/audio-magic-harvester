
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const { recordingId, processingType } = await req.json();
    console.log(`[Process Audio] Starting processing for recording ${recordingId}, type: ${processingType}`);

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Create initial processing record
    const { data: track, error: trackError } = await supabase
      .from('processed_tracks')
      .insert({
        recording_id: recordingId,
        processing_type: processingType,
        processing_status: 'processing'
      })
      .select()
      .single();

    if (trackError) {
      throw new Error(`Error creating processed track: ${trackError.message}`);
    }

    // Get the recording
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single();

    if (recordingError || !recording) {
      throw new Error('Recording not found');
    }

    // Get the public URL for the recording
    const { data: { publicUrl } } = await supabase.storage
      .from('recordings')
      .getPublicUrl(recording.filename);

    // Process with MusicGen
    try {
      console.log('Calling MusicGen for processing...');
      
      const prompt = processingType === 'drums' 
        ? "Create a dynamic drum beat" 
        : "Create a melodic accompaniment";

      const musicgenResponse = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/process-audio-musicgen`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            melody_url: publicUrl,
            prompt,
          }),
        }
      );

      if (!musicgenResponse.ok) {
        throw new Error(`MusicGen processing failed: ${await musicgenResponse.text()}`);
      }

      const musicgenResult = await musicgenResponse.json();
      console.log('MusicGen processing completed:', musicgenResult);

      // Update the processed track with MusicGen results
      const { error: updateError } = await supabase
        .from('processed_tracks')
        .update({
          processing_status: 'completed',
          processed_audio_url: musicgenResult.output,
        })
        .eq('id', track.id);

      if (updateError) {
        throw new Error(`Error updating processed track: ${updateError.message}`);
      }

    } catch (processingError) {
      console.error('Error during MusicGen processing:', processingError);
      
      // Update track status to failed
      await supabase
        .from('processed_tracks')
        .update({
          processing_status: 'failed',
          error_message: processingError.message,
        })
        .eq('id', track.id);
        
      throw processingError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Audio processed successfully',
        trackId: track.id,
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    console.error('[Process Audio] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      {
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json'
        }
      }
    );
  }
});
