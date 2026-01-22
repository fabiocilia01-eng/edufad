/* =========================
   EduFAD SPA - app.js
   Flusso: DISCLAIMER -> LOGIN -> APP
   ========================= */

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

/* -------------------------
   API helper
   ------------------------- */
const api = async (path, options = {}) => {
  const headers = options.headers ? { ...options.headers } : {};

  if (state.token) headers["Authorization"] = `Bearer ${state.token}`;

  const hasBody = Object.prototype.hasOwnProperty.call(options, "body") && options.body != null;
  const isForm = headers["Content-Type"] === "application/x-www-form-urlencoded";
  if (hasBody && !isForm && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const response = await fetch(path, { ...options, headers });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ detail: "Errore inatteso." }));
    throw new Error(data.detail || "Errore inatteso.");
  }

  const ct = response.headers.get("content-type") || "";
  if (ct.includes("application/json")) return response.json();
  return response;
};

/* -------------------------
   UI helpers
   ------------------------- */
const showTab = (tab) => {
  document.querySelectorAll(".tab-content").forEach((el) => el.classList.add("hidden"));
  const target = document.getElementById(`tab-${tab}`);
  if (target) target.classList.remove("hidden");
};

const computeAge = (dob, assessmentDate) => {
  const birth = new Date(dob);
  const ref = new Date(assessmentDate);
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age -= 1;
  return `${age} anni`;
};

/* -------------------------
   Gate: Disclaimer -> Login
   ------------------------- */
const showDisclaimerGate = () => {
  const disclaimerModal = document.getElementById("disclaimer-modal");
  const loginSection = document.getElementById("login-section");
  const appSection = document.getElementById("app-section");
  const ackBtn = document.getElementById("disclaimer-ack");

  if (!disclaimerModal || !loginSection || !ackBtn) return;

  // App sempre nascosta finché non fai login
  if (appSection) appSection.classList.add("hidden");

  const alreadyAck = localStorage.getItem(LS_DISCLAIMER_ACK_KEY) === "1";

  if (alreadyAck) {
    disclaimerModal.classList.add("hidden");
    loginSection.classList.remove("hidden");
    return;
  }

  // Mostra disclaimer, nascondi login
  disclaimerModal.classList.remove("hidden");
  loginSection.classList.add("hidden");

  ackBtn.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.setItem(LS_DISCLAIMER_ACK_KEY, "1");
    disclaimerModal.classList.add("hidden");
    loginSection.classList.remove("hidden");
  });
};

const syncDisclaimerAckToServerIfPossible = async () => {
  if (!state.user) return;

  const localAck = localStorage.getItem(LS_DISCLAIMER_ACK_KEY) === "1";
  if (!localAck) return;

  if (!state.user.disclaimer_ack_at) {
    try {
      state.user = await api("/api/auth/ack-disclaimer", { method: "POST" });
    } catch (_err) {
      // best-effort: non bloccare
    }
  }
};

/* -------------------------
   Render functions
   ------------------------- */
const renderProfiles = async () => {
  const profiles = await api("/api/profiles");
  state.profiles = profiles;

  const table = document.getElementById("profiles-table");
  if (table) {
    table.innerHTML = "<tr><th>Codice</th><th>Nome</th><th>Nascita</th></tr>";
    profiles.forEach((p) => {
      table.innerHTML += `<tr><td>${p.code}</td><td>${p.display_name}</td><td>${p.date_of_birth}</td></tr>`;
    });
  }

  const select = document.getElementById("dashboard-profile-select");
  if (select) select.innerHTML = profiles.map((p) => `<option value="${p.id}">${p.display_name}</option>`).join("");

  const assessmentProfile = document.getElementById("assessment-profile");
  if (assessmentProfile) {
    assessmentProfile.innerHTML = profiles.map((p) => `<option value="${p.id}">${p.display_name}</option>`).join("");
  }

  const groupMembers = document.getElementById("group-members");
  if (groupMembers) {
    groupMembers.innerHTML = profiles.map((p) => `<option value="${p.id}">${p.display_name}</option>`).join("");
  }
};

