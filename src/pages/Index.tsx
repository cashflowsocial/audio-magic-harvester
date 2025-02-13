
import { useState } from "react";
import { AudioLevel } from "@/components/audio/AudioLevel";
import { RecordButton } from "@/components/audio/RecordButton";
import { PlaybackControl } from "@/components/audio/PlaybackControl";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";

const Index = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const {
    isRecording,
    isProcessing,
    audioLevel,
    currentRecording,
    startRecording,
    stopRecording,
  } = useAudioRecorder();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
      <div className="bg-white rounded-lg shadow-md p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-8">Voice Recorder</h1>
        
        <div className="flex flex-col items-center gap-4">
          <AudioLevel 
            level={audioLevel}
            isRecording={isRecording}
          />

          <RecordButton
            isRecording={isRecording}
            isProcessing={isProcessing}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
          />
          
          {currentRecording && (
            <PlaybackControl
              audioUrl={currentRecording}
              isPlaying={isPlaying}
              onPlayingChange={setIsPlaying}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
