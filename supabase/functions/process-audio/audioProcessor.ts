
import { HfInference } from 'https://esm.sh/@huggingface/inference@2.6.4';
import { ProcessingType, ProcessingResult } from './types.ts';

export const processAudio = async (
  hf: HfInference,
  audioBlob: Blob,
  processingType: ProcessingType,
  publicUrl: string
): Promise<ProcessingResult> => {
  console.log(`Processing ${processingType} extraction...`);
  
  switch (processingType) {
    case 'melody':
      await hf.audioToAudio({
        model: 'facebook/demucs',
        data: audioBlob,
        parameters: {
          target: 'vocals'
        }
      });
      
      return {
        type: 'melody',
        url: publicUrl,
        processed: true
      };
      
    case 'drums':
      await hf.audioToAudio({
        model: 'facebook/demucs',
        data: audioBlob,
        parameters: {
          target: 'drums'
        }
      });
      
      const drumClassification = await hf.audioClassification({
        model: 'antonibigata/drummids',
        data: audioBlob
      });
      
      return {
        type: 'drums',
        url: publicUrl,
        classification: drumClassification,
        processed: true
      };
      
    case 'instrumentation':
      await hf.audioToAudio({
        model: 'facebook/demucs',
        data: audioBlob,
        parameters: {
          target: 'other'
        }
      });
      
      return {
        type: 'instrumentation',
        url: publicUrl,
        processed: true
      };
      
    default:
      throw new Error(`Unknown processing type: ${processingType}`);
  }
};
