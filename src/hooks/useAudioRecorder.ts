
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { saveToStorage, processAudio, getRecordingUrl, checkProcessingStatus } from "@/utils/audioProcessing";

export const useAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [currentRecording, setCurrentRecording] = useState<string | null>(null);
  
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
      
      if (Date.now() % 500 === 0) {
        console.log('Current audio level:', average);
      }
      
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
      analyserRef.current.fftSize = 256;
      
      updateAudioLevel();

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          console.log('Recording data chunk received:', e.data.size, 'bytes');
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/wav' });
        console.log('Recording stopped. Total size:', audioBlob.size, 'bytes');
        setIsProcessing(true);
        
        try {
          const processedAudio = await processAudio(audioBlob);
          const result = await saveToStorage(processedAudio);
          const url = await getRecordingUrl(result.filename);
          setCurrentRecording(url);
          
          const checkStatus = async () => {
            const status = await checkProcessingStatus(result.processedTrackId);
            if (status.processing_status === 'completed') {
              toast({
                title: "Success",
                description: "Audio processed successfully!",
              });
            } else if (status.processing_status === 'failed') {
              toast({
                title: "Error",
                description: "Failed to process the recording.",
                variant: "destructive",
              });
            } else {
              setTimeout(checkStatus, 2000);
            }
          };
          
          checkStatus();
          
        } catch (error) {
          console.error('Error processing/saving audio:', error);
          toast({
            title: "Error",
            description: "Failed to process or save the recording.",
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
    startRecording,
    stopRecording,
  };
};
