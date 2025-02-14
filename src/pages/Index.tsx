
import { useState } from "react";
import { AudioLevel } from "@/components/audio/AudioLevel";
import { RecordButton } from "@/components/audio/RecordButton";
import { PlaybackControl } from "@/components/audio/PlaybackControl";
import { ExtractButtons } from "@/components/audio/ExtractButtons";
import { TestConnection } from "@/components/audio/TestConnection";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { NavMenu } from "@/components/NavMenu";

const Index = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const {
    isRecording,
    isProcessing,
    audioLevel,
    currentRecording,
    currentRecordingId,
    startRecording,
    stopRecording,
  } = useAudioRecorder();

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <NavMenu />
      
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold text-center mb-8">New Recording</h1>
          
          <div className="flex flex-col items-center gap-6">
            <TestConnection />
            
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
            
            {currentRecording && !isRecording && (
              <>
                <div className="w-full">
                  <PlaybackControl
                    audioUrl={currentRecording}
                    isPlaying={isPlaying}
                    onPlayingChange={setIsPlaying}
                  />
                </div>
                
                <ExtractButtons
                  recordingId={currentRecordingId}
                  disabled={isProcessing || isRecording || isPlaying}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
