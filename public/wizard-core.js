// Lógica pura del Form Wizard: sin DOM, sin red. Por eso se puede probar con Node
// directamente (ver tests/wizard-core.test.js) y también se importa tal cual en el
// navegador (index.html lo carga como <script type="module">).

export const WIZARD_VERSION = 1;

export const EXPERIENCE_OPTIONS = [
  ["nueva", "Es mi primera vez con IA de marketing"],
  ["algo", "Ya he usado algo de IA para esto"],
  ["experta", "Ya soy experta en esto"],
];

// Rangos más finos a partir de 10 personas (feedback de Ricardo): antes "grande" mezclaba
// desde 9 hasta miles de personas en una sola opción, perdiendo la diferencia real que hay
// entre una pyme y una empresa grande a la hora de generar datos de quiénes son los clientes.
export const TEAM_SIZE_OPTIONS = [
  ["solo", "Solo yo"],
  ["chico", "Equipo chico (2-9 personas)"],
  ["mediano", "Equipo mediano (10-25 personas)"],
  ["grande", "Equipo grande (25-50 personas)"],
  ["muy_grande", "Equipo muy grande (+50 personas)"],
];

export const VERTICAL_OPTIONS = [
  ["gobierno", "Gobierno"], ["rh", "RH"], ["ventas", "Ventas"],
  ["fiscal", "Fiscal"], ["retail", "Retail"], ["compras", "Compras"],
  ["usuario", "Usuario"], ["usuario_final", "Usuario final"], ["otro", "Otro"],
];

export const RELATIONSHIP_OPTIONS = [
  ["nuevo", "Todavía no los conozco"],
  ["en_conversacion", "Ya estoy platicando con ellos"],
  ["cliente", "Ya son clientes"],
];

export const URGENCY_OPTIONS = [["baja", "Baja"], ["media", "Media"], ["alta", "Alta"]];

export const CHANNEL_OPTIONS = [
  "LinkedIn", "Email", "Eventos", "Pauta digital", "Prensa", "Redes sociales", "Sitio web",
];

export const AUTONOMY_OPTIONS = [
  ["bajo", "Bajo — solo que me recomiende, yo decido todo"],
  ["medio", "Medio — que prepare todo listo, yo apruebo antes de publicar o invertir"],
  ["alto", "Alto — que ejecute solo lo repetitivo y de bajo riesgo"],
];

export const DOCUMENT_SLOTS = [
  ["brandManual", "Manual de marca"],
  ["cases", "Casos y evidencias"],
  ["productSheets", "Fichas de producto"],
  ["other", "Otros documentos"],
];

