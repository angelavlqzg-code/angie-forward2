import test from "node:test";
import assert from "node:assert/strict";
import {
  WIZARD_STEPS, emptyWizardData, validateStep, validateAll, buildContextText, collectWizardFileContents,
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
