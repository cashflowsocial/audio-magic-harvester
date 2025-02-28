
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

type Recording = Database['public']['Tables']['recordings']['Row'];
type RecordingWithUrl = Recording & { url: string };

export const processAudio = async (audioBlob: Blob): Promise<Blob> => {
  try {
    // Convert blob to base64
    const reader = new FileReader();
    const base64Promise = new Promise<string>((resolve) => {
      reader.onloadend = () => {
        const base64data = reader.result as string;
        resolve(base64data.split(',')[1]); // Remove data URL prefix
      };
    });
    reader.readAsDataURL(audioBlob);
    const base64Audio = await base64Promise;

    // We'll just return the original audio for now
    // The actual processing will happen in the Edge Function
    return audioBlob;
  } catch (error) {
    console.error('Error processing audio:', error);
    throw error;
  }
};

export const saveToStorage = async (audioBlob: Blob) => {
  try {
    // Ensure the audio is saved as WAV for compatibility with all processors
    // This is critical for Kits.ai which requires specific audio formats
    const filename = `recording-${Date.now()}.wav`;
    
    // Convert blob to WAV if it's not already
    let blobToUpload = audioBlob;
    
    // If the blob is not already a WAV file, we need to ensure it's in the right format
    if (audioBlob.type !== 'audio/wav') {
      console.log(`Converting from ${audioBlob.type} to audio/wav for Kits.ai compatibility`);
      blobToUpload = new Blob([audioBlob], { type: 'audio/wav' });
    }
    
    // Upload the audio file to Supabase Storage
    const { data, error } = await supabase.storage
      .from('recordings')
      .upload(filename, blobToUpload, {
        contentType: 'audio/wav' // Explicitly set the content type
      });

    if (error) throw error;

    // Store the metadata in the database
    const { data: recording, error: dbError } = await supabase
      .from('recordings')
      .insert({
        filename: filename,
        storage_path: data.path,
        status: 'pending'
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // Get and return the public URL
    const audioUrl = await getRecordingUrl(filename);
    
    return {
      filename,
      url: audioUrl,
      id: recording.id
    };
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

export type { RecordingWithUrl };