/* Definición data-driven de los pasos del wizard (sin el paso de resumen, que es especial). */
export const WIZARD_STEPS = [
  {
    id: "bienvenida", title: "Bienvenida", subtitle: "Para calibrar cómo te explico las cosas.",
    fields: [
      { id: "experience", label: "¿Qué tanto has usado IA para marketing?", type: "select", options: EXPERIENCE_OPTIONS, required: true },
    ],
  },
  {
    id: "empresa", title: "Tu empresa", subtitle: "Lo esencial para que los agentes sepan con quién trabajan.",
    fields: [
      { id: "companyName", label: "Nombre de tu empresa", type: "text", required: true },
      { id: "companyDescription", label: "¿A qué se dedica, en pocas palabras?", type: "textarea" },
      { id: "website", label: "Sitio web (si tienes)", type: "text" },
      { id: "teamSize", label: "Tamaño del equipo que va a usar esto", type: "select", options: TEAM_SIZE_OPTIONS, required: true },
      { id: "users", label: "¿Quiénes lo van a usar? (nombres o roles)", type: "text" },
    ],
  },
  {
    id: "objetivo", title: "Tu objetivo", subtitle: "En tus palabras — no hace falta jerga de marketing.",
    fields: [
      { id: "objective", label: "¿Qué quieres lograr?", type: "textarea", required: true,
        hint: "No hace falta que sea preciso — hasta \"vender más\" o \"que nos conozcan más clientes\" está bien. Angie te ayuda a afinarlo.",
        placeholder: "Ej. Vender más, conseguir más leads calificados, que nos conozcan en un nuevo mercado…" },
      { id: "numericGoal", label: "¿Tienes una meta numérica? (opcional)", type: "text" },
      { id: "targetDate", label: "¿Para cuándo?", type: "date" },
    ],
  },
  {
    id: "audiencia", title: "A quién le hablas", subtitle: "Compradores y su momento con ustedes.",
    fields: [
      { id: "buyer", label: "Vertical o comprador principal", type: "select", options: VERTICAL_OPTIONS, required: true },
      { id: "relationshipStage", label: "¿En qué momento están con ellos?", type: "select", options: RELATIONSHIP_OPTIONS },
      { id: "painPoints", label: "¿Qué les duele o qué necesitan hoy?", type: "textarea" },
    ],
  },
  {
    id: "restricciones", title: "Restricciones", subtitle: "Para que las recomendaciones sean realistas.",
    fields: [
      { id: "budget", label: "Presupuesto disponible (si lo hay)", type: "text" },
      { id: "channels", label: "Canales de interés", type: "chips", options: CHANNEL_OPTIONS },
      { id: "urgency", label: "¿Qué tan urgente es?", type: "select", options: URGENCY_OPTIONS },
      { id: "constraints", label: "Otras restricciones", type: "textarea" },
    ],
  },
  {
    id: "columna", title: "Columna vertebral del mensaje", subtitle: "El cambio, la tensión, la posición, la prueba, la promesa. Déjalo en blanco si aún no lo tienes — Angie puede proponerlo.",
    fields: [
      { id: "change", label: "El cambio", type: "textarea",
        hint: "¿Qué cambió en tu mercado o industria que hace que esto sea relevante ahora?",
        placeholder: "Ej. Las marcas internacionales ya no necesitan buscar fuera de México una agencia con estándares de clase mundial." },
      { id: "tension", label: "La tensión", type: "textarea",
        hint: "¿Qué fricción o problema deja esto sin resolver para tu cliente?",
        placeholder: "Ej. Han quemado presupuesto con agencias que prometen cobertura integral y entregan ejecución fragmentada." },
      { id: "position", label: "La posición", type: "textarea",
        hint: "¿Qué lugar ocupas tú frente a esa tensión — por qué tú y no otro?",
        placeholder: "Ej. Somos la agencia mexicana con capacidad probada de operar al nivel de exigencia de una marca global." },
      { id: "proof", label: "La prueba", type: "textarea",
        hint: "¿Qué evidencia real respalda esa posición? (casos, números autorizados, certificaciones)",
        placeholder: "Ej. 3 marcas Fortune 500 operando con nosotros desde 2023, sin incidentes de marca." },
      { id: "promise", label: "La promesa", type: "textarea",
        hint: "¿Qué le prometes al cliente si te elige — en una frase, sin jerga?",
        placeholder: "Ej. Resultados medibles, sin intermediarios, sin excusas." },
    ],
  },
  {
    id: "marca", title: "Tono y documentos", subtitle: "Adjunta lo que tengas — Angie trabaja sobre esto, no sobre suposiciones.",
    fields: [
      { id: "toneRules", label: "Reglas de tono y voz (si las tienes)", type: "textarea" },
      { id: "documents", label: "Documentos", type: "documents" },
    ],
  },
  {
    id: "gobierno", title: "Autonomía y aprobación", subtitle: "Quién dirige, quién aprueba.",
    fields: [
      { id: "autonomyLevel", label: "Nivel de autonomía permitido", type: "select", options: AUTONOMY_OPTIONS, required: true },
      { id: "approver", label: "¿Quién aprueba lo sensible?", type: "text", required: true },
    ],
  },
];

export function emptyWizardData() {
  const d = { version: WIZARD_VERSION, documents: {} };
  WIZARD_STEPS.forEach((s) => s.fields.forEach((f) => {
    if (f.type === "documents") return;
    d[f.id] = f.type === "chips" ? [] : "";
  }));
  return d;
}

/** Valida los campos requeridos de un solo paso. Devuelve {ok, missing:[label,...]}. */
export function validateStep(step, data) {
  const missing = [];
  step.fields.forEach((f) => {
    if (!f.required) return;
    const v = data[f.id];
    const empty = f.type === "chips" ? !(v && v.length) : !v || !String(v).trim();
    if (empty) missing.push(f.label);
  });
  return { ok: missing.length === 0, missing };
}

/** Valida todo el wizard de una vez (para el paso de resumen). */
export function validateAll(data) {
  const missing = [];
  WIZARD_STEPS.forEach((s) => {
    const r = validateStep(s, data);
    missing.push(...r.missing);
  });
  return { ok: missing.length === 0, missing };
}

