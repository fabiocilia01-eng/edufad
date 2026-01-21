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

const api = async (path, options = {}) => {
  const headers = options.headers || {};
  if (state.token) {
    headers["Authorization"] = `Bearer ${state.token}`;
  }
  if (!options.body) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ detail: "Errore inatteso." }));
    throw new Error(data.detail || "Errore inatteso.");
  }
  if (response.headers.get("content-type")?.includes("application/json")) {
    return response.json();
  }
  return response;
};

const showTab = (tab) => {
  document.querySelectorAll(".tab-content").forEach((el) => el.classList.add("hidden"));
  document.getElementById(`tab-${tab}`).classList.remove("hidden");
};

const renderProfiles = async () => {
  const profiles = await api("/api/profiles");
  state.profiles = profiles;
  const table = document.getElementById("profiles-table");
  table.innerHTML = "<tr><th>Codice</th><th>Nome</th><th>Nascita</th></tr>";
  profiles.forEach((profile) => {
    table.innerHTML += `<tr><td>${profile.code}</td><td>${profile.display_name}</td><td>${profile.date_of_birth}</td></tr>`;
  });
  const select = document.getElementById("dashboard-profile-select");
  select.innerHTML = profiles.map((p) => `<option value="${p.id}">${p.display_name}</option>`).join("");
  document.getElementById("assessment-profile").innerHTML = profiles
    .map((p) => `<option value="${p.id}">${p.display_name}</option>`)
    .join("");
  document.getElementById("group-members").innerHTML = profiles
    .map((p) => `<option value="${p.id}">${p.display_name}</option>`)
    .join("");
};

const computeAge = (dob, assessmentDate) => {
  const birth = new Date(dob);
  const ref = new Date(assessmentDate);
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) {
    age -= 1;
  }
  return `${age} anni`;
};

const renderAssessments = async () => {
  const includeDeleted = document.getElementById("show-deleted").checked;
  const assessments = await api(`/api/assessments${includeDeleted ? "?include_deleted=true" : ""}`);
  state.assessments = assessments;
  const profileMap = Object.fromEntries(state.profiles.map((p) => [p.id, p]));
  const table = document.getElementById("assessments-table");
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
        <button data-edit="${a.id}">Apri</button>
        ${state.user.role === "admin" && a.is_deleted ? `<button data-restore="${a.id}">Ripristina</button>` : ""}
      </td>
    </tr>`;
  });
  table.querySelectorAll("button[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => openAssessment(btn.dataset.edit));
  });
  table.querySelectorAll("button[data-restore]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/assessments/${btn.dataset.restore}/restore`, { method: "POST" });
      renderAssessments();
    });
  });
};

const renderDashboard = async () => {
  const profileId = document.getElementById("dashboard-profile-select").value;
  if (!profileId) return;
  const data = await api(`/api/dashboard/profile/${profileId}`);
  const canvas = document.getElementById("profile-chart");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#1e3a8a";
  ctx.beginPath();
  data.series.forEach((point, index) => {
    const x = 50 + index * 80;
    const avg = Object.values(point.areas).reduce((acc, v) => acc + v, 0) / (Object.keys(point.areas).length || 1);
    const y = 250 - avg * 50;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    ctx.fillText(point.date, x - 10, 280);
  });
  ctx.stroke();
  const compareA = document.getElementById("compare-a");
  const compareB = document.getElementById("compare-b");
  const options = state.assessments
    .filter((a) => a.profile_id === Number(profileId))
    .map((a) => `<option value="${a.id}">${a.assessment_date} (${a.status})</option>`)
    .join("");
  compareA.innerHTML = options;
  compareB.innerHTML = options;
};

const renderItemDashboard = async () => {
  const itemId = document.getElementById("dashboard-item-select").value;
  if (!itemId) return;
  const data = await api(`/api/dashboard/item/${itemId}?max_support=1`);
  const table = document.getElementById("item-dashboard-table");
  table.innerHTML = "<tr><th>Studente</th><th>Data</th><th>Supporto</th></tr>";
  data.results.forEach((row) => {
    table.innerHTML += `<tr><td>${row.profile_name}</td><td>${row.assessment_date}</td><td>${row.support}</td></tr>`;
  });
};

const renderGroups = async () => {
  const groups = await api("/api/work-groups");
  state.groups = groups;
  const table = document.getElementById("groups-table");
  table.innerHTML = "<tr><th>Titolo</th><th>Item</th><th>Status</th></tr>";
  groups.forEach((group) => {
    table.innerHTML += `<tr>
      <td>${group.title}</td>
      <td>${group.item_id}</td>
      <td>${group.status}</td>
      <td><button data-group="${group.id}">Apri</button></td>
    </tr>`;
  });
  table.querySelectorAll("button[data-group]").forEach((btn) => {
    btn.addEventListener("click", () => openGroup(btn.dataset.group));
  });
};

