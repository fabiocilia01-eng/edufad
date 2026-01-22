/* =========================
   EduFAD SPA - app.js
   UI stile demo (dark)
   Flusso: DISCLAIMER -> LOGIN -> APP
   ========================= */

const state = {
  token: null,
  user: null,
  profiles: [],
  assessmentsByProfile: new Map(),
  selectedProfileId: null,
};

const LS_TOKEN_KEY = "edufad_token";
const LS_DISCLAIMER_ACK_KEY = "edufad_disclaimer_ack";

/* -------------------------
   Helpers UI
------------------------- */
function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2400);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function fmtDate(isoOrYmd) {
  // accetta "YYYY-MM-DD" o ISO
  if (!isoOrYmd) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrYmd)) return isoOrYmd;
  const d = new Date(isoOrYmd);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function setHidden(id, hidden) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("hidden", !!hidden);
}

/* -------------------------
   API helper
------------------------- */
async function api(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};

  if (state.token) headers["Authorization"] = `Bearer ${state.token}`;

  const hasBody = Object.prototype.hasOwnProperty.call(options, "body") && options.body != null;
  const isForm = headers["Content-Type"] === "application/x-www-form-urlencoded";
  if (!isForm && hasBody && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(path, { ...options, headers });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Errore inatteso." }));
    throw new Error(data.detail || `Errore HTTP ${res.status}`);
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res;
}

/* -------------------------
   Disclaimer Gate (solo client)
------------------------- */
function showDisclaimerGate() {
  const modal = document.getElementById("disclaimer-modal");
  const ack = document.getElementById("disclaimer-ack");
  const alreadyAck = localStorage.getItem(LS_DISCLAIMER_ACK_KEY) === "1";

  if (!modal || !ack) return;

  if (alreadyAck) {
    modal.classList.add("hidden");
    return;
  }

  modal.classList.remove("hidden");
  ack.onclick = (e) => {
    e.preventDefault();
    localStorage.setItem(LS_DISCLAIMER_ACK_KEY, "1");
    modal.classList.add("hidden");
  };
}

async function syncDisclaimerAckToServerIfPossible() {
  // best effort: se l’utente è loggato e ha ack nel browser, prova a scriverlo sul server
  if (!state.user) return;
  const localAck = localStorage.getItem(LS_DISCLAIMER_ACK_KEY) === "1";
  if (!localAck) return;

  if (!state.user.disclaimer_ack_at) {
    try {
      await api("/api/auth/ack-disclaimer", { method: "POST" });
      state.user = await api("/api/auth/me");
    } catch (_e) {
      // non bloccare
    }
  }
}

/* -------------------------
   Data loading
------------------------- */
async function loadProfiles() {
  const profiles = await api("/api/profiles");
  state.profiles = profiles || [];
  return state.profiles;
}

async function loadAssessmentsForProfile(profileId) {
  // se il backend ha include_deleted, ok; qui per default no
  const list = await api("/api/assessments");
  // filtra lato client per profile_id
  const filtered = (list || []).filter((a) => a.profile_id === Number(profileId));
  state.assessmentsByProfile.set(Number(profileId), filtered);
  return filtered;
}

