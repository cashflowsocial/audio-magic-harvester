
import { HfInference } from 'https://esm.sh/@huggingface/inference@2.6.4';
import { ProcessingType, ProcessingResult } from './types.ts';

export const processAudio = async (
  hf: HfInference,
  audioBlob: Blob,
  processingType: ProcessingType,
  publicUrl: string
): Promise<ProcessingResult> => {
  try {
    console.log(`Starting ${processingType} processing with blob:`, {
      size: audioBlob.size,
      type: audioBlob.type
    });

    // Validate audio blob
    if (audioBlob.size === 0) {
      throw new Error('Audio blob is empty');
    }

    // Test a small portion of the audio first
    console.log('Testing audio processing...');
    
    switch (processingType) {
      case 'melody':
        console.log('Attempting melody extraction...');
        try {
          const result = await hf.audioToAudio({
            model: 'facebook/demucs',
            data: audioBlob,
            parameters: {
              target: 'vocals'
            }
          });
          console.log('Melody extraction succeeded');
          return {
            type: 'melody',
            url: publicUrl,
            processed: true
          };
        } catch (melodyError) {
          console.error('Melody extraction failed:', melodyError);
          throw melodyError;
        }
        
      case 'drums':
        console.log('Attempting drums extraction...');
        try {
          await hf.audioToAudio({
            model: 'facebook/demucs',
            data: audioBlob,
            parameters: {
              target: 'drums'
            }
          });
          
          console.log('Attempting drum classification...');
          const drumClassification = await hf.audioClassification({
            model: 'antonibigata/drummids',
            data: audioBlob
          });
          
          console.log('Drums processing succeeded');
          return {
            type: 'drums',
            url: publicUrl,
            classification: drumClassification,
            processed: true
          };
        } catch (drumsError) {
          console.error('Drums processing failed:', drumsError);
          throw drumsError;
        }
        
      case 'instrumentation':
        console.log('Attempting instrumentation extraction...');
        try {
          await hf.audioToAudio({
            model: 'facebook/demucs',
            data: audioBlob,
            parameters: {
              target: 'other'
            }
          });
          
          console.log('Instrumentation extraction succeeded');
          return {
            type: 'instrumentation',
            url: publicUrl,
            processed: true
          };
        } catch (instrumentationError) {
          console.error('Instrumentation processing failed:', instrumentationError);
          throw instrumentationError;
        }
        
      default:
        throw new Error(`Unknown processing type: ${processingType}`);
    }
  } catch (error) {
    console.error('Audio processing error:', {
      message: error.message,
      stack: error.stack,
      type: error.constructor.name
    });
    throw error;
  }
};
