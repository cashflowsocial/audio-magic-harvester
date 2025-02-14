
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { corsHeaders } from '../_shared/cors.ts'

const SAMPLE_TYPES = ['kick', 'snare', 'hihat', 'crash', 'tom', 'percussion'] as const;

interface FreesoundResponse {
  results: Array<{
    id: number;
    name: string;
    download: string;
    previews: {
      'preview-hq-mp3': string;
    };
  }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Create a new drum kit
    const { data: kit, error: kitError } = await supabase
      .from('drum_kits')
      .insert({
        name: 'Basic Kit',
        description: 'A basic drum kit with essential sounds'
      })
      .select()
      .single()

    if (kitError) throw kitError

    // Get Freesound credentials from Supabase
    const clientId = Deno.env.get('FREESOUND_CLIENT_ID')
    const clientSecret = Deno.env.get('FREESOUND_CLIENT_SECRET')

    if (!clientId || !clientSecret) {
      throw new Error('Missing Freesound credentials')
    }

    // Get access token
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
    })

    const { access_token } = await tokenResponse.json()

    // Download and store samples for each type
    for (const sampleType of SAMPLE_TYPES) {
      // Search Freesound for high-quality samples
      const searchResponse = await fetch(
        `https://freesound.org/apiv2/search/text/?query=${sampleType}+drum&filter=duration:[0 TO 2]&fields=id,name,previews,download`,
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        }
      )

      const searchData: FreesoundResponse = await searchResponse.json()
      const sample = searchData.results[0] // Get the first result

      if (sample) {
        // Download the sample
        const sampleResponse = await fetch(sample.previews['preview-hq-mp3'])
        const sampleData = await sampleResponse.arrayBuffer()

        // Upload to Supabase Storage
        const filename = `${sampleType}-${sample.id}.mp3`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('drum_samples')
          .upload(filename, sampleData, {
            contentType: 'audio/mpeg',
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) throw uploadError

        // Get the public URL
        const { data: urlData } = supabase.storage
          .from('drum_samples')
          .getPublicUrl(filename)

        // Store sample metadata in database
        await supabase
          .from('drum_kit_samples')
          .insert({
            kit_id: kit.id,
            sample_type: sampleType,
            filename,
            storage_path: urlData.publicUrl
          })
      }
    }

    return new Response(
      JSON.stringify({ message: 'Drum kit initialized successfully', kitId: kit.id }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

