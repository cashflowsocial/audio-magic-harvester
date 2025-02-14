
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

    // Test API connection
    console.log('Testing API connection...');
    const response = await hf.textGeneration({
      inputs: "Hello, how are you?",
      model: "gpt2",
      max_new_tokens: 5
    });

    console.log('Response from Hugging Face:', response);

    return {
      success: true,
      message: 'Successfully connected to Hugging Face API'
    };

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
