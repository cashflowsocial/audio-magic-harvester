import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { transcribe } from 'https://esm.sh/@ AssemblyAI / deno-sdk @ 0.0.2';

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
    console.log('[Process Audio] Starting processing for recording:', recordingId);

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get Freesound credentials
    const clientId = Deno.env.get('FREESOUND_CLIENT_ID');
    const clientSecret = Deno.env.get('FREESOUND_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new Error('Freesound credentials not found');
    }

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
      }),
    });

    const { access_token } = await tokenResponse.json();

    // Search for guitar samples
    const searchResponse = await fetch(
      'https://freesound.org/apiv2/search/text/' +
      '?query=guitar+single+note+electric&filter=duration:[0.1 TO 2.0]' +
      '&fields=id,name,previews&page_size=15',
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    const searchData = await searchResponse.json();
    
    // Transform the results into our desired format
    const guitarSamples: Record<string, any> = {};
    
    searchData.results.forEach((result: any, index: number) => {
      guitarSamples[`note_${index + 1}`] = {
        id: result.id,
        name: result.name,
        url: result.previews['preview-hq-mp3'],
      };
    });

    console.log('Found guitar samples:', guitarSamples);

    // Get the recording URL and continue with existing processing
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

		console.log("[Process Audio] Audio URL:", publicUrl);

		// Transcribe the audio using AssemblyAI
		console.log("[Process Audio] Starting transcription with AssemblyAI...");
		const transcription = await transcribe({
			apiKey: Deno.env.get('ASSEMBLYAI_API_KEY') ?? '',
			audioUrl: publicUrl,
		});

		console.log("[Process Audio] Transcription completed:", transcription.text);

    // Update the response to include guitar samples
    return new Response(
      JSON.stringify({
        success: true,
        guitarSamples,
        transcription: transcription.text,
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
