
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
    await supabase
      .from('recordings')
      .update({
        status: 'processing',
        processing_type: type
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

    // Create FormData to send the file directly
    const formData = new FormData();
    formData.append("file", fileData, "audio.wav");
    
    let apiUrl = "";
    
    if (type === 'hf-drums') {
      // For DrumKitRVCModels, we use the audio-to-audio API
      apiUrl = "https://regalzhyperus-drumkitrvcmodels.hf.space/api/predict";
      console.log("Using the RegalHyperus DrumKitRVCModels Spaces API endpoint");
    } else {
      // For melody, we'll use the standard HuggingFace API
      apiUrl = "https://api-inference.huggingface.co/models/facebook/musicgen-small";
      console.log("Using the standard HuggingFace API for MusicGen");
    }
    
    let response;
    
    if (type === 'hf-drums') {
      // For DrumKitRVCModels, we use a custom API format for the Spaces API
      const formData = new FormData();
      formData.append("data", fileData, "audio.wav");
      formData.append("transposition", "0");  // Default transposition
      formData.append("model", "grit_tape_drums");  // Sample drum model
      
      console.log("Sending request to Spaces API for drum conversion");
      
      response = await fetch(apiUrl, {
        method: "POST",
        body: formData
      });
    } else {
      // For musicgen, use the standard HuggingFace API
      const arrayBuffer = await fileData.arrayBuffer();
      const base64Audio = btoa(
        new Uint8Array(arrayBuffer)
          .reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      
      const requestBody = {
        inputs: {
          audio: `data:audio/wav;base64,${base64Audio}`,
          prompt: "Convert this to a melodic line"
        }
      };
      
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${huggingFaceApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
    }

    if (!response.ok) {
      const errorMsg = await response.text();
      console.error(`API error: ${response.status} - ${errorMsg}`);
      
      await supabase
        .from('recordings')
        .update({
          status: 'failed',
          error_message: `API error: ${response.status} - ${errorMsg}`
        })
        .eq('id', recordingId);
        
      return new Response(
        JSON.stringify({ 
          error: `API error: ${response.status}`,
          details: errorMsg 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
    
    // Parse the response based on the type
    let processedAudio;
    
    if (type === 'hf-drums') {
      // The Spaces API returns a JSON with data URLs
      const responseData = await response.json();
      console.log("Received response from Spaces API:", JSON.stringify(responseData).substring(0, 100) + "...");
      
      // Extract the audio data URL from the response
      const audioDataUrl = responseData.data?.[1]?.data;
      
      if (!audioDataUrl) {
        throw new Error("No audio data returned from the Spaces API");
      }
      
      // Convert the data URL to a blob
      const base64Data = audioDataUrl.split(',')[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      processedAudio = bytes.buffer;
    } else {
      // For musicgen, get the audio directly
      processedAudio = await response.arrayBuffer();
    }
    
    console.log('Received processed audio, size:', processedAudio.byteLength);
    
    // Create processed filename
    const processedFilename = `processed-${type}-${recording.filename}`;
    
    // Upload the processed audio to storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('recordings')
      .upload(processedFilename, processedAudio, {
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
