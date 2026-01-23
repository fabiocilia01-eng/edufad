/* =========================
   EduFAD SPA - app.js
   Disclaimer -> Login -> App
   Robust version (tolerant selectors)
   ========================= */

const state = {
  token: null,
  user: null,
  checklist: null,
  profiles: [],
  assessments: [],
  currentProfileId: null,
  currentAssessment: null,
  currentAreaId: null,
};

const LS_TOKEN_KEY = "edufad_token";
const LS_DISCLAIMER_ACK_KEY = "edufad_disclaimer_ack";

/* -------------------------
   Small helpers
------------------------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const pickEl = (selectors) => {
  for (const s of selectors) {
    const el = document.querySelector(s);
    if (el) return el;
  }
  return null;
};

const pickEls = (selectors) => {
  for (const s of selectors) {
    const els = document.querySelectorAll(s);
    if (els && els.length) return Array.from(els);
  }
  return [];
};

const setText = (el, txt) => {
  if (el) el.textContent = txt ?? "";
};

const show = (el) => {
  if (!el) return;
  el.classList.remove("hidden");
  el.style.display = "";
};

const hide = (el) => {
  if (!el) return;
  el.classList.add("hidden");
};

/* -------------------------
   API helper
------------------------- */
const api = async (path, options = {}) => {
  const headers = options.headers ? { ...options.headers } : {};

  if (state.token) headers["Authorization"] = `Bearer ${state.token}`;

  // Default JSON content-type (NOT for form-urlencoded)
  const hasBody = Object.prototype.hasOwnProperty.call(options, "body") && options.body != null;
  const isFormUrlEncoded = headers["Content-Type"] === "application/x-www-form-urlencoded";
  if (hasBody && !isFormUrlEncoded && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(path, { ...options, headers });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Errore inatteso." }));
    throw new Error(data.detail || "Errore inatteso.");
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res;
};

/* -------------------------
   Disclaimer gate (client-side)
------------------------- */
const disclaimerGate = () => {
  const modal = pickEl(["#disclaimer-modal", "#disclaimerModal"]);
  const ackBtn = pickEl(["#disclaimer-ack", "#ackDisclaimerBtn"]);
  const loginSection = pickEl(["#login-section", "#loginSection"]);
  const appSection = pickEl(["#app-section", "#appSection"]);

  if (!modal || !ackBtn) return;

  const alreadyAck = localStorage.getItem(LS_DISCLAIMER_ACK_KEY) === "1";
  if (alreadyAck) {
    hide(modal);
    if (loginSection) show(loginSection);
    if (appSection) hide(appSection);
    return;
  }

  show(modal);
  if (loginSection) hide(loginSection);
  if (appSection) hide(appSection);

  ackBtn.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.setItem(LS_DISCLAIMER_ACK_KEY, "1");
    hide(modal);
    if (loginSection) show(loginSection);
  });
};

/* -------------------------
   Login
------------------------- */
const wireLogin = () => {
  const loginForm = pickEl(["#login-form", "#loginForm"]);
  const errEl = pickEl(["#login-error", "#loginError"]);
  const userInfo = pickEl(["#user-info", "#userInfo"]);

  const loginSection = pickEl(["#login-section", "#loginSection"]);
  const appSection = pickEl(["#app-section", "#appSection"]);

  if (!loginForm) return;

  loginForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (errEl) errEl.textContent = "";

    const username = pickEl(["#login-username", "#username"])?.value?.trim() || "";
    const password = pickEl(["#login-password", "#password"])?.value || "";

    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username, password }),
      });

      state.token = data.access_token;
      localStorage.setItem(LS_TOKEN_KEY, state.token);

      state.user = await api("/api/auth/me");
      if (userInfo) userInfo.textContent = `${state.user.username} (${state.user.role})`;

      if (loginSection) hide(loginSection);
      if (appSection) show(appSection);

      await bootApp();

      // best-effort: se disclaimer accettato localmente, proviamo ad aggiornare il server
      await syncDisclaimerAckToServerIfNeeded();
    } catch (err) {
      if (errEl) errEl.textContent = err.message;
    }
  });
};

const syncDisclaimerAckToServerIfNeeded = async () => {
  if (!state.user) return;
  const localAck = localStorage.getItem(LS_DISCLAIMER_ACK_KEY) === "1";
  if (!localAck) return;

  // Se server non ha ack, prova
  if (!state.user.disclaimer_ack_at) {
    try {
      state.user = await api("/api/auth/ack-disclaimer", { method: "POST" });
    } catch (_e) {
      // non bloccare
    }
  }
};

/* -------------------------
   Checklist + Areas UI
------------------------- */
const loadChecklist = async () => {
  state.checklist = await api("/api/checklist");
};

