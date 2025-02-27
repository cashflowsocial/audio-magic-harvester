import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  let recordingId = null;

  try {
    const { recordingId: reqRecordingId, type } = await req.json();
    recordingId = reqRecordingId;
    
    if (!recordingId) {
      return new Response(JSON.stringify({ error: 'Recording ID is required' }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 
      });
    }

    console.log(`Processing recording ${recordingId} with HuggingFace for ${type}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const huggingFaceApiKey = Deno.env.get('HUGGING_FACE_API_KEY') ?? '';

    if (!huggingFaceApiKey) {
      return new Response(JSON.stringify({ error: 'HuggingFace API key is missing' }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase.from('recordings').update({ status: 'processing', processing_type: type }).eq('id', recordingId);

    const { data: recording } = await supabase.from('recordings').select('*').eq('id', recordingId).single();

    if (!recording) {
      return new Response(JSON.stringify({ error: 'Recording not found' }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 
      });
    }

    const { data: fileData } = await supabase.storage.from('recordings').download(recording.filename);

    const arrayBuffer = await fileData.arrayBuffer();
    const audioBlob = new Blob([arrayBuffer], { type: 'audio/wav' });

    let model = type === 'hf-drums' ? "RegalHyperus/DrumKitRVCModels" : "facebook/musicgen-small";

    console.log(`Using HuggingFace model: ${model}`);

    let apiUrl = `https://api-inference.huggingface.co/models/${model}`;

    const hfResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${huggingFaceApiKey}`,
        'Content-Type': 'application/octet-stream'
      },
      body: arrayBuffer
    });

    if (!hfResponse.ok) {
      const errorText = await hfResponse.text();
      console.error(`HuggingFace API error: ${hfResponse.status} - ${errorText}`);

      await supabase.from('recordings').update({ 
        status: 'failed', 
        error_message: `HuggingFace API error: ${hfResponse.status} - ${errorText}` 
      }).eq('id', recordingId);

      return new Response(JSON.stringify({ error: `HuggingFace API error: ${hfResponse.status}` }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 
      });
    }

    const responseBuffer = await hfResponse.arrayBuffer();
    const processedFilename = `processed-${type}-${recording.filename}`;
    const processedAudioBlob = new Blob([responseBuffer], { type: 'audio/wav' });

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('recordings')
      .upload(processedFilename, processedAudioBlob, { upsert: true });

    if (uploadError) {
      console.error('Error uploading processed audio:', uploadError);
      
      await supabase.from('recordings').update({ 
        status: 'failed', 
        error_message: `Error uploading processed audio: ${uploadError.message}` 
      }).eq('id', recordingId);
        
      return new Response(JSON.stringify({ error: 'Error uploading processed audio' }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 
      });
    }

    const { data: urlData } = await supabase.storage.from('recordings').getPublicUrl(processedFilename);

    await supabase.from('recordings').update({ 
      status: 'completed', 
      processed_audio_url: urlData.publicUrl 
    }).eq('id', recordingId);

    return new Response(JSON.stringify({ success: true, message: 'Recording processed successfully', url: urlData.publicUrl }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 
    });

  } catch (error) {
    console.error('Error processing audio with HuggingFace:', error);
    return new Response(JSON.stringify({ error: `Internal Server Error: ${error.message}` }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 
    });
  }
});
