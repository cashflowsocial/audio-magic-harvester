
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { HfInference } from 'https://esm.sh/@huggingface/inference@2.6.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { recordingId, audioUrl } = await req.json();
    const hfApiKey = Deno.env.get('HUGGING_FACE_API_KEY');
    
    if (!hfApiKey) {
      throw new Error('Hugging Face API key not configured');
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Processing audio for recording:', recordingId);
    
    // Create a processed track record
    const { data: processedTrack, error: insertError } = await supabaseClient
      .from('processed_tracks')
      .insert({
        recording_id: recordingId,
        processing_status: 'processing'
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Error creating processed track: ${insertError.message}`);
    }

    // Fetch the audio file
    console.log('Fetching audio file from URL:', audioUrl);
    const audioResponse = await fetch(audioUrl, {
      headers: {
        'Accept': '*/*',
      }
    });
    
    if (!audioResponse.ok) {
      throw new Error('Failed to fetch audio file');
    }
    
    const audioBlob = await audioResponse.blob();

    // Initialize Hugging Face client
    const hf = new HfInference(hfApiKey);

    console.log('Starting AI processing...');

    try {
      // Use audio classification as a simpler test
      const result = await hf.audioClassification({
        model: 'facebook/wav2vec2-base-960h',
        data: audioBlob
      });

      console.log('AI processing completed:', result);

      // Update the processed track with results
      const { error: updateError } = await supabaseClient
        .from('processed_tracks')
        .update({
          processing_status: 'completed',
          melody_file_path: audioUrl, // For now, just store the original URL
          drums_file_path: audioUrl,
          combined_file_path: audioUrl
        })
        .eq('id', processedTrack.id);

      if (updateError) {
        throw new Error(`Error updating processed track: ${updateError.message}`);
      }

      return new Response(
        JSON.stringify({ 
          message: 'Audio processing completed',
          processedTrackId: processedTrack.id
        }),
        { 
          headers: { 
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );

    } catch (processingError) {
      console.error('AI processing error:', processingError);
      
      // Update status to failed
      await supabaseClient
        .from('processed_tracks')
        .update({
          processing_status: 'failed'
        })
        .eq('id', processedTrack.id);
        
      throw processingError;
    }

  } catch (error) {
    console.error('Error processing audio:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
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
