
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Music } from "lucide-react";
import { ProcessedTrack } from "./types";

interface GuitarSamplePlayerProps {
  track: ProcessedTrack;
  isPlaying: boolean;
  onPlayingChange: (playing: boolean) => void;
}

export const GuitarSamplePlayer = ({ track, isPlaying, onPlayingChange }: GuitarSamplePlayerProps) => {
  const [audioBuffers, setAudioBuffers] = useState<Record<string, AudioBuffer>>({});
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  useEffect(() => {
    const loadSamples = async () => {
      if (!track.freesound_samples) {
        setStatus('error');
        return;
      }

      try {
        // Initialize AudioContext
        audioContextRef.current = new AudioContext();
        const buffers: Record<string, AudioBuffer> = {};

        // Load all samples
        const samples = Object.entries(track.freesound_samples);
        await Promise.all(
          samples.map(async ([key, sample]) => {
            try {
              const response = await fetch(sample.url);
              const arrayBuffer = await response.arrayBuffer();
              const audioBuffer = await audioContextRef.current!.decodeAudioData(arrayBuffer);
              buffers[key] = audioBuffer;
            } catch (error) {
              console.error(`Failed to load sample ${key}:`, error);
            }
          })
        );

        setAudioBuffers(buffers);
        setStatus('ready');
      } catch (error) {
        console.error('Error loading samples:', error);
        setStatus('error');
      }
    };

    loadSamples();

    return () => {
      // Cleanup function
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
    };
  }, [track.freesound_samples]);

  const playNote = (noteKey: string, time: number = 0) => {
    if (!audioContextRef.current || !audioBuffers[noteKey]) return;

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffers[noteKey];
    
    // Create a gain node for volume control
    const gainNode = audioContextRef.current.createGain();
    gainNode.gain.value = 0.5; // Set volume to 50%
    
    // Connect nodes: source -> gain -> destination
    source.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);
    
    source.start(audioContextRef.current.currentTime + time);
    activeSourcesRef.current.push(source);

    // Remove the source from active sources when it finishes
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
      if (activeSourcesRef.current.length === 0) {
        onPlayingChange(false);
      }
    };
  };

  const handlePlay = () => {
    if (status !== 'ready' || !track.midi_data) return;

    onPlayingChange(true);
    
    // Stop any currently playing sounds
    stopAllSounds();
    
    // Get the sample keys (assuming they match the number of MIDI notes)
    const sampleKeys = Object.keys(track.freesound_samples || {});
    
    // Play each note in the MIDI sequence
    track.midi_data.notes.forEach((note, index) => {
      const sampleKey = sampleKeys[index % sampleKeys.length];
      playNote(sampleKey, note.startTime);
    });
  };

  const stopAllSounds = () => {
    activeSourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Ignore errors from already stopped sources
      }
    });
    activeSourcesRef.current = [];
    onPlayingChange(false);
  };

  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <Button
        size="lg"
        variant="outline"
        className="w-16 h-16 rounded-full"
        onClick={isPlaying ? stopAllSounds : handlePlay}
        disabled={status !== 'ready'}
      >
        {status === 'loading' ? (
          <div className="animate-spin">
            <Music className="h-6 w-6" />
          </div>
        ) : isPlaying ? (
          <Pause className="h-6 w-6" />
        ) : (
          <Play className="h-6 w-6" />
        )}
      </Button>
      <p className="text-sm text-gray-500">
        {status === 'loading' ? 'Loading samples...' : 
         status === 'error' ? 'Error loading samples' :
         isPlaying ? 'Playing...' : 'Click to play'}
      </p>
    </div>
  );
};
