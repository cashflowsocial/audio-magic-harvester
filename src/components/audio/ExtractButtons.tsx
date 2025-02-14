
import { Button } from "@/components/ui/button";
import { Drumstick, Music, Guitar, Play } from "lucide-react";
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

  // Query processed tracks
  const { data: processedTracks, isLoading } = useQuery({
    queryKey: ['processed-tracks', recordingId],
    queryFn: async () => {
      if (!recordingId) return [];
      const { data, error } = await supabase
        .from('processed_tracks')
        .select('*')
        .eq('recording_id', recordingId);
      
      if (error) throw error;
      return data;
    },
    enabled: !!recordingId
  });

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

  const getTrackByType = (type: string) => {
    return processedTracks?.find(track => track.processing_type === type);
  };

  return (
    <div className="flex flex-col gap-3 w-full max-w-sm">
      <div className="space-y-2">
        <Button
          onClick={() => handleExtract('drums')}
          disabled={disabled}
          className="flex items-center gap-2 w-full"
          variant="outline"
        >
          <Drumstick className="h-4 w-4" />
          Extract & Create Drums
        </Button>
        {getTrackByType('drums')?.processed_audio_url && (
          <PlaybackControl
            audioUrl={getTrackByType('drums')?.processed_audio_url || ''}
            isPlaying={playingType === 'drums'}
            onPlayingChange={(playing) => setPlayingType(playing ? 'drums' : null)}
          />
        )}
      </div>

      <div className="space-y-2">
        <Button
          onClick={() => handleExtract('melody')}
          disabled={disabled}
          className="flex items-center gap-2 w-full"
          variant="outline"
        >
          <Music className="h-4 w-4" />
          Extract & Create Melody
        </Button>
        {getTrackByType('melody')?.processed_audio_url && (
          <PlaybackControl
            audioUrl={getTrackByType('melody')?.processed_audio_url || ''}
            isPlaying={playingType === 'melody'}
            onPlayingChange={(playing) => setPlayingType(playing ? 'melody' : null)}
          />
        )}
      </div>

      <div className="space-y-2">
        <Button
          onClick={() => handleExtract('instrumentation')}
          disabled={disabled}
          className="flex items-center gap-2 w-full"
          variant="outline"
        >
          <Guitar className="h-4 w-4" />
          Extract & Create Instrumentation
        </Button>
        {getTrackByType('instrumentation')?.processed_audio_url && (
          <PlaybackControl
            audioUrl={getTrackByType('instrumentation')?.processed_audio_url || ''}
            isPlaying={playingType === 'instrumentation'}
            onPlayingChange={(playing) => setPlayingType(playing ? 'instrumentation' : null)}
          />
        )}
      </div>
    </div>
  );
};
