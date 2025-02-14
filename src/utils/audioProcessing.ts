
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { analyzeAudio, AudioFeatures } from "./audioAnalysis";

type Recording = Database['public']['Tables']['recordings']['Row'];
type RecordingWithUrl = Recording & { url: string };

export const processAudio = async (audioBlob: Blob): Promise<Blob> => {
  try {
    // Convert blob to AudioBuffer for analysis
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Analyze the audio
    const features = await analyzeAudio(audioBuffer);
    console.log('Analyzed audio features:', features);
    
    // Store features in the blob's metadata or process them as needed
    // For now, we'll just log them and return the original blob
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
    const { data: recording, error: dbError } = await supabase
      .from('recordings')
      .insert({
        filename: filename,
        storage_path: data.path,
        timestamp: new Date().toISOString(),
        status: 'completed'
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
