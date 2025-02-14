
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { HfInference } from 'https://esm.sh/@huggingface/inference@2.6.4'
import { corsHeaders } from './config.ts'
import { testHuggingFaceConnection } from './testProcessor.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const token = Deno.env.get('HUGGING_FACE_API_KEY');
    if (!token) {
      throw new Error('Hugging Face API token not configured');
    }

    console.log('Initializing Hugging Face client...');
    // Initialize with proper token string
    const hf = new HfInference(String(token));

    // Test the connection
    console.log('Testing Hugging Face connection...');
    const testResult = await testHuggingFaceConnection(hf);
    console.log('Connection test result:', testResult);

    if (!testResult.success) {
      throw new Error(testResult.message);
    }

    return new Response(
      JSON.stringify(testResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    return new Response(
      JSON.stringify({
        success: false,
        message: error.message
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
