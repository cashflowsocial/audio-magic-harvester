
export interface AudioFeatures {
  beats: number[];
  pitch: number[];
  timestamp: string;
}

export const analyzeAudio = async (audioBuffer: AudioBuffer): Promise<AudioFeatures> => {
  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(analyser);
  
  // Configure analyzer
  analyser.fftSize = 2048;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Float32Array(bufferLength);
  
  // Process audio data
  analyser.getFloatFrequencyData(dataArray);
  
  // Detect beats (using frequency peaks in lower range)
  const beats = detectBeats(dataArray.slice(0, Math.floor(bufferLength / 4)));
  
  // Extract pitch information (focusing on mid-range frequencies)
  const pitch = analyzePitch(dataArray.slice(Math.floor(bufferLength / 4), Math.floor(bufferLength / 2)));
  
  return {
    beats,
    pitch,
    timestamp: new Date().toISOString()
  };
};

const detectBeats = (lowFrequencies: Float32Array): number[] => {
  const threshold = -50; // Adjust based on testing
  const beats: number[] = [];
  
  for (let i = 0; i < lowFrequencies.length; i++) {
    if (lowFrequencies[i] > threshold) {
      beats.push(i);
    }
  }
  
  return beats;
};

const analyzePitch = (midFrequencies: Float32Array): number[] => {
  const pitch: number[] = [];
  const threshold = -60; // Adjust based on testing
  
  for (let i = 0; i < midFrequencies.length; i++) {
    if (midFrequencies[i] > threshold) {
      pitch.push(i);
    }
  }
  
  return pitch;
};
