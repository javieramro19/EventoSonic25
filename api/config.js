export default function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Método no permitido" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    return response.status(503).json({ error: "Supabase todavía no está configurado." });
  }

  response.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  return response.status(200).json({ supabaseUrl, supabasePublishableKey });
}
