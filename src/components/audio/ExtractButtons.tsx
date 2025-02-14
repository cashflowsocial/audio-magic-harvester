
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
      const response = await supabase.functions.invoke('process-audio', {
        body: { 
          recordingId, 
          processingType: type 
        }
      });

      if (response.error) {
        console.error(`Processing error:`, response.error);
        throw new Error(response.error.message || 'Processing failed');
      }

      console.log(`Processing response:`, response);

      toast({
        title: "Processing Complete",
        description: `Successfully extracted ${type}!`,
      });

      return response.data;
    } catch (error) {
      console.error(`Error extracting ${type}:`, error);
      toast({
        variant: "destructive",
        title: "Processing Failed",
        description: error instanceof Error ? error.message : `Failed to extract ${type}. Please try again.`,
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
