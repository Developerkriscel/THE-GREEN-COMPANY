export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_BASE_URL') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function preflight(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  return null
}
