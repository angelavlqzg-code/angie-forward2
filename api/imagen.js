// Generación de imágenes reales con Nano Banana (Gemini Image, de Google).
// La llave vive AQUÍ, en el servidor. El navegador nunca la ve.

export const config = { maxDuration: 60 };

// ── MODELO ──
// Por defecto: Nano Banana 2 (rápido y barato, ~3-4¢ por imagen).
// Para MÁXIMA calidad cinematográfica (portadas, piezas hero), cambia esta línea a:
//   const MODELO = "gemini-3-pro-image";   // Nano Banana Pro (más caro, ~10-15¢, pero mucho más nítido)
const MODELO = "gemini-3.1-flash-image";

// ─────────────────────────────────────────────────────────────
// ESTILO DE IMAGEN. Se agrega solo a TODO lo que pidas.
// Por defecto ahora es CINEMATOGRÁFICO / EDITORIAL (dramático y premium).
// ─────────────────────────────────────────────────────────────

// El estilo protagonista: dramático, atmosférico, de portada de revista.
const ESTILO_CINE = `
Fotografía editorial cinematográfica, dramática y atmosférica, de altísima producción.
Una sola fuente de luz direccional fuerte que crea sombras profundas y highlights luminosos;
luz volumétrica, bruma sutil, contraste rico y elegante. Gradación de color oscura y sofisticada:
azules muy oscuros y carbón (#070920 como base), con acentos sutiles de brillo violeta (#6C54FA)
y teal (#02DCBE). Profundidad de campo corta, gran detalle y textura, grano de película fino,
composición poderosa con un solo sujeto o escena, mucho espacio negativo y atmósfera.
Sensación premium, evocadora y contemporánea. Fotorrealista, nitidez 8k, iluminación cinematográfica.
Evita a toda costa: estética plana, look corporativo genérico, foto de stock aburrida, colores lavados,
saturación excesiva, caricatura, render 3D infantil, y clichés de IA (robots humanoides, cerebros de circuitos).
NO incluyas texto, letras, palabras ni logotipos dentro de la imagen: deja espacio negativo limpio
(normalmente en la parte inferior) para colocar un titular encima después.
`.trim();

// Alternativa limpia: solo cuando pidas algo minimalista/claro/documento.
const ESTILO_LIMPIO = `
Imagen limpia, sobria y profesional, con mucho aire y espacio en blanco. Fondo blanco (#FFFFFF)
u off-white (#F6F7FB). Estética minimalista y tecnológica, nada saturada, iluminación suave y uniforme.
Acentos discretos de violeta (#6C54FA) y teal (#02DCBE). Fotorrealista y elegante.
Evita clichés de IA. NO incluyas texto, letras ni logotipos dentro de la imagen.
`.trim();

// Decide el estilo. Por defecto: CINEMATOGRÁFICO.
// Solo cambia a limpio si pides explícitamente algo minimalista/claro/documento.
function elegirEstilo(prompt, modo) {
  if (modo === "limpio" || modo === "claro") return ESTILO_LIMPIO;
  if (modo === "cine" || modo === "oscuro") return ESTILO_CINE;

  const p = (prompt || "").toLowerCase();
  const señalesLimpio = [
    "limpio", "minimalista", "claro", "documento", "ficha", "fondo blanco",
    "corporativ", "sencill", "plano", "diagrama", "infograf",
  ];
  if (señalesLimpio.some((s) => p.includes(s))) return ESTILO_LIMPIO;

  return ESTILO_CINE; // el protagonista
}

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
    const { prompt, formato, modo } = req.body || {};
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: "No llegó la descripción de la imagen." });
    }

    const estilo = elegirEstilo(prompt, modo);

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
            parts: [{ text: `${prompt.trim()}\n\n${estilo}` }],
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
