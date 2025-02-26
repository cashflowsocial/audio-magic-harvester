
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
    // Create a copy of the request before consuming it
    const clonedReq = req.clone();
    
    // Get the request body and store recordingId in the outer scope
    const body = await clonedReq.json();
    recordingId = body.recordingId;
    const type = body.type;
    
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
    const kitsApiKey = Deno.env.get('KITS.AI_API_KEY') ?? '';
    
    if (!kitsApiKey) {
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
        processing_type: type
      })
      .eq('id', recordingId);

    if (updateError) {
      console.error('Error updating recording status:', updateError);
      return new Response(
        JSON.stringify({ error: `Error updating recording status: ${updateError.message}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
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

    // Prepare for Kits.ai API request
    // Convert the Blob to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Convert to base64
    let binary = '';
    for (let i = 0; i < uint8Array.byteLength; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64Data = btoa(binary);

    // Use the fixed model ID (110784) as specified in the URL
    const modelId = '110784';
    console.log(`Using fixed model ID: ${modelId} for ${type}`);

    // Fetch the voice model using GET
    const modelEndpoint = `https://arpeggi.io/api/kits/v1/voice-models/${modelId}`;
    console.log(`Fetching model from: ${modelEndpoint}`);
    
    const modelResponse = await fetch(modelEndpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${kitsApiKey}`
      }
    });

    if (!modelResponse.ok) {
      const errorText = await modelResponse.text();
      console.error(`Kits.ai API error: ${modelResponse.status} - ${errorText}`);
      
      await supabase
        .from('recordings')
        .update({
          status: 'failed',
          error_message: `Kits.ai API error: ${modelResponse.status} - ${errorText}`
        })
        .eq('id', recordingId);
        
      return new Response(
        JSON.stringify({ error: `Kits.ai API error: ${modelResponse.status}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Process the response from Kits.ai
    const modelData = await modelResponse.json();
    console.log('Successfully fetched model data from Kits.ai:', modelData);

    // Now we have the model data, we need to send our audio for generation
    const generateEndpoint = `https://arpeggi.io/api/kits/v1/generate`;
    
    // Prepare generate request body with model info
    const generateRequestBody = {
      model_id: modelId,
      audio: `data:audio/wav;base64,${base64Data}`
    };

    console.log(`Sending audio to generation endpoint: ${generateEndpoint}`);

    const generateResponse = await fetch(generateEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${kitsApiKey}`
      },
      body: JSON.stringify(generateRequestBody)
    });

    if (!generateResponse.ok) {
      const errorText = await generateResponse.text();
      console.error(`Kits.ai generation API error: ${generateResponse.status} - ${errorText}`);
      
      await supabase
        .from('recordings')
        .update({
          status: 'failed',
          error_message: `Kits.ai generation API error: ${generateResponse.status} - ${errorText}`
        })
        .eq('id', recordingId);
        
      return new Response(
        JSON.stringify({ error: `Kits.ai generation API error: ${generateResponse.status}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const generatedData = await generateResponse.json();
    console.log('Received generated audio from Kits.ai:', generatedData);

    if (!generatedData.audio) {
      await supabase
        .from('recordings')
        .update({
          status: 'failed',
          error_message: 'No audio data in Kits.ai response'
        })
        .eq('id', recordingId);
        
      return new Response(
        JSON.stringify({ error: 'No audio data in Kits.ai response' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Extract the base64 audio data
    const base64Audio = generatedData.audio.split(',')[1];
    const binaryStr = atob(base64Audio);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Create processed filename
    const processedFilename = `processed-${type}-${recording.filename}`;
    
    // Upload the processed audio to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('recordings')
      .upload(processedFilename, bytes.buffer, {
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
    const { error: finalUpdateError } = await supabase
      .from('recordings')
      .update({
        status: 'completed',
        processed_audio_url: urlData.publicUrl
      })
      .eq('id', recordingId);

    if (finalUpdateError) {
      console.error('Error updating recording with processed audio URL:', finalUpdateError);
      return new Response(
        JSON.stringify({ error: 'Error updating recording with processed audio URL' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`Successfully processed recording ${recordingId} with Kits.ai`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Recording processed successfully',
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
