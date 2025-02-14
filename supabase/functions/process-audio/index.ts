
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
    console.log(`[Process Audio] Starting processing for recording ${recordingId}, type: ${processingType}`)
    
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
    const track = await createProcessedTrack(supabase, recordingId, processingType as ProcessingType)
    console.log('[Process Audio] Created processed track record:', track.id)

    try {
      // Process the audio
      console.log('[Process Audio] Starting audio processing...')
      const result = await processAudio(
        publicUrlData.publicUrl,
        processingType as ProcessingType
      )
      console.log('[Process Audio] Processing completed, result:', result)

      // Create a storage filename for the processed audio
      const processedFilename = `processed-${processingType}-${track.id}.mp3`
      console.log('[Process Audio] Will save processed audio as:', processedFilename)

      // Upload the processed audio if it's a buffer/blob
      if (result.audioBuffer) {
        console.log('[Process Audio] Uploading processed audio to storage...')
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('processed_audio')
          .upload(processedFilename, result.audioBuffer)

        if (uploadError) {
          console.error('[Process Audio] Upload error:', uploadError)
          throw uploadError
        }

        // Get the public URL for the processed audio
        const { data: processedUrlData } = await supabase.storage
          .from('processed_audio')
          .getPublicUrl(processedFilename)

        result.url = processedUrlData.publicUrl
        console.log('[Process Audio] Processed audio URL:', result.url)
      }

      // Update the processed track with results
      console.log('[Process Audio] Updating processed track record...')
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
      console.error('[Process Audio] Processing error:', processingError)
      // Mark the track as failed if processing fails
      await markProcessingAsFailed(
        supabase,
        track.id,
        processingError.message
      )
      throw processingError
    }

  } catch (error) {
    console.error('[Process Audio] Error:', error)
    
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

