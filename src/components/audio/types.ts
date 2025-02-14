
export interface ProcessedTrack {
  id: string;
  recording_id: string;
  processing_type: 'drums' | 'melody' | 'instrumentation';
  processed_audio_url: string | null;
  processing_status: string;
  musical_analysis?: any;
  tempo?: number;
  time_signature?: string;
  pattern_data?: any;
  error_message?: string;
  created_at: string;
}
