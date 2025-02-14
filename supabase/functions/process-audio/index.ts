
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { HfInference } from 'https://esm.sh/@huggingface/inference@2.6.4'
import { corsHeaders } from './config.ts'
import { testHuggingFaceConnection } from './testProcessor.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const token = Deno.env.get('HUGGING_FACE_API_KEY');
    if (!token) {
      throw new Error('Hugging Face API token not configured');
    }

    console.log('Initializing Hugging Face client...');
    const hf = new HfInference(token);

    console.log('Testing Hugging Face connection...');
    const testResult = await testHuggingFaceConnection(hf);
    console.log('Connection test result:', testResult);

    if (!testResult.success) {
      throw new Error(testResult.message);
    }

    // Create response headers
    const responseHeaders = new Headers();
    for (const [key, value] of Object.entries(corsHeaders)) {
      responseHeaders.set(key, value);
    }
    responseHeaders.set('Content-Type', 'application/json');

    return new Response(
      JSON.stringify(testResult),
      { headers: responseHeaders }
    );

  } catch (error) {
    console.error('Error:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    // Create error response headers
    const errorHeaders = new Headers();
    for (const [key, value] of Object.entries(corsHeaders)) {
      errorHeaders.set(key, value);
    }
    errorHeaders.set('Content-Type', 'application/json');

    return new Response(
      JSON.stringify({
        success: false,
        message: error.message
      }),
      { 
        headers: errorHeaders,
        status: 500
      }
    );
  }
});
