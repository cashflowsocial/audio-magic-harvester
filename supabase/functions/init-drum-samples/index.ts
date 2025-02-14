
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function uploadDrumSample(supabase: any, sampleType: string) {
  // URL to your default drum samples - these should be hosted somewhere accessible
  const sampleUrl = `https://example.com/drum-samples/${sampleType}.mp3`; // Replace with actual URLs
  
  try {
    // Download the sample file
    const response = await fetch(sampleUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${sampleType} sample`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const file = new Uint8Array(arrayBuffer);
    
    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('drum_samples')
      .upload(`${sampleType}.mp3`, file, {
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
