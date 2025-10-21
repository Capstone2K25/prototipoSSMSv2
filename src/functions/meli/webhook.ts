// /functions/meli/webhook.ts
/// <reference types="@cloudflare/workers-types" />

export const onRequest: PagesFunction = async (ctx) => {
  const { request } = ctx;

  if (request.method === "GET") {
    return new Response("OK", { status: 200 });
  }

  const res = await fetch("https://vloofwzvvoyvrvaqbitm.supabase.co/functions/v1/meli-webhook", {
    method: request.method,
    headers: request.headers,
    body: request.method === "POST" ? await request.text() : undefined,
  });

  return new Response(await res.text(), { status: res.status, headers: res.headers });
};

