
import { useEffect, useRef, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Play, Pause, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { DrumPattern } from './types';

interface DrumPatternPlayerProps {
  processedTrackId: string;
}

export const DrumPatternPlayer = ({ processedTrackId }: DrumPatternPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pattern, setPattern] = useState<DrumPattern | null>(null);
  const [audioBuffers, setAudioBuffers] = useState<Record<string, AudioBuffer>>({});
  const { toast } = useToast();
  const audioContextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const fetchPatternAndSamples = async () => {
      try {
        // Get the processed track data
        const { data, error } = await supabase
          .from('processed_tracks')
          .select('*')
          .eq('id', processedTrackId)
          .single();

        if (error) throw error;

        if (!data.pattern_data || !data.tempo || !data.freesound_samples) {
          throw new Error('Missing required pattern data or Freesound samples');
        }

        // Set the pattern
        setPattern({
          pattern: data.pattern_data,
          tempo: Number(data.tempo),
          timeSignature: data.time_signature || '4/4'
        });

        // Initialize audio context
        audioContextRef.current = new AudioContext();
        const loadedBuffers: Record<string, AudioBuffer> = {};

        // Load Freesound samples
        for (const [instrumentType, sample] of Object.entries(data.freesound_samples)) {
          try {
            const response = await fetch(sample.url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
            loadedBuffers[instrumentType] = audioBuffer;
          } catch (err) {
            console.error(`Error loading sample for ${instrumentType}:`, err);
            toast({
              title: "Error",
              description: `Failed to load ${instrumentType} sample`,
              variant: "destructive",
            });
          }
        }

        setAudioBuffers(loadedBuffers);
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching pattern and samples:', error);
        toast({
          title: "Error",
          description: "Failed to load drum pattern and samples",
          variant: "destructive",
        });
        setIsLoading(false);
      }
    };

    fetchPatternAndSamples();

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [processedTrackId, toast]);

  const playSound = (type: string, time: number) => {
    if (!audioContextRef.current || !audioBuffers[type]) return;

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffers[type];
    
    // Create a gain node for volume control
    const gainNode = audioContextRef.current.createGain();
    gainNode.gain.value = 0.7; // Adjust volume as needed
    
    // Connect the nodes
    source.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);
    
    source.start(time);
  };

  const playPattern = () => {
    if (!pattern || !audioContextRef.current) return;

    setIsPlaying(true);
    const startTime = audioContextRef.current.currentTime;
    const beatDuration = 60 / pattern.tempo;

    // Schedule all sounds
    Object.entries(pattern.pattern).forEach(([type, beats]) => {
      beats.forEach((beat) => {
        const time = startTime + (beat - 1) * beatDuration;
        playSound(type, time);
      });
    });

    // Calculate pattern duration and stop playing after it's done
    const allBeats = Object.values(pattern.pattern).flat();
    const maxBeat = Math.max(...allBeats);
    const patternDuration = maxBeat * beatDuration * 1000;

    timerRef.current = window.setTimeout(() => {
      setIsPlaying(false);
    }, patternDuration);
  };

  const stopPattern = () => {
    setIsPlaying(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading samples...</span>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <Button
        variant="outline"
        size="lg"
        className="w-16 h-16 rounded-full"
        onClick={isPlaying ? stopPattern : playPattern}
        disabled={!pattern || isLoading}
      >
        {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
      </Button>
      {pattern && (
        <div className="mt-2 text-sm text-gray-500">
          Tempo: {pattern.tempo} BPM | Time Signature: {pattern.timeSignature}
        </div>
      )}
    </div>
  );
};
