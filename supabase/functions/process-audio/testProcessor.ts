
import { HfInference } from 'https://esm.sh/@huggingface/inference@2.6.4';

export const testHuggingFaceConnection = async (hf: HfInference): Promise<{ success: boolean, message: string }> => {
  try {
    // Create a minimal audio test blob (1 second of silence)
    const sampleRate = 44100;
    const duration = 1; // 1 second
    const audioData = new Float32Array(sampleRate * duration);
    const audioBlob = new Blob([audioData], { type: 'audio/wav' });

    console.log('Starting test connection with blob:', {
      size: audioBlob.size,
      type: audioBlob.type
    });

    // Try the simplest possible classification task
    const result = await hf.audioClassification({
      data: audioBlob,
      model: 'antonibigata/drummids'
    });

    console.log('Test connection succeeded:', result);
    return {
      success: true,
      message: 'Successfully connected to Hugging Face API'
    };

  } catch (error) {
    console.error('Test connection failed:', {
      message: error.message,
      stack: error.stack,
      type: error.constructor.name
    });
    
    return {
      success: false,
      message: `Connection test failed: ${error.message}`
    };
  }
};
