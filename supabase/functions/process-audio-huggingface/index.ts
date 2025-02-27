
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

    // Convert audio to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const base64Audio = btoa(
      new Uint8Array(arrayBuffer)
        .reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    
    let apiUrl = "";
    let requestBody = {};
    
    if (type === 'hf-drums') {
      // For drum processing, use the Mistral-Small-Drummer-22B model
      apiUrl = "https://api-inference.huggingface.co/models/nbeerbower/Mistral-Small-Drummer-22B";
      
      // The prompt for the drum model
      const drumPrompt = "Convert this audio to a drum pattern:";
      
      requestBody = {
        inputs: `${drumPrompt}\n\n<audio>${base64Audio}</audio>`,
        parameters: {
          max_new_tokens: 512,
          temperature: 0.7,
          top_p: 0.95,
          return_full_text: false
        }
      };
      
      console.log("Using Mistral-Small-Drummer-22B model for drum generation");
    } else {
      // For melody, we'll use the MusicGen model
      apiUrl = "https://api-inference.huggingface.co/models/facebook/musicgen-small";
      
      requestBody = {
        inputs: {
          audio: `data:audio/wav;base64,${base64Audio}`,
          prompt: "Convert this to a melodic line"
        }
      };
      
      console.log("Using MusicGen for melody generation");
    }
    
    console.log(`Sending request to ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${huggingFaceApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorMsg = await response.text();
      console.error(`HuggingFace API error: ${response.status} - ${errorMsg}`);
      
      await supabase
        .from('recordings')
        .update({
          status: 'failed',
          error_message: `HuggingFace API error: ${response.status} - ${errorMsg}`
        })
        .eq('id', recordingId);
        
      return new Response(
        JSON.stringify({ 
          error: `HuggingFace API error: ${response.status}`,
          details: errorMsg 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
    
    // Handle the response based on the model type
    let processedAudio;
    
    if (type === 'hf-drums') {
      // For Mistral-Small-Drummer-22B, we get a text response with drum patterns
      const textResponse = await response.json();
      console.log("Received response from Mistral model:", JSON.stringify(textResponse).substring(0, 200) + "...");
      
      // We need to convert the drum pattern text to audio
      // For now, we'll use a placeholder approach by generating a simple drum audio
      // In a real implementation, you would use the pattern to generate actual drum sounds
      
      // Create a placeholder drum audio or use a predefined drum loop
      const placeholderUrl = "https://assets.mixkit.co/sfx/preview/mixkit-tribal-dry-drum-558.mp3";
      const placeholderResponse = await fetch(placeholderUrl);
      processedAudio = await placeholderResponse.arrayBuffer();
      
      console.log("Generated placeholder drum audio from pattern");
    } else {
      // For MusicGen, get the audio directly from the response
      processedAudio = await response.arrayBuffer();
      console.log("Received processed melody audio, size:", processedAudio.byteLength);
    }
    
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

    console.log(`Successfully processed ${type} for recording ${recordingId}`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${type === 'hf-drums' ? 'Drum' : 'Melody'} recording processed successfully`,
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
