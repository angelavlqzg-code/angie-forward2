// Generación de imágenes con Nano Banana + CAPA DE DIRECCIÓN DE ARTE (Art Direction Engine).
// La llave vive AQUÍ, en el servidor. El navegador nunca la ve.
//
// No mandamos el texto crudo al generador: lo enriquecemos con concepto, composición,
// iluminación, paleta y un negative prompt, según un PRESET de estilo reutilizable.

export const config = { maxDuration: 60 };

// ── MODELO ──
// Por defecto: Nano Banana 2 (rápido, ~3-4¢). Para máxima calidad editorial cambia a:
//   const MODELO = "gemini-3-pro-image";   // Nano Banana Pro (~10-15¢, mucho más nítido)
const MODELO = "gemini-3.1-flash-image";

// ── Paleta Forward AI (acentos, NO cubre toda la imagen) ──
const PALETA = "azul marino muy profundo (#0A0A1A) como base, con acentos eléctricos de morado (#6C5CE7) y turquesa (#00CEC9) presentes solo en la luz, reflejos, señales, pantallas o elementos digitales; blanco y gris (#A9AEC9) para el aire. Premium, nunca gamer, sin exceso de neón.";

// ── Negative prompt general (lo que NUNCA queremos) ──
const NEGATIVO = "Sin texto ni letras generadas dentro de la imagen, sin letras deformadas, sin mockup plano, sin fondo blanco genérico, sin tarjeta corporativa plana, sin plantilla de PowerPoint, sin infografía básica, sin íconos de stock, sin letras 'AI' gigantes como único recurso, sin círculos decorativos sin función, sin ilustración vectorial básica, sin estética gamer, sin saturación excesiva, sin marcas de agua, sin logotipos inventados, sin manos ni rostros deformados, sin objetos duplicados, sin recortes accidentales, sin dashboard flotando sin contexto.";

// ── PRESETS de dirección de arte (config reutilizable) ──
// El default NO es corporativo plano: es "Editorial tecnológico Forward AI".
const PRESETS = {
  editorial: { name:"Editorial tecnológico",
    dir:"Portada editorial premium de una publicación especializada en tecnología, IA e innovación. Imagen conceptual protagonista con una metáfora visual clara y contundente, alto contraste y jerarquía fuerte.",
    luz:"iluminación dramática y editorial, luz lateral direccional que modela el sujeto",
    comp:"vertical, punto focal potente, zona inferior limpia y en penumbra reservada para el titular" },
  cine: { name:"Cinematográfico",
    dir:"Escena realista y cinematográfica con narrativa visual, como un fotograma de película de alta producción.",
    luz:"iluminación dramática, luz volumétrica, bruma atmosférica, grano de película fino",
    comp:"profundidad de campo corta, encuadre cinematográfico, un protagonista claro" },
  corporativo: { name:"Forward AI corporativo",
    dir:"Imagen premium, moderna y tecnológica, sofisticada pero cálida (no rígida ni de stock).",
    luz:"iluminación limpia y elegante con acentos de color de marca",
    comp:"composición ordenada y sofisticada, con aire y un protagonista claro" },
  campana: { name:"Campaña publicitaria",
    dir:"Imagen protagonista de campaña publicitaria global, concepto simple y contundente, alto impacto comercial.",
    luz:"iluminación de estudio dramática, alto contraste",
    comp:"un solo protagonista dominante, composición comercial limpia" },
  surrealista: { name:"Conceptual surrealista",
    dir:"Metáfora visual memorable con escalas inesperadas, una escena surrealista pero elegante y creíble.",
    luz:"iluminación atmosférica y evocadora",
    comp:"escena conceptual sorprendente con un foco claro" },
  data: { name:"Data storytelling",
    dir:"Datos, dashboards o indicadores integrados de forma realista dentro de una escena física, no como infografía plana.",
    luz:"iluminación tecnológica con brillo de pantallas y señales",
    comp:"escena real donde los datos son parte natural del entorno" },
  producto: { name:"Producto digital",
    dir:"Interfaces, dispositivos y pantallas en un contexto realista y aspiracional.",
    luz:"iluminación de producto, reflejos suaves y controlados",
    comp:"dispositivo o pantalla protagonista dentro de un entorno real" },
  minimal: { name:"Minimalismo premium",
    dir:"Un solo objeto protagonista, composición limpia con profundidad y acabado editorial.",
    luz:"iluminación suave y direccional, sombras elegantes",
    comp:"mucho espacio negativo intencional alrededor de un objeto focal" },
  social: { name:"Social media impact",
    dir:"Pieza vertical de alto impacto para LinkedIn o Instagram, de lectura inmediata.",
    luz:"alto contraste, luz llamativa pero premium",
    comp:"vertical, foco inmediato, zona clara para el titular" },
  ejecutiva: { name:"Presentación ejecutiva",
    dir:"Composición horizontal sofisticada para una presentación ejecutiva.",
    luz:"iluminación elegante y sobria",
    comp:"horizontal, espacio seguro para título y datos" },
};
const DEFAULT_PRESET = "editorial";

