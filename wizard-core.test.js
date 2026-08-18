import test from "node:test";
import assert from "node:assert/strict";
import {
  WIZARD_STEPS, emptyWizardData, validateStep, validateAll, buildContextText, collectWizardFileContents,
  estimateDocumentsBytes, DOCUMENTS_SAFE_LIMIT_BYTES, TEAM_SIZE_OPTIONS, VERTICAL_OPTIONS,
} from "../public/wizard-core.js";

test("emptyWizardData: crea un campo por cada field definido, chips como arreglo vacío", () => {
  const d = emptyWizardData();
  assert.equal(d.companyName, "");
  assert.deepEqual(d.channels, []);
  assert.deepEqual(d.documents, {});
});

test("validateStep: marca como faltante un campo requerido vacío", () => {
  const empresaStep = WIZARD_STEPS.find((s) => s.id === "empresa");
  const data = emptyWizardData();
  const r = validateStep(empresaStep, data);
  assert.equal(r.ok, false);
  assert.ok(r.missing.includes("Nombre de tu empresa"));
});

test("validateStep: pasa cuando los campos requeridos están llenos", () => {
  const empresaStep = WIZARD_STEPS.find((s) => s.id === "empresa");
  const data = emptyWizardData();
  data.companyName = "Forward AI";
  data.teamSize = "chico";
  const r = validateStep(empresaStep, data);
  assert.equal(r.ok, true);
  assert.deepEqual(r.missing, []);
});

test("validateAll: agrega los faltantes de todos los pasos", () => {
  const data = emptyWizardData();
  const r = validateAll(data);
  assert.equal(r.ok, false);
  assert.ok(r.missing.length >= 5); // experience, companyName, teamSize, objective, buyer, autonomyLevel, approver...
});

test("buildContextText: vacío no genera ruido más allá del encabezado", () => {
  const txt = buildContextText(null);
  assert.equal(txt, "");
});

test("buildContextText: incluye los campos llenos con su etiqueta legible (no el value crudo)", () => {
  const data = emptyWizardData();
  data.companyName = "Forward AI";
  data.buyer = "gobierno";
  data.teamSize = "chico";
  data.channels = ["LinkedIn", "Email"];
  const txt = buildContextText(data);
  assert.match(txt, /Empresa: Forward AI/);
  assert.match(txt, /Comprador \/ vertical principal: Gobierno/); // etiqueta, no "gobierno" crudo
  assert.match(txt, /Equipo chico/);
  assert.match(txt, /Canales de interés: LinkedIn, Email/);
});

test("buildContextText: la columna vertebral solo aparece si al menos un campo tiene contenido", () => {
  const data = emptyWizardData();
  assert.doesNotMatch(buildContextText(data), /Columna vertebral propuesta/);
  data.change = "De vender demos a vender operación";
  assert.match(buildContextText(data), /Columna vertebral propuesta/);
  assert.match(buildContextText(data), /El cambio: De vender demos a vender operación/);
});

test("buildContextText: lista los documentos adjuntos por categoría", () => {
  const data = emptyWizardData();
  data.documents.brandManual = [{ name: "manual.pdf" }];
  data.documents.cases = [{ name: "atizapan.pdf" }, { name: "caso2.pdf" }];
  const txt = buildContextText(data);
  assert.match(txt, /Manual de marca: manual\.pdf/);
  assert.match(txt, /Casos y evidencias: atizapan\.pdf, caso2\.pdf/);
});

test("collectWizardFileContents: aplana todos los documentos de todas las categorías", () => {
  const data = emptyWizardData();
  data.documents.brandManual = [{ name: "a.pdf" }];
  data.documents.other = [{ name: "b.txt" }, { name: "c.png" }];
  const all = collectWizardFileContents(data);
  assert.equal(all.length, 3);
});

test("estimateDocumentsBytes: 0 sin documentos", () => {
  assert.equal(estimateDocumentsBytes(emptyWizardData()), 0);
});

test("estimateDocumentsBytes: suma bytes reales de base64 (b64.length * 0.75) y de texto plano", () => {
  const data = emptyWizardData();
  data.documents.brandManual = [{ name: "a.pdf", b64: "A".repeat(400) }]; // 400 chars b64 -> 300 bytes
  data.documents.other = [{ name: "b.txt", text: "hola" }]; // 4 bytes
  assert.equal(estimateDocumentsBytes(data), 300 + 4);
});

test("estimateDocumentsBytes: se puede comparar contra DOCUMENTS_SAFE_LIMIT_BYTES para avisar antes de guardar", () => {
  const data = emptyWizardData();
  data.documents.other = [{ name: "grande.pdf", b64: "A".repeat(DOCUMENTS_SAFE_LIMIT_BYTES * 2) }];
  assert.ok(estimateDocumentsBytes(data) > DOCUMENTS_SAFE_LIMIT_BYTES);
});

test("DOCUMENTS_SAFE_LIMIT_BYTES: el límite de archivos reales, ya inflado a base64, cabe dentro del tope DURO de 4.5 MB de Vercel para el cuerpo de la petición (con margen para el system prompt y el resto de la conversación)", () => {
  const VERCEL_HARD_LIMIT_BYTES = 4.5 * 1024 * 1024; // https://vercel.com/docs/functions/limitations
  const base64InflatedBytes = Math.ceil(DOCUMENTS_SAFE_LIMIT_BYTES * (4 / 3));
  const marginLeftForEverythingElse = VERCEL_HARD_LIMIT_BYTES - base64InflatedBytes;
  assert.ok(base64InflatedBytes < VERCEL_HARD_LIMIT_BYTES, `los documentos en base64 (${(base64InflatedBytes/1024/1024).toFixed(2)} MB) deben caber bajo el tope de Vercel (4.5 MB)`);
  assert.ok(marginLeftForEverythingElse > 200 * 1024, `debe quedar margen razonable (>200 KB) para el system prompt + el resto de la conversación (quedó: ${(marginLeftForEverythingElse/1024).toFixed(0)} KB)`);
});

test("TEAM_SIZE_OPTIONS: sigue teniendo 'chico' (retrocompatible con datos ya guardados)", () => {
  assert.ok(TEAM_SIZE_OPTIONS.some(([v]) => v === "chico"));
  assert.ok(TEAM_SIZE_OPTIONS.some(([v]) => v === "mediano"));
  assert.ok(TEAM_SIZE_OPTIONS.some(([v]) => v === "muy_grande"));
});

test("VERTICAL_OPTIONS: incluye Compras, Usuario y Usuario final (feedback de Ricardo)", () => {
  const values = VERTICAL_OPTIONS.map(([v]) => v);
  assert.ok(values.includes("compras"));
  assert.ok(values.includes("usuario"));
  assert.ok(values.includes("usuario_final"));
});
