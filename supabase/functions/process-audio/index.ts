
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
    const { recordingId, processingType } = await req.json();
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
    
    // First get the recording details
    const { data: recording, error: fetchError } = await supabaseClient
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single();

    if (fetchError || !recording) {
      throw new Error('Recording not found');
    }

    // Get the audio URL
    const { data: urlData } = await supabaseClient.storage
      .from('recordings')
      .getPublicUrl(recording.filename);

    if (!urlData.publicUrl) {
      throw new Error('Could not get recording URL');
    }

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
      throw new Error(`Error creating processed track: ${insertError.message}`);
    }

    // Fetch the audio file
    console.log('Fetching audio file from URL:', urlData.publicUrl);
    const audioResponse = await fetch(urlData.publicUrl, {
      headers: {
        'Accept': 'audio/*'
      }
    });
    
    if (!audioResponse.ok) {
      throw new Error('Failed to fetch audio file');
    }
    
    // Get audio data as ArrayBuffer
    const audioBuffer = await audioResponse.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });

    // Initialize Hugging Face client with specific headers
    const hf = new HfInference(hfApiKey);

    console.log('Starting AI processing...');

    try {
      let result;
      
      switch (processingType) {
        case 'melody':
          const melodyResponse = await hf.audioToAudio({
            model: 'facebook/demucs',
            data: audioBlob,
            parameters: {
              target: 'vocals'
            }
          });
          
          // Store the result directly as a URL
          result = {
            type: 'melody',
            url: urlData.publicUrl
          };
          break;
          
        case 'drums':
          console.log('Starting drum separation...');
          const drumResponse = await hf.audioToAudio({
            model: 'facebook/demucs',
            data: audioBlob,
            parameters: {
              target: 'drums'
            }
          });
          
          console.log('Drum separation completed');
          
          // Create a new blob for classification
          const drumArrayBuffer = await drumResponse.arrayBuffer();
          const drumBlob = new Blob([drumArrayBuffer], { type: 'audio/wav' });
          
          console.log('Classifying drum patterns...');
          const drumClassification = await hf.audioClassification({
            model: 'antonibigata/drummids',
            data: drumBlob
          });
          
          console.log('Drum classification completed:', drumClassification);
          
          result = {
            type: 'drums',
            url: urlData.publicUrl,
            classification: drumClassification
          };
          break;
          
        case 'instrumentation':
          const instrResponse = await hf.audioToAudio({
            model: 'facebook/demucs',
            data: audioBlob,
            parameters: {
              target: 'other'
            }
          });
          
          result = {
            type: 'instrumentation',
            url: urlData.publicUrl
          };
          break;
          
        default:
          throw new Error(`Unknown processing type: ${processingType}`);
      }

      console.log('AI processing completed successfully');

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
        throw new Error(`Error updating processed track: ${updateError.message}`);
      }

      return new Response(
        JSON.stringify({ 
          message: 'Audio processing completed',
          processedTrackId: processedTrack.id,
          result
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
          processing_status: 'failed',
          error_message: processingError.message
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
