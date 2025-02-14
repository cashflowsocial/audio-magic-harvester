
export type ProcessingType = 'drums' | 'melody' | 'instrumentation';

export interface ProcessingResult {
  type: ProcessingType;
  url: string;
  processed: boolean;
  analysis: string;
  transcription: string;
  musicalAnalysis?: any;
  tempo?: number;
  timeSignature?: string;
  patternData?: any;
}

export interface DrumPattern {
  tempo: number;
  timeSignature: string;
  pattern: {
    kick: number[];
    snare: number[];
    hihat: number[];
    crash: number[];
  };
}
