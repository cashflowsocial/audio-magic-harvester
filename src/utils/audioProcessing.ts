
import { HfInference } from '@huggingface/inference';
import { supabase } from "@/integrations/supabase/client";

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

export const saveToStorage = async (audioBlob: Blob) => {
  try {
    const filename = `recording-${Date.now()}.wav`;
    
    // Upload the audio file to Supabase Storage
    const { data, error } = await supabase.storage
      .from('recordings')
      .upload(filename, audioBlob);

    if (error) throw error;

    // Store the metadata in the database
    const { error: dbError } = await supabase
      .from('recordings')
      .insert({
        filename: filename,
        storage_path: data.path,
        timestamp: new Date().toISOString(),
      });

    if (dbError) throw dbError;

    return filename;
  } catch (error) {
    console.error('Error saving to Supabase:', error);
    throw error;
  }
};

export const getRecordingUrl = async (filename: string) => {
  const { data } = await supabase.storage
    .from('recordings')
    .getPublicUrl(filename);
  
  return data.publicUrl;
};
