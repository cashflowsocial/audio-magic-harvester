
import { supabase } from "@/integrations/supabase/client";

export const getDrumKits = async () => {
  const { data: kits, error } = await supabase
    .from('drum_kits')
    .select(`
      id,
      name,
      description,
      drum_kit_samples (
        id,
        sample_type,
        filename,
        storage_path
      )
    `);

  if (error) {
    console.error('Error fetching drum kits:', error);
    return [];
  }

  return kits;
};

export const getDrumSampleUrls = async (kitId: string) => {
  const { data: samples, error } = await supabase
    .from('drum_kit_samples')
    .select('*')
    .eq('kit_id', kitId);

  if (error) {
    console.error('Error fetching drum samples:', error);
    return {};
  }

  return samples.reduce((urls: Record<string, string>, sample) => {
    const { data } = supabase.storage
      .from('drum_kit_samples')
      .getPublicUrl(sample.storage_path);
    
    urls[sample.sample_type] = data.publicUrl;
    return urls;
  }, {});
};

// Usage example:
// const kits = await getDrumKits();
// const urls = await getDrumSampleUrls(kits[0].id);
// console.log(urls.kick); // URL to kick.mp3
// console.log(urls.snare); // URL to snare.mp3
// etc.
