// Adaptador Upstash Redis (vía su REST API — no requiere cliente TCP, funciona bien en
// funciones serverless). Se usa únicamente para contar clics reales en los links que
// Angela comparte desde el tablero de medición. Sin esto configurado, el conteo de clics
// simplemente no existe — nunca se muestra un número inventado en su lugar.
//
// Verificado contra la documentación oficial (upstash.com/docs/redis/features/restapi)
// el 2026-08-06: GET {REST_URL}/incr/{key} con header Authorization: Bearer {TOKEN}
// devuelve {"result": N}; /mget/{k1}/{k2}/... devuelve {"result": [v1, v2, ...]}.

export function isUpstashConfigured() {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function base() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function call(pathParts, fetcher = fetch) {
  const cfg = base();
  if (!cfg) return null;
  const path = pathParts.map((p) => encodeURIComponent(p)).join("/");
  const r = await fetcher(`${cfg.url}/${path}`, { headers: { Authorization: `Bearer ${cfg.token}` } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error(data.error || `Upstash respondió ${r.status}`);
  return data.result;
}

/** Incrementa en 1 el contador de clics de `id` y regresa el nuevo total (o null si no está configurado). */
export async function incrClick(id, fetcher = fetch) {
  if (!isUpstashConfigured()) return null;
  return call(["incr", `clicks:${id}`], fetcher);
}

/** Regresa {id: count} para una lista de ids, usando MGET en una sola llamada. */
export async function getClickCounts(ids, fetcher = fetch) {
  if (!isUpstashConfigured() || !ids.length) return {};
  const keys = ids.map((id) => `clicks:${id}`);
  const results = await call(["mget", ...keys], fetcher);
  const out = {};
  ids.forEach((id, i) => { out[id] = Number(results?.[i]) || 0; });
  return out;
}
