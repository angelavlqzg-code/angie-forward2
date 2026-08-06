import test from "node:test";
import assert from "node:assert/strict";
import { createStore, makeMemoryStorage } from "../public/store.js";

test("wizard: guarda y recupera; null si nunca se guardó", () => {
  const store = createStore(makeMemoryStorage());
  assert.equal(store.loadWizardData(), null);
  store.saveWizardData({ companyName: "Forward AI" });
  assert.deepEqual(store.loadWizardData(), { companyName: "Forward AI" });
});

test("runs: addRun agrega al principio (más reciente primero)", () => {
  const store = createStore(makeMemoryStorage());
  store.addRun({ id: "1", text: "primero" });
  store.addRun({ id: "2", text: "segundo" });
  const runs = store.loadRuns();
  assert.equal(runs[0].id, "2");
  assert.equal(runs[1].id, "1");
});

test("runs: updateRun aplica un patch parcial", () => {
  const store = createStore(makeMemoryStorage());
  store.addRun({ id: "1", status: "running" });
  const updated = store.updateRun("1", { status: "done", hubspot: { contactId: "abc" } });
  assert.equal(updated.status, "done");
  assert.equal(store.loadRuns()[0].hubspot.contactId, "abc");
});

test("runs: updateRun con id inexistente devuelve null y no rompe nada", () => {
  const store = createStore(makeMemoryStorage());
  assert.equal(store.updateRun("no-existe", { status: "x" }), null);
});

test("approvals: addApprovals crea items pending con id único", () => {
  const store = createStore(makeMemoryStorage());
  const created = store.addApprovals(["Publicar el post", "Lanzar la pauta"]);
  assert.equal(created.length, 2);
  assert.equal(created[0].status, "pending");
  assert.notEqual(created[0].id, created[1].id);
});

test("approvals: setApprovalStatus cambia el estado y sella decidedAt", () => {
  const store = createStore(makeMemoryStorage());
  const [a] = store.addApprovals(["Publicar el post"]);
  const updated = store.setApprovalStatus(a.id, "approved");
  assert.equal(updated.status, "approved");
  assert.ok(updated.decidedAt);
});

test("sin storage disponible (Node sin localStorage inyectado): no truena, devuelve defaults", () => {
  const store = createStore(null);
  assert.equal(store.loadWizardData(), null);
  assert.deepEqual(store.loadRuns(), []);
  store.saveWizardData({ x: 1 }); // no debe lanzar
});

test("crmKeys: vacío por default", () => {
  const store = createStore(makeMemoryStorage());
  assert.deepEqual(store.loadCrmKeys(), {});
});

test("crmKeys: saveCrmKey guarda por CRM sin pisar otros CRMs", () => {
  const store = createStore(makeMemoryStorage());
  store.saveCrmKey("hubspot", "pat-abc123");
  store.saveCrmKey("pipedrive", "pd-xyz789");
  const keys = store.loadCrmKeys();
  assert.equal(keys.hubspot.apiKey, "pat-abc123");
  assert.equal(keys.pipedrive.apiKey, "pd-xyz789");
});

test("crmKeys: saveCrmKey vuelto a llamar sobreescribe solo ese CRM", () => {
  const store = createStore(makeMemoryStorage());
  store.saveCrmKey("hubspot", "pat-viejo");
  store.saveCrmKey("hubspot", "pat-nuevo");
  assert.equal(store.loadCrmKeys().hubspot.apiKey, "pat-nuevo");
});

test("crmKeys: clearCrmKey quita solo ese CRM", () => {
  const store = createStore(makeMemoryStorage());
  store.saveCrmKey("hubspot", "pat-abc123");
  store.saveCrmKey("pipedrive", "pd-xyz789");
  store.clearCrmKey("hubspot");
  const keys = store.loadCrmKeys();
  assert.equal(keys.hubspot, undefined);
  assert.equal(keys.pipedrive.apiKey, "pd-xyz789");
});

test("namespace: dos stores con distinto namespace sobre el MISMO storage no se mezclan", () => {
  const backend = makeMemoryStorage();
  const admin = createStore(backend, "");
  const invitada = createStore(backend, "guest_");

  admin.addRun({ id: "1", request: "proyecto real de la administradora" });
  invitada.addRun({ id: "1", request: "proyecto de prueba de la invitada" });

  assert.equal(admin.loadRuns().length, 1);
  assert.equal(admin.loadRuns()[0].request, "proyecto real de la administradora");
  assert.equal(invitada.loadRuns().length, 1);
  assert.equal(invitada.loadRuns()[0].request, "proyecto de prueba de la invitada");

  admin.saveCrmKey("hubspot", "pat-de-admin");
  invitada.saveCrmKey("hubspot", "pat-de-invitada");
  assert.equal(admin.loadCrmKeys().hubspot.apiKey, "pat-de-admin");
  assert.equal(invitada.loadCrmKeys().hubspot.apiKey, "pat-de-invitada");
});

test("namespace: vacío (\"\") sigue usando las llaves de siempre, sin prefijo (retrocompatible)", () => {
  const backend = makeMemoryStorage();
  const store = createStore(backend, "");
  store.saveWizardData({ companyName: "Forward AI" });
  assert.deepEqual(JSON.parse(backend.getItem("forwardai_wizard_v1")), { companyName: "Forward AI" });
});