const renderAreas = () => {
  // Container possibili per la lista aree
  const container = pickEl([
    "#areas-list",
    "#areas",
    "#area-list",
    "#sidebar-areas",
    "[data-areas-container]",
  ]);

  if (!container || !state.checklist) return;

  // pulizia
  container.innerHTML = "";

  // Aree
  state.checklist.areas.forEach((area) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "area-btn";
    btn.dataset.areaId = area.id || area.area_id || area.code || area.name;
    btn.textContent = area.name;

    btn.addEventListener("click", () => {
      state.currentAreaId = btn.dataset.areaId;
      renderBehaviorsForArea(state.currentAreaId);
      highlightSelectedArea(btn.dataset.areaId);
    });

    container.appendChild(btn);
  });
};

const highlightSelectedArea = (areaId) => {
  pickEls([".area-btn"]).forEach((b) => {
    if (b.dataset.areaId === areaId) b.classList.add("active");
    else b.classList.remove("active");
  });
};

const renderBehaviorsForArea = (areaId) => {
  const container = pickEl([
    "#behaviors-list",
    "#behaviors",
    "#items-list",
    "#area-items",
    "[data-behaviors-container]",
  ]);
  if (!container || !state.checklist) return;

  const area = state.checklist.areas.find((a) => (a.id || a.area_id || a.code || a.name) === areaId);
  container.innerHTML = "";

  if (!area) {
    container.innerHTML = `<div class="muted">Seleziona un'area.</div>`;
    return;
  }

  // Items / comportamenti
  area.items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "behavior-row";
    row.dataset.itemId = item.id;

    row.innerHTML = `
      <div class="behavior-title"><strong>${item.id}</strong> ${item.label}</div>
      <div class="behavior-actions">
        <button type="button" class="btn-create-assessment" data-action="new-assessment">
          Rilevazione
        </button>
      </div>
    `;

    // pulsante: crea rilevazione (se profilo selezionato)
    row.querySelector('[data-action="new-assessment"]').addEventListener("click", async () => {
      await createAssessmentForCurrentProfile();
    });

    container.appendChild(row);
  });
};

/* -------------------------
   Profiles
------------------------- */
const fetchProfiles = async () => {
  state.profiles = await api("/api/profiles");
};

const renderProfiles = () => {
  const table = pickEl(["#profiles-table"]);
  const list = pickEl(["#profiles-list", "#profiles", "[data-profiles-container]"]);
  const select = pickEl(["#profile-select", "#profiles-select", "#assessment-profile"]);

  // tabella (vecchia UI)
  if (table) {
    table.innerHTML = "<tr><th>Codice</th><th>Nome</th><th>Nascita</th><th></th></tr>";
    state.profiles.forEach((p) => {
      table.innerHTML += `
        <tr>
          <td>${p.code || ""}</td>
          <td>${p.display_name}</td>
          <td>${p.date_of_birth}</td>
          <td><button type="button" data-action="select-profile" data-id="${p.id}">Seleziona</button></td>
        </tr>
      `;
    });
  }

  // lista (nuova UI)
  if (list) {
    list.innerHTML = "";
    state.profiles.forEach((p) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "profile-card";
      card.dataset.profileId = p.id;
      card.innerHTML = `
        <div class="profile-name">${p.display_name}</div>
        <div class="profile-meta">${p.code || ""} • ${p.date_of_birth}</div>
      `;
      card.addEventListener("click", async () => {
        await selectProfile(p.id);
      });
      list.appendChild(card);
    });
  }

  // select (se presente)
  if (select) {
    select.innerHTML = state.profiles.map((p) => `<option value="${p.id}">${p.display_name}</option>`).join("");
  }

  // event delegation per tabella
  if (table) {
    table.querySelectorAll('[data-action="select-profile"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        await selectProfile(Number(btn.dataset.id));
      });
    });
  }
};

const selectProfile = async (profileId) => {
  state.currentProfileId = Number(profileId);
  await fetchAssessments();
  renderAssessments();

  // se hai una UI “titolo profilo selezionato”
  const label = pickEl(["#current-profile-label", "#selected-profile"]);
  const p = state.profiles.find((x) => x.id === state.currentProfileId);
  if (label && p) label.textContent = p.display_name;

  // evidenzia card selezionata
  pickEls([".profile-card"]).forEach((c) => {
    c.classList.toggle("active", Number(c.dataset.profileId) === state.currentProfileId);
  });
};

/* -------------------------
   Assessments
------------------------- */
const fetchAssessments = async () => {
  // carichiamo TUTTE, poi filtriamo per profilo sul client (semplice)
  state.assessments = await api("/api/assessments");
};

