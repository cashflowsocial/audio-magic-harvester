
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { HfInference } from 'https://esm.sh/@huggingface/inference@2.6.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { recordingId, processingType } = await req.json();
    console.log('Received request:', { recordingId, processingType });
    
    const hfApiKey = Deno.env.get('HUGGING_FACE_API_KEY');
    if (!hfApiKey) {
      return new Response(
        JSON.stringify({ error: 'Hugging Face API key not configured' }), 
        { status: 500, headers: corsHeaders }
      );
    }

    // Initialize Supabase client with proper headers
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Get the recording details
    const { data: recording, error: fetchError } = await supabaseClient
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single();

    if (fetchError || !recording) {
      return new Response(
        JSON.stringify({ error: 'Recording not found' }), 
        { status: 404, headers: corsHeaders }
      );
    }

    // Get the audio URL
    const { data: urlData } = await supabaseClient.storage
      .from('recordings')
      .getPublicUrl(recording.filename);

    if (!urlData.publicUrl) {
      return new Response(
        JSON.stringify({ error: 'Could not get recording URL' }), 
        { status: 500, headers: corsHeaders }
      );
    }

    // Download the audio file with explicit headers
    console.log('Downloading audio file from:', urlData.publicUrl);
    const audioResponse = await fetch(urlData.publicUrl, {
      headers: {
        'Accept': 'audio/*'
      }
    });
    
    if (!audioResponse.ok) {
      throw new Error('Failed to download audio file');
    }
    
    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });

    // Create a processed track record
    const { data: processedTrack, error: insertError } = await supabaseClient
      .from('processed_tracks')
      .insert({
        recording_id: recordingId,
        processing_type: processingType,
        processing_status: 'processing'
      })
      .select()
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: `Error creating processed track: ${insertError.message}` }), 
        { status: 500, headers: corsHeaders }
      );
    }

    // Initialize Hugging Face client
    const hf = new HfInference(hfApiKey);
    console.log('Initialized Hugging Face client');

    try {
      let result;
      
      switch (processingType) {
        case 'melody':
          console.log('Processing melody extraction...');
          const melodyResponse = await hf.audioToAudio({
            model: 'facebook/demucs',
            data: audioBlob,
            parameters: {
              target: 'vocals'
            }
          });
          
          result = {
            type: 'melody',
            url: urlData.publicUrl,
            processed: true
          };
          console.log('Melody extraction complete');
          break;
          
        case 'drums':
          console.log('Processing drums extraction...');
          const drumsResponse = await hf.audioToAudio({
            model: 'facebook/demucs',
            data: audioBlob,
            parameters: {
              target: 'drums'
            }
          });
          
          const drumClassification = await hf.audioClassification({
            model: 'antonibigata/drummids',
            data: audioBlob
          });
          
          result = {
            type: 'drums',
            url: urlData.publicUrl,
            classification: drumClassification,
            processed: true
          };
          console.log('Drums extraction complete');
          break;
          
        case 'instrumentation':
          console.log('Processing instrumentation extraction...');
          const instrumentResponse = await hf.audioToAudio({
            model: 'facebook/demucs',
            data: audioBlob,
            parameters: {
              target: 'other'
            }
          });
          
          result = {
            type: 'instrumentation',
            url: urlData.publicUrl,
            processed: true
          };
          console.log('Instrumentation extraction complete');
          break;
          
        default:
          return new Response(
            JSON.stringify({ error: `Unknown processing type: ${processingType}` }), 
            { status: 400, headers: corsHeaders }
          );
      }

      // Update the processed track with results
      const { error: updateError } = await supabaseClient
        .from('processed_tracks')
        .update({
          processing_status: 'completed',
          melody_file_path: processingType === 'melody' ? JSON.stringify(result) : null,
          drums_file_path: processingType === 'drums' ? JSON.stringify(result) : null,
          combined_file_path: urlData.publicUrl
        })
        .eq('id', processedTrack.id);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: `Error updating processed track: ${updateError.message}` }), 
          { status: 500, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ 
          message: 'Audio processing completed',
          processedTrackId: processedTrack.id,
          result
        }),
        { headers: corsHeaders }
      );

    } catch (processingError) {
      console.error('Processing error:', processingError);
      // Update status to failed
      await supabaseClient
        .from('processed_tracks')
        .update({
          processing_status: 'failed',
          error_message: processingError.message
        })
        .eq('id', processedTrack.id);
        
      return new Response(
        JSON.stringify({ error: processingError.message }), 
        { status: 500, headers: corsHeaders }
      );
    }

  } catch (error) {
    console.error('General error:', error);
    return new Response(
      JSON.stringify({ error: error.message }), 
      { status: 500, headers: corsHeaders }
    );
  }
});
