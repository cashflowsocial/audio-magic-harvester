
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

type Recording = Database['public']['Tables']['recordings']['Row'];
type RecordingWithUrl = Recording & { url: string };

export const processAudio = async (audioBlob: Blob): Promise<Blob> => {
  try {
    console.log(`Processing audio of type: ${audioBlob.type}, size: ${audioBlob.size} bytes`);
    
    // Ensure we have an MP3 blob with the correct MIME type
    // This doesn't actually convert the audio format but ensures the right MIME type is set
    const processedBlob = new Blob([audioBlob], { 
      type: 'audio/mpeg' 
    });
    
    console.log(`Processed audio blob type: ${processedBlob.type}, size: ${processedBlob.size} bytes`);
    return processedBlob;
  } catch (error) {
    console.error('Error processing audio:', error);
    throw error;
  }
};

export const saveToStorage = async (audioBlob: Blob) => {
  try {
    // Save as MP3 for compatibility with Kits.ai
    const filename = `recording-${Date.now()}.mp3`;
    
    // Ensure the blob has the correct MIME type for MP3 (crucial for Kits.ai)
    const blobToUpload = new Blob([audioBlob], { type: 'audio/mpeg' });
    
    console.log(`Uploading audio file: ${filename}, type: ${blobToUpload.type}, size: ${blobToUpload.size} bytes`);
    
    // Upload the audio file to Supabase Storage
    const { data, error } = await supabase.storage
      .from('recordings')
      .upload(filename, blobToUpload, {
        contentType: 'audio/mpeg', // Explicitly set the content type to MP3
        cacheControl: '3600'
      });

    if (error) {
      console.error('Supabase storage upload error:', error);
      throw error;
    }

    console.log('File uploaded successfully to path:', data.path);

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

    if (dbError) {
      console.error('Database insert error:', dbError);
      throw dbError;
    }

    // Get and return the public URL
    const audioUrl = await getRecordingUrl(filename);
    
    console.log('Recording saved with URL:', audioUrl);
    
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

// Helper function to validate audio file
export const validateAudioFormat = (blob: Blob): boolean => {
  const validMimeTypes = ['audio/mpeg', 'audio/mp3', 'audio/webm', 'audio/wav'];
  return validMimeTypes.includes(blob.type) && blob.size > 0;
};

export type { RecordingWithUrl };
