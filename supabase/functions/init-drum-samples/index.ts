
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Freesound API search terms for each sample type
const sampleSearchTerms = {
  kick: 'kick drum electronic',
  snare: 'snare drum electronic',
  hihat: 'hihat electronic closed',
  crash: 'crash cymbal electronic'
};

async function downloadSampleFromFreesound(sampleType: string) {
  const clientId = Deno.env.get('FREESOUND_CLIENT_ID');
  const clientSecret = Deno.env.get('FREESOUND_CLIENT_SECRET');
  
  // First, get the access token
  const tokenResponse = await fetch('https://freesound.org/apiv2/oauth2/access_token/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      grant_type: 'client_credentials',
    }),
  });

  const { access_token } = await tokenResponse.json();

  // Search for samples
  const searchResponse = await fetch(
    `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(sampleSearchTerms[sampleType])}&filter=duration:[0 TO 1]&fields=id,download,name`,
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    }
  );

  const searchResult = await searchResponse.json();
  
  if (!searchResult.results?.length) {
    throw new Error(`No samples found for ${sampleType}`);
  }

  // Get the first result's download URL
  const sampleId = searchResult.results[0].id;
  const downloadResponse = await fetch(
    `https://freesound.org/apiv2/sounds/${sampleId}/download/`,
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    }
  );

  if (!downloadResponse.ok) {
    throw new Error(`Failed to download ${sampleType} sample`);
  }

  return new Uint8Array(await downloadResponse.arrayBuffer());
}

async function uploadDrumSample(supabase: any, sampleType: string) {
  try {
    console.log(`Downloading ${sampleType} sample from Freesound...`);
    const fileData = await downloadSampleFromFreesound(sampleType);
    
    console.log(`Uploading ${sampleType} sample to Supabase storage...`);
    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('drum_samples')
      .upload(`${sampleType}.mp3`, fileData, {
        contentType: 'audio/mpeg',
        upsert: true
      });
      
    if (error) throw error;
    
    return data;
  } catch (error) {
    console.error(`Error uploading ${sampleType}:`, error);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Upload all default samples
    const sampleTypes = ['kick', 'snare', 'hihat', 'crash'];
    
    console.log('Starting drum sample initialization...');
    
    const results = await Promise.all(
      sampleTypes.map(type => uploadDrumSample(supabase, type))
    );
    
    console.log('Drum samples initialized successfully:', results);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Drum samples initialized successfully',
        results
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error initializing drum samples:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
