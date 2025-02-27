
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
    const { recordingId: reqRecordingId, type } = await req.json();
    recordingId = reqRecordingId;
    
    if (!recordingId) {
      return new Response(
        JSON.stringify({ error: 'Recording ID is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Processing recording ${recordingId} with HuggingFace for ${type}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const huggingFaceApiKey = Deno.env.get('HUGGING_FACE_API_KEY') ?? '';
    
    if (!huggingFaceApiKey) {
      return new Response(
        JSON.stringify({ error: 'HuggingFace API key is not configured' }),
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

    // Convert audio to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const base64Audio = btoa(
      new Uint8Array(arrayBuffer)
        .reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    // Select the appropriate model based on type
    let model = "";
    
    if (type === 'hf-drums') {
      // Using the DrumKitRVCModels for drums
      model = "RegalHyperus/DrumKitRVCModels";
    } else {
      // Default melody model
      model = "facebook/musicgen-small";
    }
    
    console.log(`Using HuggingFace model: ${model}`);

    // Prepare the API request based on model type
    let apiUrl = `https://api-inference.huggingface.co/models/${model}`;
    let requestBody = {};
    let headers = {
      'Authorization': `Bearer ${huggingFaceApiKey}`,
      'Content-Type': 'application/json'
    };
    
    if (type === 'hf-drums') {
      // For the DrumKitRVCModels, we need to send raw audio data
      // Since this is a voice conversion model, we don't specify a task
      requestBody = {
        inputs: `data:audio/wav;base64,${base64Audio}`,
        parameters: {
          voice_pitch_scale: 0,
          f0_method: "crepe",
          index_rate: 0.5,
          protect: 0.33,
          filter_radius: 3
        }
      };
    } else if (type === 'hf-melody') {
      // Melody generation with MusicGen
      requestBody = {
        inputs: {
          audio: `data:audio/wav;base64,${base64Audio}`,
          prompt: "Convert this to a melodic line"
        }
      };
    }

    console.log(`Sending request to HuggingFace API: ${apiUrl}`);
    console.log(`Request parameters:`, JSON.stringify(requestBody).substring(0, 200) + '...');

    // Send request to HuggingFace API
    const hfResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!hfResponse.ok) {
      const errorText = await hfResponse.text();
      console.error(`HuggingFace API error: ${hfResponse.status} - ${errorText}`);
      
      await supabase
        .from('recordings')
        .update({
          status: 'failed',
          error_message: `HuggingFace API error: ${hfResponse.status} - ${errorText}`
        })
        .eq('id', recordingId);
        
      return new Response(
        JSON.stringify({ error: `HuggingFace API error: ${hfResponse.status}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Get the response data from HuggingFace
    const responseBuffer = await hfResponse.arrayBuffer();
    console.log('Received response from HuggingFace, size:', responseBuffer.byteLength);

    // Create processed filename
    const processedFilename = `processed-${type}-${recording.filename}`;
    
    // Upload the processed audio to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('recordings')
      .upload(processedFilename, responseBuffer, {
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

    console.log(`Successfully processed recording ${recordingId} with HuggingFace`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Recording processed successfully',
        url: urlData.publicUrl
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error processing audio with HuggingFace:', error);
    
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
            error_message: `Error processing audio with HuggingFace: ${error instanceof Error ? error.message : 'Unknown error'}`
          })
          .eq('id', recordingId);
      } catch (updateError) {
        console.error('Error updating recording status after failure:', updateError);
      }
    }
    
    return new Response(
      JSON.stringify({ error: `Error processing audio with HuggingFace: ${error instanceof Error ? error.message : 'Unknown error'}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
