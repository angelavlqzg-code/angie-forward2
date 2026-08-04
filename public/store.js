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
  storage.setItem(key, JSON.stringify(value));
}

export function createStore(storage = defaultStorage()) {
  return {
    loadWizardData() {
      return readJSON(storage, KEYS.wizard, null);
    },
    saveWizardData(data) {
      writeJSON(storage, KEYS.wizard, data);
    },
    clearWizardData() {
      storage?.removeItem(KEYS.wizard);
    },

    loadRuns() {
      return readJSON(storage, KEYS.runs, []);
    },
    addRun(run) {
      const runs = readJSON(storage, KEYS.runs, []);
      runs.unshift(run); // más reciente primero
      const trimmed = runs.slice(0, 200); // límite de tamaño razonable
      writeJSON(storage, KEYS.runs, trimmed);
      return run;
    },
    updateRun(id, patch) {
      const runs = readJSON(storage, KEYS.runs, []);
      const idx = runs.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      runs[idx] = { ...runs[idx], ...patch };
      writeJSON(storage, KEYS.runs, runs);
      return runs[idx];
    },

    loadApprovals() {
      return readJSON(storage, KEYS.approvals, []);
    },
    addApprovals(items) {
      if (!items || !items.length) return [];
      const approvals = readJSON(storage, KEYS.approvals, []);
      const created = items.map((text, i) => ({
        id: `${Date.now()}-${i}`,
        text,
        status: "pending", // pending | approved | adjust | rejected
        createdAt: new Date().toISOString(),
        decidedAt: null,
      }));
      writeJSON(storage, KEYS.approvals, [...created, ...approvals]);
      return created;
    },
    setApprovalStatus(id, status) {
      const approvals = readJSON(storage, KEYS.approvals, []);
      const idx = approvals.findIndex((a) => a.id === id);
      if (idx === -1) return null;
      approvals[idx] = { ...approvals[idx], status, decidedAt: new Date().toISOString() };
      writeJSON(storage, KEYS.approvals, approvals);
      return approvals[idx];
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
