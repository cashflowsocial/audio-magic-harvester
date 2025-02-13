
import { Button } from "@/components/ui/button";
import { Drumstick, Music, Guitar } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ExtractButtonsProps {
  recordingId: string | null;
  disabled: boolean;
}

export const ExtractButtons = ({ recordingId, disabled }: ExtractButtonsProps) => {
  const { toast } = useToast();

  const handleExtract = async (type: 'drums' | 'melody' | 'instrumentation') => {
    if (!recordingId) return;

    toast({
      title: "Processing Started",
      description: `Starting ${type} extraction...`,
    });

    try {
      // Use fetch directly instead of supabase.functions.invoke
      const response = await fetch(
        `${supabase.functions.url}/process-audio`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabase.auth.getSession()?.access_token}`,
          },
          body: JSON.stringify({ 
            recordingId, 
            processingType: type 
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Processing failed: ${response.statusText}`);
      }

      const data = await response.json();

      toast({
        title: "Processing Complete",
        description: `Successfully extracted ${type}!`,
      });

      return data;
    } catch (error) {
      console.error(`Error extracting ${type}:`, error);
      toast({
        variant: "destructive",
        title: "Processing Failed",
        description: `Failed to extract ${type}. Please try again.`,
      });
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full max-w-sm">
      <Button
        onClick={() => handleExtract('drums')}
        disabled={disabled}
        className="flex items-center gap-2"
        variant="outline"
      >
        <Drumstick className="h-4 w-4" />
        Extract & Create Drums
      </Button>

      <Button
        onClick={() => handleExtract('melody')}
        disabled={disabled}
        className="flex items-center gap-2"
        variant="outline"
      >
        <Music className="h-4 w-4" />
        Extract & Create Melody
      </Button>

      <Button
        onClick={() => handleExtract('instrumentation')}
        disabled={disabled}
        className="flex items-center gap-2"
        variant="outline"
      >
        <Guitar className="h-4 w-4" />
        Extract & Create Instrumentation
      </Button>
    </div>
  );
};
