
import { ExtractButton } from "./ExtractButton";
import { useAudioProcessing } from "./useAudioProcessing";

interface ExtractButtonsProps {
  recordingId: string | null;
  disabled: boolean;
}

export const ExtractButtons = ({ recordingId, disabled }: ExtractButtonsProps) => {
  const {
    playingType,
    setPlayingType,
    processingType,
    handleCancel,
    handleExtract,
    getTrackByType,
    getProcessingTime
  } = useAudioProcessing(recordingId);

  const renderExtractButton = (type: 'drums' | 'melody' | 'instrumentation') => {
    const track = getTrackByType(type);
    const isProcessing = processingType === type || track?.processing_status === 'processing';
    const processingTime = getProcessingTime(type);

    return (
      <ExtractButton
        type={type}
        disabled={disabled}
        isProcessing={isProcessing}
        processingTime={processingTime}
        onExtract={() => handleExtract(type)}
        onCancel={() => handleCancel(type)}
        track={track}
        isPlaying={playingType === type}
        onPlayingChange={(playing) => setPlayingType(playing ? type : null)}
      />
    );
  };

  return (
    <div className="flex flex-col gap-3 w-full max-w-sm">
      {renderExtractButton('drums')}
      {renderExtractButton('melody')}
      {renderExtractButton('instrumentation')}
    </div>
  );
};
