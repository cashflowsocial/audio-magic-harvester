
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

  let processedTrack = null;

  try {
    const { recordingId, processingType } = await req.json() as AudioProcessingRequest;
    console.log('Received request:', { recordingId, processingType });
    
    const hfApiKey = Deno.env.get('HUGGING_FACE_API_KEY');
    if (!hfApiKey) {
      throw new Error('Hugging Face API key not configured');
    }

    const supabaseClient = createSupabaseClient();
    
    // Get recording
    const recording = await getRecording(supabaseClient, recordingId);
    console.log('Retrieved recording:', { id: recording.id, filename: recording.filename });
    
    // Get the audio URL
    const { data: urlData } = await supabaseClient.storage
      .from('recordings')
      .getPublicUrl(recording.filename);

    if (!urlData.publicUrl) {
      throw new Error('Could not get recording URL');
    }

    console.log('Downloading audio file from:', urlData.publicUrl);
    const audioResponse = await fetch(urlData.publicUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio file: ${audioResponse.statusText}`);
    }
    
    const contentType = audioResponse.headers.get('content-type') || 'audio/wav';
    const arrayBuffer = await audioResponse.arrayBuffer();
    
    const audioBlob = new Blob([arrayBuffer], { type: contentType });
    console.log('Audio blob created:', {
      size: audioBlob.size,
      type: audioBlob.type
    });

    // Create processed track record before processing
    processedTrack = await createProcessedTrack(supabaseClient, recordingId, processingType);
    console.log('Created processed track:', { id: processedTrack.id });

    // Initialize Hugging Face client
    const hf = new HfInference(hfApiKey);
    console.log('Initialized Hugging Face client');
    
    const result = await processAudio(hf, audioBlob, processingType, urlData.publicUrl);
    console.log('Audio processing completed successfully');
    
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
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json'
        } 
      }
    );

  } catch (error) {
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });

    if (processedTrack) {
      try {
        await markProcessingAsFailed(supabaseClient, processedTrack.id, error.message);
      } catch (markFailedError) {
        console.error('Failed to mark processing as failed:', markFailedError);
      }
    }

    return createErrorResponse(error.message);
  }
});
