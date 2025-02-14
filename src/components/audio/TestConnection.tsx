
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
      // Test audio context creation
      const audioContext = new AudioContext();
      
      // Test analyzer node creation
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      
      // Test microphone access
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
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
      className="w-full max-w-[200px]"
    >
      {testing ? (
        <>
          <Loader2 className="animate-spin" />
          Testing...
        </>
      ) : testResult === "success" ? (
        <>
          <Check className="text-green-500" />
          System Ready
        </>
      ) : testResult === "error" ? (
        <>
          <XCircle className="text-red-500" />
          Check Settings
        </>
      ) : (
        "Test Audio System"
      )}
    </Button>
  );
};
