export default function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Método no permitido" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabasePublishableKey) return proxyPrimaryConfig(response);

  response.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  return response.status(200).json({ supabaseUrl, supabasePublishableKey });
}

async function proxyPrimaryConfig(response) {
  try {
    const upstream = await fetch("https://eventosonic.vercel.app/api/config", {
      headers: { Accept: "application/json" }
    });
    const config = await upstream.json().catch(() => ({}));
    if (!upstream.ok || !config.supabaseUrl || !config.supabasePublishableKey) {
      throw new Error("La configuración principal no está disponible.");
    }
    response.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    return response.status(200).json(config);
  } catch (error) {
    console.error("EventoSonic config proxy error", error);
    return response.status(503).json({ error: "Supabase todavía no está configurado." });
  }
}
