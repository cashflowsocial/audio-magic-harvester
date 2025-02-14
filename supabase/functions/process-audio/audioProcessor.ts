
import { ProcessingType, ProcessingResult } from './types.ts'

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
        model: 'gpt-4o-mini',
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
        temperature: 0.3, // Lower temperature for more precise output
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
