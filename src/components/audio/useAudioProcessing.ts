
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface Recording {
  id: string;
  created_at: string;
  filename: string;
  storage_path: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  processed_audio_url?: string;
  error_message?: string;
  processing_type?: 'drums' | 'melody' | 'hf-drums' | 'hf-melody' | 'kits-drums' | 'kits-melody';
  prompt?: string;
}

export const useAudioProcessing = (recordingId: string | null) => {
  const { toast } = useToast();
  const [playingType, setPlayingType] = useState<string | null>(null);
  const [processingType, setProcessingType] = useState<string | null>(null);
  const [startTimes, setStartTimes] = useState<Record<string, number>>({});

  const { data: recording, refetch } = useQuery({
    queryKey: ['recording', recordingId],
    queryFn: async () => {
      if (!recordingId) return null;
      
      try {
        const { data, error } = await supabase
          .from('recordings')
          .select('*')
          .eq('id', recordingId)
          .single();
        
        if (error) throw error;
        return data as Recording;
      } catch (error) {
        console.error('Error fetching recording:', error);
        throw error;
      }
    },
    enabled: !!recordingId,
    refetchInterval: (query) => {
      const data = query.state.data as Recording | null;
      return data?.status === 'processing' ? 3000 : false;
    }
  });

  const handleCancel = async (type: string) => {
    if (!recordingId) return;

    try {
      if (recording?.status === 'processing' && recording.processing_type === type) {
        await supabase
          .from('recordings')
          .update({ 
            status: 'failed',
            error_message: 'Processing cancelled by user'
          })
          .eq('id', recordingId);

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

  const handleExtract = async (type: 'drums' | 'melody' | 'hf-drums' | 'hf-melody' | 'kits-drums' | 'kits-melody') => {
    if (!recordingId) return;

    if (recording?.status === 'processing') {
      await handleCancel(type);
    }

    setProcessingType(type);
    setStartTimes(prev => ({...prev, [type]: Date.now()}));
    
    toast({
      title: "Processing Started",
      description: `Starting ${type} extraction...`,
    });

    try {
      let endpoint = 'process-audio-musicgen';
      
      if (type.startsWith('hf')) {
        endpoint = 'process-audio-huggingface';
      } else if (type.startsWith('kits')) {
        endpoint = 'process-audio-kitsai';
      }
      
      // Make the request with proper error handling
      const { data, error } = await supabase.functions.invoke(endpoint, {
        body: { recordingId, type }
      });

      if (error) {
        throw new Error(error.message || 'Processing failed');
      }

      await refetch();

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
    recording,
    playingType,
    setPlayingType,
    processingType,
    handleCancel,
    handleExtract,
    getProcessingTime: (type: string) => {
      const startTime = startTimes[type];
      if (!startTime) return '';
      return `${Math.floor((Date.now() - startTime) / 1000)}s`;
    }
  };
};
