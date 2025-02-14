
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ProcessingType, ProcessingResult, DrumPattern } from './types.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const freesoundClientId = Deno.env.get('FREESOUND_CLIENT_ID');
const freesoundClientSecret = Deno.env.get('FREESOUND_CLIENT_SECRET');

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
    const { recordingId, processingType } = await req.json();

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the recording URL
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single();

    if (recordingError || !recording) {
      throw new Error('Recording not found');
    }

    // Get the public URL for the recording
    const { data: { publicUrl } } = await supabase.storage
      .from('recordings')
      .getPublicUrl(recording.filename);

    // First, transcribe the audio using Whisper
    const audioResponse = await fetch(publicUrl);
    const audioBlob = await audioResponse.blob();
    const formData = new FormData();
    formData.append('file', audioBlob);
    formData.append('model', 'whisper-1');

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

    const pattern = JSON.parse(analysis.choices[0].message.content) as DrumPattern;

    // Save the MIDI pattern
    const { data: midiPattern, error: midiError } = await supabase
      .from('midi_patterns')
      .insert({
        recording_id: recordingId,
        pattern_data: pattern.pattern,
        tempo: pattern.tempo,
        time_signature: pattern.timeSignature,
        freesound_samples: {
          kick: "667", // Default Freesound IDs for our drum kit
          snare: "668",
          hihat: "669",
          crash: "670"
        }
      })
      .select()
      .single();

    if (midiError) {
      throw new Error(`Failed to save MIDI pattern: ${midiError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        midiPattern,
        transcription: transcription.text,
        analysis: pattern
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
