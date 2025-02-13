
export type ProcessingType = 'drums' | 'melody' | 'instrumentation';

export type ProcessingResult = {
  type: ProcessingType;
  url: string;
  processed: boolean;
  classification?: any;
};

export type AudioProcessingRequest = {
  recordingId: string;
  processingType: ProcessingType;
};
