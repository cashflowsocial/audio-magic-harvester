
import { supabase } from "@/integrations/supabase/client";

export const getDrumSampleUrls = async () => {
  try {
    const samples = ['kick', 'snare', 'hihat', 'crash'];
    const urls: Record<string, string> = {};

    for (const sample of samples) {
      const { data } = supabase.storage
        .from('drum_samples')
        .getPublicUrl(`${sample}.mp3`);
      
      urls[sample] = data.publicUrl;
    }

    return urls;
  } catch (error) {
    console.error('Error getting drum sample URLs:', error);
    throw error;
  }
};
