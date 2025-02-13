
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2, Play, Pause } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { saveToStorage, processAudio, getRecordingUrl } from "@/utils/audioProcessing";

const Index = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentRecording, setCurrentRecording] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/wav' });
        setIsProcessing(true);
        
        try {
          // Process the audio using Hugging Face
          const processedAudio = await processAudio(audioBlob);
          // Save to Supabase storage
          const filename = await saveToStorage(processedAudio);
          const url = await getRecordingUrl(filename);
          setCurrentRecording(url);
          toast({
            title: "Success",
            description: "Audio recorded and saved successfully!",
          });
        } catch (error) {
          console.error('Error processing/saving audio:', error);
          toast({
            title: "Error",
            description: "Failed to process or save the recording.",
            variant: "destructive",
          });
        } finally {
          setIsProcessing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        title: "Error",
        description: "Could not access the microphone. Please check your permissions.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const togglePlayback = () => {
    if (!audioPlayerRef.current || !currentRecording) return;

    if (isPlaying) {
      audioPlayerRef.current.pause();
    } else {
      audioPlayerRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
      <div className="bg-white rounded-lg shadow-md p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-8">Voice Recorder</h1>
        
        <div className="flex flex-col items-center gap-4">
          <Button
            size="lg"
            className={`w-16 h-16 rounded-full ${isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'}`}
            onClick={isRecording ? stopRecording : startRecording}
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

          {currentRecording && (
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
                src={currentRecording}
                onEnded={() => setIsPlaying(false)}
                onPause={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
