// Transcribe un audio a texto usando Gemini (reutiliza tu misma GOOGLE_API_KEY).
// La llave vive AQUÍ, en el servidor. El navegador nunca la ve.

export const config = { maxDuration: 60 };

// Modelo de comprensión de audio de Gemini.
const MODELO = "gemini-2.5-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Solo POST." });

  const key = process.env.GOOGLE_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: "Falta la llave GOOGLE_API_KEY. Es la misma que usas para las imágenes; ya debería estar en Vercel.",
    });
  }

  try {
    const { audioB64, mime } = req.body || {};
    if (!audioB64) return res.status(400).json({ error: "No llegó el audio." });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: "Transcribe este audio a texto en español, tal como se dijo, sin agregar comentarios ni encabezados. Solo devuelve el texto transcrito." },
              { inlineData: { mimeType: mime || "audio/mpeg", data: audioB64 } },
            ],
          },
        ],
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || "Google rechazó la transcripción.";
      return res.status(r.status).json({ error: msg });
    }

    const parts =
      (data.candidates && data.candidates[0] && data.candidates[0].content &&
        data.candidates[0].content.parts) || [];
    const text = parts.map((p) => p.text || "").join("").trim();

    if (!text) return res.status(502).json({ error: "No se entendió el audio. Intenta con mejor calidad." });

    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: "Error del servidor: " + err.message });
  }
}
