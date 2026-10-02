import { MACHINES, CHECKS, GROUPS } from "./machines.js";
import { createApi, validUsername } from "./data.js";

const SHIFTS = { A: "صباحي", B: "مسائي", C: "ليلي" };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const isoDate = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const fmtTime = iso => new Date(iso).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" });
const waLink = t => "https://wa.me/?text=" + encodeURIComponent(t);
function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => el.hidden = true, 2800); }

const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 12l2.5 2.5L16 9"/></svg>',
  hist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-3-5.5"/></svg>',
  me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  wa: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>',
  chev: '<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>',
};

const S = { api: null, me: null, tab: "check", date: null, shift: null, data: {}, filter: "all", group: "all", open: new Set(), hist: [], users: [], unShift: null, unHist: null, unUsers: null };

function currentShift() {
  const now = new Date(), h = now.getHours();
  if (h >= 7 && h < 15) return { date: isoDate(now), shift: "A" };
  if (h >= 15 && h < 23) return { date: isoDate(now), shift: "B" };
  const d = new Date(now); if (h < 7) d.setDate(d.getDate() - 1);
  return { date: isoDate(d), shift: "C" };
}
const key = () => S.date + "_" + S.shift;

function authError(e) {
  const c = e && e.code || "";
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c)) return "اسم المستخدم أو كلمة السر غلط.";
  if (/too-many-requests/.test(c)) return "محاولات كتير غلط. استنى شوية وجرب تاني.";
  if (/network/.test(c)) return "مفيش نت. اتأكد من الاتصال وجرب تاني.";
  if (/email-already-in-use/.test(c)) return "اسم المستخدم ده موجود قبل كده. اختار اسم تاني.";
  if (/weak-password/.test(c)) return "كلمة السر لازم تكون 6 حروف أو أرقام على الأقل.";
  if (/permission-denied/.test(c)) return "مش مسموح لك تعمل ده.";
  return "حصلت مشكلة: " + (e && (e.code || e.message) || "");
}

/* ======================= Boot ======================= */
(async function boot() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  try { S.api = await createApi(); }
  catch (e) { $("#app").innerHTML = `<div class="auth"><div class="box"><h1>مش قادر يحمّل</h1><p>اتأكد إن فيه نت أول مرة تفتح الأبلكيشن، وبعدين افتحه تاني.</p><button class="btn pri big" onclick="location.reload()">جرب تاني</button></div></div>`; return; }
  S.api.onAuth(p => p ? enter(p) : showLogin());
})();

/* ======================= Auth screens ======================= */
async function showLogin() {
  cleanup();
  const demo = S.api.mode === "demo";
  $("#app").innerHTML = `<div class="auth"><form class="box" id="loginF" autocomplete="on">
    <img class="logo" src="icons/icon-192.png" alt="">
    <div><h1>فحص الماكينات</h1><p>ادخل باسم المستخدم وكلمة السر بتوعك</p></div>
    ${demo ? `<div class="demo">وضع تجريبي: البيانات محفوظة على الجهاز ده بس لحد ما يتربط Firebase.</div>` : ""}
    <div class="field"><label for="lu">اسم المستخدم</label><input id="lu" class="ltr" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
    <div class="field"><label for="lp">كلمة السر</label><input id="lp" class="ltr" type="password" autocomplete="current-password" required></div>
    <div class="err" id="lerr"></div>
    <button class="btn pri big" id="lbtn">دخول</button>
    <button type="button" class="link" id="toSetup" hidden>أول مرة؟ اعمل حساب المدير</button>
  </form></div>`;
  $("#loginF").onsubmit = async e => {
    e.preventDefault(); $("#lerr").textContent = ""; $("#lbtn").disabled = true;
    try { await S.api.signIn($("#lu").value, $("#lp").value); }
    catch (err) { $("#lerr").textContent = authError(err); $("#lbtn").disabled = false; }
  };
  $("#toSetup").onclick = showSetup;
  if (!(await S.api.setupDone())) $("#toSetup").hidden = false;
}

