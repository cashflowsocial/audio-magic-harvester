
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
      return new Response(
        JSON.stringify({ error: 'Recording ID is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Processing recording ${recordingId} with Kits.ai for ${type}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const kitsApiKey = Deno.env.get('KITS_API_KEY') ?? '';
    
    if (!kitsApiKey) {
      return new Response(
        JSON.stringify({ error: 'Kits.ai API key is not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update the recording status to processing
    await supabase
      .from('recordings')
      .update({
        status: 'processing',
        processing_type: type,
        prompt: prompt || undefined
      })
      .eq('id', recordingId);

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

    console.log(`Successfully downloaded recording ${recording.filename}`);
    
    // Define voice model IDs based on type
    // Using the correct Kits.ai voice model IDs provided by the user
    const voiceModelId = type === 'kits-drums' 
      ? '1118122' // Drum kit ID provided by user
      : '221129';  // Melody voice ID provided by user
    
    // Create a FormData object for the API request
    const formData = new FormData();
    formData.append('voiceModelId', voiceModelId);
    
    // Convert the file data to a Blob
    const audioBlob = new Blob([fileData], { type: 'audio/wav' });
    formData.append('soundFile', audioBlob, recording.filename);
    
    // Call the Kits.ai API to start the conversion
    console.log(`Calling Kits.ai API for ${type} conversion with model ID: ${voiceModelId}`);
    const conversionResponse = await fetch('https://arpeggi.io/api/kits/v1/voice-conversions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${kitsApiKey}`
        // Don't set Content-Type when using FormData
      },
      body: formData
    });
    
    if (!conversionResponse.ok) {
      const errorText = await conversionResponse.text();
      throw new Error(`Kits.ai API error: ${conversionResponse.status} - ${errorText}`);
    }
    
    const conversionData = await conversionResponse.json();
    const conversionId = conversionData.id;
    
    if (!conversionId) {
      throw new Error('No conversion ID returned from Kits.ai API');
    }
    
    console.log(`Kits.ai conversion job created with ID: ${conversionId}`);
    
    // Poll for completion
    let outputFileUrl: string | null = null;
    let attempts = 0;
    const maxAttempts = 30; // Maximum polling attempts (5 minutes with 10s delay)
    
    while (attempts < maxAttempts) {
      console.log(`Polling conversion job ${conversionId}, attempt ${attempts + 1}`);
      
      const statusResponse = await fetch(`https://arpeggi.io/api/kits/v1/voice-conversions/${conversionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${kitsApiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        throw new Error(`Error checking conversion status: ${statusResponse.status} - ${errorText}`);
      }
      
      const statusData = await statusResponse.json();
      
      if (statusData.status === 'success') {
        console.log('Conversion completed successfully');
        outputFileUrl = statusData.outputFileUrl || statusData.lossyOutputFileUrl;
        break;
      } else if (statusData.status === 'error' || statusData.status === 'failed') {
        throw new Error(`Conversion failed: ${statusData.error || 'Unknown error'}`);
      }
      
      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10-second delay
      attempts++;
    }
    
    if (!outputFileUrl) {
      throw new Error('Conversion timed out or no output URL was provided');
    }
    
    console.log(`Got output file URL: ${outputFileUrl}`);
    
    // Download the converted audio file
    const audioResponse = await fetch(outputFileUrl);
    
    if (!audioResponse.ok) {
      throw new Error(`Error downloading converted audio: ${audioResponse.status}`);
    }
    
    const audioBuffer = await audioResponse.arrayBuffer();
    
    // Create processed filename
    const processedFilename = `${type}-${Date.now()}.wav`;
    
    // Upload the processed audio to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('recordings')
      .upload(processedFilename, audioBuffer, {
        contentType: 'audio/wav',
        upsert: true
      });

    if (uploadError) {
      console.error('Error uploading processed audio:', uploadError);
      
      await supabase
        .from('recordings')
        .update({
          status: 'failed',
          error_message: `Error uploading processed audio: ${uploadError.message}`
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

    // Update the recording with the processed audio URL
    await supabase
      .from('recordings')
      .update({
        status: 'completed',
        processed_audio_url: urlData.publicUrl
      })
      .eq('id', recordingId);

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
    console.error('Error processing audio with Kits.ai:', error);
    
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
            error_message: `Error processing audio with Kits.ai: ${error instanceof Error ? error.message : 'Unknown error'}`
          })
          .eq('id', recordingId);
      } catch (updateError) {
        console.error('Error updating recording status after failure:', updateError);
      }
    }
    
    return new Response(
      JSON.stringify({ error: `Error processing audio with Kits.ai: ${error instanceof Error ? error.message : 'Unknown error'}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
