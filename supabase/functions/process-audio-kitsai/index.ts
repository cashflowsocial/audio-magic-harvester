import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let recordingId: string | null = null;

  try {
    const clonedReq = req.clone();
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

    // Fetch model details from Kits.AI API
    const modelEndpoint = `https://arpeggi.io/api/kits/v1/voice-models/110784`;
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

      return new Response(
        JSON.stringify({ error: `Kits.ai API error: ${modelResponse.status}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const modelData = await modelResponse.json();
    console.log('Successfully fetched model data:', modelData);

    // Extract model_id dynamically
    const modelId = modelData.id || "110784"; // Fallback to default ID if missing
    console.log(`Using model ID: ${modelId}`);

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

    // Download audio file
    const { data: fileData, error: fileError } = await supabase.storage
      .from('recordings')
      .download(recording.filename);

    if (fileError || !fileData) {
      console.error('Error downloading audio file:', fileError);
      return new Response(
        JSON.stringify({ error: 'Error downloading audio file' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`Successfully downloaded recording ${recording.filename}`);

    // Convert file to base64
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8Array.byteLength; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64Data = btoa(binary);

    // Send audio to Kits.AI for conversion
    const generateEndpoint = `https://arpeggi.io/api/kits/v1/generate`;
    console.log(`Sending audio to conversion endpoint: ${generateEndpoint}`);

    const generateRequestBody = {
      model_id: modelId,
      audio: `data:audio/wav;base64,${base64Data}`
    };

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
      console.error(`Kits.ai conversion error: ${generateResponse.status} - ${errorText}`);

      return new Response(
        JSON.stringify({ error: `Kits.ai conversion error: ${generateResponse.status}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const generatedData = await generateResponse.json();
    console.log('Received generated audio:', generatedData);

    if (!generatedData.audio) {
      return new Response(
        JSON.stringify({ error: 'No audio data in Kits.ai response' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Convert base64 audio back to binary
    const base64Audio = generatedData.audio.split(',')[1];
    const binaryStr = atob(base64Audio);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Save processed audio
    const processedFilename = `processed-${type}-${recording.filename}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('recordings')
      .upload(processedFilename, bytes.buffer, {
        contentType: 'audio/wav',
        upsert: true
      });

    if (uploadError) {
      console.error('Error uploading processed audio:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Error uploading processed audio' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Get public URL of processed file
    const { data: urlData } = await supabase.storage
      .from('recordings')
      .getPublicUrl(processedFilename);

    console.log(`Successfully processed recording ${recordingId}`);

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

    return new Response(
      JSON.stringify({ error: `Error processing audio: ${error.message || 'Unknown error'}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
