
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { saveToStorage, processAudio } from "@/utils/audioProcessing";

export const useAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [currentRecording, setCurrentRecording] = useState<string | null>(null);
  const [currentRecordingId, setCurrentRecordingId] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number>();
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      audioContextRef.current?.close();
    };
  }, []);

  const updateAudioLevel = () => {
    if (analyserRef.current) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
      setAudioLevel(average);
      
      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
    }
  };

  const startRecording = async () => {
    try {
      console.log('Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Microphone access granted!');
      
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 2048;
      
      updateAudioLevel();

      // Try to use MP3 format for compatibility with Kits.ai
      let mimeType = 'audio/mpeg';
      let options: MediaRecorderOptions = { mimeType };
      
      // Fallback options if MP3 is not supported
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        console.log('audio/mpeg not supported, trying audio/webm');
        mimeType = 'audio/webm';
        options = { mimeType };
        
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          console.log('audio/webm not supported, trying default recorder');
          // Use default options without specifying mimeType
          options = {};
        }
      }
      
      console.log(`Using recording MIME type: ${options.mimeType || 'browser default'}`);
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Create a blob with the proper mime type for MP3
        const finalMimeType = options.mimeType || 'audio/mpeg';
        const audioBlob = new Blob(chunksRef.current, { type: finalMimeType });
        setIsProcessing(true);
        
        try {
          console.log(`Recording completed, blob type: ${audioBlob.type}, size: ${audioBlob.size} bytes`);
          const processedAudio = await processAudio(audioBlob);
          const result = await saveToStorage(processedAudio);
          setCurrentRecording(result.url);
          setCurrentRecordingId(result.id);
          
          toast({
            title: "Success",
            description: "Recording saved and analyzed successfully!",
          });
          
        } catch (error) {
          console.error('Error processing/saving audio:', error);
          toast({
            title: "Error",
            description: "Failed to save or analyze the recording.",
            variant: "destructive",
          });
        } finally {
          setIsProcessing(false);
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
          }
          setAudioLevel(0);
        }
      };

      mediaRecorder.start();
      console.log('Recording started!');
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

  return {
    isRecording,
    isProcessing,
    audioLevel,
    currentRecording,
    currentRecordingId,
    startRecording,
    stopRecording,
  };
};