// Elige preset: explícito (estilo) o por palabras del pedido; default editorial.
function elegirPreset(topic, estilo) {
  if (estilo && PRESETS[estilo]) return estilo;
  const t = (topic || "").toLowerCase();
  const map = [
    ["cine", ["cinematográf","cinematograf","película","pelicula","escena","fotograma"]],
    ["campana", ["campaña","campana","anuncio","publicit","comercial"]],
    ["data", ["dashboard","indicador","métrica","metrica","datos","gráfica","grafica","kpi"]],
    ["producto", ["interfaz","pantalla","dispositivo","app","producto digital","landing"]],
    ["ejecutiva", ["presentación","presentacion","deck","ejecutiv","horizontal"]],
    ["social", ["linkedin","instagram","redes","story","reel"]],
    ["minimal", ["minimalista","un solo objeto","sencillo"]],
    ["surrealista", ["surreal","metáfora","metafora","conceptual"]],
    ["corporativo", ["corporativ","institucional"]],
  ];
  for (const [id, kws] of map) if (kws.some(k => t.includes(k))) return id;
  return DEFAULT_PRESET;
}

// Construye el prompt enriquecido (la "dirección de arte").
function buildPrompt(topic, presetId) {
  const p = PRESETS[presetId] || PRESETS[DEFAULT_PRESET];
  return [
    `DIRECCIÓN DE ARTE (${p.name}): ${p.dir}`,
    `TEMA A INTERPRETAR VISUALMENTE — conviértelo en una metáfora visual potente y una escena protagonista; NO lo escribas como texto dentro de la imagen: ${topic}`,
    `COMPOSICIÓN: ${p.comp}.`,
    `ILUMINACIÓN: ${p.luz}.`,
    `PROFUNDIDAD Y TEXTURA: profundidad atmosférica, texturas detalladas y realistas, gran nivel de detalle.`,
    `PALETA FORWARD AI: ${PALETA}`,
    `REALISMO: fotografía conceptual hiperrealista, calidad de campaña global y de portada editorial, nitidez alta.`,
    `ESPACIO SEGURO PARA TEXTO: deja una zona limpia (según la composición) para colocar el titular encima después, dentro de la app.`,
    `RESTRICCIONES: ${NEGATIVO}`,
  ].join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Solo POST." });

  const key = process.env.GOOGLE_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: "Falta la llave GOOGLE_API_KEY. Agrégala en Vercel → Settings → Environment Variables. " +
             "Mientras tanto, Angie sigue funcionando: solo no puede generar fotografías.",
    });
  }

  try {
    const { prompt, formato, estilo } = req.body || {};
    if (!prompt || !prompt.trim()) return res.status(400).json({ error: "No llegó la descripción de la imagen." });

    const presetId = elegirPreset(prompt, estilo);
    const promptFinal = buildPrompt(prompt.trim(), presetId);

    // Formatos preconfigurados → aspect ratios admitidos por la integración.
    const RATIOS = {
      cuadrado: "1:1", instagram: "1:1",
      vertical: "9:16", story: "9:16",
      horizontal: "16:9", articulo: "16:9", banner: "16:9", presentacion: "16:9", linkedin: "16:9",
      editorial: "3:4", portada: "3:4", linkedin_vertical: "3:4", retrato: "3:4",
    };
    const aspect = RATIOS[formato] || "3:4"; // por defecto vertical editorial

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptFinal }] }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect } },
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || "Google rechazó la petición.";
      return res.status(r.status).json({ error: msg });
    }

    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const imgPart = parts.find((p) => p.inlineData || p.inline_data);
    if (!imgPart) return res.status(502).json({ error: "Google no devolvió imagen. Suele pasar si el pedido choca con sus filtros. Reformúlalo." });

    const inline = imgPart.inlineData || imgPart.inline_data;
    const mime = inline.mimeType || inline.mime_type || "image/png";
    // Devolvemos también el preset usado, por si la app quiere mostrarlo.
    return res.status(200).json({ dataUrl: `data:${mime};base64,${inline.data}`, preset: PRESETS[presetId].name });
  } catch (err) {
    return res.status(500).json({ error: "Error del servidor: " + err.message });
  }
}
