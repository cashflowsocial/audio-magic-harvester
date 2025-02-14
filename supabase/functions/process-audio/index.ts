
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ProcessingType, ProcessingResult, DrumPattern } from './types.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/cors.ts';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { recordingId, processingType } = await req.json();
    console.log(`[Process Audio] Starting processing for recording ${recordingId}, type: ${processingType}`);

    if (!recordingId || !processingType) {
      throw new Error('Missing required parameters');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get drum kit samples first
    const { data: drumKit, error: drumKitError } = await supabase
      .from('drum_kits')
      .select(`
        id,
        name,
        drum_kit_samples (
          id,
          sample_type,
          storage_path
        )
      `)
      .eq('name', 'Default Kit')
      .single();

    if (drumKitError || !drumKit) {
      console.error('[Process Audio] Drum kit not found:', drumKitError);
      throw new Error('Default drum kit not found');
    }

    // Get the recording
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single();

    if (recordingError || !recording) {
      console.error('[Process Audio] Recording not found:', recordingError);
      throw new Error('Recording not found');
    }

    // Get recording URL
    const { data: { publicUrl } } = await supabase.storage
      .from('recordings')
      .getPublicUrl(recording.filename);

    console.log('[Process Audio] Got recording URL:', publicUrl);

    // Create initial processing record
    const { data: track, error: trackError } = await supabase
      .from('processed_tracks')
      .insert({
        recording_id: recordingId,
        processing_type: processingType,
        processing_status: 'processing'
      })
      .select()
      .single();

    if (trackError) {
      throw new Error(`Error creating processed track: ${trackError.message}`);
    }

    // Download and transcribe the audio
    console.log('[Process Audio] Downloading audio for transcription');
    const audioResponse = await fetch(publicUrl);
    const audioBlob = await audioResponse.blob();
    
    // Prepare form data for Whisper API
    const formData = new FormData();
    formData.append('file', audioBlob);
    formData.append('model', 'whisper-1');

    console.log('[Process Audio] Sending to Whisper API');
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
    console.log('[Process Audio] Transcription result:', transcription);

    // Map available samples for GPT
    const sampleMapping = drumKit.drum_kit_samples.reduce((acc, sample) => {
      acc[sample.sample_type] = sample.id;
      return acc;
    }, {});

    // Analyze with GPT-4
    console.log('[Process Audio] Sending to GPT for analysis');
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
            
            Available drum samples:
            ${JSON.stringify(sampleMapping, null, 2)}
            
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
              },
              "sampleIds": {
                "kick": string (sample ID),
                "snare": string (sample ID),
                "hihat": string (sample ID),
                "crash": string (sample ID)
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
    console.log('[Process Audio] Pattern analysis:', analysis);

    const pattern = JSON.parse(analysis.choices[0].message.content) as DrumPattern & {
      sampleIds: Record<string, string>;
    };

    // Update the processed track with results
    const { error: updateError } = await supabase
      .from('processed_tracks')
      .update({
        processing_status: 'completed',
        processed_audio_url: publicUrl,
        musical_analysis: analysis.choices[0].message.content,
        pattern_data: pattern.pattern,
        tempo: pattern.tempo,
        time_signature: pattern.timeSignature
      })
      .eq('id', track.id);

    if (updateError) {
      throw new Error(`Error updating processed track: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Audio processed successfully',
        trackId: track.id,
        url: publicUrl,
        analysis: pattern,
        transcription: transcription.text,
        drumKit: {
          id: drumKit.id,
          samples: drumKit.drum_kit_samples
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('[Process Audio] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