function showSetup() {
  $("#app").innerHTML = `<div class="auth"><form class="box" id="setF">
    <img class="logo" src="icons/icon-192.png" alt="">
    <div><h1>حساب المدير</h1><p>ده أول حساب، وهيكون ليه صلاحية إضافة المشرفين وإيقافهم. بيتعمل مرة واحدة بس.</p></div>
    <div class="field"><label for="sn">الاسم (بيظهر في التقارير)</label><input id="sn" required></div>
    <div class="field"><label for="su">اسم المستخدم (حروف إنجليزي وأرقام)</label><input id="su" class="ltr" autocapitalize="none" spellcheck="false" required placeholder="mina"></div>
    <div class="field"><label for="sp">كلمة السر (6 على الأقل)</label><input id="sp" class="ltr" type="password" autocomplete="new-password" required minlength="6"></div>
    <div class="field"><label for="sp2">أعد كلمة السر</label><input id="sp2" class="ltr" type="password" autocomplete="new-password" required></div>
    <div class="err" id="serr"></div>
    <button class="btn pri big" id="sbtn">اعمل الحساب وادخل</button>
    <button type="button" class="link" id="back">رجوع للدخول</button>
  </form></div>`;
  $("#back").onclick = showLogin;
  $("#setF").onsubmit = async e => {
    e.preventDefault();
    const n = $("#sn").value.trim(), u = $("#su").value.trim().toLowerCase(), p = $("#sp").value;
    if (!validUsername(u)) return $("#serr").textContent = "اسم المستخدم لازم يكون من 3 لـ 30 حرف إنجليزي صغير أو أرقام (ممكن . أو - أو _).";
    if (p !== $("#sp2").value) return $("#serr").textContent = "كلمتين السر مش زي بعض.";
    $("#sbtn").disabled = true; $("#serr").textContent = "";
    try { const prof = await S.api.setupOwner(n, u, p); enter(prof); }
    catch (err) { $("#serr").textContent = authError(err); $("#sbtn").disabled = false; }
  };
}

function showBlocked(p) {
  cleanup();
  $("#app").innerHTML = `<div class="auth"><div class="box">
    <img class="logo" src="icons/icon-192.png" alt="">
    <h1>الحساب مش مفعّل</h1>
    <p>${p.missing ? "مش قادر يوصل لبيانات حسابك. لو مفيش نت، اتصل وجرب تاني. لو فيه نت، كلّم المدير." : "حسابك موقوف. كلّم المدير علشان يفعّله."}</p>
    <button class="btn big" id="retry">جرب تاني</button>
    <button class="btn big danger" id="out">خروج</button></div></div>`;
  $("#retry").onclick = () => location.reload();
  $("#out").onclick = () => S.api.signOut();
}

function cleanup() {
  [S.unShift, S.unHist, S.unUsers].forEach(f => f && f());
  S.unShift = S.unHist = S.unUsers = null;
}

/* ======================= Main shell ======================= */
function enter(p) {
  if (!p.active) return showBlocked(p);
  cleanup();
  S.me = p;
  const cs = currentShift(); S.date = cs.date; S.shift = cs.shift;
  const isAdmin = p.role === "admin";
  $("#app").innerHTML = `
  <header class="topbar"><div class="row1">
    <div><h1 id="tTitle">فحص الماكينات</h1><div class="who">${esc(p.name)}${isAdmin ? " · مدير" : " · مشرف"} ${S.api.mode === "demo" ? " · <b style='color:var(--accent)'>وضع تجريبي</b>" : ""}</div></div>
    <span class="offline" id="offline" hidden>بدون نت · هيترفع لما النت يرجع</span>
  </div><div id="topExtra"></div></header>
  <main id="main"></main>
  <div class="sendbar" id="sendbar"><div class="in"><div class="st" id="sentSt"></div><button class="btn wa" id="openSend">${ICON.wa}ابعت التقرير</button></div></div>
  <nav class="tabs" id="tabs">
    <button data-tab="check">${ICON.check}الفحص</button>
    <button data-tab="hist">${ICON.hist}السجل</button>
    ${isAdmin ? `<button data-tab="users">${ICON.users}المشرفين</button>` : ""}
    <button data-tab="me">${ICON.me}حسابي</button>
  </nav>
  <div class="sheetbg" id="sheet" hidden><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetT">
    <h2 id="sheetT">تقرير الوردية</h2>
    <div class="warn" id="sheetWarn" hidden></div>
    <pre class="msg" id="sheetMsg"></pre>
    <div class="acts"><a class="btn wa big" id="waGo" href="#" target="_blank" rel="noopener">${ICON.wa}<span id="waGoT">افتح واتساب واختار الجروب</span></a><button class="btn" id="copyMsg">انسخ الرسالة</button><button class="btn" id="closeSheet">رجوع</button></div>
    <div class="meta">واتساب هيفتح والرسالة جاهزة. اختار جروب الماكينات ودوس إرسال.</div>
  </div></div>`;
  const setOff = () => $("#offline").hidden = navigator.onLine;
  window.onoffline = window.ononline = setOff; setOff();
  S.unHist = S.api.watchHistory(h => { S.hist = h; if (S.tab === "hist") renderHist(); });
  if (isAdmin) S.unUsers = S.api.watchUsers(u => { S.users = u; if (S.tab === "users") renderUsers(); });
  selectShift(S.date, S.shift);
  go("check");
}

