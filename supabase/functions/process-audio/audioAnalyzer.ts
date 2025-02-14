
export interface Note {
  pitch: number;
  startTime: number;
  endTime: number;
  velocity: number;
}

export interface AudioAnalysisResult {
  notes: Note[];
  tempo: number;
  timeSignature: string;
}

export async function analyzeAudio(audioBuffer: ArrayBuffer): Promise<AudioAnalysisResult> {
  // Create audio context
  const audioContext = new AudioContext();
  const audioData = await audioContext.decodeAudioData(audioBuffer);
  
  // Create analyzer node
  const analyzer = audioContext.createAnalyser();
  analyzer.fftSize = 2048;
  
  // Create buffer source
  const source = audioContext.createBufferSource();
  source.buffer = audioData;
  source.connect(analyzer);
  
  // Arrays for analysis
  const frequencyData = new Float32Array(analyzer.frequencyBinCount);
  const timeData = new Float32Array(analyzer.frequencyBinCount);
  
  // Analyze frequency data
  analyzer.getFloatFrequencyData(frequencyData);
  analyzer.getFloatTimeDomainData(timeData);
  
  // Detect pitch using autocorrelation
  const notes: Note[] = [];
  const sampleRate = audioContext.sampleRate;
  const bufferSize = 2048;
  
  for (let offset = 0; offset < audioData.length; offset += bufferSize) {
    const buffer = audioData.getChannelData(0).slice(offset, offset + bufferSize);
    const pitch = detectPitch(buffer, sampleRate);
    
    if (pitch) {
      notes.push({
        pitch: Math.round(midiFromFrequency(pitch)),
        startTime: offset / sampleRate,
        endTime: (offset + bufferSize) / sampleRate,
        velocity: 100 // Default velocity
      });
    }
  }
  
  // Detect tempo using onset detection
  const tempo = detectTempo(timeData, sampleRate);
  
  return {
    notes,
    tempo,
    timeSignature: "4/4" // Default time signature
  };
}

function detectPitch(buffer: Float32Array, sampleRate: number): number | null {
  const correlations = new Float32Array(buffer.length);
  
  // Autocorrelation
  for (let lag = 0; lag < buffer.length; lag++) {
    let correlation = 0;
    for (let i = 0; i < buffer.length - lag; i++) {
      correlation += buffer[i] * buffer[i + lag];
    }
    correlations[lag] = correlation;
  }
  
  // Find peaks in correlation
  let peakLag = -1;
  let peakCorrelation = 0;
  for (let lag = 1; lag < correlations.length; lag++) {
    if (correlations[lag] > peakCorrelation) {
      peakLag = lag;
      peakCorrelation = correlations[lag];
    }
  }
  
  if (peakLag !== -1) {
    return sampleRate / peakLag;
  }
  
  return null;
}

function detectTempo(buffer: Float32Array, sampleRate: number): number {
  // Simple onset detection
  const onsets: number[] = [];
  let lastValue = 0;
  
  for (let i = 0; i < buffer.length; i++) {
    const currentValue = Math.abs(buffer[i]);
    if (currentValue > 0.1 && lastValue <= 0.1) {
      onsets.push(i);
    }
    lastValue = currentValue;
  }
  
  // Calculate average time between onsets
  if (onsets.length < 2) return 120; // Default tempo
  
  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    intervals.push(onsets[i] - onsets[i-1]);
  }
  
  const averageInterval = intervals.reduce((a, b) => a + b) / intervals.length;
  const tempo = (60 * sampleRate) / averageInterval;
  
  return Math.round(tempo);
}

function midiFromFrequency(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440);
}