const renderAssessments = async () => {
  const showDeleted = document.getElementById("show-deleted");
  const includeDeleted = showDeleted ? showDeleted.checked : false;

  const assessments = await api(`/api/assessments${includeDeleted ? "?include_deleted=true" : ""}`);
  state.assessments = assessments;

  const profileMap = Object.fromEntries(state.profiles.map((p) => [p.id, p]));
  const table = document.getElementById("assessments-table");
  if (!table) return;

  table.innerHTML = "<tr><th>ID</th><th>Profilo</th><th>Data</th><th>Età</th><th>Stato</th><th>Azioni</th></tr>";

  assessments.forEach((a) => {
    const profile = profileMap[a.profile_id];
    const age = profile ? computeAge(profile.date_of_birth, a.assessment_date) : "-";
    const deleted = a.is_deleted ? " (eliminato)" : "";
    table.innerHTML += `<tr>
      <td>${a.id}</td>
      <td>${profile?.display_name || a.profile_id}</td>
      <td>${a.assessment_date}</td>
      <td>${age}</td>
      <td>${a.status}${deleted}</td>
      <td>
        <button type="button" data-edit="${a.id}">Apri</button>
        ${state.user?.role === "admin" && a.is_deleted ? `<button type="button" data-restore="${a.id}">Ripristina</button>` : ""}
      </td>
    </tr>`;
  });

  table.querySelectorAll("button[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => openAssessment(btn.dataset.edit));
  });

  table.querySelectorAll("button[data-restore]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/assessments/${btn.dataset.restore}/restore`, { method: "POST" });
      await renderAssessments();
    });
  });
};

