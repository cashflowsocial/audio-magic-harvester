
import { HfInference } from 'https://esm.sh/@huggingface/inference@2.6.4'

export async function testHuggingFaceConnection(hf: HfInference) {
  try {
    // Basic validation
    if (!hf) {
      throw new Error('Hugging Face client not initialized');
    }

    // Try a simple inference task
    console.log('Testing API connection with basic inference...');
    const response = await hf.textClassification({
      model: 'distilbert-base-uncased-finetuned-sst-2-english',
      inputs: 'Testing connection'
    });

    console.log('Response from Hugging Face:', response);

    if (!response) {
      throw new Error('No response received from Hugging Face API');
    }

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

    // Check for specific error types
    if (error.message?.includes('401')) {
      return {
        success: false,
        message: 'Authentication failed. Please check your API token.'
      };
    }

    return {
      success: false,
      message: `Connection test failed: ${error.message}`
    };
  }
}
