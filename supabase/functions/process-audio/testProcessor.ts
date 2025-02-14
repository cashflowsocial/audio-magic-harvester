
import { HfInference } from 'https://esm.sh/@huggingface/inference@2.6.4'

export async function testHuggingFaceConnection(hf: HfInference) {
  try {
    // Basic validation
    if (!hf) {
      throw new Error('Hugging Face client not initialized');
    }

    // Test API connection with a simple text generation task
    console.log('Testing API connection...');
    try {
      await hf.textGeneration({
        model: "gpt2",
        inputs: "Hello world",
        parameters: {
          max_new_tokens: 5,
          return_full_text: false
        }
      });

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
