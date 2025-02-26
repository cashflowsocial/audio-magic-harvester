
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

    // Get Kits.ai API key from environment variables
    const kitsApiKey = Deno.env.get('KITS.AI_API_KEY');
    if (!kitsApiKey) {
      throw new Error('Kits.ai API key is not configured.');
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

    // Create a temporary file URL for the Kits.ai API
    const tempFilename = `temp-${Date.now()}.wav`;
    const { error: tempUploadError } = await supabase
      .storage
      .from('recordings')
      .upload(tempFilename, fileData, {
        contentType: 'audio/wav'
      });

    if (tempUploadError) throw tempUploadError;

    // Get the public URL for the temp file
    const { data: tempUrlData } = await supabase
      .storage
      .from('recordings')
      .getPublicUrl(tempFilename);

    const audioFileUrl = tempUrlData.publicUrl;

    // Prepare to call the Kits.ai API
    try {
      console.log(`Calling Kits.ai API for ${extractionType} extraction`);
      
      // In a real implementation, we would make an actual API call to Kits.ai
      // This is a placeholder for demonstration purposes
      // const response = await fetch('https://api.kits.ai/process', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${kitsApiKey}`
      //   },
      //   body: JSON.stringify({
      //     url: audioFileUrl,
      //     type: extractionType
      //   })
      // });
      
      // if (!response.ok) {
      //   throw new Error(`Kits.ai API error: ${response.statusText}`);
      // }
      
      // const result = await response.json();
      // const processedAudioUrl = result.url;

      // For now, we'll simulate a successful API call
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Simulate a processed file by using the original audio
      const processedFilename = `kits-${extractionType}-${Date.now()}.wav`;
      
      // Upload the original file as a placeholder (in a real implementation, we would download the processed file from Kits.ai)
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

      // Clean up the temporary file
      await supabase
        .storage
        .from('recordings')
        .remove([tempFilename]);

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
    } catch (apiError) {
      console.error('Error calling Kits.ai API:', apiError);
      throw new Error(`Failed to process audio with Kits.ai: ${apiError.message}`);
    }

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
