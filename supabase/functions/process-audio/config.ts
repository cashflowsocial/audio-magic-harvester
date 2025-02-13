
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
};

export const createErrorResponse = (error: string, status: number = 500) => {
  return new Response(
    JSON.stringify({ error }), 
    { status, headers: corsHeaders }
  );
};
