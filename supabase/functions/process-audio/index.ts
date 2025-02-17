
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { recordingId, processingType } = await req.json();
    console.log(`[Process Audio] Starting processing for recording ${recordingId}, type: ${processingType}`);

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

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

    // Get the recording
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

    // For melody processing, attempt to get Freesound samples
    let guitarSamples = null;
    if (processingType === 'melody') {
      try {
        // Get Freesound credentials
        const clientId = Deno.env.get('FREESOUND_CLIENT_ID');
        const clientSecret = Deno.env.get('FREESOUND_CLIENT_SECRET');

        if (!clientId || !clientSecret) {
          console.warn('Freesound credentials not found');
        } else {
          console.log('Attempting Freesound authentication...');
          
          // Get the access token for Freesound
          const tokenResponse = await fetch('https://freesound.org/apiv2/oauth2/token/', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              grant_type: 'client_credentials',
            }).toString(),
          });

          if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('Freesound token error:', errorText);
            throw new Error(`Freesound token error: ${tokenResponse.status} ${errorText}`);
          }

          const tokenData = await tokenResponse.json();
          console.log('Got Freesound token:', tokenData.access_token ? 'Yes' : 'No');

          // Search for guitar samples
          const searchResponse = await fetch(
            'https://freesound.org/apiv2/search/text/' +
            '?query=guitar+single+note+electric&filter=duration:[0.1 TO 2.0]' +
            '&fields=id,name,previews&page_size=15',
            {
              headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
              },
            }
          );

          if (!searchResponse.ok) {
            throw new Error(`Freesound search failed: ${searchResponse.statusText}`);
          }

          const searchData = await searchResponse.json();
          
          // Transform the results into our desired format
          guitarSamples = {};
          searchData.results.forEach((result: any, index: number) => {
            guitarSamples[`note_${index + 1}`] = {
              id: result.id,
              name: result.name,
              url: result.previews['preview-hq-mp3'],
            };
          });

          console.log('Found guitar samples:', Object.keys(guitarSamples).length);
        }
      } catch (freesoundError) {
        console.error('Freesound processing error:', freesoundError);
        // Don't fail the whole process if Freesound fails
      }
    }

    // Generate example MIDI data for melody
    const midiData = processingType === 'melody' ? {
      notes: [
        { pitch: 60, startTime: 0, endTime: 0.5, velocity: 80 },
        { pitch: 62, startTime: 0.5, endTime: 1.0, velocity: 80 },
      ],
      instrument: 'guitar'
    } : null;

    // Update the processed track with results
    const { error: updateError } = await supabase
      .from('processed_tracks')
      .update({
        processing_status: 'completed',
        processed_audio_url: publicUrl,
        freesound_samples: guitarSamples,
        midi_data: midiData,
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
        guitarSamples,
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    console.error('[Process Audio] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      {
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json'
        }
      }
    );
  }
});
