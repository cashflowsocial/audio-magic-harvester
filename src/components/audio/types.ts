
export interface ProcessedTrack {
  id: string;
  recording_id: string;
  processing_type: 'drums' | 'melody' | 'instrumentation';
  processed_audio_url: string | null;
  processing_status: string;
  musical_analysis?: any;
  tempo?: number;
  time_signature?: string;
  pattern_data?: Record<string, number[]> | null;
  error_message?: string;
  created_at: string;
  midi_data?: {
    notes: Array<{
      pitch: number;
      startTime: number;
      endTime: number;
      velocity: number;
    }>;
    instrument: string;
  } | null;
  freesound_samples?: Record<string, {
    id: string;
    name: string;
    url: string;
  }> | null;
  playback_status?: 'pending' | 'loading_samples' | 'ready' | 'error';
}

export interface DrumPattern {
  tempo: number;
  timeSignature: string;
  pattern: Record<string, number[]>;
}
