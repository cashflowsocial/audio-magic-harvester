
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
    getProcessingTime,
    recording
  } = useAudioProcessing(recordingId);

  const renderExtractButton = (type: 'drums' | 'melody' | 'hf-drums' | 'hf-melody') => {
    const isProcessing = processingType === type || recording?.status === 'processing';
    const processingTime = getProcessingTime(type);
    const isComplete = recording?.status === 'completed' && recording.processing_type === type;
    
    const displayName = {
      'drums': 'MusicGen Drums',
      'melody': 'MusicGen Melody',
      'hf-drums': 'HuggingFace Drums',
      'hf-melody': 'HuggingFace Melody'
    }[type];

    return (
      <ExtractButton
        type={type}
        displayName={displayName}
        disabled={disabled}
        isProcessing={isProcessing}
        processingTime={processingTime}
        onExtract={() => handleExtract(type)}
        onCancel={() => handleCancel(type)}
        audioUrl={isComplete ? recording.processed_audio_url : undefined}
        isPlaying={playingType === type}
        onPlayingChange={(playing) => setPlayingType(playing ? type : null)}
      />
    );
  };

  return (
    <div className="flex flex-col gap-3 w-full max-w-sm">
      <div className="space-y-2">
        <h3 className="text-sm font-medium">MusicGen Processing</h3>
        {renderExtractButton('drums')}
        {renderExtractButton('melody')}
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-medium">HuggingFace Processing</h3>
        {renderExtractButton('hf-drums')}
        {renderExtractButton('hf-melody')}
      </div>
    </div>
  );
};