const initChecklist = async () => {
  state.checklist = await api("/api/checklist");
  const itemSelect = document.getElementById("dashboard-item-select");
  itemSelect.innerHTML = state.checklist.areas
    .flatMap((area) => area.items.map((item) => `<option value="${item.id}">${item.id} ${item.label}</option>`))
    .join("");
  document.getElementById("group-item").innerHTML = itemSelect.innerHTML;
};

const loadUsers = async () => {
  state.users = await api("/api/users/basic");
  document.getElementById("group-assignees").innerHTML = state.users
    .map((u) => `<option value="${u.id}">${u.username} (${u.role})</option>`)
    .join("");
};

const openAssessment = async (assessmentId) => {
  const assessment = await api(`/api/assessments/${assessmentId}`);
  state.currentAssessment = assessment;
  document.getElementById("assessment-editor").classList.remove("hidden");
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
  if (!assessment) return;
  const warning = document.getElementById("assessment-warning");
  if (state.user.role === "admin" && (!assessment.operator_name || !assessment.operator_role)) {
    warning.textContent = "Per gli admin, inserire nome e ruolo operatore prima di compilare le risposte.";
  } else {
    warning.textContent = "";
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
  const operatorName = document.getElementById("assessment-operator-name").value.trim();
  const operatorRole = document.getElementById("assessment-operator-role").value.trim();
  if (state.user.role === "admin" && (!operatorName || !operatorRole)) {
    return;
  }
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
  try {
    const summary = await api(`/api/assessments/${state.currentAssessment.id}/summary`);
    document.getElementById("summary-auto").textContent = summary.auto_text || "";
    document.getElementById("summary-manual").value = summary.manual_text || "";
  } catch (err) {
    document.getElementById("summary-auto").textContent = "";
    document.getElementById("summary-manual").value = "";
  }
};

const loadPlans = async () => {
  const plans = await api(`/api/assessments/${state.currentAssessment.id}/plans`);
  const list = document.getElementById("plans-list");
  list.innerHTML = "";
  plans.forEach((plan) => {
    const li = document.createElement("li");
    li.innerHTML = `v${plan.version} - ${plan.generated_at} <button data-plan="${plan.id}">PDF</button>`;
    list.appendChild(li);
  });
  list.querySelectorAll("button[data-plan]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.open(`/api/exports/plan/${btn.dataset.plan}.pdf`, "_blank");
    });
  });
};

const openGroup = async (groupId) => {
  const group = state.groups.find((g) => g.id === Number(groupId));
  if (!group) return;
  state.currentGroup = group;
  document.getElementById("group-editor").classList.remove("hidden");
  document.getElementById("group-title").value = group.title;
  document.getElementById("group-item").value = group.item_id;
  document.getElementById("group-area").value = group.area_id;
  document.getElementById("group-support-min").value = group.support_min;
  document.getElementById("group-support-max").value = group.support_max;
  document.getElementById("group-start").value = group.start_date || "";
  document.getElementById("group-end").value = group.end_date || "";
  document.getElementById("group-notes").value = group.notes || "";
  document.getElementById("group-status").value = group.status;
  Array.from(document.getElementById("group-members").options).forEach((opt) => {
    opt.selected = group.members.includes(Number(opt.value));
  });
  Array.from(document.getElementById("group-assignees").options).forEach((opt) => {
    opt.selected = group.assignees.includes(Number(opt.value));
  });
};

const showDisclaimerIfNeeded = () => {
  if (!state.user || state.user.disclaimer_ack_at) return;
  const modal = document.getElementById("disclaimer-modal");
  modal.classList.remove("hidden");
  document.getElementById("disclaimer-ack").onclick = async () => {
    await api("/api/auth/ack-disclaimer", { method: "POST" });
    modal.classList.add("hidden");
    state.user.disclaimer_ack_at = new Date().toISOString();
  };
};

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = document.getElementById("login-username").value;
  const password = document.getElementById("login-password").value;
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username, password }),
    });
    state.token = data.access_token;
    state.user = await api("/api/auth/me");
    document.getElementById("login-section").classList.add("hidden");
    document.getElementById("app-section").classList.remove("hidden");
    document.getElementById("user-info").textContent = `${state.user.username} (${state.user.role})`;
    await initChecklist();
    await renderProfiles();
    await renderAssessments();
    await loadUsers();
    await renderGroups();
    showTab("profiles");
    showDisclaimerIfNeeded();
  } catch (err) {
    document.getElementById("login-error").textContent = err.message;
  }
});

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

document.getElementById("dashboard-profile-select").addEventListener("change", renderDashboard);
document.getElementById("dashboard-item-select").addEventListener("change", renderItemDashboard);

document.getElementById("export-item-csv").addEventListener("click", () => {
  const itemId = document.getElementById("dashboard-item-select").value;
  window.open(`/api/exports/item/${itemId}.csv`, "_blank");
});

document.getElementById("export-item-pdf").addEventListener("click", () => {
  const itemId = document.getElementById("dashboard-item-select").value;
  window.open(`/api/exports/item/${itemId}.pdf`, "_blank");
});

