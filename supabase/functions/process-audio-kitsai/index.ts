
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.23.0";

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse the request body
    const { recordingId, type } = await req.json();
    
    if (!recordingId) {
      throw new Error('Recording ID is required');
    }

    // Create Supabase client with Deno Deploy environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update recording status to processing
    const { error: updateError } = await supabase
      .from('recordings')
      .update({
        status: 'processing',
        processing_type: type
      })
      .eq('id', recordingId);

    if (updateError) throw updateError;

    // Get recording details
    const { data: recording, error: fetchError } = await supabase
      .from('recordings')
      .select('filename, storage_path')
      .eq('id', recordingId)
      .single();

    if (fetchError) throw fetchError;

    // Download the audio file
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('recordings')
      .download(recording.filename);

    if (downloadError) throw downloadError;

    // Set up Kits.ai API options based on type
    const isPercussion = type === 'kits-drums';
    const extractionType = isPercussion ? 'percussion' : 'melody';

    console.log(`Starting Kits.ai ${extractionType} extraction for recording ${recordingId}`);

    // Simulate API processing delay (in a real implementation, this would be an actual API call)
    await new Promise(resolve => setTimeout(resolve, 3000));

    // In a real implementation, this would be where you'd call the Kits.ai API
    // For demonstration, we'll mock a processed file URL
    const processedFilename = `kits-${extractionType}-${Date.now()}.wav`;
    
    // Upload the original file as a placeholder (in a real implementation, this would be the processed file)
    const { error: uploadError } = await supabase
      .storage
      .from('recordings')
      .upload(processedFilename, fileData, {
        contentType: 'audio/wav'
      });

    if (uploadError) throw uploadError;

    // Get the public URL for the processed file
    const { data: publicUrlData } = await supabase
      .storage
      .from('recordings')
      .getPublicUrl(processedFilename);

    // Update the recording with the completed status and processed file URL
    const { error: finalUpdateError } = await supabase
      .from('recordings')
      .update({
        status: 'completed',
        processed_audio_url: publicUrlData.publicUrl
      })
      .eq('id', recordingId);

    if (finalUpdateError) throw finalUpdateError;

    console.log(`Completed Kits.ai ${extractionType} extraction for recording ${recordingId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully processed ${type}`,
        url: publicUrlData.publicUrl
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error processing audio with Kits.ai:', error);
    
    // If we have a recording ID, update its status to failed
    try {
      const { recordingId } = await req.json();
      if (recordingId) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        await supabase
          .from('recordings')
          .update({
            status: 'failed',
            error_message: error.message || 'Unknown error occurred'
          })
          .eq('id', recordingId);
      }
    } catch (updateError) {
      console.error('Error updating recording status:', updateError);
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Unknown error occurred during Kits.ai processing'
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
