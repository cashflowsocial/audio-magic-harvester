
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { recordingId, processingType } = await req.json()
    console.log(`[Process Audio] Starting processing for recording ${recordingId}, type: ${processingType}`)
    
    if (!recordingId || !processingType) {
      throw new Error('Missing required parameters')
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the recording URL
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single()

    if (recordingError || !recording) {
      console.error('[Process Audio] Recording not found:', recordingError)
      throw new Error('Recording not found')
    }

    console.log('[Process Audio] Found recording:', recording.filename)

    // Get the public URL for the recording
    const { data: publicUrlData } = await supabase
      .storage
      .from('recordings')
      .getPublicUrl(recording.filename)

    console.log('[Process Audio] Got public URL:', publicUrlData.publicUrl)

    // Create a new processed track record
    const { data: track, error: trackError } = await supabase
      .from('processed_tracks')
      .insert({
        recording_id: recordingId,
        processing_type: processingType,
        processing_status: 'processing'
      })
      .select()
      .single()

    if (trackError) {
      throw new Error(`Error creating processed track: ${trackError.message}`)
    }

    // Mock successful processing for now
    const { error: updateError } = await supabase
      .from('processed_tracks')
      .update({
        processing_status: 'completed',
        processed_audio_url: publicUrlData.publicUrl // For now, just use the original audio
      })
      .eq('id', track.id)

    if (updateError) {
      throw new Error(`Error updating processed track: ${updateError.message}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Audio processed successfully',
        trackId: track.id,
        url: publicUrlData.publicUrl
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('[Process Audio] Error:', error)
    
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