const renderDashboard = async () => {
  const sel = document.getElementById("dashboard-profile-select");
  if (!sel) return;

  const profileId = sel.value;
  if (!profileId) return;

  const data = await api(`/api/dashboard/profile/${profileId}`);
  const canvas = document.getElementById("profile-chart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.beginPath();
  data.series.forEach((point, index) => {
    const x = 50 + index * 80;
    const avg =
      Object.values(point.areas).reduce((acc, v) => acc + v, 0) / (Object.keys(point.areas).length || 1);
    const y = 250 - avg * 50;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    ctx.fillText(point.date, x - 10, 280);
  });
  ctx.stroke();

  const compareA = document.getElementById("compare-a");
  const compareB = document.getElementById("compare-b");
  if (!compareA || !compareB) return;

  const options = state.assessments
    .filter((a) => a.profile_id === Number(profileId))
    .map((a) => `<option value="${a.id}">${a.assessment_date} (${a.status})</option>`)
    .join("");

  compareA.innerHTML = options;
  compareB.innerHTML = options;
};

const renderItemDashboard = async () => {
  const itemSel = document.getElementById("dashboard-item-select");
  if (!itemSel) return;

  const itemId = itemSel.value;
  if (!itemId) return;

  const data = await api(`/api/dashboard/item/${itemId}?max_support=1`);
  const table = document.getElementById("item-dashboard-table");
  if (!table) return;

  table.innerHTML = "<tr><th>Studente</th><th>Data</th><th>Supporto</th></tr>";
  data.results.forEach((row) => {
    table.innerHTML += `<tr><td>${row.profile_name}</td><td>${row.assessment_date}</td><td>${row.support}</td></tr>`;
  });
};

const initChecklist = async () => {
  state.checklist = await api("/api/checklist");

  const itemSelect = document.getElementById("dashboard-item-select");
  if (itemSelect) {
    itemSelect.innerHTML = state.checklist.areas
      .flatMap((area) => area.items.map((item) => `<option value="${item.id}">${item.id} ${item.label}</option>`))
      .join("");
  }

  const groupItem = document.getElementById("group-item");
  if (groupItem && itemSelect) groupItem.innerHTML = itemSelect.innerHTML;
};

const loadUsers = async () => {
  state.users = await api("/api/users/basic");
  const assignees = document.getElementById("group-assignees");
  if (!assignees) return;

  assignees.innerHTML = state.users.map((u) => `<option value="${u.id}">${u.username} (${u.role})</option>`).join("");
};

const renderGroups = async () => {
  const groups = await api("/api/work-groups");
  state.groups = groups;

  const table = document.getElementById("groups-table");
  if (!table) return;

  table.innerHTML = "<tr><th>Titolo</th><th>Item</th><th>Status</th><th>Azioni</th></tr>";
  groups.forEach((g) => {
    table.innerHTML += `<tr>
      <td>${g.title}</td>
      <td>${g.item_id}</td>
      <td>${g.status}</td>
      <td><button type="button" data-group="${g.id}">Apri</button></td>
    </tr>`;
  });

  table.querySelectorAll("button[data-group]").forEach((btn) => {
    btn.addEventListener("click", () => openGroup(btn.dataset.group));
  });
};

/* -------------------------
   Assessment editor
   ------------------------- */
const openAssessment = async (assessmentId) => {
  const assessment = await api(`/api/assessments/${assessmentId}`);
  state.currentAssessment = assessment;

  document.getElementById("assessment-editor")?.classList.remove("hidden");
  document.getElementById("assessment-profile").value = assessment.profile_id;
  document.getElementById("assessment-date").value = assessment.assessment_date;
  document.getElementById("assessment-status").value = assessment.status;
  document.getElementById("assessment-operator-name").value = assessment.operator_name;
  document.getElementById("assessment-operator-role").value = assessment.operator_role;
  document.getElementById("assessment-present-users").value = (assessment.present_user_ids || []).join(", ");
  document.getElementById("assessment-present-other").value = assessment.present_other || "";
  document.getElementById("assessment-notes").value = assessment.session_notes || "";
  document.getElementById("assessment-meta").textContent = `ID ${assessment.id}`;

  await renderResponses();
  await loadSummary();
  await loadPlans();
};

const renderResponses = async () => {
  const container = document.getElementById("responses-container");
  const assessment = state.currentAssessment;
  if (!assessment || !container) return;

  const warning = document.getElementById("assessment-warning");
  if (warning) {
    if (state.user?.role === "admin" && (!assessment.operator_name || !assessment.operator_role)) {
      warning.textContent = "Per gli admin, inserire nome e ruolo operatore prima di compilare le risposte.";
    } else {
      warning.textContent = "";
    }
  }

  const existing = await api(`/api/assessments/${assessment.id}/responses`);
  const responseMap = Object.fromEntries(existing.map((r) => [r.item_id, r]));

  container.innerHTML = "";
  state.checklist.areas.forEach((area) => {
    const areaBlock = document.createElement("div");
    areaBlock.innerHTML = `<h4>${area.name}</h4>`;

    area.items.forEach((item) => {
      const resp = responseMap[item.id] || {};
      const row = document.createElement("div");
      row.className = "form-grid";

      row.innerHTML = `
        <div><strong>${item.id}</strong> ${item.label}</div>
        <label>Supporto
          <select data-item="${item.id}" data-field="support">
            ${[0, 1, 2, 3].map((v) => `<option value="${v}" ${resp.support === v ? "selected" : ""}>${v}</option>`).join("")}
          </select>
        </label>
        <label>Frequenza
          <select data-item="${item.id}" data-field="freq">
            ${["", "F0", "F1", "F2", "F3", "F4"].map((v) => `<option value="${v}" ${resp.freq === v ? "selected" : ""}>${v || "-"}</option>`).join("")}
          </select>
        </label>
        <label>Generalizzazione
          <select data-item="${item.id}" data-field="gen">
            ${["", "G0", "G1", "G2", "G3"].map((v) => `<option value="${v}" ${resp.gen === v ? "selected" : ""}>${v || "-"}</option>`).join("")}
          </select>
        </label>
        <label>Contesto <input data-item="${item.id}" data-field="context" value="${resp.context || ""}" /></label>
        <label>Nota <input data-item="${item.id}" data-field="note" value="${resp.note || ""}" /></label>
      `;

      areaBlock.appendChild(row);
    });

    container.appendChild(areaBlock);
  });

  container.querySelectorAll("select,input").forEach((el) => {
    el.addEventListener("change", () => autosaveResponse(el.dataset.item));
  });
};

const autosaveResponse = async (itemId) => {
  const assessment = state.currentAssessment;
  if (!assessment) return;

  const operatorName = document.getElementById("assessment-operator-name")?.value.trim() || "";
  const operatorRole = document.getElementById("assessment-operator-role")?.value.trim() || "";

  if (state.user?.role === "admin" && (!operatorName || !operatorRole)) return;

  const fields = {};
  document.querySelectorAll(`[data-item="${itemId}"]`).forEach((el) => {
    fields[el.dataset.field] = el.value || null;
  });

  await api(`/api/assessments/${assessment.id}/responses`, {
    method: "POST",
    body: JSON.stringify({
      item_id: itemId,
      support: Number(fields.support),
      freq: fields.freq || null,
      gen: fields.gen || null,
      context: fields.context || null,
      note: fields.note || null,
    }),
  });

  await loadSummary();
};

const loadSummary = async () => {
  const autoEl = document.getElementById("summary-auto");
  const manualEl = document.getElementById("summary-manual");

  try {
    const summary = await api(`/api/assessments/${state.currentAssessment.id}/summary`);
    if (autoEl) autoEl.textContent = summary.auto_text || "";
    if (manualEl) manualEl.value = summary.manual_text || "";
  } catch (_err) {
    if (autoEl) autoEl.textContent = "";
    if (manualEl) manualEl.value = "";
  }
};

const loadPlans = async () => {
  const plans = await api(`/api/assessments/${state.currentAssessment.id}/plans`);
  const list = document.getElementById("plans-list");
  if (!list) return;

  list.innerHTML = "";
  plans.forEach((plan) => {
    const li = document.createElement("li");
    li.innerHTML = `v${plan.version} - ${plan.generated_at} <button type="button" data-plan="${plan.id}">PDF</button>`;
    list.appendChild(li);
  });

  list.querySelectorAll("button[data-plan]").forEach((btn) => {
    btn.addEventListener("click", () => window.open(`/api/exports/plan/${btn.dataset.plan}.pdf`, "_blank"));
  });
};

/* -------------------------
   Groups editor
   ------------------------- */
const openGroup = async (groupId) => {
  const group = state.groups.find((g) => g.id === Number(groupId));
  if (!group) return;

  state.currentGroup = group;

  document.getElementById("group-editor")?.classList.remove("hidden");
  document.getElementById("group-title").value = group.title;
  document.getElementById("group-item").value = group.item_id;
  document.getElementById("group-area").value = group.area_id;
  document.getElementById("group-support-min").value = group.support_min;
  document.getElementById("group-support-max").value = group.support_max;
  document.getElementById("group-start").value = group.start_date || "";
  document.getElementById("group-end").value = group.end_date || "";
  document.getElementById("group-notes").value = group.notes || "";
  document.getElementById("group-status").value = group.status;

  const membersEl = document.getElementById("group-members");
  if (membersEl) {
    Array.from(membersEl.options).forEach((opt) => (opt.selected = group.members.includes(Number(opt.value))));
  }

  const assigneesEl = document.getElementById("group-assignees");
  if (assigneesEl) {
    Array.from(assigneesEl.options).forEach((opt) => (opt.selected = group.assignees.includes(Number(opt.value))));
  }
};

/* -------------------------
   Boot
   ------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  // Gate disclaimer -> login
  showDisclaimerGate();

  // carica token salvato
  const saved = localStorage.getItem(LS_TOKEN_KEY);
  if (saved) state.token = saved;

  // LOGIN
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const username = document.getElementById("login-username")?.value || "";
      const password = document.getElementById("login-password")?.value || "";

      const errEl = document.getElementById("login-error");
      if (errEl) errEl.textContent = "";

      try {
        const data = await api("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ username, password }),
        });

        state.token = data.access_token;
        localStorage.setItem(LS_TOKEN_KEY, state.token);

        state.user = await api("/api/auth/me");

        // UI: show app
        document.getElementById("login-section")?.classList.add("hidden");
        document.getElementById("app-section")?.classList.remove("hidden");

        const info = document.getElementById("user-info");
        if (info) info.textContent = `${state.user.username} (${state.user.role})`;

        await initChecklist();
        await renderProfiles();
        await renderAssessments();
        await loadUsers();
        await renderGroups();

        showTab("profiles");

        await syncDisclaimerAckToServerIfPossible();
      } catch (err) {
        if (errEl) errEl.textContent = err.message;
      }
    });
  }

  // Tabs
  document.querySelectorAll(".tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      showTab(tab);
      if (tab === "dashboard") {
        renderDashboard();
        renderItemDashboard();
      }
    });
  });

  // Dashboard selectors
  document.getElementById("dashboard-profile-select")?.addEventListener("change", renderDashboard);
  document.getElementById("dashboard-item-select")?.addEventListener("change", renderItemDashboard);

  // Exports
  document.getElementById("export-item-csv")?.addEventListener("click", () => {
    const itemId = document.getElementById("dashboard-item-select")?.value;
    if (itemId) window.open(`/api/exports/item/${itemId}.csv`, "_blank");
  });

  document.getElementById("export-item-pdf")?.addEventListener("click", () => {
    const itemId = document.getElementById("dashboard-item-select")?.value;
    if (itemId) window.open(`/api/exports/item/${itemId}.pdf`, "_blank");
  });

  document.getElementById("show-deleted")?.addEventListener("change", renderAssessments);

  // New assessment
  document.getElementById("new-assessment")?.addEventListener("click", async () => {
    if (!state.profiles.length) return;

    const payload = {
      profile_id: state.profiles[0].id,
      assessment_date: new Date().toISOString().slice(0, 10),
      operator_name: state.user.username,
      operator_role: state.user.role === "admin" ? "" : "Editor",
      status: "draft",
    };

    const assessment = await api("/api/assessments", { method: "POST", body: JSON.stringify(payload) });
    await renderAssessments();
    await openAssessment(assessment.id);
  });

  // Save assessment
  document.getElementById("save-assessment")?.addEventListener("click", async () => {
    const assessment = state.currentAssessment;
    if (!assessment) return;

    const payload = {
      profile_id: Number(document.getElementById("assessment-profile").value),
      assessment_date: document.getElementById("assessment-date").value,
      operator_name: document.getElementById("assessment-operator-name").value,
      operator_role: document.getElementById("assessment-operator-role").value,
      present_user_ids: (document.getElementById("assessment-present-users").value || "")
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((v) => !Number.isNaN(v)),
      present_other: document.getElementById("assessment-present-other").value,
      session_notes: document.getElementById("assessment-notes").value,
      status: document.getElementById("assessment-status").value,
    };

    const updated = await api(`/api/assessments/${assessment.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    state.currentAssessment = updated;
    await renderAssessments();
  });

  // Delete assessment
  document.getElementById("delete-assessment")?.addEventListener("click", async () => {
    if (!state.currentAssessment) return;
    await api(`/api/assessments/${state.currentAssessment.id}`, { method: "DELETE" });
    document.getElementById("assessment-editor")?.classList.add("hidden");
    await renderAssessments();
  });

  // Export assessment PDF
  document.getElementById("export-assessment-pdf")?.addEventListener("click", () => {
    if (!state.currentAssessment) return;
    window.open(`/api/exports/assessment/${state.currentAssessment.id}.pdf`, "_blank");
  });

  // Generate plan
  document.getElementById("generate-plan")?.addEventListener("click", async () => {
    if (!state.currentAssessment) return;
    await api(`/api/assessments/${state.currentAssessment.id}/plans`, { method: "POST" });
    await loadPlans();
  });

  // Save summary
  document.getElementById("save-summary")?.addEventListener("click", async () => {
    if (!state.currentAssessment) return;
    await api(`/api/assessments/${state.currentAssessment.id}/summary`, {
      method: "PATCH",
      body: JSON.stringify({ manual_text: document.getElementById("summary-manual").value }),
    });
  });

  // Compare
  document.getElementById("compare-run")?.addEventListener("click", async () => {
    const a = document.getElementById("compare-a")?.value;
    const b = document.getElementById("compare-b")?.value;
    if (!a || !b) return;

    const data = await api(`/api/dashboard/compare?assessment_a=${a}&assessment_b=${b}`);
    const table = document.getElementById("compare-table");
    if (!table) return;

    table.innerHTML = "<tr><th>Item</th><th>Delta</th></tr>";
    data.deltas.forEach((delta) => {
      table.innerHTML += `<tr><td>${delta.item_id}</td><td>${delta.delta}</td></tr>`;
    });
  });

  // Create group from item
  document.getElementById("create-group-from-item")?.addEventListener("click", () => {
    const itemId = document.getElementById("dashboard-item-select")?.value;
    if (!itemId) return;

    document.getElementById("group-item").value = itemId;
    document.getElementById("group-area").value = itemId.slice(0, 2);
    document.getElementById("group-support-min").value = 0;
    document.getElementById("group-support-max").value = 1;
    document.getElementById("group-editor")?.classList.remove("hidden");
    showTab("groups");
  });

  // New group
  document.getElementById("new-group")?.addEventListener("click", () => {
    state.currentGroup = null;
    document.getElementById("group-editor")?.classList.remove("hidden");
    document.getElementById("group-title").value = "";
    document.getElementById("group-notes").value = "";
  });

  // Save group
  document.getElementById("save-group")?.addEventListener("click", async () => {
    const payload = {
      title: document.getElementById("group-title").value,
      item_id: document.getElementById("group-item").value,
      area_id: document.getElementById("group-area").value,
      support_min: Number(document.getElementById("group-support-min").value),
      support_max: Number(document.getElementById("group-support-max").value),
      start_date: document.getElementById("group-start").value || null,
      end_date: document.getElementById("group-end").value || null,
      notes: document.getElementById("group-notes").value,
      status: document.getElementById("group-status").value,
      member_profile_ids: Array.from(document.getElementById("group-members").selectedOptions).map((o) => Number(o.value)),
      assignee_user_ids: Array.from(document.getElementById("group-assignees").selectedOptions).map((o) => Number(o.value)),
    };

    if (state.currentGroup) {
      await api(`/api/work-groups/${state.currentGroup.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    } else {
      await api("/api/work-groups", { method: "POST", body: JSON.stringify(payload) });
    }

    document.getElementById("group-editor")?.classList.add("hidden");
    await renderGroups();
  });

  // Delete group
  document.getElementById("delete-group")?.addEventListener("click", async () => {
    if (!state.currentGroup) return;
    await api(`/api/work-groups/${state.currentGroup.id}`, { method: "DELETE" });
    document.getElementById("group-editor")?.classList.add("hidden");
    await renderGroups();
  });
});
