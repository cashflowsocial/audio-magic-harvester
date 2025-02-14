
import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"
import { PlaybackControl } from "@/components/audio/PlaybackControl"
import { useState } from "react"
import { ExtractButtons } from "@/components/audio/ExtractButtons"
import { getRecordingUrl, type RecordingWithUrl } from "@/utils/audioProcessing"
import { NavMenu } from "@/components/NavMenu"

const Recordings = () => {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const { data: recordings, isLoading } = useQuery({
    queryKey: ['recordings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recordings')
        .select('*')
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
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Recordings
