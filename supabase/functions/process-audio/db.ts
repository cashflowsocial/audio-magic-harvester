
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { ProcessingType, ProcessingResult } from './types.ts'

export const createSupabaseClient = () => {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

export const createProcessedTrack = async (
  supabaseClient: any, 
  recordingId: string, 
  processingType: ProcessingType
) => {
  console.log('[DB] Creating processed track record:', { recordingId, processingType })
  const { data, error } = await supabaseClient
    .from('processed_tracks')
    .insert({
      recording_id: recordingId,
      processing_type: processingType,
      processing_status: 'processing'
    })
    .select()
    .single()

  if (error) {
    console.error('[DB] Error creating processed track:', error)
    throw new Error(`Error creating processed track: ${error.message}`)
  }
  return data
}

export const updateProcessedTrack = async (
  supabaseClient: any,
  trackId: string,
  result: ProcessingResult,
  processingType: ProcessingType,
  outputUrl: string
) => {
  console.log('[DB] Updating processed track:', { trackId, processingType, outputUrl })
  const { error } = await supabaseClient
    .from('processed_tracks')
    .update({
      processing_status: 'completed',
      processed_audio_url: outputUrl,
      output_url: outputUrl,
      musical_analysis: result.musicalAnalysis,
      tempo: result.tempo,
      time_signature: result.timeSignature,
      pattern_data: result.patternData
    })
    .eq('id', trackId)

  if (error) {
    console.error('[DB] Error updating processed track:', error)
    throw new Error(`Error updating processed track: ${error.message}`)
  }
}

export const markProcessingAsFailed = async (
  supabaseClient: any,
  trackId: string,
  errorMessage: string
) => {
  console.log('[DB] Marking processing as failed:', { trackId, errorMessage })
  const { error } = await supabaseClient
    .from('processed_tracks')
    .update({
      processing_status: 'failed',
      error_message: errorMessage
    })
    .eq('id', trackId)

  if (error) {
    console.error('[DB] Error marking processing as failed:', error)
    throw new Error(`Error marking processing as failed: ${error.message}`)
  }
}

