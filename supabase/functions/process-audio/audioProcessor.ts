
import { ProcessingType, ProcessingResult } from './types.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

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
      `You are a drum pattern expert. Analyze the given beatbox sounds and convert them into a precise drum pattern with:
      1. Tempo (BPM)
      2. Time signature
      3. Exact placement of:
         - Kick drum (usually "boom", "b", "puh")
         - Snare drum (usually "psh", "ka", "ts")
         - Hi-hat (usually "ts", "ch", "tss")
         - Cymbals and other percussion
      4. Any variations or fills
      Return a valid JSON object with these exact fields and nothing else:
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
      : `You are a musical expert. Analyze the given text and extract ${processingType} patterns. Return a valid JSON object with these exact fields and nothing else:
      {
        "tempo": number,
        "timeSignature": string,
        "pattern": {
          "notes": number[],
          "durations": number[]
        }
      }`;

    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt
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

    const analysisContent = analysis.choices[0].message.content;
    let parsedAnalysis;
    try {
      parsedAnalysis = JSON.parse(analysisContent);
    } catch (error) {
      console.error('[Audio Processor] Failed to parse analysis JSON:', error);
      throw new Error('Failed to parse musical analysis output');
    }

    return {
      type: processingType,
      url: audioUrl, // This will be updated with the actual processed audio URL
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
