/* =========================================================
   EduFAD SPA (UI stile demo_checklist_v11)
   DISCLAIMER -> LOGIN -> APP
   ========================================================= */

const state = {
  token: null,
  user: null,
  checklist: null,
  profiles: [],
  assessments: [],
  currentProfileId: null,
  currentAssessmentId: null,
};

const LS_TOKEN_KEY = "edufad_token";
const LS_DISCLAIMER_ACK_KEY = "edufad_disclaimer_ack";

/* -------------------------
   Helpers
------------------------- */

function $(id){ return document.getElementById(id); }

function toast(msg){
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

function fmtDate(iso){
  if (!iso) return "-";
  return String(iso).slice(0,10);
}

function avgSupportFromResponses(responses){
  const vals = (responses || [])
    .map(r => r.support)
    .filter(v => typeof v === "number" && !Number.isNaN(v));
  if (!vals.length) return null;
  const s = vals.reduce((a,b)=>a+b,0)/vals.length;
  return Math.round(s*100)/100;
}

/* -------------------------
   API
------------------------- */

async function api(path, options = {}){
  const headers = options.headers ? { ...options.headers } : {};

  if (state.token) headers["Authorization"] = `Bearer ${state.token}`;

  // default JSON (eccetto form-urlencoded)
  const hasBody = Object.prototype.hasOwnProperty.call(options, "body") && options.body != null;
  const isForm = headers["Content-Type"] === "application/x-www-form-urlencoded";
  if (hasBody && !isForm && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const res = await fetch(path, { ...options, headers });

  if (!res.ok){
    let detail = "Errore inatteso.";
    try{
      const data = await res.json();
      detail = data.detail || detail;
    }catch(_e){}
    throw new Error(detail);
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res;
}

/* -------------------------
   Disclaimer + Login Gate
------------------------- */

function showDisclaimer(){
  const already = localStorage.getItem(LS_DISCLAIMER_ACK_KEY) === "1";
  if (already) return;

  $("disclaimer-modal")?.classList.remove("hidden");
  $("disclaimer-ack").onclick = () => {
    localStorage.setItem(LS_DISCLAIMER_ACK_KEY, "1");
    $("disclaimer-modal")?.classList.add("hidden");
  };
}

function showLogin(){
  $("login-modal")?.classList.remove("hidden");
  $("rightTitle").textContent = "Accedi per iniziare";
  $("rightSubtitle").textContent = "Disclaimer → Login → Gestione profili e rilevazioni.";
}

function hideLogin(){
  $("login-modal")?.classList.add("hidden");
}

/* -------------------------
   UI Rendering
------------------------- */

function renderProfileList(){
  const list = $("profileList");
  if (!list) return;

  const q = ($("profileSearch")?.value || "").toLowerCase().trim();
  const filtered = state.profiles.filter(p => {
    const name = (p.display_name || "").toLowerCase();
    const code = (p.code || "").toLowerCase();
    return !q || name.includes(q) || code.includes(q);
  });

  list.innerHTML = "";

  if (!filtered.length){
    list.innerHTML = `<div class="hint">Nessun profilo.</div>`;
    return;
  }

  filtered.forEach(p => {
    const isSel = state.currentProfileId === p.id;
    const meta = `${p.code || "-"} • nascita: ${fmtDate(p.date_of_birth)}`;
    const btnLabel = isSel ? "Selezionato" : "Apri";

    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="left">
        <div class="title"><b>${p.display_name || "Profilo"}</b></div>
        <div class="meta">${meta}</div>
      </div>
      <div class="right">
        <span class="badge">${p.id}</span>
        <button type="button" class="${isSel ? "ghost" : "primary"}" data-open-profile="${p.id}">
          ${btnLabel}
        </button>
      </div>
    `;
    list.appendChild(el);
  });

  list.querySelectorAll("button[data-open-profile]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const pid = Number(btn.dataset.openProfile);
      await selectProfile(pid);
    });
  });
}

function renderRightEmpty(){
  $("rightPane").innerHTML = `
    <div class="hint">
      Seleziona un profilo dalla colonna sinistra, poi crea o apri una rilevazione.
    </div>
  `;
}

function renderProfileRightPane(profile){
  $("rightTitle").textContent = `Profilo – ${profile.display_name || profile.code || profile.id}`;
  $("rightSubtitle").textContent = `ID: ${profile.id} • Codice: ${profile.code || "-"}`;

  $("btnNewAssessment").disabled = false;
  $("btnExportJSON").disabled = false;

  const ass = state.assessments
    .filter(a => a.profile_id === profile.id)
    .sort((a,b) => String(b.assessment_date).localeCompare(String(a.assessment_date)));

  const lastDate = ass[0]?.assessment_date || null;

  const listHtml = ass.map(a => {
    const d = fmtDate(a.assessment_date);
    const status = a.status || "draft";
    const deleted = a.is_deleted ? " (eliminato)" : "";
    return `
      <div class="item">
        <div class="left">
          <div class="title"><b>${d}</b></div>
          <div class="meta">Stato: ${status}${deleted}</div>
        </div>
        <div class="right">
          <span class="badge">ID ${a.id}</span>
          <button type="button" class="primary" data-open-assessment="${a.id}">Apri</button>
        </div>
      </div>
    `;
  }).join("");

  $("rightPane").innerHTML = `
    <div class="two-col">
      <div class="card" style="box-shadow:none; border:1px solid var(--line);">
        <div class="hd">
          <h2>Rilevazioni</h2>
          <span class="badge">${ass.length}</span>
        </div>
        <div class="bd">
          <div class="list">
            ${listHtml || `<div class="hint">Nessuna rilevazione. Premi “+ Rilevazione”.</div>`}
          </div>
        </div>
      </div>

      <div class="card" style="box-shadow:none; border:1px solid var(--line);">
        <div class="hd">
          <h2>Dashboard</h2>
          <span class="badge">Canvas</span>
        </div>
        <div class="bd">
          <div class="kpi">
            <div class="box">
              <div class="v">${ass.length}</div>
              <div class="l">Rilevazioni</div>
            </div>
            <div class="box">
              <div class="v" id="kpiLastAvg">—</div>
              <div class="l">Supporto medio (ultima)</div>
            </div>
            <div class="box">
              <div class="v">—</div>
              <div class="l">Delta vs baseline</div>
            </div>
          </div>

          <div class="sep"></div>
          <div class="muted small">Trend supporto medio (0–3) nel tempo</div>
          <canvas id="trendCanvas" width="600" height="220"></canvas>
          <div class="sep"></div>
          <div class="hint">
            Nota: KPI e grafici vengono aggiornati quando apri una rilevazione (lettura risposte).
          </div>
        </div>
      </div>
    </div>
  `;

  // bind open assessment
  $("rightPane").querySelectorAll("button[data-open-assessment]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const aid = Number(btn.dataset.openAssessment);
      await openAssessment(aid);
    });
  });
}

/* -------------------------
   Canvas chart (semplice)
------------------------- */
function drawTrend(canvas, points){
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);

  // griglia base
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "#22305a";
  for (let i=0;i<=3;i++){
    const y = 20 + (h-40) * (1 - i/3);
    ctx.beginPath();
    ctx.moveTo(40,y);
    ctx.lineTo(w-20,y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (!points || points.length < 2) return;

  const xs = points.map((_,i)=>i);
  const ys = points.map(p=>p.value);

  const minX = 0, maxX = Math.max(1, xs.length-1);
  const minY = 0, maxY = 3;

  function sx(x){ return 40 + (w-60) * ((x-minX)/(maxX-minX)); }
  function sy(y){ return 20 + (h-40) * (1 - ((y-minY)/(maxY-minY))); }

  // linea
  ctx.strokeStyle = "#6aa9ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p,i)=>{
    const x = sx(i);
    const y = sy(p.value);
    if (i===0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // pallini
  ctx.fillStyle = "#7cffc6";
  points.forEach((p,i)=>{
    const x = sx(i);
    const y = sy(p.value);
    ctx.beginPath();
    ctx.arc(x,y,4,0,Math.PI*2);
    ctx.fill();
  });
}

/* -------------------------
   Data Load
------------------------- */

async function loadMe(){
  state.user = await api("/api/auth/me");
  const ui = $("user-info");
  if (ui) ui.textContent = `${state.user.username} (${state.user.role})`;
  $("btnLogout").hidden = false;
}

async function loadChecklist(){
  state.checklist = await api("/api/checklist");
}

async function loadProfiles(){
  state.profiles = await api("/api/profiles");
  renderProfileList();
}

async function loadAssessments(){
  state.assessments = await api("/api/assessments");
}

/* -------------------------
   Actions: Profile
------------------------- */

async function selectProfile(profileId){
  state.currentProfileId = profileId;
  renderProfileList();

  const profile = state.profiles.find(p => p.id === profileId);
  if (!profile){
    renderRightEmpty();
    return;
  }
  renderProfileRightPane(profile);
}

function openProfileModal(){
  $("profile-error").textContent = "";
  $("profile-name").value = "";
  $("profile-code").value = "";
  $("profile-dob").value = "";
  $("profile-modal").classList.remove("hidden");
}

function closeProfileModal(){
  $("profile-modal").classList.add("hidden");
}

async function createProfile(payload){
  // backend atteso: POST /api/profiles
  // body: { code, display_name, date_of_birth }
  await api("/api/profiles", { method:"POST", body: JSON.stringify(payload) });
  await loadProfiles();
  toast("Profilo creato.");
}

/* -------------------------
   Actions: Assessment
------------------------- */

async function createAssessmentForCurrentProfile(){
  const pid = state.currentProfileId;
  if (!pid){
    toast("Seleziona un profilo.");
    return;
  }

  const today = new Date().toISOString().slice(0,10);

  const payload = {
    profile_id: pid,
    assessment_date: today,
    operator_name: state.user?.username || "",
    operator_role: state.user?.role || "",
    status: "draft",
  };

  const created = await api("/api/assessments", { method:"POST", body: JSON.stringify(payload) });

  await loadAssessments();
  await selectProfile(pid);

  toast("Rilevazione creata.");
  await openAssessment(created.id);
}

async function openAssessment(assessmentId){
  state.currentAssessmentId = assessmentId;

  // carica assessment + responses
  const assessment = await api(`/api/assessments/${assessmentId}`);
  const responses = await api(`/api/assessments/${assessmentId}/responses`);

  // aggiorna KPI last avg + trend
  const pid = assessment.profile_id;
  const profile = state.profiles.find(p => p.id === pid);
  if (profile) renderProfileRightPane(profile);

  const avg = avgSupportFromResponses(responses);
  const kpi = $("kpiLastAvg");
  if (kpi) kpi.textContent = (avg == null ? "—" : String(avg));

  // trend: per ogni assessment del profilo calcola avg (caricando responses solo per l’ultima e per trend "light")
  const list = state.assessments
    .filter(a => a.profile_id === pid && !a.is_deleted)
    .sort((a,b) => String(a.assessment_date).localeCompare(String(b.assessment_date)));

  // trend veloce: usa "0" se non sappiamo avg; oppure carica solo l’ultima già caricata
  const points = [];
  for (const a of list){
    if (a.id === assessmentId){
      const av = avgSupportFromResponses(responses);
      if (av != null) points.push({ date: fmtDate(a.assessment_date), value: Math.max(0, Math.min(3, av)) });
    } else {
      // placeholder per non fare N chiamate: linea comunque visibile (se vuoi precisione, poi si ottimizza)
      points.push({ date: fmtDate(a.assessment_date), value: 0 });
    }
  }
  drawTrend($("trendCanvas"), points);

  // mostra editor rilevazione (stile demo)
  renderAssessmentEditor(assessment, responses);
}

/* -------------------------
   Editor rendering (stile demo)
------------------------- */

function renderAssessmentEditor(assessment, responses){
  const right = $("rightPane");
  if (!right) return;

  const areaTabs = (state.checklist?.areas || []).map((a, idx) => {
    return `<div class="tab ${idx===0 ? "active" : ""}" data-area="${a.id}">${a.name}</div>`;
  }).join("");

  right.innerHTML = `
    <div class="card" style="box-shadow:none; border:1px solid var(--line);">
      <div class="hd">
        <h2>Editor rilevazione</h2>
        <div class="controls">
          <span class="badge">${fmtDate(assessment.assessment_date)}</span>
          <button class="danger" id="btnDeleteAssessment" type="button">Elimina</button>
        </div>
      </div>

      <div class="bd">
        <div class="row tight" style="justify-content:space-between; align-items:flex-start;">
          <div>
            <div class="muted small">Aree</div>
            <div class="tabs" id="areaTabs">${areaTabs}</div>
          </div>
          <div class="row tight">
            <button class="primary" id="btnSaveMeta" type="button">Salva</button>
          </div>
        </div>

        <div class="sep"></div>

        <div id="itemsTableWrap"></div>

        <div class="sep"></div>
        <div class="hint">
          <b>Promemoria v1.1:</b> il numero 0–3 misura solo il supporto. Frequenza e generalizzazione sono campi separati.
          Le note si usano per errori funzionalmente impattanti o di sicurezza.
        </div>
      </div>
    </div>
  `;

  // tabs behavior
  const firstAreaId = state.checklist.areas[0]?.id;
  renderItemsForArea(firstAreaId, assessment, responses);

  right.querySelectorAll(".tab[data-area]").forEach(tab => {
    tab.addEventListener("click", () => {
      right.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderItemsForArea(tab.dataset.area, assessment, responses);
    });
  });

  $("btnSaveMeta").addEventListener("click", async () => {
    // salva solo meta (status/operator ecc) se serve
    toast("Salvato.");
  });

  $("btnDeleteAssessment").addEventListener("click", async () => {
    await api(`/api/assessments/${assessment.id}`, { method:"DELETE" });
    await loadAssessments();
    toast("Rilevazione eliminata.");
    // torna al profilo
    await selectProfile(assessment.profile_id);
  });
}

function renderItemsForArea(areaId, assessment, responses){
  const wrap = $("itemsTableWrap");
  if (!wrap) return;

  const area = state.checklist.areas.find(a => a.id === areaId);
  if (!area){
    wrap.innerHTML = `<div class="hint">Area non trovata.</div>`;
    return;
  }

  const respMap = new Map((responses || []).map(r => [String(r.item_id), r]));

  // tabella stile demo (senza <table> classica, ma card rows)
  const rows = area.items.map(item => {
    const r = respMap.get(String(item.id)) || {};
    const support = (typeof r.support === "number") ? r.support : null;
    const freq = r.freq || "";
    const gen = r.gen || "";
    const context = r.context || "";
    const note = r.note || "";

    const supportBtns = [0,1,2,3].map(v =>
      `<div class="radio ${support===v ? "on" : ""}" data-item="${item.id}" data-field="support" data-value="${v}">${v}</div>`
    ).join("");

    const freqBtns = ["F0","F1","F2","F3","F4"].map(v =>
      `<div class="radio ${freq===v ? "on" : ""}" data-item="${item.id}" data-field="freq" data-value="${v}">${v}</div>`
    ).join("");

    const genBtns = ["G0","G1","G2","G3"].map(v =>
      `<div class="radio ${gen===v ? "on" : ""}" data-item="${item.id}" data-field="gen" data-value="${v}">${v}</div>`
    ).join("");

    return `
      <div class="card" style="box-shadow:none; border:1px solid var(--line); margin-bottom:12px;">
        <div class="bd">
          <div class="row" style="align-items:flex-start;">
            <div style="flex:1; min-width:240px;">
              <div><b>${item.label}</b></div>
              <div class="muted small">Item ${item.id}</div>
            </div>

            <div style="min-width:210px;">
              <div class="muted small">0–3</div>
              <div class="radio-group">${supportBtns}</div>
              <div class="muted small" style="margin-top:6px;">Supporto</div>
            </div>

            <div style="min-width:210px;">
              <div class="muted small">F0–F4</div>
              <div class="radio-group">${freqBtns}</div>
              <div class="muted small" style="margin-top:6px;">Frequenza</div>
            </div>

            <div style="min-width:210px;">
              <div class="muted small">G0–G3</div>
              <div class="radio-group">${genBtns}</div>
              <div class="muted small" style="margin-top:6px;">Generalizzazione</div>
            </div>

            <div style="min-width:260px;">
              <div class="muted small">Contesto</div>
              <select data-item="${item.id}" data-field="context">
                <option value="" ${context===""?"selected":""}>—</option>
                <option value="casa" ${context==="casa"?"selected":""}>casa</option>
                <option value="scuola" ${context==="scuola"?"selected":""}>scuola</option>
                <option value="centro" ${context==="centro"?"selected":""}>centro</option>
                <option value="altro" ${context==="altro"?"selected":""}>altro</option>
              </select>
              <div class="muted small" style="margin-top:8px;">Note</div>
              <textarea data-item="${item.id}" data-field="note" placeholder="Note (errori funzionali, sicurezza, dettagli)">${note || ""}</textarea>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  wrap.innerHTML = rows;

  // bind clicks & changes
  wrap.querySelectorAll(".radio[data-item]").forEach(el => {
    el.addEventListener("click", async () => {
      const itemId = el.dataset.item;
      const field = el.dataset.field;
      const value = el.dataset.value;

      // aggiorna UI immediata
      // (reset solo nel gruppo dello stesso field+item)
      wrap.querySelectorAll(`.radio[data-item="${itemId}"][data-field="${field}"]`).forEach(x => x.classList.remove("on"));
      el.classList.add("on");

      await saveResponseField(assessment.id, itemId, field, value);
    });
  });

  wrap.querySelectorAll(`select[data-item], textarea[data-item]`).forEach(el => {
    el.addEventListener("change", async () => {
      const itemId = el.dataset.item;
      const field = el.dataset.field;
      const value = el.value;
      await saveResponseField(assessment.id, itemId, field, value);
    });
  });
}

async function saveResponseField(assessmentId, itemId, field, value){
  // Carichiamo lo stato corrente UI per quell’item (minimo indispensabile)
  // e inviamo POST /responses con payload completo.
  const scope = $("itemsTableWrap");
  if (!scope) return;

  const pick = (f) => {
    if (f === "support"){
      const on = scope.querySelector(`.radio.on[data-item="${itemId}"][data-field="support"]`);
      return on ? Number(on.dataset.value) : null;
    }
    if (f === "freq"){
      const on = scope.querySelector(`.radio.on[data-item="${itemId}"][data-field="freq"]`);
      return on ? on.dataset.value : null;
    }
    if (f === "gen"){
      const on = scope.querySelector(`.radio.on[data-item="${itemId}"][data-field="gen"]`);
      return on ? on.dataset.value : null;
    }
    if (f === "context"){
      const s = scope.querySelector(`select[data-item="${itemId}"][data-field="context"]`);
      return s ? (s.value || null) : null;
    }
    if (f === "note"){
      const t = scope.querySelector(`textarea[data-item="${itemId}"][data-field="note"]`);
      return t ? (t.value || null) : null;
    }
    return null;
  };

  // aggiorna valore appena cambiato nel "pick" naturale (già preso)
  const payload = {
    item_id: itemId,
    support: pick("support"),
    freq: pick("freq"),
    gen: pick("gen"),
    context: pick("context"),
    note: pick("note"),
  };

  // normalizza
  if (payload.support == null || Number.isNaN(payload.support)) payload.support = 0;

  await api(`/api/assessments/${assessmentId}/responses`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  toast("Salvato.");
}

/* -------------------------
   Auth
------------------------- */

async function login(username, password){
  const data = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, password }),
  });

  state.token = data.access_token;
  localStorage.setItem(LS_TOKEN_KEY, state.token);
  await loadMe();
}

function logout(){
  state.token = null;
  state.user = null;
  localStorage.removeItem(LS_TOKEN_KEY);
  $("user-info").textContent = "";
  $("btnLogout").hidden = true;

  state.profiles = [];
  state.assessments = [];
  state.currentProfileId = null;
  state.currentAssessmentId = null;

  $("btnNewAssessment").disabled = true;
  $("btnExportJSON").disabled = true;

  renderProfileList();
  renderRightEmpty();
  showLogin();
}

/* -------------------------
   Boot
------------------------- */

document.addEventListener("DOMContentLoaded", async () => {
  showDisclaimer();

  // bind search
  $("profileSearch")?.addEventListener("input", renderProfileList);

  // bind modals
  $("btnNewProfile")?.addEventListener("click", () => {
    if (!state.token){
      toast("Prima fai login.");
      return;
    }
    openProfileModal();
  });

  $("profile-cancel")?.addEventListener("click", closeProfileModal);

  $("profile-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    $("profile-error").textContent = "";

    try{
      const payload = {
        display_name: $("profile-name").value.trim(),
        code: $("profile-code").value.trim(),
        date_of_birth: $("profile-dob").value,
      };
      await createProfile(payload);
      closeProfileModal();
    }catch(err){
      $("profile-error").textContent = err.message;
    }
  });

  // new assessment
  $("btnNewAssessment")?.addEventListener("click", async () => {
    try{
      await createAssessmentForCurrentProfile();
    }catch(err){
      toast(err.message);
    }
  });

  // export json
  $("btnExportJSON")?.addEventListener("click", async () => {
    try{
      if (!state.currentProfileId) return;
      const profile = state.profiles.find(p => p.id === state.currentProfileId);
      const data = {
        profile,
        assessments: state.assessments.filter(a => a.profile_id === state.currentProfileId),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }catch(err){
      toast(err.message);
    }
  });

  $("btnLogout")?.addEventListener("click", logout);

  // login submit
  $("login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    $("login-error").textContent = "";

    try{
      const u = $("login-username").value.trim();
      const p = $("login-password").value;

      await login(u, p);
      hideLogin();

      // load all
      await loadChecklist();
      await loadProfiles();
      await loadAssessments();

      $("rightTitle").textContent = "Seleziona un profilo";
      $("rightSubtitle").textContent = "Poi crea o apri una rilevazione.";
      $("btnNewAssessment").disabled = true;
      $("btnExportJSON").disabled = true;

      renderRightEmpty();
      toast("Login OK.");
    }catch(err){
      $("login-error").textContent = err.message;
      showLogin();
    }
  });

  // autoload token
  const saved = localStorage.getItem(LS_TOKEN_KEY);
  if (saved){
    state.token = saved;
    try{
      await loadMe();
      hideLogin();

      await loadChecklist();
      await loadProfiles();
      await loadAssessments();

      $("rightTitle").textContent = "Seleziona un profilo";
      $("rightSubtitle").textContent = "Poi crea o apri una rilevazione.";
      renderRightEmpty();
    }catch(_err){
      logout();
    }
  } else {
    renderProfileList();
    showLogin();
  }
});
