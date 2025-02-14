
import { HfInference } from 'https://esm.sh/@huggingface/inference@2.6.4'

export async function testHuggingFaceConnection(hf: HfInference) {
  try {
    // First validate the client is properly initialized
    if (!hf) {
      throw new Error('Hugging Face client not initialized');
    }

    // Test with a simple text classification task
    console.log('Testing basic API connectivity...');
    const result = await hf.textClassification({
      model: 'distilbert-base-uncased-finetuned-sst-2-english',
      inputs: 'Test message'
    });
    
    console.log('Basic API test succeeded:', result);

    return {
      success: true,
      message: 'Successfully connected to Hugging Face API'
    };

  } catch (error) {
    console.error('Test connection error:', {
      name: error.name,
      message: error.message
    });

    if (error.message?.includes('401') || error.message?.includes('unauthorized')) {
      return {
        success: false,
        message: 'Invalid or expired Hugging Face API token. Please check your token.'
      };
    }

    return {
      success: false,
      message: `Connection test failed: ${error.message}`
    };
  }
}
