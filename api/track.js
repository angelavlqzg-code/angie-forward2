// Link de rastreo: Angela comparte /api/track?id=<pieza>&to=<destino real> en vez del
// link directo. Cada vez que alguien lo abre, sumamos 1 clic real en Upstash (si está
// configurado) y lo mandamos de inmediato al destino real. Si Upstash no está configurado,
// el link sigue funcionando igual (solo no cuenta) — nunca se rompe el redireccionamiento
// por falta de medición.

import { incrClick } from "../lib/upstash-adapter.js";

function isSafeUrl(u) {
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") { res.status(405); return res.end("Método no permitido."); }

  const { id, to } = req.query || {};
  if (!id || !to || !isSafeUrl(to)) {
    res.status(400);
    if (res.setHeader) res.setHeader("content-type", "text/html; charset=utf-8");
    return res.end(`<!doctype html><body style="font-family:system-ui;max-width:520px;margin:80px auto">
      <h3>Link de rastreo incompleto</h3><p>Falta "id" o "to", o "to" no es una URL http(s) válida.</p></body>`);
  }

  try { await incrClick(id); } catch { /* el conteo es mejor esfuerzo: nunca bloquea el redireccionamiento */ }

  res.status(302);
  if (res.setHeader) res.setHeader("Location", to);
  return res.end();
}
