// Lee los conteos reales de clics para el tablero de medición. Sin Upstash configurado,
// regresa configured:false y counts:{} — el front debe mostrar "conecta un contador de
// clics" en vez de inventar ceros como si fueran datos reales.

import { isUpstashConfigured, getClickCounts } from "../lib/upstash-adapter.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Solo GET." });

  const configured = isUpstashConfigured();
  const idsParam = (req.query && req.query.ids) || "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);

  if (!configured || !ids.length) return res.status(200).json({ configured, counts: {} });

  try {
    const counts = await getClickCounts(ids);
    return res.status(200).json({ configured: true, counts });
  } catch (err) {
    return res.status(200).json({ configured: true, counts: {}, error: "No se pudo leer Upstash: " + err.message });
  }
}
