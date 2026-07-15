// Generación de imágenes reales con Nano Banana (Gemini Image, de Google).
// La llave vive AQUÍ, en el servidor. El navegador nunca la ve.

export const config = { maxDuration: 60 };

// Nano Banana 2: el equilibrio recomendado entre calidad, velocidad y costo.
// Si quieres máxima calidad para pieza final, cambia a "gemini-3-pro-image".
// Si quieres lo más barato para bocetos, usa "gemini-3.1-flash-lite-image".
const MODELO = "gemini-3.1-flash-image";

// Estilo de marca Forward: se agrega a TODA imagen para que no se salga del manual.
const ESTILO_FORWARD = `
Estilo visual: corporativo sobrio y moderno, de alta gama. Fotografía o ilustración limpia,
con mucho espacio negativo. Paleta dominante de azul marino muy oscuro (#0F1535),
con acentos de morado (#5B4FE6) y verde azulado teal (#0FA697). Iluminación suave y realista.
Serio y profesional, nunca caricaturesco, nunca futurista de ciencia ficción, sin robots humanoides,
sin cerebros de circuitos, sin clichés de inteligencia artificial.
NO incluyas texto, letras, palabras ni logotipos dentro de la imagen.
`.trim();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Solo POST." });
  }

  const key = process.env.GOOGLE_API_KEY;
  if (!key) {
    return res.status(500).json({
      error:
        "Falta la llave GOOGLE_API_KEY. Agrégala en Vercel → Settings → Environment Variables. " +
        "Mientras tanto, Angie sigue funcionando: solo no puede generar fotografías.",
    });
  }

  try {
    const { prompt, formato } = req.body || {};
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: "No llegó la descripción de la imagen." });
    }

    // Formatos útiles para marketing.
    const RATIOS = {
      cuadrado: "1:1",
      horizontal: "16:9",
      vertical: "9:16",
      linkedin: "1.91:1",
    };
    const aspect = RATIOS[formato] || "1:1";

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: `${prompt.trim()}\n\n${ESTILO_FORWARD}` }],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: aspect },
        },
      }),
    });

    const data = await r.json();

    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || "Google rechazó la petición.";
      return res.status(r.status).json({ error: msg });
    }

    // Buscamos la imagen dentro de la respuesta.
    const parts =
      (data.candidates && data.candidates[0] && data.candidates[0].content &&
        data.candidates[0].content.parts) || [];

    const imgPart = parts.find((p) => p.inlineData || p.inline_data);
    if (!imgPart) {
      return res.status(502).json({
        error: "Google no devolvió imagen. Suele pasar si el pedido choca con sus filtros. Reformúlalo.",
      });
    }

    const inline = imgPart.inlineData || imgPart.inline_data;
    const mime = inline.mimeType || inline.mime_type || "image/png";

    return res.status(200).json({ dataUrl: `data:${mime};base64,${inline.data}` });
  } catch (err) {
    return res.status(500).json({ error: "Error del servidor: " + err.message });
  }
}
