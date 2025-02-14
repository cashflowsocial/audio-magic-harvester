
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { analyzeAudio } from './audioAnalyzer.ts';
import { generateMidiFile } from './midiGenerator.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { recordingId, processingType } = await req.json();
    console.log(`[Process Audio] Starting processing for recording ${recordingId}, type: ${processingType}`);

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

    // Get recording URL and download audio
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

    // Download and analyze the audio
    const audioResponse = await fetch(publicUrl);
    const audioBuffer = await audioResponse.arrayBuffer();
    
    console.log('[Process Audio] Analyzing audio...');
    const analysis = await analyzeAudio(audioBuffer);
    
    console.log('[Process Audio] Generating MIDI file...');
    const midiData = generateMidiFile(analysis.notes, analysis.tempo);
    
    // Upload MIDI file to storage
    const midiFileName = `${track.id}.mid`;
    const { error: uploadError } = await supabase.storage
      .from('midi_files')
      .upload(midiFileName, midiData, {
        contentType: 'audio/midi',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Error uploading MIDI file: ${uploadError.message}`);
    }

    // Get the MIDI file URL
    const { data: { publicUrl: midiUrl } } = await supabase.storage
      .from('midi_files')
      .getPublicUrl(midiFileName);

    // Update the processed track with results
    const { error: updateError } = await supabase
      .from('processed_tracks')
      .update({
        processing_status: 'completed',
        processed_audio_url: midiUrl,
        musical_analysis: analysis,
        midi_data: {
          notes: analysis.notes,
          instrument: 'piano'
        },
        tempo: analysis.tempo,
        time_signature: analysis.timeSignature,
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
        analysis,
        midiUrl
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
