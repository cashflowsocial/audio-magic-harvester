
interface BeatEvent {
  type: 'kick' | 'snare' | 'hihat';
  timestamp: number;
  velocity: number;
}

export const analyzeBeatbox = async (audioBuffer: AudioBuffer): Promise<BeatEvent[]> => {
  const events: BeatEvent[] = [];
  
  // Create audio context and analyzer
  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  
  // Create buffer source
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(analyser);
  
  // Set up frequency analysis
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Float32Array(bufferLength);
  
  // Process audio data
  analyser.getFloatFrequencyData(dataArray);
  
  // Analyze frequency bands
  const lowFreq = dataArray.slice(0, 10);  // 0-200Hz (kicks)
  const midFreq = dataArray.slice(10, 30);  // 200-600Hz (snares)
  const highFreq = dataArray.slice(30, 50); // 600Hz+ (hihats)
  
  // Detect peaks in each frequency range
  const detectPeaks = (data: Float32Array, threshold: number) => {
    const peaks: number[] = [];
    for (let i = 1; i < data.length - 1; i++) {
      if (data[i] > threshold && 
          data[i] > data[i - 1] && 
          data[i] > data[i + 1]) {
        peaks.push(i);
      }
    }
    return peaks;
  };
  
  // Find peaks in each range
  const kickPeaks = detectPeaks(lowFreq, -40);
  const snarePeaks = detectPeaks(midFreq, -35);
  const hihatPeaks = detectPeaks(highFreq, -30);
  
  // Convert peaks to events
  kickPeaks.forEach(peak => {
    events.push({
      type: 'kick',
      timestamp: peak * (audioBuffer.duration / bufferLength),
      velocity: Math.min(127, Math.round(Math.abs(lowFreq[peak]) * 2))
    });
  });
  
  snarePeaks.forEach(peak => {
    events.push({
      type: 'snare',
      timestamp: peak * (audioBuffer.duration / bufferLength),
      velocity: Math.min(127, Math.round(Math.abs(midFreq[peak]) * 2))
    });
  });
  
  hihatPeaks.forEach(peak => {
    events.push({
      type: 'hihat',
      timestamp: peak * (audioBuffer.duration / bufferLength),
      velocity: Math.min(127, Math.round(Math.abs(highFreq[peak]) * 2))
    });
  });
  
  // Sort events by timestamp
  events.sort((a, b) => a.timestamp - b.timestamp);
  
  console.log('Detected beat events:', events);
  return events;
};

export const createDrumSequence = async (events: BeatEvent[]): Promise<AudioBuffer> => {
  const audioContext = new AudioContext();
  const mainGain = audioContext.createGain();
  mainGain.connect(audioContext.destination);
  
  // Load drum samples (we'll need to implement this)
  const samples = await loadDrumSamples();
  
  // Create a buffer for the sequence
  const duration = Math.max(...events.map(e => e.timestamp)) + 1; // Add 1 second padding
  const outputBuffer = audioContext.createBuffer(
    2, // Stereo
    Math.ceil(duration * audioContext.sampleRate),
    audioContext.sampleRate
  );
  
  // Schedule each event
  for (const event of events) {
    const sample = samples[event.type];
    if (sample) {
      // Copy sample data to output buffer at event timestamp
      const startFrame = Math.floor(event.timestamp * audioContext.sampleRate);
      const gain = event.velocity / 127;
      
      for (let channel = 0; channel < 2; channel++) {
        const outputData = outputBuffer.getChannelData(channel);
        const sampleData = sample.getChannelData(channel);
        
        for (let i = 0; i < sampleData.length; i++) {
          if (startFrame + i < outputData.length) {
            outputData[startFrame + i] += sampleData[i] * gain;
          }
        }
      }
    }
  }
  
  return outputBuffer;
};

const loadDrumSamples = async () => {
  // This will be implemented to load samples from Supabase storage
  // For now return empty object
  return {};
};
