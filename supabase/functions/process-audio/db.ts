
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { ProcessingType } from './types.ts'

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
  const { data, error } = await supabaseClient
    .from('processed_tracks')
    .insert({
      recording_id: recordingId,
      processing_type: processingType,
      processing_status: 'processing'
    })
    .select()
    .single()

  if (error) throw new Error(`Error creating processed track: ${error.message}`)
  return data
}

export const updateProcessedTrack = async (
  supabaseClient: any,
  trackId: string,
  result: any,
  processingType: ProcessingType,
  outputUrl: string
) => {
  const { error } = await supabaseClient
    .from('processed_tracks')
    .update({
      processing_status: 'completed',
      output_url: outputUrl
    })
    .eq('id', trackId)

  if (error) throw new Error(`Error updating processed track: ${error.message}`)
}

export const markProcessingAsFailed = async (
  supabaseClient: any,
  trackId: string,
  errorMessage: string
) => {
  const { error } = await supabaseClient
    .from('processed_tracks')
    .update({
      processing_status: 'failed',
      error_message: errorMessage
    })
    .eq('id', trackId)

  if (error) throw new Error(`Error marking processing as failed: ${error.message}`)
}
