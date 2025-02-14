
export type ProcessingType = 'drums' | 'melody' | 'instrumentation';

export type ProcessingResult = {
  type: ProcessingType;
  url: string;
  processed: boolean;
  analysis?: string;
  transcription?: string;
};

export type AudioProcessingRequest = {
  recordingId: string;
  processingType: ProcessingType;
};
