
import { HfInference } from 'https://esm.sh/@huggingface/inference@2.6.4'

export async function testHuggingFaceConnection(hf: HfInference) {
  try {
    // First validate the client is properly initialized
    if (!hf) {
      throw new Error('Hugging Face client not initialized');
    }

    // Test with a simple sentiment analysis task first
    // This is a lighter model that's good for testing
    console.log('Testing basic API connectivity...');
    const result = await hf.textClassification({
      model: 'SamLowe/roberta-base-go_emotions',
      inputs: 'Test message'
    });
    
    if (!result) {
      throw new Error('No response from text classification test');
    }
    
    console.log('Basic API test succeeded:', result);

    // Now test specific audio model access
    console.log('Testing audio model access...');
    const audioModelInfo = await hf.modelInfo({
      model: 'facebook/demucs'
    });

    console.log('Audio model info:', audioModelInfo);

    // Test successful access to models needed for the app
    const requiredModels = [
      'facebook/demucs',           // For melody/drums separation
      'antonibigata/drummids'      // For drum classification
    ];

    for (const model of requiredModels) {
      console.log(`Validating access to ${model}...`);
      const modelInfo = await hf.modelInfo({ model });
      console.log(`Successfully validated access to ${model}`);
    }

    return {
      success: true,
      message: 'Successfully connected to Hugging Face API and verified all required model access'
    };

  } catch (error) {
    console.error('Test connection error:', {
      name: error.name,
      message: error.message,
      cause: error.cause,
      stack: error.stack
    });

    // Provide specific error messages based on error types
    if (error.message?.includes('401') || error.message?.includes('unauthorized')) {
      return {
        success: false,
        message: 'Invalid or expired Hugging Face API token. Please check your token.'
      };
    }

    if (error.message?.includes('403')) {
      return {
        success: false,
        message: 'Permission denied. Please ensure your API token has the right permissions.'
      };
    }

    if (error.message?.includes('404')) {
      return {
        success: false,
        message: 'One or more required models not found. Please ensure you have access to all required models.'
      };
    }

    return {
      success: false,
      message: `Connection test failed: ${error.message}`
    };
  }
}
