/// <reference types="@cloudflare/workers-types" />

export const onRequest: PagesFunction = async ({ request, env }) => {
  // ML hace un GET para validar → responde 200 OK
  if (request.method === "GET") {
    return new Response("OK", { status: 200 });
  }

  // Tu función real en Supabase
  const target = "https://vloofwzvvoyvrvaqbitm.supabase.co/functions/v1/meli-webhook";

  // Copia headers y agrega Authorization/apikey
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${env.SUPABASE_ANON_KEY}`);
  headers.set("apikey", env.SUPABASE_ANON_KEY);

  const res = await fetch(target, {
    method: "POST",
    headers,
    body: await request.text(),
  });

  return new Response(await res.text(), {
    status: res.status,
    headers: res.headers,
  });
};
