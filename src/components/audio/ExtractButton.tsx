
import { Button } from "@/components/ui/button";
import { Drumstick, Music, Guitar, Loader2, StopCircle } from "lucide-react";
import { PlaybackControl } from "./PlaybackControl";
import { ProcessedTrack } from "./types";

interface ExtractButtonProps {
  type: 'drums' | 'melody' | 'instrumentation';
  disabled: boolean;
  isProcessing: boolean;
  processingTime: string;
  onExtract: () => void;
  onCancel: () => void;
  track?: ProcessedTrack;
  isPlaying: boolean;
  onPlayingChange: (playing: boolean) => void;
}

export const ExtractButton = ({
  type,
  disabled,
  isProcessing,
  processingTime,
  onExtract,
  onCancel,
  track,
  isPlaying,
  onPlayingChange
}: ExtractButtonProps) => {
  const icon = {
    drums: <Drumstick className="h-4 w-4" />,
    melody: <Music className="h-4 w-4" />,
    instrumentation: <Guitar className="h-4 w-4" />
  }[type];

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          onClick={onExtract}
          disabled={disabled || isProcessing}
          className="flex items-center gap-2 flex-1"
          variant="outline"
        >
          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
          {isProcessing ? `Processing ${type}... ${processingTime}` : `Extract & Create ${type}`}
        </Button>
        {isProcessing && (
          <Button
            onClick={onCancel}
            variant="destructive"
            size="icon"
            className="shrink-0"
          >
            <StopCircle className="h-4 w-4" />
          </Button>
        )}
      </div>
      {track?.processed_audio_url && track.processing_status === 'completed' && (
        <PlaybackControl
          audioUrl={track.processed_audio_url}
          isPlaying={isPlaying}
          onPlayingChange={onPlayingChange}
        />
      )}
    </div>
  );
};
