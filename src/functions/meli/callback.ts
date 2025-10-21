/// <reference types="@cloudflare/workers-types" />

export const onRequest: PagesFunction = async ({ request, env }) => {
  // Tu función real en Supabase
  const target = "https://vloofwzvvoyvrvaqbitm.supabase.co/functions/v1/meli-oauth-callback";

  // Preserva el query string (?code=...)
  const incoming = new URL(request.url);
  const url = new URL(target);
  url.search = incoming.search;

  // Inyecta headers para pasar el verify_jwt del gateway de Supabase
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${env.SUPABASE_ANON_KEY}`);
  headers.set("apikey", env.SUPABASE_ANON_KEY);

  // ML siempre llegará por GET aquí
  const res = await fetch(url.toString(), { method: "GET", headers });

  return new Response(await res.text(), {
    status: res.status,
    headers: res.headers,
  });
};
