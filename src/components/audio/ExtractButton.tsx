
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

  // Add style information for Kits.ai buttons
  const getStyleInfo = () => {
    if (type === 'kits-drums') return '(Gritty Tape Drums)';
    if (type === 'kits-melody') return '(Female Rock/Pop)';
    return '';
  };

  const styleInfo = getStyleInfo();
  const buttonText = styleInfo ? `${displayName} ${styleInfo}` : displayName;

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
          {isProcessing ? `Processing ${displayName}... ${processingTime}` : buttonText}
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
