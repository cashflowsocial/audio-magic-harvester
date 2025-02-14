
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

    // First, transcribe the audio using Whisper
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

    // Use GPT-4 to analyze the transcription and generate musical instructions
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
            content: `You are a musical expert. Analyze the given text and extract ${processingType} patterns. 
                     For drums, focus on rhythm and percussion patterns.
                     For melody, focus on pitch and melodic patterns.
                     For instrumentation, focus on arrangement and instrumental choices.`
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
