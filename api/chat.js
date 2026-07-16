// Cerebro de Angie. Habla con Claude.
// La llave vive AQUÍ, en el servidor. El navegador nunca la ve.
//
// El cerebro (marca, agentes, formato y diseño) vive en public/index.html,
// en la constante SYSTEM. Este archivo solo lo reenvía de forma segura.

export const config = { maxDuration: 60 };

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
        system,
        messages,
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
