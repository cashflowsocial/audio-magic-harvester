
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { melody_url, prompt } = await req.json();
    console.log('Processing with MusicGen:', { melody_url, prompt });

    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) {
      throw new Error('REPLICATE_API_KEY is not set');
    }

    const replicate = new Replicate({
      auth: REPLICATE_API_KEY,
    });

    // Prepare the input parameters for MusicGen
    const input = {
      model_version: "melody",
      prompt: prompt || "Create a modern musical accompaniment",
      duration: 8,
      continuation: false,
      normalization_strategy: "peak",
      output_format: "wav",
      temperature: 1,
    };

    // If melody URL is provided, add it to the input
    if (melody_url) {
      input["melody_url"] = melody_url;
    }

    console.log('Starting MusicGen generation with input:', input);

    // Run the MusicGen model
    const output = await replicate.run(
      "meta/musicgen:b05b1dff1d8c6dc63d14b0cdb42135378dcb87f6373b0d3d341ede46e59e2b38",
      { input }
    );

    console.log('MusicGen generation completed:', output);

    return new Response(
      JSON.stringify({ output }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in MusicGen processing:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
