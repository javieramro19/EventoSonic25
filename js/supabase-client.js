(function () {
  let clientPromise;

  async function getClient() {
    if (!clientPromise) {
      clientPromise = createClient();
    }
    return clientPromise;
  }

  async function createClient() {
    if (!window.supabase?.createClient) {
      throw new Error("No se pudo cargar la conexión segura con Supabase.");
    }

    const response = await fetch("/api/config", {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    const config = await response.json().catch(() => ({}));

    if (!response.ok || !config.supabaseUrl || !config.supabasePublishableKey) {
      throw new Error(config.error || "Supabase todavía no está configurado.");
    }

    return window.supabase.createClient(
      config.supabaseUrl,
      config.supabasePublishableKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      }
    );
  }

  window.EventoSonicSupabase = {
    bucket: "event-images",
    getClient
  };
})();
