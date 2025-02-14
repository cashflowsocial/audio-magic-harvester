
import { ProcessingType, ProcessingResult } from './types.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const generateDrumAudio = async (pattern: any, tempo: number): Promise<ArrayBuffer> => {
  // Download the drum samples
  const kickResponse = await fetch('https://cdn.lovable.dev/drums/kick.mp3');
  const snareResponse = await fetch('https://cdn.lovable.dev/drums/snare.mp3');
  const hihatResponse = await fetch('https://cdn.lovable.dev/drums/hihat.mp3');
  const crashResponse = await fetch('https://cdn.lovable.dev/drums/crash.mp3');

  const kickBuffer = await kickResponse.arrayBuffer();
  const snareBuffer = await snareResponse.arrayBuffer();
  const hihatBuffer = await hihatResponse.arrayBuffer();
  const crashBuffer = await crashResponse.arrayBuffer();

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

export const processAudio = async (
  audioUrl: string,
  processingType: ProcessingType
): Promise<ProcessingResult> => {
  try {
    console.log(`[Audio Processor] Starting ${processingType} processing for audio at ${audioUrl}`);

    // Download the audio file
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch audio file');
    }

    console.log('[Audio Processor] Successfully downloaded audio file');
    const audioBuffer = await response.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });

    // Transcribe using Whisper API
    console.log('[Audio Processor] Transcribing audio with Whisper...');
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.wav');
    formData.append('model', 'whisper-1');

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      console.error('[Audio Processor] Whisper API error:', errorText);
      throw new Error(`Whisper API error: ${errorText}`);
    }

    const transcription = await whisperResponse.json();
    console.log('[Audio Processor] Transcription result:', transcription);

    // Analyze with GPT-4
    console.log('[Audio Processor] Generating musical analysis...');
    const systemPrompt = processingType === 'drums' ? 
      `You are a drum pattern expert that can interpret beatbox sounds and vocal drum imitations into precise drum patterns.
      
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
      : `You are a musical expert that can interpret sung or hummed melodies into precise musical patterns.
      
      When you receive a transcription of a melody:
      1. First identify the tempo from the rhythm
      2. Determine the time signature from the pattern
      3. Map the notes to a numerical scale where:
         - 1-7 represents scale degrees in the major scale
         - 0 represents rests
      4. Map note durations where:
         - 1 = quarter note
         - 0.5 = eighth note
         - 2 = half note
         etc.
      
      Return ONLY a valid JSON object with this exact format:
      {
        "tempo": number (between 60-200),
        "timeSignature": string (e.g. "4/4"),
        "pattern": {
          "notes": number[] (scale degrees),
          "durations": number[] (note lengths)
        }
      }`;

    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',  // Fixed model name
        messages: [
          {
            role: 'system',
            content: systemPrompt
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
      const errorText = await gptResponse.text();
      console.error('[Audio Processor] GPT API error:', errorText);
      throw new Error(`GPT API error: ${errorText}`);
    }

    const analysis = await gptResponse.json();
    console.log('[Audio Processor] Musical analysis:', analysis);

    const analysisContent = analysis.choices[0].message.content;
    let parsedAnalysis;
    try {
      parsedAnalysis = JSON.parse(analysisContent);
      
      // Validate the parsed analysis
      if (!parsedAnalysis.tempo || !parsedAnalysis.timeSignature || !parsedAnalysis.pattern) {
        throw new Error('Invalid analysis format: missing required fields');
      }
      
      if (processingType === 'drums') {
        if (!Array.isArray(parsedAnalysis.pattern.kick) || 
            !Array.isArray(parsedAnalysis.pattern.snare) ||
            !Array.isArray(parsedAnalysis.pattern.hihat) ||
            !Array.isArray(parsedAnalysis.pattern.crash)) {
          throw new Error('Invalid drum pattern format');
        }

        // Generate new drum audio based on the analysis
        console.log('[Audio Processor] Generating drum audio...');
        const drumAudioBuffer = await generateDrumAudio(parsedAnalysis.pattern, parsedAnalysis.tempo);
        
        // Create a blob from the buffer
        const drumAudioBlob = new Blob([drumAudioBuffer], { type: 'audio/wav' });
        
        // Upload to Supabase storage
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
        
        const fileName = `processed-${processingType}-${crypto.randomUUID()}.mp3`;
        
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

        return {
          type: processingType,
          url: publicUrl,
          processed: true,
          analysis: analysisContent,
          transcription: transcription.text,
          audioBuffer: drumAudioBuffer,
          musicalAnalysis: parsedAnalysis,
          tempo: parsedAnalysis.tempo,
          timeSignature: parsedAnalysis.timeSignature,
          patternData: parsedAnalysis.pattern
        };
      } else {
        if (!Array.isArray(parsedAnalysis.pattern.notes) || 
            !Array.isArray(parsedAnalysis.pattern.durations)) {
          throw new Error('Invalid melody pattern format');
        }
      }
    } catch (error) {
      console.error('[Audio Processor] Failed to parse or validate analysis JSON:', error);
      throw new Error('Failed to parse musical analysis output');
    }

    return {
      type: processingType,
      url: audioUrl,
      processed: true,
      analysis: analysisContent,
      transcription: transcription.text,
      audioBuffer: audioBuffer,
      musicalAnalysis: parsedAnalysis,
      tempo: parsedAnalysis.tempo,
      timeSignature: parsedAnalysis.timeSignature,
      patternData: parsedAnalysis.pattern
    };

  } catch (error) {
    console.error('[Audio Processor] Error:', error);
    throw error;
  }
};
