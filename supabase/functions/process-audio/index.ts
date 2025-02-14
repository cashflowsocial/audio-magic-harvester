
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from './config.ts'
import { createSupabaseClient, createProcessedTrack, updateProcessedTrack, markProcessingAsFailed } from './db.ts'
import { ProcessingType } from './types.ts'
import { processAudio } from './audioProcessor.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { recordingId, processingType } = await req.json()
    
    if (!recordingId || !processingType) {
      throw new Error('Missing required parameters')
    }

    const supabase = createSupabaseClient()

    // Get the recording URL
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .single()

    if (recordingError || !recording) {
      throw new Error('Recording not found')
    }

    // Get the public URL for the recording
    const { data: publicUrlData } = await supabase
      .storage
      .from('recordings')
      .getPublicUrl(recording.filename)

    // Create a new processed track record
    const track = await createProcessedTrack(supabase, recordingId, processingType as ProcessingType)

    try {
      // Process the audio
      const result = await processAudio(
        publicUrlData.publicUrl,
        processingType as ProcessingType
      )

      // Update the processed track with results
      await updateProcessedTrack(
        supabase,
        track.id,
        result,
        processingType as ProcessingType,
        result.url
      )

      const headers = new Headers(corsHeaders)
      headers.set('Content-Type', 'application/json')

      return new Response(
        JSON.stringify({
          success: true,
          trackId: track.id,
          result
        }),
        { headers }
      )

    } catch (processingError) {
      // Mark the track as failed if processing fails
      await markProcessingAsFailed(
        supabase,
        track.id,
        processingError.message
      )
      throw processingError
    }

  } catch (error) {
    console.error('Error:', error)
    
    const headers = new Headers(corsHeaders)
    headers.set('Content-Type', 'application/json')

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { 
        headers,
        status: 500
      }
    )
  }
})
