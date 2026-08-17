// Persistencia local (MVP interno, sin backend con base de datos todavía).
// Guarda: configuración del wizard, historial de ejecuciones y bandeja de aprobaciones.
// Vive en localStorage del navegador → un dispositivo, una sesión de trabajo.
// Es una limitación real y documentada (ver LEEME_PRIMERO / reporte de cierre), no un
// intento de simular persistencia real: cuando haya backend, solo se cambia este archivo.
//
// Recibe el backend de storage inyectado para poder probarse con Node (sin localStorage real).

const KEYS = {
  wizard: "forwardai_wizard_v1",
  runs: "forwardai_runs_v1",
  approvals: "forwardai_approvals_v1",
  crmKeys: "forwardai_crm_keys_v1",
};

function defaultStorage() {
  if (typeof localStorage !== "undefined") return localStorage;
  return null;
}

function readJSON(storage, key, fallback) {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(storage, key, value) {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // El caso real que rompía esto en silencio: alguien adjunta documentos pesados en el
    // wizard (PDFs en base64 inflan mucho de tamaño) y localStorage — que tiene un límite
    // de ~5-10 MB por navegador — se llena. `setItem` entonces lanza QuotaExceededError,
    // y si nadie lo atrapa, el botón que lo disparó "no hace nada" sin explicación (así lo
    // reportó Ricardo). Aquí se relanza con un mensaje que sí se le puede mostrar a quien
    // esté usando la app, en vez de dejar que la excepción se pierda en la consola.
    const quota = e && (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014);
    const friendly = new Error(
      quota
        ? "No se pudo guardar: se llenó el espacio de almacenamiento del navegador. Es probable que los documentos adjuntos sean muy pesados — quita alguno (o comprímelo) e intenta de nuevo."
        : "No se pudo guardar la información en este navegador: " + (e && e.message ? e.message : e)
    );
    friendly.cause = e;
    friendly.isStorageError = true;
    throw friendly;
  }
}

/**
 * `namespace` separa por completo los datos de una sesión de las de otra dentro del MISMO
 * navegador — se usa para que "invitada" (quien prueba la app con la contraseña de invitado)
 * nunca vea ni mezcle sus proyectos/aprobaciones/llaves con los reales de la administradora,
 * incluso si ambas abren la app en el mismo equipo. Vacío ("") = comportamiento de siempre,
 * retrocompatible con localStorage ya existente de antes de que existieran los roles.
 */
export function createStore(storage = defaultStorage(), namespace = "") {
  const k = (key) => (namespace ? `${namespace}${key}` : key);
  return {
    loadWizardData() {
      return readJSON(storage, k(KEYS.wizard), null);
    },
    saveWizardData(data) {
      writeJSON(storage, k(KEYS.wizard), data);
    },
    clearWizardData() {
      storage?.removeItem(k(KEYS.wizard));
    },

    loadRuns() {
      return readJSON(storage, k(KEYS.runs), []);
    },
    addRun(run) {
      const runs = readJSON(storage, k(KEYS.runs), []);
      runs.unshift(run); // más reciente primero
      const trimmed = runs.slice(0, 200); // límite de tamaño razonable
      writeJSON(storage, k(KEYS.runs), trimmed);
      return run;
    },
    updateRun(id, patch) {
      const runs = readJSON(storage, k(KEYS.runs), []);
      const idx = runs.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      runs[idx] = { ...runs[idx], ...patch };
      writeJSON(storage, k(KEYS.runs), runs);
      return runs[idx];
    },

    loadApprovals() {
      return readJSON(storage, k(KEYS.approvals), []);
    },
    addApprovals(items, meta) {
      if (!items || !items.length) return [];
      const approvals = readJSON(storage, k(KEYS.approvals), []);
      const created = items.map((text, i) => ({
        id: `${Date.now()}-${i}`,
        text,
        status: "pending", // pending | approved | adjust | rejected
        createdAt: new Date().toISOString(),
        decidedAt: null,
        // Clasificación por proyecto: a qué proyecto pertenece esta aprobación, para poder
        // filtrar la bandeja cuando hay varios proyectos activos al mismo tiempo. Opcional
        // y retrocompatible — si no se manda meta, queda null (comportamiento anterior).
        projectId: meta && meta.projectId ? meta.projectId : null,
        projectLabel: meta && meta.projectLabel ? meta.projectLabel : null,
      }));
      writeJSON(storage, k(KEYS.approvals), [...created, ...approvals]);
      return created;
    },
    setApprovalStatus(id, status) {
      const approvals = readJSON(storage, k(KEYS.approvals), []);
      const idx = approvals.findIndex((a) => a.id === id);
      if (idx === -1) return null;
      approvals[idx] = { ...approvals[idx], status, decidedAt: new Date().toISOString() };
      writeJSON(storage, k(KEYS.approvals), approvals);
      return approvals[idx];
    },

    // Llaves de CRM que la propia usuaria conecta desde el panel "Conectar CRM", sin pasar
    // por Vercel. Viven SOLO en este navegador (igual que el resto de forwardai_*) — nunca
    // se mandan a ningún lado excepto en el header de cada llamada a /api/hubspot mientras
    // dura esa llamada. Forma: { hubspot: { apiKey: "pat-..." } } — un slot por CRM, para
    // cuando se agreguen adaptadores de otros CRMs más adelante.
    loadCrmKeys() {
      return readJSON(storage, k(KEYS.crmKeys), {});
    },
    saveCrmKey(crm, apiKey) {
      const keys = readJSON(storage, k(KEYS.crmKeys), {});
      keys[crm] = { apiKey };
      writeJSON(storage, k(KEYS.crmKeys), keys);
      return keys;
    },
    clearCrmKey(crm) {
      const keys = readJSON(storage, k(KEYS.crmKeys), {});
      delete keys[crm];
      writeJSON(storage, k(KEYS.crmKeys), keys);
      return keys;
    },
  };
}

export function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}