document.getElementById("show-deleted").addEventListener("change", renderAssessments);

document.getElementById("new-assessment").addEventListener("click", async () => {
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
  openAssessment(assessment.id);
});

document.getElementById("save-assessment").addEventListener("click", async () => {
  const assessment = state.currentAssessment;
  if (!assessment) return;
  const payload = {
    profile_id: Number(document.getElementById("assessment-profile").value),
    assessment_date: document.getElementById("assessment-date").value,
    operator_name: document.getElementById("assessment-operator-name").value,
    operator_role: document.getElementById("assessment-operator-role").value,
    present_user_ids: document.getElementById("assessment-present-users").value
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

document.getElementById("delete-assessment").addEventListener("click", async () => {
  if (!state.currentAssessment) return;
  await api(`/api/assessments/${state.currentAssessment.id}`, { method: "DELETE" });
  document.getElementById("assessment-editor").classList.add("hidden");
  await renderAssessments();
});

document.getElementById("export-assessment-pdf").addEventListener("click", () => {
  if (!state.currentAssessment) return;
  window.open(`/api/exports/assessment/${state.currentAssessment.id}.pdf`, "_blank");
});

document.getElementById("generate-plan").addEventListener("click", async () => {
  if (!state.currentAssessment) return;
  await api(`/api/assessments/${state.currentAssessment.id}/plans`, { method: "POST" });
  await loadPlans();
});

document.getElementById("save-summary").addEventListener("click", async () => {
  if (!state.currentAssessment) return;
  await api(`/api/assessments/${state.currentAssessment.id}/summary`, {
    method: "PATCH",
    body: JSON.stringify({ manual_text: document.getElementById("summary-manual").value }),
  });
});

document.getElementById("compare-run").addEventListener("click", async () => {
  const a = document.getElementById("compare-a").value;
  const b = document.getElementById("compare-b").value;
  if (!a || !b) return;
  const data = await api(`/api/dashboard/compare?assessment_a=${a}&assessment_b=${b}`);
  const table = document.getElementById("compare-table");
  table.innerHTML = "<tr><th>Item</th><th>Delta</th></tr>";
  data.deltas.forEach((delta) => {
    table.innerHTML += `<tr><td>${delta.item_id}</td><td>${delta.delta}</td></tr>`;
  });
});

document.getElementById("create-group-from-item").addEventListener("click", () => {
  const itemId = document.getElementById("dashboard-item-select").value;
  document.getElementById("group-item").value = itemId;
  document.getElementById("group-area").value = itemId.slice(0, 2);
  document.getElementById("group-support-min").value = 0;
  document.getElementById("group-support-max").value = 1;
  document.getElementById("group-editor").classList.remove("hidden");
  showTab("groups");
});

document.getElementById("new-group").addEventListener("click", () => {
  state.currentGroup = null;
  document.getElementById("group-editor").classList.remove("hidden");
  document.getElementById("group-title").value = "";
  document.getElementById("group-notes").value = "";
});

document.getElementById("save-group").addEventListener("click", async () => {
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
  document.getElementById("group-editor").classList.add("hidden");
  await renderGroups();
});

document.getElementById("delete-group").addEventListener("click", async () => {
  if (!state.currentGroup) return;
  await api(`/api/work-groups/${state.currentGroup.id}`, { method: "DELETE" });
  document.getElementById("group-editor").classList.add("hidden");
  await renderGroups();
});
document.addEventListener("DOMContentLoaded", () => {

  // ===== DISCLAIMER FLOW =====
  const disclaimer = document.getElementById("disclaimer-modal");
  const loginSection = document.getElementById("login-section");
  const ackBtn = document.getElementById("disclaimer-ack");

  // Stato iniziale
  if (disclaimer) disclaimer.classList.remove("hidden");
  if (loginSection) loginSection.style.display = "none";

  // Click su "Ho compreso"
  if (ackBtn) {
    ackBtn.addEventListener("click", async () => {
      try {
        const token = localStorage.getItem("token");
        if (token) {
          await fetch("/api/auth/ack-disclaimer", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            }
          });
        }

        disclaimer.classList.add("hidden");
        loginSection.style.display = "block";
      } catch (err) {
        console.error("Errore conferma disclaimer:", err);
      }
    });
  }

  // ===== RESTO DEL TUO CODICE GIÀ ESISTENTE =====
  initLogin();
  loadChecklist();
  // ecc...

});

  const btn = document.getElementById("disclaimer-ack");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      alert("Sessione scaduta. Effettua di nuovo il login.");
      return;
    }

    const res = await fetch("/api/auth/ack-disclaimer", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token
      }
    });

    if (!res.ok) {
      alert("Errore nel salvataggio del disclaimer");
      return;
    }

    const modal = document.getElementById("disclaimerModal");
    if (modal) modal.style.display = "none";

    if (typeof loadMeAndRender === "function") {
      loadMeAndRender();
    }
  });
});
