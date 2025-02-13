
import { HfInference } from 'https://esm.sh/@huggingface/inference@2.6.4';
import { ProcessingType, ProcessingResult } from './types.ts';

export const processAudio = async (
  hf: HfInference,
  audioBlob: Blob,
  processingType: ProcessingType,
  publicUrl: string
): Promise<ProcessingResult> => {
  console.log(`Processing ${processingType} extraction...`);
  
  // Ensure proper headers for HF API calls
  const requestOptions = {
    headers: {
      'Accept': 'audio/wav, audio/*, */*',
      'Content-Type': 'audio/wav'
    }
  };
  
  switch (processingType) {
    case 'melody':
      console.log('Starting melody extraction...');
      const melodyResult = await hf.audioToAudio({
        model: 'facebook/demucs',
        data: audioBlob,
        parameters: {
          target: 'vocals'
        }
      }, requestOptions);
      
      console.log('Melody extraction completed');
      return {
        type: 'melody',
        url: publicUrl,
        processed: true
      };
      
    case 'drums':
      console.log('Starting drums extraction...');
      const drumsResult = await hf.audioToAudio({
        model: 'facebook/demucs',
        data: audioBlob,
        parameters: {
          target: 'drums'
        }
      }, requestOptions);
      
      console.log('Starting drum classification...');
      const drumClassification = await hf.audioClassification({
        model: 'antonibigata/drummids',
        data: audioBlob
      }, requestOptions);
      
      console.log('Drums processing completed');
      return {
        type: 'drums',
        url: publicUrl,
        classification: drumClassification,
        processed: true
      };
      
    case 'instrumentation':
      console.log('Starting instrumentation extraction...');
      const instrumentResult = await hf.audioToAudio({
        model: 'facebook/demucs',
        data: audioBlob,
        parameters: {
          target: 'other'
        }
      }, requestOptions);
      
      console.log('Instrumentation extraction completed');
      return {
        type: 'instrumentation',
        url: publicUrl,
        processed: true
      };
      
    default:
      throw new Error(`Unknown processing type: ${processingType}`);
  }
};
