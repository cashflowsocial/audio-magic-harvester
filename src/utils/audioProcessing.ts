
import { HfInference } from '@huggingface/inference';

// Initialize the Hugging Face inference client
const inference = new HfInference();

export const processAudio = async (audioBlob: Blob) => {
  try {
    // For MVP, we'll just return the original audio
    // TODO: Implement AI processing once we have the API key configured
    return audioBlob;
  } catch (error) {
    console.error('Error processing audio:', error);
    throw error;
  }
};

export const saveToLocalStorage = (audioBlob: Blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        const recordings = JSON.parse(localStorage.getItem('recordings') || '[]');
        recordings.push({
          id: Date.now(),
          data: reader.result,
          timestamp: new Date().toISOString(),
        });
        localStorage.setItem('recordings', JSON.stringify(recordings));
        resolve(true);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(audioBlob);
  });
};