function labelFor(step, fieldId) {
  const f = step.fields.find((x) => x.id === fieldId);
  return f ? f.label : fieldId;
}

function optionLabel(options, value) {
  const hit = (options || []).find(([v]) => v === value);
  return hit ? hit[1] : value;
}

/**
 * Convierte la configuración del wizard en un bloque de texto legible que se agrega
 * al system prompt del coordinador, como "fuente de verdad" del negocio.
 * No es JSON crudo a propósito: el modelo lee mejor prosa/lista etiquetada.
 */
export function buildContextText(data) {
  if (!data) return "";
  const lines = ["=== CONTEXTO REAL DEL NEGOCIO (fuente de verdad — no lo inventes, no lo ignores) ==="];

  const push = (label, value) => { if (value && String(value).trim()) lines.push(`${label}: ${value}`); };

  push("Experiencia de la usuaria", optionLabel(EXPERIENCE_OPTIONS, data.experience));
  push("Empresa", data.companyName);
  push("A qué se dedica", data.companyDescription);
  push("Sitio web", data.website);
  push("Tamaño de equipo", optionLabel(TEAM_SIZE_OPTIONS, data.teamSize));
  push("Quiénes lo usarán", data.users);
  push("Objetivo de negocio", data.objective);
  push("Meta numérica", data.numericGoal);
  push("Fecha objetivo", data.targetDate);
  push("Comprador / vertical principal", optionLabel(VERTICAL_OPTIONS, data.buyer));
  push("Momento con el prospecto", optionLabel(RELATIONSHIP_OPTIONS, data.relationshipStage));
  push("Dolores / necesidades", data.painPoints);
  push("Presupuesto", data.budget);
  if (data.channels && data.channels.length) push("Canales de interés", data.channels.join(", "));
  push("Urgencia", optionLabel(URGENCY_OPTIONS, data.urgency));
  push("Restricciones adicionales", data.constraints);

  if (data.change || data.tension || data.position || data.proof || data.promise) {
    lines.push("Columna vertebral propuesta por la usuaria:");
    push("  El cambio", data.change);
    push("  La tensión", data.tension);
    push("  La posición", data.position);
    push("  La prueba", data.proof);
    push("  La promesa", data.promise);
  }
  push("Reglas de tono y voz adicionales", data.toneRules);
  push("Nivel de autonomía permitido", optionLabel(AUTONOMY_OPTIONS, data.autonomyLevel));
  push("Responsable de aprobación", data.approver);

  const docNames = Object.entries(data.documents || {})
    .filter(([, arr]) => arr && arr.length)
    .map(([slot, arr]) => `${DOCUMENT_SLOTS.find(([id]) => id === slot)?.[1] || slot}: ${arr.map((d) => d.name).join(", ")}`);
  if (docNames.length) { lines.push("Documentos adjuntos por la usuaria:"); docNames.forEach((d) => lines.push("  - " + d)); }

  return lines.join("\n");
}

/** Junta todos los archivos cargados en el wizard en la forma que espera el endpoint /api/chat. */
export function collectWizardFileContents(data) {
  const out = [];
  Object.values(data.documents || {}).forEach((arr) => (arr || []).forEach((d) => out.push(d)));
  return out;
}

// localStorage tiene un límite real de ~5-10 MB por navegador (varía por navegador), y ahí
// vive TODO lo de Angie, no solo los documentos del wizard (proyectos, aprobaciones, etc.).
// Este límite es deliberadamente conservador para avisar ANTES de que `setItem` truene con
// QuotaExceededError — mejor un aviso claro al adjuntar que un botón que "no hace nada" al
// confirmar (ver bug reportado por Ricardo).
export const DOCUMENTS_SAFE_LIMIT_BYTES = 4 * 1024 * 1024; // 4 MB

/** Tamaño aproximado en bytes de todos los documentos ya adjuntados en el wizard. */
export function estimateDocumentsBytes(data) {
  let total = 0;
  Object.values((data && data.documents) || {}).forEach((arr) => (arr || []).forEach((d) => {
    if (d.b64) total += Math.ceil(d.b64.length * 0.75); // base64 -> bytes reales
    else if (d.text) total += d.text.length;
  }));
  return total;
}
