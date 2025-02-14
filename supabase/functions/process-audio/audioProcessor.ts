
import { ProcessingType, ProcessingResult } from './types.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

export const processAudio = async (
  audioUrl: string,
  processingType: ProcessingType
): Promise<ProcessingResult> => {
  try {
    console.log(`[Audio Processor] Starting ${processingType} processing for audio at ${audioUrl}`)

    // Download the audio file
    const response = await fetch(audioUrl)
    if (!response.ok) {
      throw new Error('Failed to fetch audio file')
    }

    console.log('[Audio Processor] Successfully downloaded audio file')
    const audioBuffer = await response.arrayBuffer()
    const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });

    // First, transcribe the audio using Whisper to get rhythm patterns
    console.log('[Audio Processor] Transcribing audio with Whisper...')
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
      const errorText = await whisperResponse.text()
      console.error('[Audio Processor] Whisper API error:', errorText)
      throw new Error(`Whisper API error: ${errorText}`)
    }

    const transcription = await whisperResponse.json();
    console.log('[Audio Processor] Transcription result:', transcription);

    // Use GPT-4 to analyze the transcription and generate specific musical instructions
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
              Format your response as a structured JSON with these fields.` 
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
      const errorText = await gptResponse.text()
      console.error('[Audio Processor] GPT API error:', errorText)
      throw new Error(`GPT API error: ${errorText}`)
    }

    const analysis = await gptResponse.json();
    console.log('[Audio Processor] Musical analysis:', analysis);

    // For drums specifically, we'll use the OpenAI analysis to create a MIDI-like drum pattern
    if (processingType === 'drums') {
      // Parse the GPT analysis to get drum pattern details
      let drumPattern;
      try {
        drumPattern = JSON.parse(analysis.choices[0].message.content);
      } catch (e) {
        console.log('[Audio Processor] Could not parse GPT analysis as JSON, using raw text');
        drumPattern = analysis.choices[0].message.content;
      }

      // Here we would convert the pattern into actual audio
      // For now, we're just returning the original audio with the analysis
      // TODO: Implement actual drum synthesis based on the pattern
      console.log('[Audio Processor] Drum pattern:', drumPattern);
    }

    // For now, we'll return the original audio as processed audio
    // In a real implementation, this would be where we'd apply AI transformations
    return {
      type: processingType,
      url: audioUrl, // Temporarily using the original audio URL
      processed: true,
      analysis: analysis.choices[0].message.content,
      transcription: transcription.text,
      audioBuffer: audioBuffer // Pass the audio buffer for storage
    };

  } catch (error) {
    console.error('[Audio Processor] Error:', error);
    throw error;
  }
};
