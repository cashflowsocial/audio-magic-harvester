
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";

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
  return (
    <>
      <Button
        size="lg"
        className={`w-16 h-16 rounded-full ${isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'}`}
        onClick={isRecording ? onStopRecording : onStartRecording}
        disabled={isProcessing}
      >
        {isProcessing ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : isRecording ? (
          <Square className="h-6 w-6" />
        ) : (
          <Mic className="h-6 w-6" />
        )}
      </Button>
      
      <p className="text-sm text-gray-500">
        {isProcessing ? 'Processing...' : isRecording ? 'Recording... Click to stop' : 'Click to start recording'}
      </p>
    </>
  );
};
