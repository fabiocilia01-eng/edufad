/* ======================================================
   EduFAD SPA - app.js
   Flusso corretto: DISCLAIMER → LOGIN → APP
   ====================================================== */

const state = {
  token: null,
  user: null,
  checklist: null,
  profiles: [],
  assessments: [],
  currentAssessment: null,
  users: [],
  groups: [],
  currentGroup: null,
};

const LS_TOKEN_KEY = "edufad_token";
const LS_DISCLAIMER_ACK_KEY = "edufad_disclaimer_ack";

/* ======================================================
   API helper
   ====================================================== */
async function api(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};

  if (state.token) {
    headers["Authorization"] = `Bearer ${state.token}`;
  }

  const hasBody = Object.prototype.hasOwnProperty.call(options, "body");
  const isForm = headers["Content-Type"] === "application/x-www-form-urlencoded";

  if (hasBody && !isForm && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(path, { ...options, headers });

  if (!res.ok) {
    let msg = "Errore inatteso";
    try {
      const data = await res.json();
      msg = data.detail || msg;
    } catch (_) {}
    throw new Error(msg);
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res;
}

/* ======================================================
   UI helpers
   ====================================================== */
function showTab(tab) {
  document.querySelectorAll(".tab-content").forEach((el) => el.classList.add("hidden"));
  const target = document.getElementById(`tab-${tab}`);
  if (target) target.classList.remove("hidden");
}

function computeAge(dob, refDate) {
  const birth = new Date(dob);
  const ref = new Date(refDate);
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
  return `${age} anni`;
}

/* ======================================================
   DISCLAIMER → LOGIN gate
   ====================================================== */
function showDisclaimerGate() {
  const modal = document.getElementById("disclaimer-modal");
  const login = document.getElementById("login-section");

  if (!modal || !login) return;

  const ack = localStorage.getItem(LS_DISCLAIMER_ACK_KEY) === "1";

  if (ack) {
    modal.classList.add("hidden");
    login.classList.remove("hidden");
    return;
  }

  modal.classList.remove("hidden");
  login.classList.add("hidden");

  const btn = document.getElementById("disclaimer-ack");
  btn.onclick = (e) => {
    e.preventDefault();
    localStorage.setItem(LS_DISCLAIMER_ACK_KEY, "1");
    modal.classList.add("hidden");
    login.classList.remove("hidden");
  };
}

async function syncDisclaimerToServer() {
  if (!state.user) return;
  if (state.user.disclaimer_ack_at) return;

  const localAck = localStorage.getItem(LS_DISCLAIMER_ACK_KEY) === "1";
  if (!localAck) return;

  try {
    state.user = await api("/api/auth/ack-disclaimer", { method: "POST" });
  } catch (_) {}
}

/* ======================================================
   DATA LOADERS
   ====================================================== */
async function initChecklist() {
  state.checklist = await api("/api/checklist");

  const itemSel = document.getElementById("dashboard-item-select");
  const groupItem = document.getElementById("group-item");

  if (itemSel) {
    itemSel.innerHTML = state.checklist.areas
      .flatMap((a) => a.items.map((i) => `<option value="${i.id}">${i.id} ${i.label}</option>`))
      .join("");
  }
  if (groupItem && itemSel) groupItem.innerHTML = itemSel.innerHTML;
}

async function renderProfiles() {
  state.profiles = await api("/api/profiles");

  const table = document.getElementById("profiles-table");
  table.innerHTML = "<tr><th>Codice</th><th>Nome</th><th>Nascita</th></tr>";

  state.profiles.forEach((p) => {
    table.innerHTML += `<tr>
      <td>${p.code || ""}</td>
      <td>${p.display_name}</td>
      <td>${p.date_of_birth}</td>
    </tr>`;
  });

  const sel = document.getElementById("assessment-profile");
  const dashSel = document.getElementById("dashboard-profile-select");
  const members = document.getElementById("group-members");

  if (sel) sel.innerHTML = state.profiles.map((p) => `<option value="${p.id}">${p.display_name}</option>`).join("");
  if (dashSel) dashSel.innerHTML = sel.innerHTML;
  if (members) members.innerHTML = sel.innerHTML;
}

async function renderAssessments() {
  const showDeleted = document.getElementById("show-deleted")?.checked;
  state.assessments = await api(`/api/assessments${showDeleted ? "?include_deleted=true" : ""}`);

  const table = document.getElementById("assessments-table");
  table.innerHTML =
    "<tr><th>ID</th><th>Profilo</th><th>Data</th><th>Età</th><th>Stato</th><th></th></tr>";

  const pmap = Object.fromEntries(state.profiles.map((p) => [p.id, p]));

  state.assessments.forEach((a) => {
    const p = pmap[a.profile_id];
    table.innerHTML += `<tr>
      <td>${a.id}</td>
      <td>${p?.display_name || a.profile_id}</td>
      <td>${a.assessment_date}</td>
      <td>${p ? computeAge(p.date_of_birth, a.assessment_date) : "-"}</td>
      <td>${a.status}${a.is_deleted ? " (eliminato)" : ""}</td>
      <td><button data-open="${a.id}">Apri</button></td>
    </tr>`;
  });

  table.querySelectorAll("button[data-open]").forEach((b) =>
    b.addEventListener("click", () => openAssessment(b.dataset.open))
  );
}

/* ======================================================
   ASSESSMENT
   ====================================================== */
async function openAssessment(id) {
  state.currentAssessment = await api(`/api/assessments/${id}`);
  document.getElementById("assessment-editor").classList.remove("hidden");

  const a = state.currentAssessment;
  document.getElementById("assessment-profile").value = a.profile_id;
  document.getElementById("assessment-date").value = a.assessment_date;
  document.getElementById("assessment-status").value = a.status;
  document.getElementById("assessment-operator-name").value = a.operator_name;
  document.getElementById("assessment-operator-role").value = a.operator_role;
  document.getElementById("assessment-meta").textContent = `ID ${a.id}`;

  await renderResponses();
}

async function renderResponses() {
  const cont = document.getElementById("responses-container");
  cont.innerHTML = "";

  const resps = await api(`/api/assessments/${state.currentAssessment.id}/responses`);
  const map = Object.fromEntries(resps.map((r) => [r.item_id, r]));

  state.checklist.areas.forEach((area) => {
    cont.innerHTML += `<h4>${area.name}</h4>`;
    area.items.forEach((it) => {
      const r = map[it.id] || {};
      cont.innerHTML += `
        <div class="form-grid">
          <div><strong>${it.id}</strong> ${it.label}</div>
          <select data-item="${it.id}">
            ${[0,1,2,3].map(v=>`<option value="${v}" ${r.support===v?"selected":""}>${v}</option>`).join("")}
          </select>
        </div>`;
    });
  });

  cont.querySelectorAll("select").forEach((s) =>
    s.addEventListener("change", () => saveResponse(s.dataset.item, s.value))
  );
}

async function saveResponse(itemId, support) {
  await api(`/api/assessments/${state.currentAssessment.id}/responses`, {
    method: "POST",
    body: JSON.stringify({ item_id: itemId, support: Number(support) }),
  });
}

/* ======================================================
   BOOT
   ====================================================== */
document.addEventListener("DOMContentLoaded", () => {
  showDisclaimerGate();

  const saved = localStorage.getItem(LS_TOKEN_KEY);
  if (saved) state.token = saved;

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const u = document.getElementById("login-username").value;
    const p = document.getElementById("login-password").value;

    const data = await api("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: u, password: p }),
    });

    state.token = data.access_token;
    localStorage.setItem(LS_TOKEN_KEY, state.token);

    state.user = await api("/api/auth/me");

    document.getElementById("login-section").classList.add("hidden");
    document.getElementById("app-section").classList.remove("hidden");
    document.getElementById("user-info").textContent = `${state.user.username} (${state.user.role})`;

    await initChecklist();
    await renderProfiles();
    await renderAssessments();
    showTab("profiles");
    await syncDisclaimerToServer();
  });

  document.getElementById("new-assessment").addEventListener("click", async () => {
    if (!state.profiles.length) {
      alert("Crea prima almeno un profilo.");
      return;
    }

    const a = await api("/api/assessments", {
      method: "POST",
      body: JSON.stringify({
        profile_id: state.profiles[0].id,
        assessment_date: new Date().toISOString().slice(0, 10),
        operator_name: state.user.username,
        operator_role: state.user.role,
        status: "draft",
      }),
    });

    await renderAssessments();
    openAssessment(a.id);
  });

  document.querySelectorAll(".tabs button").forEach((b) =>
    b.addEventListener("click", () => showTab(b.dataset.tab))
  );
});