const renderAssessments = () => {
  const table = pickEl(["#assessments-table"]);
  const list = pickEl(["#assessments-list", "#assessments", "[data-assessments-container]"]);

  const filtered = state.currentProfileId
    ? state.assessments.filter((a) => a.profile_id === state.currentProfileId && !a.is_deleted)
    : [];

  // tabella (vecchia UI)
  if (table) {
    table.innerHTML = "<tr><th>ID</th><th>Data</th><th>Stato</th><th></th></tr>";
    filtered.forEach((a) => {
      table.innerHTML += `
        <tr>
          <td>${a.id}</td>
          <td>${a.assessment_date}</td>
          <td>${a.status}</td>
          <td><button type="button" data-action="open-assessment" data-id="${a.id}">Apri</button></td>
        </tr>
      `;
    });

    table.querySelectorAll('[data-action="open-assessment"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        await openAssessment(Number(btn.dataset.id));
      });
    });
  }

  // lista (nuova UI)
  if (list) {
    list.innerHTML = "";
    filtered.forEach((a) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "assessment-card";
      card.dataset.assessmentId = a.id;
      card.innerHTML = `
        <div class="assessment-title">Rilevazione #${a.id}</div>
        <div class="assessment-meta">${a.assessment_date} • ${a.status}</div>
      `;
      card.addEventListener("click", async () => {
        await openAssessment(a.id);
      });
      list.appendChild(card);
    });
  }
};

const createAssessmentForCurrentProfile = async () => {
  if (!state.currentProfileId) {
    alert("Seleziona prima un profilo.");
    return;
  }

  const payload = {
    profile_id: state.currentProfileId,
    assessment_date: new Date().toISOString().slice(0, 10),
    operator_name: state.user?.username || "",
    operator_role: state.user?.role === "admin" ? "" : "Editor",
    status: "draft",
  };

  try {
    const created = await api("/api/assessments", { method: "POST", body: JSON.stringify(payload) });
    await fetchAssessments();
    renderAssessments();
    await openAssessment(created.id);
  } catch (e) {
    console.error(e);
    alert(e.message || "Errore creazione rilevazione.");
  }
};

const openAssessment = async (assessmentId) => {
  try {
    const a = await api(`/api/assessments/${assessmentId}`);
    state.currentAssessment = a;

    // Se hai una sezione editor
    const editor = pickEl(["#assessment-editor", "#assessmentEditor", "#assessment-panel", "[data-assessment-editor]"]);
    if (editor) show(editor);

    // Carica risposte e renderizza griglia (se container esiste)
    await renderAssessmentResponses();
    await renderProfileDashboard(); // aggiorna grafici “profilo” su destra (se presenti)
  } catch (e) {
    console.error("openAssessment error:", e);
    alert(e.message || "Errore apertura rilevazione.");
  }
};

const renderAssessmentResponses = async () => {
  if (!state.currentAssessment || !state.checklist) return;

  const container = pickEl([
    "#responses-container",
    "#responses",
    "#assessment-responses",
    "[data-responses-container]",
  ]);
  if (!container) return;

  const assessment = state.currentAssessment;
  const existing = await api(`/api/assessments/${assessment.id}/responses`);
  const map = Object.fromEntries(existing.map((r) => [r.item_id, r]));

  container.innerHTML = "";

  // Selezione area: se non c'è, prendiamo la prima
  const areaId = state.currentAreaId || (state.checklist.areas[0]?.id ?? null);
  if (areaId) state.currentAreaId = areaId;

  const area = state.checklist.areas.find((x) => (x.id || x.area_id || x.code || x.name) === state.currentAreaId) || state.checklist.areas[0];
  if (!area) {
    container.innerHTML = `<div class="muted">Nessuna area disponibile.</div>`;
    return;
  }

  const title = document.createElement("div");
  title.className = "responses-title";
  title.innerHTML = `<h3>${area.name}</h3>`;
  container.appendChild(title);

  area.items.forEach((item) => {
    const resp = map[item.id] || {};
    const row = document.createElement("div");
    row.className = "response-row";
    row.dataset.itemId = item.id;

    row.innerHTML = `
      <div class="response-label"><strong>${item.id}</strong> ${item.label}</div>
      <div class="response-fields">
        <label>Supporto
          <select data-field="support">
            ${[0,1,2,3].map(v => `<option value="${v}" ${resp.support === v ? "selected" : ""}>${v}</option>`).join("")}
          </select>
        </label>
        <label>Frequenza
          <select data-field="freq">
            ${["", "F0","F1","F2","F3","F4"].map(v => `<option value="${v}" ${resp.freq === v ? "selected" : ""}>${v || "-"}</option>`).join("")}
          </select>
        </label>
        <label>Generalizzazione
          <select data-field="gen">
            ${["", "G0","G1","G2","G3"].map(v => `<option value="${v}" ${resp.gen === v ? "selected" : ""}>${v || "-"}</option>`).join("")}
          </select>
        </label>
      </div>
    `;

    // autosave
    row.querySelectorAll("select").forEach((sel) => {
      sel.addEventListener("change", async () => {
        await saveResponse(item.id, row);
        await renderProfileDashboard();
      });
    });

    container.appendChild(row);
  });
};

