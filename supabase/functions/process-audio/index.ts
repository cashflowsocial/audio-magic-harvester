
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { HfInference } from 'https://esm.sh/@huggingface/inference@2.6.4';
import { corsHeaders, createErrorResponse } from './config.ts';
import { createSupabaseClient, getRecording, createProcessedTrack, updateProcessedTrack, markProcessingAsFailed } from './db.ts';
import { processAudio } from './audioProcessor.ts';
import type { AudioProcessingRequest } from './types.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { recordingId, processingType } = await req.json() as AudioProcessingRequest;
    console.log('Received request:', { recordingId, processingType });
    
    const hfApiKey = Deno.env.get('HUGGING_FACE_API_KEY');
    if (!hfApiKey) {
      return createErrorResponse('Hugging Face API key not configured');
    }

    const supabaseClient = createSupabaseClient();
    
    // Get recording and create processed track
    const recording = await getRecording(supabaseClient, recordingId);
    
    // Get the audio URL
    const { data: urlData } = await supabaseClient.storage
      .from('recordings')
      .getPublicUrl(recording.filename);

    if (!urlData.publicUrl) {
      return createErrorResponse('Could not get recording URL');
    }

    // Download the audio file
    console.log('Downloading audio file from:', urlData.publicUrl);
    try {
      const audioResponse = await fetch(urlData.publicUrl);
      if (!audioResponse.ok) {
        throw new Error(`Failed to download audio file: ${audioResponse.statusText}`);
      }
      
      // Get the content type from the response
      const contentType = audioResponse.headers.get('content-type') || 'audio/wav';
      const arrayBuffer = await audioResponse.arrayBuffer();
      
      // Create a new blob with explicit type
      const audioBlob = new Blob([arrayBuffer], { type: contentType });
      console.log('Audio blob created successfully:', {
        size: audioBlob.size,
        type: audioBlob.type
      });

      // Create processed track record
      const processedTrack = await createProcessedTrack(supabaseClient, recordingId, processingType);

      // Initialize Hugging Face client and process audio
      const hf = new HfInference(hfApiKey);
      console.log('Initialized Hugging Face client');
      
      const result = await processAudio(hf, audioBlob, processingType, urlData.publicUrl);
      
      // Update the processed track with results
      await updateProcessedTrack(
        supabaseClient,
        processedTrack.id,
        result,
        processingType,
        urlData.publicUrl
      );

      return new Response(
        JSON.stringify({ 
          message: 'Audio processing completed',
          processedTrackId: processedTrack.id,
          result
        }),
        { headers: corsHeaders }
      );

    } catch (downloadError) {
      console.error('Error downloading or processing audio:', downloadError);
      return createErrorResponse(`Error processing audio: ${downloadError.message}`);
    }

  } catch (error) {
    console.error('General error:', error);
    return createErrorResponse(error.message);
  }
});