function go(tab) {
  S.tab = tab;
  document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false"));
  $("#sendbar").hidden = tab !== "check";
  $("#topExtra").innerHTML = "";
  const titles = { check: "فحص الماكينات", hist: "سجل الورديات", users: "المشرفين", me: "حسابي" };
  $("#tTitle").textContent = titles[tab];
  if (tab === "check") { renderCheckTop(); renderCheck(); }
  if (tab === "hist") renderHist();
  if (tab === "users") renderUsers();
  if (tab === "me") renderMe();
  window.scrollTo(0, 0);
}

function selectShift(date, shift) {
  S.date = date; S.shift = shift; S.data = {};
  if (S.unShift) S.unShift();
  S.unShift = S.api.watchShift(key(), d => { S.data = d || {}; if (S.tab === "check") renderCheck(); });
  if (S.tab === "check") { renderCheckTop(); renderCheck(); }
}

/* ======================= Check ======================= */
function mstate(m) {
  const r = S.data.m?.[m.id] || {};
  const items = CHECKS[m.type];
  const vals = items.map((_, i) => r.items?.[i] || "");
  const done = vals.filter(Boolean).length, bad = vals.filter(v => v === "bad").length, total = items.length;
  if (r.stop) return { k: "off", label: "واقفة", done: total, total, bad, r, vals };
  if (done === total) return { k: bad ? "bad" : "ok", label: bad ? bad + " مشكلة" : "كله تمام", done, total, bad, r, vals };
  if (done) return { k: bad ? "bad" : "part", label: done + " من " + total + (bad ? " · " + bad + " مشكلة" : ""), done, total, bad, r, vals, partial: true };
  return { k: "todo", label: "لسه", done, total, bad, r, vals, partial: true };
}

function renderCheckTop() {
  $("#topExtra").innerHTML = `<div class="controls">
    <input type="date" id="date" value="${S.date}" aria-label="تاريخ الوردية">
    <div class="seg" role="group" aria-label="الوردية">${Object.entries(SHIFTS).map(([k, l]) => `<button data-shift="${k}" aria-pressed="${S.shift === k}">${l}</button>`).join("")}</div>
  </div><div class="progress"><div class="meter" id="meter" aria-hidden="true"></div><div class="stats" id="stats"></div></div>`;
}

