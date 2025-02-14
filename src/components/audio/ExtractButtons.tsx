
import { Button } from "@/components/ui/button";
import { Drumstick, Music, Guitar, Play, Loader2, StopCircle } from "lucide-react";
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
  const [startTimes, setStartTimes] = useState<Record<string, number>>({});

  // Query processed tracks
  const { data: processedTracks, isLoading, refetch } = useQuery({
    queryKey: ['processed-tracks', recordingId],
    queryFn: async () => {
      if (!recordingId) return [];
      const { data, error } = await supabase
        .from('processed_tracks')
        .select('*')
        .eq('recording_id', recordingId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!recordingId,
    refetchInterval: (data: any) => {
      // Only refetch if we have data and there are any tracks in 'processing' status
      if (!Array.isArray(data)) return false;
      const hasProcessingTracks = data.some(track => track.processing_status === 'processing');
      return hasProcessingTracks ? 3000 : false;
    }
  });

  const handleCancel = async (type: string) => {
    if (!recordingId) return;

    try {
      // Find all processing tracks of this type for this recording
      const tracksToCancel = processedTracks?.filter(t => 
        t.processing_type === type && 
        t.processing_status === 'processing'
      );

      if (tracksToCancel && tracksToCancel.length > 0) {
        // Cancel all processing tracks of this type
        for (const track of tracksToCancel) {
          await supabase
            .from('processed_tracks')
            .update({ 
              processing_status: 'failed',
              error_message: 'Processing cancelled by user'
            })
            .eq('id', track.id);
        }

        await refetch();
        setProcessingType(null);
        delete startTimes[type];
        setStartTimes({...startTimes});

        toast({
          title: "Processing Cancelled",
          description: `Cancelled ${type} extraction.`,
        });
      }
    } catch (error) {
      console.error('Error cancelling processing:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to cancel processing. Please try again.",
      });
    }
  };

  const handleExtract = async (type: 'drums' | 'melody' | 'instrumentation') => {
    if (!recordingId) return;

    // First, cancel any existing processing of this type
    const existingProcessing = processedTracks?.find(
      t => t.processing_type === type && t.processing_status === 'processing'
    );
    
    if (existingProcessing) {
      await handleCancel(type);
    }

    setProcessingType(type);
    setStartTimes(prev => ({...prev, [type]: Date.now()}));
    
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
      await refetch();

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
      delete startTimes[type];
      setStartTimes({...startTimes});
    }
  };

  const getTrackByType = (type: string) => {
    return processedTracks?.find(track => track.processing_type === type);
  };

  const getProcessingTime = (type: string) => {
    const startTime = startTimes[type];
    if (!startTime) return '';
    
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    return `${seconds}s`;
  };

  const renderExtractButton = (type: 'drums' | 'melody' | 'instrumentation') => {
    const track = getTrackByType(type);
    const isProcessing = processingType === type || track?.processing_status === 'processing';
    const processingTime = getProcessingTime(type);
    
    const icon = {
      drums: <Drumstick className="h-4 w-4" />,
      melody: <Music className="h-4 w-4" />,
      instrumentation: <Guitar className="h-4 w-4" />
    }[type];

    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <Button
            onClick={() => handleExtract(type)}
            disabled={disabled || isProcessing}
            className="flex items-center gap-2 flex-1"
            variant="outline"
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
            {isProcessing ? `Processing ${type}... ${processingTime}` : `Extract & Create ${type}`}
          </Button>
          {isProcessing && (
            <Button
              onClick={() => handleCancel(type)}
              variant="destructive"
              size="icon"
              className="shrink-0"
            >
              <StopCircle className="h-4 w-4" />
            </Button>
          )}
        </div>
        {track?.processed_audio_url && track.processing_status === 'completed' && (
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
