import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get JSON body once
    const { recordingId, type } = await req.json();
    console.log("Processing with Kits.ai:", { recordingId, type });

    // Validate required parameters
    if (!recordingId || !type) {
      throw new Error("Recording ID and type are required");
    }

    // Get environment variables
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const KITS_API_KEY = Deno.env.get("KITS_API_KEY") ?? "";
    if (!KITS_API_KEY) {
      throw new Error("Kits.ai API key is not set");
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch the recording details from Supabase
    const { data: recording, error: recordingError } = await supabase
      .from("recordings")
      .select("*")
      .eq("id", recordingId)
      .single();
    if (recordingError || !recording) {
      throw new Error("Recording not found");
    }
    console.log("Found recording:", recording.filename);

    // Update status to processing
    await supabase
      .from("recordings")
      .update({ status: "processing", processing_type: type })
      .eq("id", recordingId);

    // Download the audio file from Supabase storage
    const { data: fileData, error: fileError } = await supabase.storage
      .from("recordings")
      .download(recording.filename);
    if (fileError || !fileData) {
      throw new Error(`Error downloading audio file: ${fileError?.message || "Unknown error"}`);
    }
    console.log(`Downloaded recording ${recording.filename} (${fileData.size} bytes)`);

    // Define Kits.ai voice model ID based on type
    // Use "1118122" for drums and "221129" for melody (as provided)
    const voiceModelId = type === "kits-drums" ? "1118122" : "221129";
    console.log("Using Kits.ai model ID:", voiceModelId);

    // Create FormData with a fixed filename "audio.wav"
    const formData = new FormData();
    formData.append("voiceModelId", voiceModelId);
    // Use a fixed filename so that the extension is valid.
    const fixedFilename = "audio.wav";
    // Wrap the downloaded file data in a Blob with WAV MIME type
    const audioBlob = new Blob([fileData], { type: "audio/wav" });
    formData.append("soundFile", audioBlob, fixedFilename);
    console.log(`Created FormData using fixed filename: ${fixedFilename}`);

    // Call the Kits.ai API to initiate the conversion
    console.log("Calling Kits.ai API...");
    const kitsResponse = await fetch("https://arpeggi.io/api/kits/v1/voice-conversions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KITS_API_KEY}`,
        // Let the browser set Content-Type for FormData
      },
      body: formData,
    });
    console.log("Kits.ai API response status:", kitsResponse.status);
    if (!kitsResponse.ok) {
      const errText = await kitsResponse.text();
      throw new Error(`Kits.ai API error: ${kitsResponse.status} - ${errText}`);
    }
    const kitsData = await kitsResponse.json();
    const conversionId = kitsData.id;
    if (!conversionId) {
      throw new Error("No conversion ID returned from Kits.ai API");
    }
    console.log("Kits.ai conversion job created with ID:", conversionId);

    // Poll for completion (max ~5 minutes, polling every 10 seconds)
    let outputFileUrl: string | null = null;
    const maxAttempts = 30;
    let attempt = 0;
    while (attempt < maxAttempts) {
      console.log(`Polling conversion status (attempt ${attempt + 1})...`);
      const statusResp = await fetch(`https://arpeggi.io/api/kits/v1/voice-conversions/${conversionId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${KITS_API_KEY}`,
          "Content-Type": "application/json",
        },
      });
      if (!statusResp.ok) {
        const errText = await statusResp.text();
        throw new Error(`Error checking conversion status: ${statusResp.status} - ${errText}`);
      }
      const statusData = await statusResp.json();
      console.log("Status response:", statusData);
      if (statusData.status === "success") {
        outputFileUrl = statusData.outputFileUrl || statusData.lossyOutputFileUrl;
        break;
      } else if (statusData.status === "error" || statusData.status === "failed") {
        throw new Error(`Conversion failed: ${statusData.error || "Unknown error"}`);
      }
      // Wait 10 seconds before next poll
      await new Promise((resolve) => setTimeout(resolve, 10000));
      attempt++;
    }
    if (!outputFileUrl) {
      throw new Error("Conversion timed out or no output URL was provided");
    }
    console.log("Got output file URL:", outputFileUrl);

    // Download the converted audio from Kits.ai
    const outputResp = await fetch(outputFileUrl);
    if (!outputResp.ok) {
      throw new Error(`Error downloading converted audio: ${outputResp.status}`);
    }
    const outputBuffer = await outputResp.arrayBuffer();
    console.log(`Downloaded converted audio (${outputBuffer.byteLength} bytes)`);

    // Create a processed filename for Supabase storage (e.g., type-timestamp.wav)
    const processedFilename = `${type}-${Date.now()}.wav`;
    console.log("Uploading processed audio with filename:", processedFilename);

    // Upload the processed audio to Supabase storage
    const { error: uploadError } = await supabase.storage
      .from("recordings")
      .upload(processedFilename, outputBuffer, {
        contentType: "audio/wav",
        upsert: true,
      });
    if (uploadError) {
      throw new Error(`Error uploading processed audio: ${uploadError.message}`);
    }
    // Get the public URL for the processed audio
    const { data: { publicUrl } } = supabase.storage
      .from("recordings")
      .getPublicUrl(processedFilename);
    console.log("Public URL for processed audio:", publicUrl);

    // Update recording in Supabase with the processed audio URL and mark as completed
    await supabase
      .from("recordings")
      .update({
        status: "completed",
        processed_audio_url: publicUrl,
      })
      .eq("id", recordingId);
    console.log("Updated recording status to completed");

    return new Response(
      JSON.stringify({ success: true, output: publicUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in Kits.ai processing:", error.message);
    // Attempt to update the recording status to failed
    try {
      const { recordingId } = await req.json().catch(() => ({}));
      if (recordingId) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );
        await supabase
          .from("recordings")
          .update({ status: "failed", error_message: error.message })
          .eq("id", recordingId);
      }
    } catch (updateError) {
      console.error("Error updating recording status:", updateError);
    }
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
