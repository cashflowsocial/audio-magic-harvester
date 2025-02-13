
import { Button } from "@/components/ui/button";
import { Play, Pause } from "lucide-react";
import { useRef, useEffect } from "react";

interface PlaybackControlProps {
  audioUrl: string;
  isPlaying: boolean;
  onPlayingChange: (isPlaying: boolean) => void;
}

export const PlaybackControl = ({ audioUrl, isPlaying, onPlayingChange }: PlaybackControlProps) => {
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const togglePlayback = () => {
    if (!audioPlayerRef.current) return;

    if (isPlaying) {
      audioPlayerRef.current.pause();
    } else {
      audioPlayerRef.current.play();
    }
  };

  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <Button
        size="lg"
        variant="outline"
        className="w-16 h-16 rounded-full"
        onClick={togglePlayback}
      >
        {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
      </Button>
      <p className="text-sm text-gray-500">
        {isPlaying ? 'Playing...' : 'Click to play'}
      </p>
      <audio
        ref={audioPlayerRef}
        src={audioUrl}
        onEnded={() => onPlayingChange(false)}
        onPause={() => onPlayingChange(false)}
        onPlay={() => onPlayingChange(true)}
      />
    </div>
  );
};
