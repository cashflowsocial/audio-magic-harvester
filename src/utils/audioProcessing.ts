
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
    // Save as MP3 for compatibility with Kits.ai
    const filename = `recording-${Date.now()}.mp3`;
    
    // If the blob is not already an MP3 file, ensure it's set with the right MIME type
    // Note: For a complete solution, actual audio conversion would be needed
    // but for now we'll use MIME type setting to help with compatibility
    let blobToUpload = audioBlob;
    if (audioBlob.type !== 'audio/mpeg') {
      console.log(`Setting MIME type to audio/mpeg for Kits.ai compatibility`);
      blobToUpload = new Blob([audioBlob], { type: 'audio/mpeg' });
    }
    
    // Upload the audio file to Supabase Storage
    const { data, error } = await supabase.storage
      .from('recordings')
      .upload(filename, blobToUpload, {
        contentType: 'audio/mpeg' // Explicitly set the content type to MP3
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
