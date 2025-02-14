
export type ProcessingType = 'drums' | 'melody' | 'instrumentation';

export interface ProcessingResult {
  type: ProcessingType;
  url: string;
  processed: boolean;
  analysis: string;
  transcription: string;
  audioBuffer?: ArrayBuffer;
  musicalAnalysis?: any;
  tempo?: number;
  timeSignature?: string;
  patternData?: any;
}
