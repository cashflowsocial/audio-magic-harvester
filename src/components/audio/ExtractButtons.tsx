
import { Button } from "@/components/ui/button";
import { Drumstick, Music, Guitar, Play, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { PlaybackControl } from "./PlaybackControl";
import { useState } from "react";

interface ExtractButtonsProps {
  recordingId: string | null;
  disabled: boolean;
}

export const ExtractButtons = ({ recordingId, disabled }: ExtractButtonsProps) => {
  const { toast } = useToast();
  const [playingType, setPlayingType] = useState<string | null>(null);
  const [processingType, setProcessingType] = useState<string | null>(null);

  // Query processed tracks
  const { data: processedTracks, isLoading, refetch } = useQuery({
    queryKey: ['processed-tracks', recordingId],
    queryFn: async () => {
      if (!recordingId) return [];
      const { data, error } = await supabase
        .from('processed_tracks')
        .select('*')
        .eq('recording_id', recordingId);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!recordingId,
    refetchInterval: 5000, // Simply poll every 5 seconds while processing
  });

  const handleExtract = async (type: 'drums' | 'melody' | 'instrumentation') => {
    if (!recordingId) return;

    setProcessingType(type);
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
      await refetch(); // Refetch to get the latest status

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
    } finally {
      setProcessingType(null);
    }
  };

  const getTrackByType = (type: string) => {
    return processedTracks?.find(track => track.processing_type === type);
  };

  const renderExtractButton = (type: 'drums' | 'melody' | 'instrumentation') => {
    const track = getTrackByType(type);
    const isProcessing = processingType === type || track?.processing_status === 'processing';
    const icon = {
      drums: <Drumstick className="h-4 w-4" />,
      melody: <Music className="h-4 w-4" />,
      instrumentation: <Guitar className="h-4 w-4" />
    }[type];

    return (
      <div className="space-y-2">
        <Button
          onClick={() => handleExtract(type)}
          disabled={disabled || isProcessing}
          className="flex items-center gap-2 w-full"
          variant="outline"
        >
          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
          {isProcessing ? `Processing ${type}...` : `Extract & Create ${type}`}
        </Button>
        {track?.processed_audio_url && (
          <PlaybackControl
            audioUrl={track.processed_audio_url}
            isPlaying={playingType === type}
            onPlayingChange={(playing) => setPlayingType(playing ? type : null)}
          />
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3 w-full max-w-sm">
      {renderExtractButton('drums')}
      {renderExtractButton('melody')}
      {renderExtractButton('instrumentation')}
    </div>
  );
};
