
import { useEffect, useRef, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Play, Pause, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DrumPatternPlayerProps {
  processedTrackId: string;
}

export const DrumPatternPlayer = ({ processedTrackId }: DrumPatternPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pattern, setPattern] = useState<any>(null);
  const [drumSamples, setDrumSamples] = useState<Record<string, AudioBuffer>>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const fetchPattern = async () => {
      const { data, error } = await supabase
        .from('processed_tracks')
        .select('*')
        .eq('id', processedTrackId)
        .single();

      if (error) {
        console.error('Error fetching pattern:', error);
        return;
      }

      if (data.pattern_data && data.tempo) {
        setPattern({
          pattern: data.pattern_data,
          tempo: data.tempo,
          timeSignature: data.time_signature
        });
      }
    };

    fetchPattern();
  }, [processedTrackId]);

  useEffect(() => {
    const loadDrumSamples = async () => {
      try {
        const { data: drumKit, error: drumKitError } = await supabase
          .from('drum_kits')
          .select(`
            id,
            name,
            drum_kit_samples (
              id,
              sample_type,
              storage_path
            )
          `)
          .eq('name', 'Default Kit')
          .single();

        if (drumKitError || !drumKit) {
          throw new Error('Failed to load drum kit');
        }

        // Initialize audio context
        audioContextRef.current = new AudioContext();
        const loadedSamples: Record<string, AudioBuffer> = {};

        // Load each sample
        for (const sample of drumKit.drum_kit_samples) {
          const { data } = await supabase.storage
            .from('drum_samples')
            .download(sample.storage_path);

          if (data) {
            const arrayBuffer = await data.arrayBuffer();
            const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
            loadedSamples[sample.sample_type] = audioBuffer;
          }
        }

        setDrumSamples(loadedSamples);
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading drum samples:', error);
        setIsLoading(false);
      }
    };

    loadDrumSamples();

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const playDrumSound = (type: string, time: number) => {
    if (!audioContextRef.current || !drumSamples[type]) return;

    const source = audioContextRef.current.createBufferSource();
    source.buffer = drumSamples[type];
    source.connect(audioContextRef.current.destination);
    source.start(time);
  };

  const playPattern = () => {
    if (!pattern || !audioContextRef.current) return;

    setIsPlaying(true);
    const startTime = audioContextRef.current.currentTime;
    const beatDuration = 60 / pattern.tempo;

    // Schedule all drum hits
    Object.entries(pattern.pattern).forEach(([type, beats]: [string, number[]]) => {
      beats.forEach((beat) => {
        const time = startTime + (beat - 1) * beatDuration;
        playDrumSound(type, time);
      });
    });

    // Calculate pattern duration and stop playing after it's done
    const maxBeat = Math.max(...Object.values(pattern.pattern).flat());
    const patternDuration = (maxBeat - 1) * beatDuration * 1000;

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
        <span className="ml-2">Loading drum samples...</span>
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
