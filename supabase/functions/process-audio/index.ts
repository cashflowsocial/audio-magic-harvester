
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ProcessingType } from './types.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/cors.ts';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const freesoundClientId = Deno.env.get('FREESOUND_CLIENT_ID');
const freesoundClientSecret = Deno.env.get('FREESOUND_CLIENT_SECRET');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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

    // Get the recording
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single();

    if (recordingError || !recording) {
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

    // Analyze with GPT-4 to create MIDI pattern
    console.log('[Process Audio] Sending to GPT for analysis');
    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a music pattern expert that can interpret vocal sounds into precise MIDI patterns.
            
            When you receive a transcription of vocal sounds:
            1. First identify the tempo by analyzing the rhythm and spacing of the sounds
            2. Determine the time signature from the pattern repetition
            3. Map each sound to the corresponding instrument type
            4. Position each sound on a numerical timeline where:
               - 1 = first beat
               - 1.5 = eighth note after first beat
               - 2 = second beat
               etc.
            
            Return ONLY a valid JSON object with this exact format:
            {
              "tempo": number (between 60-200),
              "timeSignature": string (e.g. "4/4"),
              "instruments": {
                "drums": {
                  "kick": number[] (beat positions),
                  "snare": number[] (beat positions),
                  "hihat": number[] (beat positions),
                  "crash": number[] (beat positions)
                },
                "melody": {
                  "notes": [
                    {
                      "pitch": number (MIDI note number),
                      "startTime": number (beat position),
                      "endTime": number (beat position),
                      "velocity": number (0-127)
                    }
                  ]
                }
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
    const pattern = JSON.parse(analysis.choices[0].message.content);
    
    // Get Freesound samples
    console.log('[Process Audio] Fetching Freesound samples');
    const freesoundSamples: Record<string, { id: string; name: string; url: string }> = {};
    
    // Get Freesound OAuth token
    const tokenResponse = await fetch('https://freesound.org/apiv2/oauth2/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: freesoundClientId,
        client_secret: freesoundClientSecret,
        grant_type: 'client_credentials',
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to get Freesound token');
    }

    const { access_token } = await tokenResponse.json();

    // Search for appropriate samples for each instrument
    for (const [instrType, pattern] of Object.entries(pattern.instruments.drums)) {
      const searchResponse = await fetch(
        `https://freesound.org/apiv2/search/text/?query=${instrType}&filter=duration:[0 TO 1]&fields=id,name,previews`,
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        }
      );

      if (searchResponse.ok) {
        const { results } = await searchResponse.json();
        if (results.length > 0) {
          const sample = results[0];
          freesoundSamples[instrType] = {
            id: sample.id,
            name: sample.name,
            url: sample.previews['preview-hq-mp3'],
          };
        }
      }
    }

    // Update the processed track with results
    const { error: updateError } = await supabase
      .from('processed_tracks')
      .update({
        processing_status: 'completed',
        processed_audio_url: publicUrl,
        musical_analysis: analysis.choices[0].message.content,
        pattern_data: pattern.instruments.drums,
        midi_data: pattern.instruments.melody,
        tempo: pattern.tempo,
        time_signature: pattern.timeSignature,
        freesound_samples: freesoundSamples,
        playback_status: 'ready'
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
        pattern,
        freesoundSamples,
        transcription: transcription.text
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
