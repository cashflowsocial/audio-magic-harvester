
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

  // Since we're now using direct URLs in storage_path, we can return them directly
  return samples.reduce((urls: Record<string, string>, sample) => {
    urls[sample.sample_type] = sample.storage_path;
    return urls;
  }, {});
};

