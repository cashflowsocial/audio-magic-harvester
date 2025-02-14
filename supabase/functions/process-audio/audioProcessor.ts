
import { ProcessingType, ProcessingResult } from './types.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const drumSamples = {
  kick: 'https://s3.amazonaws.com/your-bucket/kick.wav',  // TODO: Replace with actual hosted drum samples
  snare: 'https://s3.amazonaws.com/your-bucket/snare.wav',
  hihat: 'https://s3.amazonaws.com/your-bucket/hihat.wav',
  crash: 'https://s3.amazonaws.com/your-bucket/crash.wav'
};

async function loadAudioBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load audio sample: ${url}`);
  return await response.arrayBuffer();
}

async function createDrumTrack(pattern: any, tempo: number): Promise<ArrayBuffer> {
  // This is a placeholder for actual drum synthesis
  // In a real implementation, we would:
  // 1. Create a Web Audio context
  // 2. Load drum samples
  // 3. Schedule drum hits based on the pattern
  // 4. Render to an audio buffer
  // For now, we'll return a simple test tone
  console.log('[Audio Processor] Creating drum track with pattern:', pattern, 'at tempo:', tempo);
  
  // TODO: Implement actual drum synthesis
  // For now, return the original audio
  const kickResponse = await fetch(drumSamples.kick);
  return await kickResponse.arrayBuffer();
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

        // Generate actual drum track based on the pattern
        processedAudio = await createDrumTrack(drumPattern.pattern, drumPattern.tempo);
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