/* -------------------------
   Rendering
------------------------- */
function renderProfilesList() {
  const list = document.getElementById("profilesList");
  if (!list) return;

  const q = (document.getElementById("profileSearch")?.value || "").toLowerCase().trim();
  const profiles = [...state.profiles].sort((a, b) =>
    (a.display_name || "").localeCompare(b.display_name || "")
  );

  const filtered = q
    ? profiles.filter((p) => (p.display_name || "").toLowerCase().includes(q) || (p.code || "").toLowerCase().includes(q))
    : profiles;

  list.innerHTML = "";

  if (!filtered.length) {
    list.innerHTML = `<div class="muted small">Nessun profilo. Clicca “+ Profilo”.</div>`;
    return;
  }

  for (const p of filtered) {
    const isSel = Number(state.selectedProfileId) === Number(p.id);
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="left">
        <div class="title">${escapeHtml(p.display_name)} <span class="muted small mono">(${escapeHtml(p.code)})</span></div>
        <div class="meta">Nascita: ${escapeHtml(p.date_of_birth || "-")}</div>
      </div>
      <div class="right">
        <span class="badge">${isSel ? "Selezionato" : "Apri"}</span>
      </div>
    `;
    item.onclick = () => selectProfile(p.id);
    list.appendChild(item);
  }
}

function renderRightEmpty() {
  const pane = document.getElementById("rightPane");
  if (!pane) return;
  pane.innerHTML = `
    <div class="hint">
      <b>Flusso consigliato:</b>
      <ol>
        <li>Crea o seleziona un profilo.</li>
        <li>Clicca “+ Rilevazione”.</li>
        <li>Apri la rilevazione dall’elenco.</li>
      </ol>
      <div class="sep"></div>
      <div class="hint">
        Se “+ Rilevazione” non funziona, di solito manca un profilo selezionato oppure il server risponde 500 su /api/assessments.
      </div>
    </div>
  `;
}

function renderRightForProfile(profile, assessments) {
  const pane = document.getElementById("rightPane");
  if (!pane) return;

  const rows = (assessments || [])
    .sort((a, b) => (a.assessment_date > b.assessment_date ? -1 : 1))
    .map((a) => {
      return `
        <div class="item" data-assessment="${a.id}">
          <div class="left">
            <div class="title">${escapeHtml(fmtDate(a.assessment_date))}</div>
            <div class="meta">Stato: ${escapeHtml(a.status || "-")} • ID: <span class="mono">${a.id}</span></div>
          </div>
          <div class="right">
            <button class="ghost" type="button" data-open="${a.id}">Apri</button>
          </div>
        </div>
      `;
    })
    .join("");

  pane.innerHTML = `
    <div class="card" style="box-shadow:none">
      <div class="hd">
        <h2>Rilevazioni</h2>
        <span class="badge">${(assessments || []).length}</span>
      </div>
      <div class="bd">
        ${rows || `<div class="muted small">Nessuna rilevazione. Clicca “+ Rilevazione”.</div>`}
      </div>
    </div>
  `;

  pane.querySelectorAll("button[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => openAssessment(btn.dataset.open));
  });
}

/* -------------------------
   Actions
------------------------- */
async function selectProfile(profileId) {
  state.selectedProfileId = Number(profileId);

  const profile = state.profiles.find((p) => Number(p.id) === Number(profileId));
  document.getElementById("rightTitle").textContent = profile ? profile.display_name : "Profilo";
  document.getElementById("rightSubtitle").textContent = profile ? `Codice: ${profile.code}` : "";

  const btnNew = document.getElementById("btnNewAssessment");
  const btnPdf = document.getElementById("btnExportAssessmentPDF");
  if (btnNew) btnNew.disabled = !profile;
  if (btnPdf) btnPdf.disabled = true;

  renderProfilesList();

  try {
    const assessments = await loadAssessmentsForProfile(profileId);
    renderRightForProfile(profile, assessments);
  } catch (e) {
    // Qui intercettiamo il 500 su /api/assessments e lo rendiamo “visibile” invece di bloccare l’app
    toast(`Errore caricamento valutazioni: ${e.message}`);
    renderRightForProfile(profile, []);
  }
}

async function openAssessment(assessmentId) {
  // Per ora: apriamo in nuova scheda la API PDF se esiste oppure lasciamo un messaggio
  // In una fase successiva possiamo montare qui l’editor completo (responses, dashboard, piani).
  toast(`Apertura rilevazione ID ${assessmentId}`);
  const btnPdf = document.getElementById("btnExportAssessmentPDF");
  if (btnPdf) {
    btnPdf.disabled = false;
    btnPdf.onclick = () => window.open(`/api/exports/assessment/${assessmentId}.pdf`, "_blank");
  }
}

async function createAssessment() {
  if (!state.selectedProfileId) {
    toast("Seleziona prima un profilo.");
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const date = prompt("Data rilevazione (YYYY-MM-DD):", today);
  if (!date) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    toast("Formato data non valido.");
    return;
  }

  const payload = {
    profile_id: Number(state.selectedProfileId),
    assessment_date: date.trim(),
    operator_name: state.user?.username || "",
    operator_role: state.user?.role === "admin" ? "" : "Editor",
    status: "draft",
  };

  try {
    await api("/api/assessments", { method: "POST", body: JSON.stringify(payload) });
    toast("Rilevazione creata.");
    await selectProfile(state.selectedProfileId); // ricarica lista
  } catch (e) {
    toast(`Errore creazione rilevazione: ${e.message}`);
  }
}

function openProfileModal() {
  setHidden("profile-modal", false);
  document.getElementById("profile-error").textContent = "";
  document.getElementById("profile-code").value = "";
  document.getElementById("profile-name").value = "";
  document.getElementById("profile-dob").value = "";
}

function closeProfileModal() {
  setHidden("profile-modal", true);
}

async function createProfile() {
  const code = document.getElementById("profile-code").value.trim();
  const name = document.getElementById("profile-name").value.trim();
  const dob = document.getElementById("profile-dob").value;

  const errEl = document.getElementById("profile-error");
  errEl.textContent = "";

  if (!code || !name || !dob) {
    errEl.textContent = "Compila tutti i campi (codice, nome, data di nascita).";
    return;
  }

  const payload = { code, display_name: name, date_of_birth: dob };

  try {
    await api("/api/profiles", { method: "POST", body: JSON.stringify(payload) });
    toast("Profilo salvato.");
    closeProfileModal();
    await loadProfiles();
    renderProfilesList();
  } catch (e) {
    errEl.textContent = e.message;
  }
}

/* -------------------------
   Auth
------------------------- */
async function doLogin(username, password) {
  const data = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, password }),
  });
  state.token = data.access_token;
  localStorage.setItem(LS_TOKEN_KEY, state.token);

  state.user = await api("/api/auth/me");
  document.getElementById("user-info").textContent = `${state.user.username} (${state.user.role})`;

  setHidden("login-section", true);
  setHidden("app-section", false);

  const logoutBtn = document.getElementById("btnLogout");
  if (logoutBtn) logoutBtn.style.display = "inline-flex";

  await syncDisclaimerAckToServerIfPossible();
  await loadProfiles();
  renderProfilesList();
  renderRightEmpty();
  toast("Login effettuato.");
}

function doLogout() {
  state.token = null;
  state.user = null;
  state.profiles = [];
  state.assessmentsByProfile = new Map();
  state.selectedProfileId = null;

  localStorage.removeItem(LS_TOKEN_KEY);

  document.getElementById("user-info").textContent = "Non autenticato";
  setHidden("app-section", true);
  setHidden("login-section", false);

  const logoutBtn = document.getElementById("btnLogout");
  if (logoutBtn) logoutBtn.style.display = "none";

  toast("Logout.");
}

/* -------------------------
   Boot
------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  showDisclaimerGate();

  // token pre-esistente
  const saved = localStorage.getItem(LS_TOKEN_KEY);
  if (saved) state.token = saved;

  // wire login
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errEl = document.getElementById("login-error");
      errEl.textContent = "";

      const username = document.getElementById("login-username").value;
      const password = document.getElementById("login-password").value;

      try {
        await doLogin(username, password);
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  }

  // logout
  document.getElementById("btnLogout")?.addEventListener("click", doLogout);

  // profiles search
  document.getElementById("profileSearch")?.addEventListener("input", renderProfilesList);

  // new profile modal
  document.getElementById("btnNewProfile")?.addEventListener("click", openProfileModal);
  document.getElementById("btnCloseProfileModal")?.addEventListener("click", closeProfileModal);
  document.getElementById("profile-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await createProfile();
  });

  // new assessment
  document.getElementById("btnNewAssessment")?.addEventListener("click", createAssessment);

  // se hai token salvato, prova auto-me e carica UI
  (async () => {
    if (!state.token) return;
    try {
      state.user = await api("/api/auth/me");
      document.getElementById("user-info").textContent = `${state.user.username} (${state.user.role})`;
      setHidden("login-section", true);
      setHidden("app-section", false);
      document.getElementById("btnLogout").style.display = "inline-flex";

      await syncDisclaimerAckToServerIfPossible();
      await loadProfiles();
      renderProfilesList();
      renderRightEmpty();
    } catch (_e) {
      // token scaduto/non valido
      localStorage.removeItem(LS_TOKEN_KEY);
      state.token = null;
    }
  })();
});