function renderCheck() {
  const all = MACHINES.map(m => ({ m, s: mstate(m) })), T = all.length;
  const fin = all.filter(x => !x.s.partial);
  const nOk = fin.filter(x => x.s.k === "ok").length, nBadDone = fin.filter(x => x.s.k === "bad").length;
  const nBad = all.filter(x => x.s.bad > 0 && x.s.k !== "off").length, nOff = all.filter(x => x.s.k === "off").length;
  if ($("#meter")) {
    $("#meter").innerHTML = `<i class="m-ok" style="width:${nOk / T * 100}%"></i><i class="m-bad" style="width:${nBadDone / T * 100}%"></i><i class="m-off" style="width:${nOff / T * 100}%"></i>`;
    $("#stats").innerHTML = `<span><b>${fin.length}</b> من ${T} خلصت</span><span><span class="dot" style="background:var(--muted)"></span>لسه <b>${T - fin.length}</b></span><span><span class="dot" style="background:var(--bad)"></span>مشاكل <b>${nBad}</b></span><span><span class="dot" style="background:var(--off)"></span>واقفة <b>${nOff}</b></span>`;
  }
  const F = [["all", "الكل", () => true], ["todo", "لسه", x => x.s.partial], ["bad", "فيها مشكلة", x => x.s.bad > 0 && x.s.k !== "off"], ["done", "خلصت", x => !x.s.partial]];
  const ff = F.find(x => x[0] === S.filter)[2];
  const list = all.filter(ff).filter(x => S.group === "all" || x.m.group === S.group);

  const ae = document.activeElement, keep = ae && ae.dataset && ae.dataset.note ? { id: ae.id, v: ae.value, s: ae.selectionStart } : null;
  $("#main").innerHTML = `
    <div class="filters">${F.map(([k, l, f]) => `<button class="chip" data-f="${k}" aria-pressed="${S.filter === k}">${l} <small>${all.filter(f).length}</small></button>`).join("")}
    <span class="sep"></span>${[["all", "كل الأقسام"], ...GROUPS.map(g => [g.k, g.label])].map(([k, l]) => `<button class="chip" data-g="${k}" aria-pressed="${S.group === k}">${l}</button>`).join("")}</div>
    <div class="grid">${list.length ? list.map(({ m, s }) => card(m, s)).join("") : `<div class="empty">مفيش ماكينات في الفلتر ده.</div>`}</div>
    <section class="panel"><h2>ملاحظات الوردية دي</h2><ul class="issues">${issuesHtml(all)}</ul></section>`;
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.value = keep.v; el.focus(); try { el.setSelectionRange(keep.s, keep.s); } catch (e) {} } }
  renderSent();
}

function issuesHtml(all) {
  const out = [];
  all.forEach(({ m, s }) => {
    const bads = badList(m, s);
    if (s.k === "off" || bads.length || s.r.note) out.push(`<li><span class="n">${m.id}</span><div><div class="name">${esc(m.ar)}${s.k === "off" ? ' — <span style="color:var(--off)">واقفة</span>' : ""}</div>${bads.length ? `<div style="color:var(--bad);font-size:.88rem">${bads.map(esc).join(" · ")}</div>` : ""}${s.r.note ? `<div class="meta">${esc(s.r.note)}</div>` : ""}</div></li>`);
  });
  return out.join("") || `<li class="empty">مفيش مشاكل ولا ملاحظات لحد دلوقتي.</li>`;
}

function card(m, s) {
  const open = S.open.has(m.id), items = CHECKS[m.type];
  const body = !open ? "" : `<div class="body ${s.r.stop ? "stopped" : ""}">
    ${items.map((it, i) => `<div class="crow"><span class="lbl">${esc(it)}</span><span class="tog"><button class="y" data-m="${m.id}" data-i="${i}" data-v="ok" aria-pressed="${s.vals[i] === "ok"}" aria-label="تمام">✓</button><button class="n" data-m="${m.id}" data-i="${i}" data-v="bad" aria-pressed="${s.vals[i] === "bad"}" aria-label="مشكلة">✗</button></span></div>`).join("")}
    <textarea id="note-${m.id}" data-note="${m.id}" placeholder="ملاحظة (اختياري): إيه المشكلة، اتبلغ مين…">${esc(s.r.note || "")}</textarea>
    <div class="acts"><button class="btn pri" data-all="${m.id}">كله تمام</button><button class="btn" data-stop="${m.id}" aria-pressed="${!!s.r.stop}">الماكينة واقفة</button>${s.done || s.r.stop ? `<button class="btn" data-clear="${m.id}">مسح</button>` : ""}${s.bad || s.r.stop ? `<a class="btn alert" href="${waLink(alertText(m, s))}" target="_blank" rel="noopener" data-alert="${m.id}">${ICON.wa}بلّغ دلوقتي</a>` : ""}</div>
    ${s.r.by ? `<div class="meta">آخر تعديل: ${esc(s.r.by)}${s.r.t ? " · " + fmtTime(s.r.t) : ""}</div>` : ""}
    ${s.r.alertAt ? `<div class="meta" style="color:var(--bad)">اتبلّغ على واتساب الساعة ${fmtTime(s.r.alertAt)}</div>` : ""}
  </div>`;
  return `<article class="card ${open ? "open" : ""}" data-state="${s.k === "todo" ? "" : s.k}">
    <button class="head" data-open="${m.id}" aria-expanded="${open}">
      <span class="ph"><img src="${m.img}" alt="" loading="lazy"><span class="num">${m.id}</span></span>
      <span class="info"><div class="name">${esc(m.ar)}</div><div class="brand">${esc(m.brand !== "—" ? m.brand : m.en)}</div><span class="pill ${s.k === "todo" ? "" : s.k}">${s.label}</span></span>
      ${ICON.chev}</button>${body}</article>`;
}

