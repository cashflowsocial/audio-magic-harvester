
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let recordingId: string | null = null;
  
  try {
    // Get the request body
    const { recordingId: reqRecordingId, type, prompt } = await req.json();
    recordingId = reqRecordingId;
    
    if (!recordingId) {
      console.error("Missing recordingId in request");
      return new Response(
        JSON.stringify({ error: 'Recording ID is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Processing recording ${recordingId} with Kits.ai for ${type}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    // Check for the API key with the correct format (with dot instead of underscore)
    const kitsApiKey = Deno.env.get('KITS.AI_API_KEY') ?? '';
    
    if (!kitsApiKey) {
      console.error("Kits.ai API key is not configured");
      return new Response(
        JSON.stringify({ error: 'Kits.ai API key is not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update the recording status to processing
    const { error: updateError } = await supabase
      .from('recordings')
      .update({
        status: 'processing',
        processing_type: type,
        prompt: prompt || undefined
      })
      .eq('id', recordingId);
      
    if (updateError) {
      console.error("Error updating recording status to processing:", updateError);
    } else {
      console.log(`Updated recording ${recordingId} status to processing`);
    }

    // Get the recording details
    const { data: recording, error: fetchError } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single();

    if (fetchError || !recording) {
      console.error('Error fetching recording:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Recording not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    console.log(`Found recording: ${recording.filename}`);

    // Get the audio file from storage
    const { data: fileData, error: fileError } = await supabase.storage
      .from('recordings')
      .download(recording.filename);

    if (fileError || !fileData) {
      console.error('Error downloading audio file:', fileError);
      await supabase
        .from('recordings')
        .update({
          status: 'failed',
          error_message: `Error downloading audio file: ${fileError?.message || 'Unknown error'}`
        })
        .eq('id', recordingId);

      return new Response(
        JSON.stringify({ error: 'Error downloading audio file' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`Successfully downloaded recording ${recording.filename}, size: ${fileData.size} bytes`);
    
    // Define voice model IDs based on type
    const voiceModelId = type === 'kits-drums' 
      ? '1118122' // Drum kit ID provided by user
      : '221129';  // Melody voice ID provided by user
    
    console.log(`Using Kits.ai model ID: ${voiceModelId} for ${type}`);
    
    // Create a FormData object for the API request
    const formData = new FormData();
    formData.append('voiceModelId', voiceModelId);
    
    // Convert the file data to a Blob
    const audioBlob = new Blob([fileData], { type: 'audio/wav' });
    formData.append('soundFile', audioBlob, recording.filename);
    
    console.log(`Created form data with audio blob (${audioBlob.size} bytes) and voice model ID: ${voiceModelId}`);
    
    // Call the Kits.ai API to start the conversion
    console.log(`Calling Kits.ai API for ${type} conversion with model ID: ${voiceModelId}`);
    
    // First, log API key details (without revealing the full key)
    const maskedKey = kitsApiKey.substring(0, 4) + '...' + kitsApiKey.substring(kitsApiKey.length - 4);
    console.log(`Using Kits.ai API key: ${maskedKey} (${kitsApiKey.length} chars)`);
    
    let conversionResponse;
    try {
      conversionResponse = await fetch('https://arpeggi.io/api/kits/v1/voice-conversions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${kitsApiKey}`
          // Don't set Content-Type when using FormData
        },
        body: formData
      });
      
      console.log(`Kits.ai API response status: ${conversionResponse.status}`);
      
      if (!conversionResponse.ok) {
        const errorText = await conversionResponse.text();
        console.error(`Kits.ai API error response (${conversionResponse.status}): ${errorText}`);
        throw new Error(`Kits.ai API error: ${conversionResponse.status} - ${errorText}`);
      }
    } catch (fetchError) {
      console.error(`Error making request to Kits.ai API:`, fetchError);
      throw new Error(`Error connecting to Kits.ai API: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`);
    }
    
    let conversionData;
    try {
      conversionData = await conversionResponse.json();
      console.log(`Kits.ai API response data:`, JSON.stringify(conversionData));
    } catch (jsonError) {
      console.error(`Error parsing Kits.ai API response:`, jsonError);
      throw new Error(`Error parsing Kits.ai API response: ${jsonError instanceof Error ? jsonError.message : 'Invalid JSON'}`);
    }
    
    const conversionId = conversionData.id;
    
    if (!conversionId) {
      console.error(`No conversion ID in response:`, JSON.stringify(conversionData));
      throw new Error('No conversion ID returned from Kits.ai API');
    }
    
    console.log(`Kits.ai conversion job created with ID: ${conversionId}`);
    
    // Poll for completion
    let outputFileUrl: string | null = null;
    let attempts = 0;
    const maxAttempts = 30; // Maximum polling attempts (5 minutes with 10s delay)
    
    while (attempts < maxAttempts) {
      console.log(`Polling conversion job ${conversionId}, attempt ${attempts + 1}`);
      
      let statusResponse;
      try {
        statusResponse = await fetch(`https://arpeggi.io/api/kits/v1/voice-conversions/${conversionId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${kitsApiKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          console.error(`Error checking conversion status (${statusResponse.status}): ${errorText}`);
          throw new Error(`Error checking conversion status: ${statusResponse.status} - ${errorText}`);
        }
      } catch (statusError) {
        console.error(`Error polling Kits.ai status API:`, statusError);
        throw new Error(`Error checking conversion status: ${statusError instanceof Error ? statusError.message : 'Unknown error'}`);
      }
      
      let statusData;
      try {
        statusData = await statusResponse.json();
        console.log(`Conversion status (attempt ${attempts + 1}):`, JSON.stringify(statusData));
      } catch (jsonError) {
        console.error(`Error parsing status response:`, jsonError);
        throw new Error(`Error parsing status response: ${jsonError instanceof Error ? jsonError.message : 'Invalid JSON'}`);
      }
      
      if (statusData.status === 'success') {
        console.log('Conversion completed successfully');
        outputFileUrl = statusData.outputFileUrl || statusData.lossyOutputFileUrl;
        console.log(`Output URL: ${outputFileUrl}`);
        break;
      } else if (statusData.status === 'error' || statusData.status === 'failed') {
        console.error(`Conversion failed: ${statusData.error || 'Unknown error'}`, JSON.stringify(statusData));
        throw new Error(`Conversion failed: ${statusData.error || 'Unknown error'}`);
      } else if (statusData.status === 'processing') {
        console.log(`Still processing, waiting...`);
      } else {
        console.log(`Unknown status: ${statusData.status}, waiting...`);
      }
      
      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10-second delay
      attempts++;
    }
    
    if (!outputFileUrl) {
      console.error(`Conversion timed out after ${maxAttempts} attempts`);
      throw new Error('Conversion timed out or no output URL was provided');
    }
    
    console.log(`Got output file URL: ${outputFileUrl}`);
    
    // Download the converted audio file
    let audioResponse;
    try {
      audioResponse = await fetch(outputFileUrl);
      
      if (!audioResponse.ok) {
        console.error(`Error downloading converted audio: ${audioResponse.status}`);
        throw new Error(`Error downloading converted audio: ${audioResponse.status}`);
      }
      
      console.log(`Downloaded converted audio, status: ${audioResponse.status}`);
    } catch (downloadError) {
      console.error(`Error fetching converted audio:`, downloadError);
      throw new Error(`Error downloading converted audio: ${downloadError instanceof Error ? downloadError.message : 'Unknown error'}`);
    }
    
    let audioBuffer;
    try {
      audioBuffer = await audioResponse.arrayBuffer();
      console.log(`Converted audio size: ${audioBuffer.byteLength} bytes`);
    } catch (bufferError) {
      console.error(`Error reading audio response:`, bufferError);
      throw new Error(`Error processing audio response: ${bufferError instanceof Error ? bufferError.message : 'Unknown error'}`);
    }
    
    // Create processed filename
    const processedFilename = `${type}-${Date.now()}.wav`;
    console.log(`Using processed filename: ${processedFilename}`);
    
    // Upload the processed audio to Supabase storage
    let uploadResult;
    try {
      uploadResult = await supabase.storage
        .from('recordings')
        .upload(processedFilename, audioBuffer, {
          contentType: 'audio/wav',
          upsert: true
        });
        
      if (uploadResult.error) {
        console.error('Error uploading processed audio:', uploadResult.error);
        throw uploadResult.error;
      }
      
      console.log(`Successfully uploaded processed audio: ${processedFilename}`);
    } catch (uploadError) {
      console.error(`Error during upload:`, uploadError);
      
      await supabase
        .from('recordings')
        .update({
          status: 'failed',
          error_message: `Error uploading processed audio: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`
        })
        .eq('id', recordingId);
        
      return new Response(
        JSON.stringify({ error: 'Error uploading processed audio' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Get the URL of the processed audio
    const { data: urlData } = await supabase.storage
      .from('recordings')
      .getPublicUrl(processedFilename);

    console.log(`Public URL for processed audio: ${urlData.publicUrl}`);

    // Update the recording with the processed audio URL
    const { error: finalUpdateError } = await supabase
      .from('recordings')
      .update({
        status: 'completed',
        processed_audio_url: urlData.publicUrl
      })
      .eq('id', recordingId);
      
    if (finalUpdateError) {
      console.error(`Error updating recording with processed URL:`, finalUpdateError);
    } else {
      console.log(`Successfully updated recording status to completed with URL`);
    }

    console.log(`Successfully processed ${type} for recording ${recordingId}`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${type === 'kits-drums' ? 'Drum' : 'Melody'} conversion processed successfully`,
        url: urlData.publicUrl
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error processing audio with Kits.ai:', errorMessage);
    if (error instanceof Error && error.stack) {
      console.error('Error stack:', error.stack);
    }
    
    // Only try to update the recording if we have a recordingId from the outer scope
    if (recordingId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        await supabase
          .from('recordings')
          .update({
            status: 'failed',
            error_message: `Error processing audio with Kits.ai: ${errorMessage}`
          })
          .eq('id', recordingId);
          
        console.log(`Updated recording ${recordingId} status to failed with error message`);
      } catch (updateError) {
        console.error('Error updating recording status after failure:', updateError);
      }
    }
    
    return new Response(
      JSON.stringify({ error: `Error processing audio with Kits.ai: ${errorMessage}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
