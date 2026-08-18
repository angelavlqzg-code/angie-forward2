// Cerebro de Angie. Habla con Claude.
// La llave vive AQUÍ, en el servidor. El navegador nunca la ve.
//
// El cerebro (marca, agentes, formato y diseño) vive en public/index.html,
// en la constante SYSTEM. Este archivo solo lo reenvía de forma segura.

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Solo POST." });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: "Falta la llave ANTHROPIC_API_KEY. Agrégala en Vercel → Settings → Environment Variables.",
    });
  }

  try {
    const { messages, system } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: "No llegó ningún mensaje." });
    }

    // Prompt caching: el system prompt (guía de los 24 agentes) es idéntico en cada llamada
    // de cada persona, y el primer turno de una conversación que ya pasó por el wizard trae
    // los PDFs adjuntos (manual de marca, contexto del negocio) — esos mismos documentos se
    // vuelven a mandar en TODOS los turnos siguientes porque la API no tiene memoria propia.
    // Sin caché, Angie tiene que "releer" esos documentos pesados en cada mensaje, lo que la
    // hace más lenta entre más larga es la conversación o más pesados los archivos adjuntos
    // (esto es lo que hacía más probable que una petición se quedara pegada). Con caché,
    // Anthropic reutiliza ese trabajo ya hecho (huella de ~5 min, se renueva con cada uso) y
    // responde más rápido y más barato a partir del segundo turno en adelante.
    const systemForAnthropic =
      typeof system === "string" && system
        ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
        : system;

    const messagesForAnthropic = messages.map((m, i) => {
      if (i !== 0 || m.role !== "user" || !Array.isArray(m.content) || !m.content.length) return m;
      const content = m.content.map((c, j) =>
        j === m.content.length - 1 ? { ...c, cache_control: { type: "ephemeral" } } : c
      );
      return { ...m, content };
    });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 5000,
        system: systemForAnthropic,
        messages: messagesForAnthropic,
      }),
    });

    const data = await r.json();

    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || "La IA rechazó la petición.";
      return res.status(r.status).json({ error: msg });
    }

    const text = (data.content || [])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("")
      .trim();

    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: "Error del servidor: " + err.message });
  }
}