function writeMachine(id, patch) {
  const body = { date: S.date, shift: S.shift, sup: S.me.name, supUid: S.me.uid, m: { [id]: { ...patch, by: S.me.name, byUid: S.me.uid, t: new Date().toISOString() } } };
  S.api.patchShift(key(), body).catch(e => toast(authError(e)));
}

/* ---------- WhatsApp ---------- */
function mLabel(m) { return "#" + m.id + " " + m.ar + (m.brand && m.brand !== "—" && !/محلي|مصري|إيطالي/.test(m.brand) ? " (" + m.brand + ")" : ""); }
function dayLabel() { const d = new Date(S.date + "T12:00:00"); return d.toLocaleDateString("ar-EG", { weekday: "long" }) + " " + d.getDate() + "/" + (d.getMonth() + 1); }
function badList(m, s) { return s.vals.map((v, i) => v === "bad" ? CHECKS[m.type][i] : null).filter(Boolean); }
function buildReport() {
  const all = MACHINES.map(m => ({ m, s: mstate(m) }));
  const fin = all.filter(x => !x.s.partial), left = all.filter(x => x.s.partial);
  const bads = all.filter(x => x.s.bad > 0 && x.s.k !== "off"), offs = all.filter(x => x.s.k === "off");
  const L = ["✅ تقرير فحص الماكينات", "📅 " + dayLabel() + " – وردية " + SHIFTS[S.shift], "👷 المشرف: " + S.me.name,
    "اتفحص: " + fin.length + "/" + all.length + " | تمام: " + fin.filter(x => x.s.k === "ok").length + " | مشاكل: " + bads.length + " | واقفة: " + offs.length];
  if (!bads.length && !offs.length && !left.length) L.push("", "كل الماكينات تمام ✅");
  if (bads.length) { L.push("", "⚠️ المشاكل:"); bads.forEach(({ m, s }) => { L.push("• " + mLabel(m)); badList(m, s).forEach(x => L.push("   ❌ " + x)); if (s.r.note) L.push("   📝 " + s.r.note); }); }
  if (offs.length) { L.push("", "⛔ واقفة:"); offs.forEach(({ m, s }) => L.push("• " + mLabel(m) + (s.r.note ? " – " + s.r.note : ""))); }
  const notes = all.filter(x => x.s.r.note && !x.s.bad && x.s.k !== "off");
  if (notes.length) { L.push("", "📝 ملاحظات:"); notes.forEach(({ m, s }) => L.push("• " + mLabel(m) + ": " + s.r.note)); }
  if (left.length) L.push("", "⏳ ما اتفحصتش: " + left.map(x => "#" + x.m.id).join("، "));
  return { text: L.join("\n"), left };
}
function alertText(m, s) {
  const L = ["🚨 بلاغ عاجل – " + mLabel(m), "📅 " + dayLabel() + " – وردية " + SHIFTS[S.shift] + " – " + new Date().toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" })];
  if (s.r.stop) L.push("⛔ الماكينة واقفة");
  badList(m, s).forEach(x => L.push("❌ " + x));
  if (s.r.note) L.push("📝 " + s.r.note);
  L.push("👷 " + S.me.name);
  return L.join("\n");
}
function renderSent() {
  const s = S.data.sent;
  $("#sentSt").innerHTML = s && s.at ? `<b>✓ التقرير اتبعت</b> ${fmtTime(s.at)}${s.by ? " · " + esc(s.by) : ""}` : "التقرير لسه ما اتبعتش";
  if (!$("#sheet").hidden) fillSheet();
}
function fillSheet() {
  const { text, left } = buildReport();
  $("#sheetMsg").textContent = text; $("#waGo").href = waLink(text);
  const w = $("#sheetWarn");
  if (left.length) { w.hidden = false; w.innerHTML = `<b>لسه ${left.length} ماكينة ما اتفحصتش:</b><ul>${left.map(x => `<li>${esc(mLabel(x.m))}</li>`).join("")}</ul>`; $("#waGoT").textContent = "ابعت برضه على واتساب"; }
  else { w.hidden = true; $("#waGoT").textContent = "افتح واتساب واختار الجروب"; }
}

/* ======================= History ======================= */
function shiftCounts(h) {
  let done = 0, bad = 0, off = 0;
  MACHINES.forEach(m => {
    const r = h.m?.[m.id]; if (!r) return;
    const v = Object.values(r.items || {}).filter(Boolean);
    if (r.stop) { off++; done++; return; }
    if (v.length >= CHECKS[m.type].length) done++;
    if (v.includes("bad")) bad++;
  });
  return { done, bad, off };
}
function renderHist() {
  const rows = S.hist.filter(h => h && h.date);
  $("#main").innerHTML = rows.length ? `<div class="list">${rows.map(h => {
    const c = shiftCounts(h);
    const d = new Date(h.date + "T12:00:00");
    return `<button class="item" data-go="${h.date}_${h.shift}" style="text-align:right;width:100%">
      <div><div class="t">${d.toLocaleDateString("ar-EG", { weekday: "long" })} ${d.getDate()}/${d.getMonth() + 1} · ${SHIFTS[h.shift] || h.shift}</div>
      <div class="s">${esc(h.sup || "—")}${h.sent?.at ? " · التقرير اتبعت " + fmtTime(h.sent.at) : " · التقرير ما اتبعتش"}</div></div>
      <div class="nums"><span>${c.done}/${MACHINES.length}</span><span style="color:${c.bad ? "var(--bad)" : "inherit"}">مشاكل ${c.bad}</span><span>واقفة ${c.off}</span></div>
    </button>`;
  }).join("")}</div>` : `<div class="empty">لسه مفيش ورديات متسجلة. أول ما حد يعلّم على أي ماكينة، الوردية هتظهر هنا.</div>`;
}

/* ======================= Users (admin) ======================= */
function renderUsers() {
  const list = [...S.users].sort((a, b) => (b.active - a.active) || (a.role === "admin" ? -1 : 1) || a.name.localeCompare(b.name, "ar"));
  $("#main").innerHTML = `
  <section class="panel" style="margin-top:0"><h2>إضافة مشرف</h2>
    <form class="form" id="addU">
      <div class="two"><div class="field"><label for="un">الاسم</label><input id="un" required placeholder="أحمد محمود"></div>
      <div class="field"><label for="uu">اسم المستخدم (إنجليزي)</label><input id="uu" class="ltr" required autocapitalize="none" spellcheck="false" placeholder="ahmed"></div></div>
      <div class="two"><div class="field"><label for="up">كلمة السر (6 على الأقل)</label><input id="up" class="ltr" required minlength="6" autocomplete="off"></div>
      <div class="field"><label for="ur">الصلاحية</label><select id="ur"><option value="supervisor">مشرف</option><option value="admin">مدير (يضيف ويوقف مشرفين)</option></select></div></div>
      <div class="err" id="uerr"></div>
      <button class="btn pri" id="ubtn">أضف</button>
      <div class="meta">ابعت للمشرف اسم المستخدم وكلمة السر، ويقدر يغيّر كلمة السر بعد كده من «حسابي».</div>
    </form></section>
  <h2 class="sectionT" style="margin-top:18px">كل الحسابات (${list.length})</h2>
  <div class="list">${list.map(u => `<div class="item"><div><div class="t">${esc(u.name)} ${u.role === "admin" ? '<span class="tag admin">مدير</span>' : '<span class="tag">مشرف</span>'} ${u.active ? "" : '<span class="tag off">موقوف</span>'}</div><div class="s ltr" style="text-align:right">${esc(u.username)}</div></div>
    ${u.uid === S.me.uid ? '<span class="meta">ده إنت</span>' : `<div class="acts"><button class="btn ${u.active ? "danger" : ""}" data-uact="${u.uid}">${u.active ? "إيقاف" : "تفعيل"}</button><button class="btn" data-urole="${u.uid}">${u.role === "admin" ? "خليه مشرف" : "خليه مدير"}</button></div>`}
  </div>`).join("")}</div>
  <p class="meta" style="margin-top:12px">لو مشرف نسي كلمة السر: وقّف حسابه واعمله حساب جديد باسم مستخدم تاني (مثلًا ahmed2).</p>`;
  $("#addU").onsubmit = async e => {
    e.preventDefault();
    const n = $("#un").value.trim(), u = $("#uu").value.trim().toLowerCase(), p = $("#up").value, r = $("#ur").value;
    if (!validUsername(u)) return $("#uerr").textContent = "اسم المستخدم لازم يكون حروف إنجليزي صغيرة وأرقام (3 لـ 30).";
    $("#ubtn").disabled = true; $("#uerr").textContent = "";
    try { await S.api.createUser(n, u, p, r); toast("اتضاف " + n + ". اسم المستخدم: " + u); e.target.reset(); }
    catch (err) { $("#uerr").textContent = authError(err); }
    $("#ubtn").disabled = false;
  };
}

/* ======================= Me ======================= */
let installEvt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; if (S.tab === "me") renderMe(); });
function renderMe() {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  $("#main").innerHTML = `
  <section class="panel" style="margin-top:0"><h2>${esc(S.me.name)}</h2>
    <div class="s ltr" style="text-align:right;color:var(--muted)">${esc(S.me.username)}</div>
    <div class="meta">${S.me.role === "admin" ? "مدير" : "مشرف"}${S.api.mode === "demo" ? " · وضع تجريبي (البيانات على الجهاز ده بس)" : ""}</div></section>
  ${standalone ? "" : `<section class="panel"><h2>نزّل الأبلكيشن على الموبايل</h2>
    ${installEvt ? `<button class="btn pri big" id="install">ثبّت الأبلكيشن</button>` : ios ? `<div class="ios"><div>1. افتح الصفحة دي من <b>Safari</b>.</div><div>2. دوس زرار المشاركة <b>⬆︎</b> اللي تحت.</div><div>3. اختار <b>Add to Home Screen</b> (إضافة إلى الشاشة الرئيسية).</div></div>` : `<div class="ios"><div>من Chrome: دوس النقط التلاتة <b>⋮</b> فوق، واختار <b>Install app</b> أو <b>Add to Home screen</b>.</div></div>`}
  </section>`}
  <section class="panel"><h2>تغيير كلمة السر</h2>
    <form class="form" id="pwF">
      <div class="field"><label for="po">كلمة السر الحالية</label><input id="po" class="ltr" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="pn">كلمة السر الجديدة (6 على الأقل)</label><input id="pn" class="ltr" type="password" autocomplete="new-password" required minlength="6"></div>
      <div class="err" id="perr"></div><button class="btn pri" id="pbtn">غيّر</button></form></section>
  <section class="panel"><button class="btn big danger" id="logout" style="width:100%">خروج</button></section>`;
  if ($("#install")) $("#install").onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; renderMe(); };
  $("#pwF").onsubmit = async e => {
    e.preventDefault(); $("#pbtn").disabled = true; $("#perr").textContent = "";
    try { await S.api.changePassword($("#po").value, $("#pn").value); toast("كلمة السر اتغيرت"); e.target.reset(); }
    catch (err) { $("#perr").textContent = authError(err); }
    $("#pbtn").disabled = false;
  };
  $("#logout").onclick = () => S.api.signOut();
}

