
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Check, XCircle } from "lucide-react";

export const TestConnection = () => {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const { toast } = useToast();

  const testAudioSystem = async () => {
    setTesting(true);
    setTestResult(null);
    
    try {
      console.log('Starting audio system test...');
      // Test audio context creation
      const audioContext = new AudioContext();
      console.log('AudioContext created successfully');
      
      // Test analyzer node creation
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      console.log('Analyzer node created successfully');
      
      // Test microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Microphone access granted:', stream.active);
      
      setTestResult("success");
      toast({
        title: "Audio System Ready",
        description: "Your browser supports all required audio features.",
      });
    } catch (error) {
      console.error('Audio system test failed:', error);
      setTestResult("error");
      toast({
        variant: "destructive",
        title: "Audio System Error",
        description: "Some audio features are not available. Please check your microphone permissions.",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={testAudioSystem}
      disabled={testing}
      className="w-full max-w-[200px] gap-2 flex items-center justify-center"
    >
      {testing ? (
        <>
          <Loader2 className="animate-spin h-4 w-4" />
          <span>Testing...</span>
        </>
      ) : testResult === "success" ? (
        <>
          <Check className="h-4 w-4 text-green-500" />
          <span>System Ready</span>
        </>
      ) : testResult === "error" ? (
        <>
          <XCircle className="h-4 w-4 text-red-500" />
          <span>Check Settings</span>
        </>
      ) : (
        "Test Audio System"
      )}
    </Button>
  );
};
