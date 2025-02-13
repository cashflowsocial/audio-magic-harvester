
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface RecordButtonProps {
  isRecording: boolean;
  isProcessing: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export const RecordButton = ({
  isRecording,
  isProcessing,
  onStartRecording,
  onStopRecording
}: RecordButtonProps) => {
  const { toast } = useToast();
  
  const handleStartRecording = async () => {
    try {
      // Check if the browser supports audio recording
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Audio recording is not supported in this browser");
      }
      
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });
      onStartRecording();
    } catch (error) {
      console.error("Recording error:", error);
      toast({
        variant: "destructive",
        title: "Recording Error",
        description: error instanceof Error ? error.message : "Could not start recording",
      });
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        size="lg"
        className={`w-16 h-16 rounded-full ${
          isRecording ? 'bg-red-500 hover:bg-red-600' : 
          'bg-blue-500 hover:bg-blue-600'
        }`}
        onClick={isRecording ? onStopRecording : handleStartRecording}
        disabled={isProcessing}
        aria-label={isRecording ? "Stop recording" : "Start recording"}
      >
        {isProcessing ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : isRecording ? (
          <Square className="h-6 w-6" />
        ) : (
          <Mic className="h-6 w-6" />
        )}
      </Button>
      
      <p className="text-sm text-gray-500 flex items-center gap-2">
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : isRecording ? (
          'Recording... Click to stop'
        ) : (
          'Click to start recording'
        )}
      </p>
    </div>
  );
};