/* ======================= Events ======================= */
document.addEventListener("click", e => {
  const a = e.target.closest("a[data-alert]");
  if (a) { const id = +a.dataset.alert, m = MACHINES.find(x => x.id === id); a.href = waLink(alertText(m, mstate(m))); setTimeout(() => writeMachine(id, { alertAt: new Date().toISOString() }), 0); return; }
  if (e.target.closest("#waGo")) {
    $("#waGo").href = waLink(buildReport().text);
    setTimeout(() => { S.api.patchShift(key(), { date: S.date, shift: S.shift, sent: { at: new Date().toISOString(), by: S.me.name, byUid: S.me.uid } }).catch(err => toast(authError(err))); $("#sheet").hidden = true; }, 0);
    return;
  }
  const t = e.target.closest("button"); if (!t) { if (e.target.id === "sheet") $("#sheet").hidden = true; return; }
  const d = t.dataset;
  if (d.tab) return go(d.tab);
  if (t.id === "openSend") { fillSheet(); $("#sheet").hidden = false; $("#closeSheet").focus(); return; }
  if (t.id === "closeSheet") { $("#sheet").hidden = true; return; }
  if (t.id === "copyMsg") {
    const txt = $("#sheetMsg").textContent;
    const sel = () => { const r = document.createRange(); r.selectNodeContents($("#sheetMsg")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("الرسالة متحددة، انسخها"); };
    try { navigator.clipboard.writeText(txt).then(() => toast("الرسالة اتنسخت، الصقها في الجروب"), sel); } catch (err) { sel(); }
    return;
  }
  if (d.shift) return selectShift(S.date, d.shift);
  if (d.go) { const [dt, sh] = d.go.split("_"); S.date = dt; S.shift = sh; go("check"); selectShift(dt, sh); return; }
  if (d.open) { const id = +d.open; S.open.has(id) ? S.open.delete(id) : S.open.add(id); return renderCheck(); }
  if (d.f) { S.filter = d.f; return renderCheck(); }
  if (d.g) { S.group = d.g; return renderCheck(); }
  if (d.m) { const cur = S.data.m?.[d.m]?.items?.[d.i] || ""; return writeMachine(+d.m, { items: { [d.i]: cur === d.v ? "" : d.v } }); }
  if (d.all) {
    const m = MACHINES.find(x => x.id == d.all), r = S.data.m?.[m.id]?.items || {}, items = {};
    CHECKS[m.type].forEach((_, i) => items[i] = r[i] === "bad" ? "bad" : "ok");
    S.open.delete(m.id); writeMachine(m.id, { items, stop: false }); return renderCheck();
  }
  if (d.stop) return writeMachine(+d.stop, { stop: !S.data.m?.[d.stop]?.stop });
  if (d.clear) { const m = MACHINES.find(x => x.id == d.clear), items = {}; CHECKS[m.type].forEach((_, i) => items[i] = ""); return writeMachine(m.id, { items, stop: false, note: "" }); }
  if (d.uact) { const u = S.users.find(x => x.uid === d.uact); S.api.updateUser(u.uid, { active: !u.active }).catch(err => toast(authError(err))); return; }
  if (d.urole) { const u = S.users.find(x => x.uid === d.urole); S.api.updateUser(u.uid, { role: u.role === "admin" ? "supervisor" : "admin" }).catch(err => toast(authError(err))); return; }
});
document.addEventListener("change", e => { if (e.target.id === "date" && e.target.value) selectShift(e.target.value, S.shift); });
const noteTimers = {};
document.addEventListener("input", e => {
  const t = e.target; if (!t.dataset.note) return; const id = +t.dataset.note;
  clearTimeout(noteTimers[id]);
  noteTimers[id] = setTimeout(() => { if ((S.data.m?.[id]?.note || "") !== t.value.trim()) writeMachine(id, { note: t.value.trim() }); }, 700);
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#sheet") && !$("#sheet").hidden) $("#sheet").hidden = true; });
