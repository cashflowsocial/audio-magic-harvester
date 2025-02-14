
import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"
import { PlaybackControl } from "@/components/audio/PlaybackControl"
import { useState } from "react"
import { ExtractButtons } from "@/components/audio/ExtractButtons"
import { getRecordingUrl, type RecordingWithUrl } from "@/utils/audioProcessing"
import { NavMenu } from "@/components/NavMenu"
import { DrumPatternPlayer } from "@/components/audio/DrumPatternPlayer"

const Recordings = () => {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const { data: recordings, isLoading } = useQuery({
    queryKey: ['recordings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recordings')
        .select(`
          *,
          processed_tracks (
            id,
            processing_type,
            processing_status,
            pattern_data,
            tempo,
            time_signature
          )
        `)
        .order('created_at', { ascending: false })
      
      if (error) throw error

      // Map the recordings to include their URLs
      const recordingsWithUrls = await Promise.all(
        data.map(async (recording) => ({
          ...recording,
          url: await getRecordingUrl(recording.filename)
        }))
      )

      return recordingsWithUrls
    }
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <NavMenu />
        <div className="flex justify-center p-8">Loading recordings...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <NavMenu />
      <div className="p-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">My Recordings</h1>
          
          <div className="space-y-4">
            {recordings?.map((recording) => (
              <div key={recording.id} className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-medium">
                      Recording {new Date(recording.created_at).toLocaleString()}
                    </h3>
                  </div>
                </div>
                
                <PlaybackControl
                  audioUrl={recording.url}
                  isPlaying={isPlaying && playingId === recording.id}
                  onPlayingChange={(playing) => {
                    setIsPlaying(playing)
                    setPlayingId(playing ? recording.id : null)
                  }}
                />

                <div className="mt-4">
                  <ExtractButtons
                    recordingId={recording.id}
                    disabled={isPlaying && playingId === recording.id}
                  />
                </div>

                {recording.processed_tracks?.map((track) => (
                  track.processing_status === 'completed' && track.pattern_data && (
                    <div key={track.id} className="mt-4 pt-4 border-t">
                      <h4 className="font-medium mb-2">AI Generated Drum Pattern</h4>
                      <DrumPatternPlayer processedTrackId={track.id} />
                    </div>
                  )
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Recordings
