
import { HfInference } from '@huggingface/inference';
import { supabase } from "@/integrations/supabase/client";

export const processAudio = async (audioBlob: Blob) => {
  try {
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
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // Get the public URL before triggering processing
    const audioUrl = await getRecordingUrl(filename);

    // Trigger AI processing with properly structured data
    const { data: processingResult, error: processError } = await supabase.functions
      .invoke('process-audio', {
        body: {
          recordingId: recording.id,
          audioUrl: audioUrl
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });

    if (processError) {
      console.error('Error triggering audio processing:', processError);
      throw processError;
    }

    return {
      filename,
      processedTrackId: processingResult.processedTrackId
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

export const checkProcessingStatus = async (processedTrackId: string) => {
  const { data, error } = await supabase
    .from('processed_tracks')
    .select('*')
    .eq('id', processedTrackId)
    .single();

  if (error) throw error;
  return data;
};
