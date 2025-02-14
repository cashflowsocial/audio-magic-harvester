
import { HfInference } from 'https://esm.sh/@huggingface/inference@2.6.4';

export const testHuggingFaceConnection = async (hf: HfInference): Promise<{ success: boolean, message: string }> => {
  try {
    console.log('Starting Hugging Face connection test...');

    // First try to check the token validity with a simple text classification
    const result = await hf.textClassification({
      model: 'SamLowe/roberta-base-go_emotions',
      inputs: 'Test message'
    });

    console.log('Initial token test succeeded:', result);

    // Now test audio model specifically
    console.log('Testing audio model access...');
    const modelInfo = await hf.getModelInfo('facebook/demucs');
    console.log('Audio model info:', modelInfo);

    return {
      success: true,
      message: 'Successfully connected to Hugging Face API and verified audio model access'
    };

  } catch (error) {
    console.error('Test connection failed:', {
      message: error.message,
      stack: error.stack,
      type: error.constructor.name
    });
    
    // Provide more specific error messages
    if (error.message.includes('unauthorized')) {
      return {
        success: false,
        message: 'Invalid or missing Hugging Face API token. Please check your token in Supabase Edge Function secrets.'
      };
    }
    
    if (error.message.includes('not found')) {
      return {
        success: false,
        message: 'Could not access required models. Please ensure you have access to the required models.'
      };
    }
    
    return {
      success: false,
      message: `Connection test failed: ${error.message}`
    };
  }
};
