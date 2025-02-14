
import { ProcessingType, ProcessingResult } from './types.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

// Define drum sample URLs from our Supabase storage
function getDrumSampleUrls(supabaseUrl: string) {
  const baseUrl = `${supabaseUrl}/storage/v1/object/public/drum_samples`;
  return {
    kick: `${baseUrl}/kick.wav`,
    snare: `${baseUrl}/snare.wav`,
    hihat: `${baseUrl}/hihat.wav`,
    crash: `${baseUrl}/crash.wav`
  };
}

async function loadAudioBuffer(url: string): Promise<ArrayBuffer> {
  console.log('[Audio Processor] Loading audio sample from:', url);
  const response = await fetch(url);
  if (!response.ok) {
    console.error('[Audio Processor] Failed to load audio sample:', url, response.status);
    throw new Error(`Failed to load audio sample: ${url}`);
  }
  return await response.arrayBuffer();
}

async function loadDrumSamples(supabaseUrl: string) {
  const urls = getDrumSampleUrls(supabaseUrl);
  const samples: Record<string, ArrayBuffer> = {};
  
  try {
    const [kick, snare, hihat, crash] = await Promise.all([
      loadAudioBuffer(urls.kick),
      loadAudioBuffer(urls.snare),
      loadAudioBuffer(urls.hihat),
      loadAudioBuffer(urls.crash)
    ]);
    
    samples.kick = kick;
    samples.snare = snare;
    samples.hihat = hihat;
    samples.crash = crash;
    
    console.log('[Audio Processor] Successfully loaded all drum samples');
    return samples;
  } catch (error) {
    console.error('[Audio Processor] Error loading drum samples:', error);
    throw error;
  }
}

async function mixAudioBuffers(buffers: ArrayBuffer[], offsets: number[]): Promise<ArrayBuffer> {
  // This is a placeholder for actual audio mixing
  // In a real implementation, we would:
  // 1. Convert ArrayBuffers to AudioBuffers
  // 2. Mix them at the specified offsets
  // 3. Return the final mixed buffer
  // For now, we'll return the first buffer
  return buffers[0];
}

async function createDrumTrack(
  pattern: Record<string, number[]>,
  tempo: number,
  samples: Record<string, ArrayBuffer>
): Promise<ArrayBuffer> {
  console.log('[Audio Processor] Creating drum track with pattern:', pattern, 'at tempo:', tempo);
  
  const buffers: ArrayBuffer[] = [];
  const offsets: number[] = [];
  const beatDuration = 60 / tempo; // Duration of one beat in seconds
  
  // Schedule each drum hit
  Object.entries(pattern).forEach(([drumType, hits]) => {
    hits.forEach(beatPosition => {
      if (samples[drumType]) {
        buffers.push(samples[drumType]);
        offsets.push(beatPosition * beatDuration);
      }
    });
  });
  
  // Mix all the drum hits together
  return await mixAudioBuffers(buffers, offsets);
}

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
    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: processingType === 'drums' ? 
              `You are a drum pattern expert. Analyze the given beatbox sounds and convert them into a precise drum pattern with:
              1. Tempo (BPM)
              2. Time signature
              3. Exact placement of:
                 - Kick drum (usually "boom", "b", "puh")
                 - Snare drum (usually "psh", "ka", "ts")
                 - Hi-hat (usually "ts", "ch", "tss")
                 - Cymbals and other percussion
              4. Any variations or fills
              Return a JSON object with these fields:
              {
                "tempo": number,
                "timeSignature": string,
                "pattern": {
                  "kick": number[],
                  "snare": number[],
                  "hihat": number[],
                  "crash": number[]
                }
              }` 
              : `You are a musical expert. Analyze the given text and extract ${processingType} patterns.`
          },
          {
            role: 'user',
            content: `Analyze this musical idea: ${transcription.text}`
          }
        ],
        temperature: 0.7,
      }),
    });

    if (!gptResponse.ok) {
      const errorText = await gptResponse.text();
      console.error('[Audio Processor] GPT API error:', errorText);
      throw new Error(`GPT API error: ${errorText}`);
    }

    const analysis = await gptResponse.json();
    console.log('[Audio Processor] Musical analysis:', analysis);

    let processedAudio = audioBuffer;
    let musicalAnalysis = null;
    let tempo = null;
    let timeSignature = null;
    let patternData = null;

    if (processingType === 'drums') {
      try {
        const drumPattern = JSON.parse(analysis.choices[0].message.content);
        musicalAnalysis = drumPattern;
        tempo = drumPattern.tempo;
        timeSignature = drumPattern.timeSignature;
        patternData = drumPattern.pattern;

        // Load drum samples
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const samples = await loadDrumSamples(supabaseUrl);

        // Generate actual drum track based on the pattern
        processedAudio = await createDrumTrack(drumPattern.pattern, drumPattern.tempo, samples);
      } catch (e) {
        console.error('[Audio Processor] Error parsing drum pattern:', e);
        throw new Error('Failed to parse drum pattern');
      }
    }

    // Create public URL for the processed audio
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    return {
      type: processingType,
      url: audioUrl, // This will be updated with the actual processed audio URL
      processed: true,
      analysis: analysis.choices[0].message.content,
      transcription: transcription.text,
      audioBuffer: processedAudio,
      musicalAnalysis,
      tempo,
      timeSignature,
      patternData
    };

  } catch (error) {
    console.error('[Audio Processor] Error:', error);
    throw error;
  }
};
