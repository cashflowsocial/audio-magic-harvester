
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { analyzeAudio, AudioFeatures } from "./audioAnalysis";
import { analyzeBeatbox, createDrumSequence } from "./beatboxAnalysis";

type Recording = Database['public']['Tables']['recordings']['Row'];
type RecordingWithUrl = Recording & { url: string };

export const processAudio = async (audioBlob: Blob): Promise<Blob> => {
  try {
    // Convert blob to AudioBuffer for analysis
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Analyze the audio to detect beats
    const beatEvents = await analyzeBeatbox(audioBuffer);
    console.log('Detected beat events:', beatEvents);
    
    // Create a new audio sequence with drum samples
    const drumSequence = await createDrumSequence(beatEvents);
    
    // Convert back to blob
    // Convert the AudioBuffer to a Blob
    const offlineCtx = new OfflineAudioContext(drumSequence.numberOfChannels, drumSequence.length, drumSequence.sampleRate);
    const bufferSource = offlineCtx.createBufferSource();
    bufferSource.buffer = drumSequence;
    bufferSource.connect(offlineCtx.destination);
    bufferSource.start();

    const renderedBuffer = await offlineCtx.startRendering();

    // Convert AudioBuffer to Float32Array
    const left = renderedBuffer.getChannelData(0);
    const right = renderedBuffer.getChannelData(1);

    // Interleave the left and right channels into a single array
    const interleaved = new Float32Array(left.length + right.length);
    for (let i = 0; i < left.length; i++) {
        interleaved[i * 2] = left[i];
        interleaved[i * 2 + 1] = right[i];
    }

    // Create a WAV file from the interleaved data
    const wavData = createWavFile(interleaved, renderedBuffer.sampleRate);
    const blob = new Blob([wavData], { type: 'audio/wav' });

    return blob;
  } catch (error) {
    console.error('Error processing audio:', error);
    throw error;
  }
};

// Function to create a WAV file from Float32Array data
function createWavFile(samples: Float32Array, sampleRate: number): ArrayBuffer {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // RIFF size (4 bytes less than the total file size)
    view.setUint32(4, 36 + samples.length * 2, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // Format chunk identifier
    writeString(view, 12, 'fmt ');
    // Format chunk size (fixed at 16)
    view.setUint32(16, 16, true);
    // Audio format (1 for PCM)
    view.setUint16(20, 1, true);
    // Number of channels (2 for stereo)
    view.setUint16(22, 2, true);
    // Sample rate
    view.setUint32(24, sampleRate, true);
    // Byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * 4, true);
    // Block align (number of bytes per sample)
    view.setUint16(32, 4, true);
    // Bits per sample (16 bits)
    view.setUint16(34, 16, true);
    // Data chunk identifier
    writeString(view, 36, 'data');
    // Data chunk size (number of samples * bytes per sample)
    view.setUint32(40, samples.length * 2, true);

    // Write the samples
    floatTo16BitPCM(view, 44, samples);

    return buffer;
}

// Helper function to write a string to the DataView
function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// Helper function to convert Float32Array to 16-bit PCM
function floatTo16BitPCM(view: DataView, offset: number, input: Float32Array) {
    for (let i = 0; i < input.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, input[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
}

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
