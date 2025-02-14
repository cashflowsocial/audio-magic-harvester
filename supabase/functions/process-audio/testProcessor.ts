
import { HfInference } from 'https://esm.sh/@huggingface/inference@2.6.4'

export async function testHuggingFaceConnection(hf: HfInference) {
  try {
    // Test with a simple text classification task
    const result = await hf.textClassification({
      model: 'distilbert-base-uncased-finetuned-sst-2-english',
      inputs: 'Testing connection'
    });

    console.log('Test result:', result);

    return {
      success: true,
      message: 'Successfully connected to Hugging Face API'
    };
  } catch (error) {
    console.error('Test connection error:', error);
    return {
      success: false,
      message: `Connection test failed: ${error.message}`
    };
  }
}
