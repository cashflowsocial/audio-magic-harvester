
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { ProcessedTrack } from "./types";

export const useAudioProcessing = (recordingId: string | null) => {
  const { toast } = useToast();
  const [playingType, setPlayingType] = useState<string | null>(null);
  const [processingType, setProcessingType] = useState<string | null>(null);
  const [startTimes, setStartTimes] = useState<Record<string, number>>({});

  const { data: processedTracks, refetch } = useQuery({
    queryKey: ['processed-tracks', recordingId],
    queryFn: async () => {
      if (!recordingId) return [];
      const { data, error } = await supabase
        .from('processed_tracks')
        .select('*')
        .eq('recording_id', recordingId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ProcessedTrack[] || [];
    },
    enabled: !!recordingId,
    refetchInterval: (query) => {
      const data = query.state.data as ProcessedTrack[] | undefined;
      if (!Array.isArray(data)) return false;
      const hasProcessingTracks = data.some(track => track.processing_status === 'processing');
      return hasProcessingTracks ? 3000 : false;
    }
  });

  const handleCancel = async (type: string) => {
    if (!recordingId) return;

    try {
      const tracksToCancel = processedTracks?.filter(t => 
        t.processing_type === type && 
        t.processing_status === 'processing'
      );

      if (tracksToCancel && tracksToCancel.length > 0) {
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
        setStartTimes(prev => {
          const next = { ...prev };
          delete next[type];
          return next;
        });

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
        body: { recordingId, processingType: type }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Processing failed');
      }

      await refetch();

      toast({
        title: "Processing Complete",
        description: `Successfully extracted ${type}!`,
      });

      // Store the MIDI pattern data
      if (response.data.midiPattern) {
        console.log('MIDI Pattern:', response.data.midiPattern);
        // TODO: Use this data to play back using Freesound samples
      }

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
      setStartTimes(prev => {
        const next = { ...prev };
        delete next[type];
        return next;
      });
    }
  };

  return {
    processedTracks,
    playingType,
    setPlayingType,
    processingType,
    handleCancel,
    handleExtract,
    getTrackByType: (type: string) => processedTracks?.find(track => track.processing_type === type),
    getProcessingTime: (type: string) => {
      const startTime = startTimes[type];
      if (!startTime) return '';
      return `${Math.floor((Date.now() - startTime) / 1000)}s`;
    }
  };
};
