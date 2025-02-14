
import { supabase } from "@/integrations/supabase/client";

export const getDrumSampleUrls = () => {
  const samples = ['kick', 'snare', 'hihat', 'crash'];
  return samples.reduce((urls, name) => {
    const { data } = supabase.storage
      .from('drum_samples')
      .getPublicUrl(`${name}.mp3`);
    
    urls[name] = data.publicUrl;
    return urls;
  }, {} as Record<string, string>);
};

// Usage example:
// const urls = getDrumSampleUrls();
// console.log(urls.kick); // URL to kick.mp3
// console.log(urls.snare); // URL to snare.mp3
// etc.