const saveResponse = async (itemId, rowEl) => {
  const assessment = state.currentAssessment;
  if (!assessment) return;

  const support = Number(rowEl.querySelector('[data-field="support"]')?.value ?? 0);
  const freq = rowEl.querySelector('[data-field="freq"]')?.value || null;
  const gen = rowEl.querySelector('[data-field="gen"]')?.value || null;

  await api(`/api/assessments/${assessment.id}/responses`, {
    method: "POST",
    body: JSON.stringify({
      item_id: itemId,
      support,
      freq,
      gen,
      context: null,
      note: null,
    }),
  });
};

/* -------------------------
   Dashboard charts (simple, visible)
------------------------- */
const renderProfileDashboard = async () => {
  // Se nel tuo HTML esistono canvas specifici, li aggiorniamo.
  // Se non esistono, non facciamo nulla.
  const canvas = pickEl(["#profile-chart", "#chart-profile", "[data-profile-chart]"]);
  if (!canvas || !state.currentProfileId) return;

  // Dati dal backend (serie per profilo)
  const data = await api(`/api/dashboard/profile/${state.currentProfileId}`);

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // assi base
  ctx.beginPath();
  // linea base
  ctx.moveTo(40, 20);
  ctx.lineTo(40, canvas.height - 40);
  ctx.lineTo(canvas.width - 20, canvas.height - 40);
  ctx.stroke();

  if (!data.series || !data.series.length) {
    ctx.fillText("Nessun dato (finalizza almeno una rilevazione).", 60, 60);
    return;
  }

  // serie: media aree per ogni rilevazione
  const points = data.series.map((p) => {
    const values = Object.values(p.areas || {});
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    return { date: p.date, avg };
  });

  const maxX = points.length - 1 || 1;
  const maxY = 3; // supporto 0..3
  const plotW = canvas.width - 80;
  const plotH = canvas.height - 80;

  ctx.beginPath();
  points.forEach((p, i) => {
    const x = 40 + (plotW * i) / maxX;
    const y = (canvas.height - 40) - (plotH * p.avg) / maxY;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    ctx.fillText(p.date, x - 18, canvas.height - 20);
  });
  ctx.stroke();
};

/* -------------------------
   Wiring buttons (New assessment etc.)
------------------------- */
const wireCoreButtons = () => {
  // pulsante "Nuova valutazione" (vecchio)
  const btnNew = pickEl(["#new-assessment", "#btn-new-assessment", "[data-action='new-assessment']"]);
  if (btnNew) {
    btnNew.addEventListener("click", async () => {
      await createAssessmentForCurrentProfile();
    });
  }

  // Tab click (vecchio)
  pickEls([".tabs button"]).forEach((b) => {
    b.addEventListener("click", () => {
      const tab = b.dataset.tab;
      if (!tab) return;
      // se il tuo HTML ha tab-content, prova a mostrarli
      $$(".tab-content").forEach((el) => el.classList.add("hidden"));
      const t = $(`#tab-${tab}`);
      if (t) t.classList.remove("hidden");

      if (tab === "assessments") renderAssessments();
      if (tab === "profiles") renderProfiles();
      if (tab === "dashboard") renderProfileDashboard();
    });
  });

  // Se nel nuovo layout hai un bottone "Rilevazioni" generico
  const btnAssessments = pickEl(["#btn-assessments", "[data-go='assessments']"]);
  if (btnAssessments) {
    btnAssessments.addEventListener("click", () => renderAssessments());
  }
};

/* -------------------------
   Boot
------------------------- */
const bootApp = async () => {
  await loadChecklist();
  await fetchProfiles();
  await fetchAssessments();

  renderAreas();
  // pre-seleziona prima area
  if (state.checklist?.areas?.length) {
    state.currentAreaId = state.checklist.areas[0].id;
    renderBehaviorsForArea(state.currentAreaId);
    highlightSelectedArea(state.currentAreaId);
  }

  renderProfiles();

  // seleziona profilo (se esiste almeno uno)
  if (state.profiles.length) {
    await selectProfile(state.profiles[0].id);
  } else {
    // se non ci sono profili, blocca rilevazioni
    const assessmentsList = pickEl(["#assessments-list", "#assessments"]);
    if (assessmentsList) assessmentsList.innerHTML = `<div class="muted">Crea prima un profilo.</div>`;
  }

  wireCoreButtons();
};

/* -------------------------
   Init (DOMContentLoaded)
------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
  // Gate Disclaimer->Login
  disclaimerGate();

  // carica token eventualmente salvato (non auto-login: ma serve per chiamate dopo login)
  const saved = localStorage.getItem(LS_TOKEN_KEY);
  if (saved) state.token = saved;

  wireLogin();
});
