
import { HfInference } from 'https://esm.sh/@huggingface/inference@2.6.4'

export async function testHuggingFaceConnection(hf: HfInference) {
  try {
    // Basic validation
    if (!hf) {
      throw new Error('Hugging Face client not initialized');
    }

    const token = Deno.env.get('HUGGING_FACE_API_KEY');
    if (!token) {
      throw new Error('API token not found');
    }

    console.log('Testing API connection...');
    try {
      // Create a simple test request to the Hugging Face API
      const response = await fetch('https://api-inference.huggingface.co/status', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API responded with status ${response.status}`);
      }

      const data = await response.json();
      console.log('Hugging Face API response:', data);

      return {
        success: true,
        message: 'Successfully connected to Hugging Face API'
      };
      
    } catch (apiError) {
      console.error('API Error:', apiError);
      throw new Error(`API request failed: ${apiError.message}`);
    }

  } catch (error) {
    console.error('Detailed error:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });

    return {
      success: false,
      message: `Connection test failed: ${error.message}`
    };
  }
}
