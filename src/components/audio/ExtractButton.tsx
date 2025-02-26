
import { Button } from "@/components/ui/button";
import { Drumstick, Music, Loader2, StopCircle } from "lucide-react";
import { PlaybackControl } from "./PlaybackControl";

interface ExtractButtonProps {
  type: 'drums' | 'melody' | 'hf-drums' | 'hf-melody' | 'kits-drums' | 'kits-melody';
  displayName: string;
  disabled: boolean;
  isProcessing: boolean;
  processingTime: string;
  onExtract: () => void;
  onCancel: () => void;
  audioUrl?: string;
  isPlaying: boolean;
  onPlayingChange: (playing: boolean) => void;
}

export const ExtractButton = ({
  type,
  displayName,
  disabled,
  isProcessing,
  processingTime,
  onExtract,
  onCancel,
  audioUrl,
  isPlaying,
  onPlayingChange
}: ExtractButtonProps) => {
  const icon = type.includes('drums') ? 
    <Drumstick className="h-4 w-4" /> : 
    <Music className="h-4 w-4" />;

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
          {isProcessing ? `Processing ${displayName}... ${processingTime}` : displayName}
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
      {audioUrl && (
        <PlaybackControl
          audioUrl={audioUrl}
          isPlaying={isPlaying}
          onPlayingChange={onPlayingChange}
        />
      )}
    </div>
  );
};
