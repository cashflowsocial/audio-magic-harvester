
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ProcessingType, ProcessingResult } from './types.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt } = await req.json();

    // First, transcribe the audio using Whisper
    const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
      },
      body: formData,
    });

    if (!transcriptionResponse.ok) {
      throw new Error(`Whisper API error: ${await transcriptionResponse.text()}`);
    }

    const transcription = await transcriptionResponse.json();
    console.log('[Audio Processor] Transcription result:', transcription);

    // Now analyze the transcription with GPT-4 to create a drum pattern
    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a drum pattern expert that can interpret beatbox sounds and vocal drum imitations into precise drum patterns.
            
            When you receive a transcription of vocal drum sounds:
            1. First identify the tempo by analyzing the rhythm and spacing of the sounds
            2. Determine the time signature from the pattern repetition
            3. Map each sound to the corresponding drum:
               - Low sounds like "boom", "bm", "b", "puh" = Kick drum
               - Sharp sounds like "psh", "ka", "ts" = Snare drum
               - High sounds like "ts", "ch", "tss" = Hi-hat
               - Crash-like sounds = Crash cymbal
            4. Position each drum hit on a numerical timeline where:
               - 1 = first beat
               - 1.5 = eighth note after first beat
               - 2 = second beat
               etc.
            
            Return ONLY a valid JSON object with this exact format:
            {
              "tempo": number (between 60-200),
              "timeSignature": string (e.g. "4/4"),
              "pattern": {
                "kick": number[] (beat positions),
                "snare": number[] (beat positions),
                "hihat": number[] (beat positions),
                "crash": number[] (beat positions)
              }
            }`
          },
          {
            role: 'user',
            content: `Analyze these sounds carefully and create a precise musical pattern: ${transcription.text}`
          }
        ],
        temperature: 0.3,
      }),
    });

    if (!gptResponse.ok) {
      throw new Error(`GPT API error: ${await gptResponse.text()}`);
    }

    const analysis = await gptResponse.json();
    console.log('[Audio Processor] Pattern analysis:', analysis);

    const parsedAnalysis = JSON.parse(analysis.choices[0].message.content);

    // Generate the drum audio using the pattern
    const drumAudioBuffer = await generateDrumAudio(parsedAnalysis.pattern, parsedAnalysis.tempo);
    const drumAudioBlob = new Blob([drumAudioBuffer], { type: 'audio/wav' });

    // Upload to Supabase storage
    const fileName = `processed-drums-${crypto.randomUUID()}.mp3`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('processed_audio')
      .upload(fileName, drumAudioBlob);

    if (uploadError) {
      throw new Error(`Failed to upload processed audio: ${uploadError.message}`);
    }

    // Get the public URL
    const { data: { publicUrl } } = supabase.storage
      .from('processed_audio')
      .getPublicUrl(fileName);

    return new Response(
      JSON.stringify({
        type: 'drums',
        url: publicUrl,
        processed: true,
        analysis: analysis.choices[0].message.content,
        transcription: transcription.text,
        audioBuffer: drumAudioBuffer,
        musicalAnalysis: parsedAnalysis,
        tempo: parsedAnalysis.tempo,
        timeSignature: parsedAnalysis.timeSignature,
        patternData: parsedAnalysis.pattern
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Audio Processor] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Helper function to generate drum audio from pattern
const generateDrumAudio = async (pattern: any, tempo: number): Promise<ArrayBuffer> => {
  // Download the drum samples from Supabase storage
  const { data: kickData } = await supabase.storage.from('drum_samples').download('kick.mp3');
  const { data: snareData } = await supabase.storage.from('drum_samples').download('snare.mp3');
  const { data: hihatData } = await supabase.storage.from('drum_samples').download('hihat.mp3');
  const { data: crashData } = await supabase.storage.from('drum_samples').download('crash.mp3');

  if (!kickData || !snareData || !hihatData || !crashData) {
    throw new Error('Failed to download drum samples from storage');
  }

  const kickBuffer = await kickData.arrayBuffer();
  const snareBuffer = await snareData.arrayBuffer();
  const hihatBuffer = await hihatData.arrayBuffer();
  const crashBuffer = await crashData.arrayBuffer();

  // Create AudioContext
  const audioContext = new AudioContext();

  // Create buffers for each drum sound
  const kickAudioBuffer = await audioContext.decodeAudioData(kickBuffer);
  const snareAudioBuffer = await audioContext.decodeAudioData(snareBuffer);
  const hihatAudioBuffer = await audioContext.decodeAudioData(hihatBuffer);
  const crashAudioBuffer = await audioContext.decodeAudioData(crashBuffer);

  // Calculate beat duration in seconds
  const beatDuration = 60 / tempo;
  const totalBeats = Math.max(
    ...Object.values(pattern).flat().map(beat => Math.ceil(beat))
  );
  const duration = totalBeats * beatDuration;

  // Create an offline context for rendering
  const offlineContext = new OfflineAudioContext(2, duration * audioContext.sampleRate, audioContext.sampleRate);

  // Schedule drum hits
  const scheduleDrumHits = (buffer: AudioBuffer, beats: number[]) => {
    beats.forEach(beat => {
      const source = offlineContext.createBufferSource();
      source.buffer = buffer;
      source.connect(offlineContext.destination);
      source.start(beat * beatDuration);
    });
  };

  // Schedule all drum parts
  scheduleDrumHits(kickAudioBuffer, pattern.kick);
  scheduleDrumHits(snareAudioBuffer, pattern.snare);
  scheduleDrumHits(hihatAudioBuffer, pattern.hihat);
  scheduleDrumHits(crashAudioBuffer, pattern.crash);

  // Render audio
  const renderedBuffer = await offlineContext.startRendering();

  // Convert AudioBuffer to WAV
  const numberOfChannels = renderedBuffer.numberOfChannels;
  const length = renderedBuffer.length * numberOfChannels * 2;
  const buffer = new ArrayBuffer(44 + length);
  const view = new DataView(buffer);

  // Write WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, audioContext.sampleRate, true);
  view.setUint32(28, audioContext.sampleRate * numberOfChannels * 2, true);
  view.setUint16(32, numberOfChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length, true);

  // Write audio data
  const offset = 44;
  for (let i = 0; i < renderedBuffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = renderedBuffer.getChannelData(channel)[i];
      const clipped = Math.max(-1, Math.min(1, sample));
      const int16 = clipped < 0 ? clipped * 0x8000 : clipped * 0x7FFF;
      view.setInt16(offset + (i * numberOfChannels + channel) * 2, int16, true);
    }
  }

  return buffer;
};
