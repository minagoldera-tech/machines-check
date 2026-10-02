// طبقة البيانات: Firebase لما يكون متظبط، ووضع تجريبي محلي غير كده
import { firebaseConfig } from "./firebase-config.js";

export const USER_DOMAIN = "users.machines-check.app";
export const toEmail = u => u.trim().toLowerCase() + "@" + USER_DOMAIN;
export const validUsername = u => /^[a-z0-9._-]{3,30}$/.test(u.trim().toLowerCase());

const FB = "https://www.gstatic.com/firebasejs/10.14.1/";

export async function createApi() {
  if (firebaseConfig.apiKey) return firebaseApi();
  return demoApi();
}

/* ======================= Firebase ======================= */
async function firebaseApi() {
  const [{ initializeApp, deleteApp }, A, F] = await Promise.all([
    import(FB + "firebase-app.js"),
    import(FB + "firebase-auth.js"),
    import(FB + "firebase-firestore.js"),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  let db;
  try {
    db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch (e) { db = F.getFirestore(app); }

  const api = { mode: "firebase", profile: null };

  api.setupDone = async () => {
    try { return (await F.getDoc(F.doc(db, "meta", "setup"))).exists(); }
    catch (e) { return true; }
  };

  api.onAuth = cb => A.onAuthStateChanged(auth, async user => {
    if (api._busy) return;
    if (!user) { api.profile = null; return cb(null); }
    let prof = null;
    try {
      const s = await F.getDoc(F.doc(db, "users", user.uid));
      if (s.exists()) prof = { uid: user.uid, ...s.data() };
    } catch (e) { /* offline أو ممنوع */ }
    if (!prof) prof = { uid: user.uid, name: user.email.split("@")[0], username: user.email.split("@")[0], role: "supervisor", active: false, missing: true };
    api.profile = prof;
    cb(prof);
  });

  api.signIn = (u, p) => A.signInWithEmailAndPassword(auth, toEmail(u), p);
  api.signOut = () => A.signOut(auth);

  api.setupOwner = async (name, u, p) => {
    api._busy = true;
    try {
    const cred = await A.createUserWithEmailAndPassword(auth, toEmail(u), p);
    const uid = cred.user.uid;
    await F.setDoc(F.doc(db, "meta", "setup"), { ownerUid: uid, at: F.serverTimestamp() });
    await F.setDoc(F.doc(db, "users", uid), { name, username: u.trim().toLowerCase(), role: "admin", active: true, createdAt: F.serverTimestamp() });
    // نعيد تحميل البروفايل
    const s = await F.getDoc(F.doc(db, "users", uid));
    api.profile = { uid, ...s.data() };
    return api.profile;
    } finally { api._busy = false; }
  };

  api.watchShift = (key, cb) => F.onSnapshot(F.doc(db, "shifts", key),
    s => cb(s.exists() ? s.data() : null), e => console.warn(e));

  api.patchShift = (key, patch) => F.setDoc(F.doc(db, "shifts", key), patch, { merge: true });

  api.watchHistory = cb => F.onSnapshot(
    F.query(F.collection(db, "shifts"), F.orderBy("date", "desc"), F.limit(120)),
    s => cb(s.docs.map(d => d.data())), e => console.warn(e));

  api.watchUsers = cb => F.onSnapshot(F.collection(db, "users"),
    s => cb(s.docs.map(d => ({ uid: d.id, ...d.data() }))), e => console.warn(e));

  api.createUser = async (name, u, p, role) => {
    // تطبيق تاني مؤقت علشان المدير ما يخرجش من حسابه
    const tmp = initializeApp(firebaseConfig, "tmp-" + Date.now());
    try {
      const tAuth = A.getAuth(tmp);
      const cred = await A.createUserWithEmailAndPassword(tAuth, toEmail(u), p);
      await F.setDoc(F.doc(db, "users", cred.user.uid), { name, username: u.trim().toLowerCase(), role, active: true, createdAt: F.serverTimestamp() });
      await A.signOut(tAuth);
    } finally { await deleteApp(tmp); }
  };

  api.updateUser = (uid, patch) => F.updateDoc(F.doc(db, "users", uid), patch);

  api.changePassword = async (oldP, newP) => {
    const u = auth.currentUser;
    await A.reauthenticateWithCredential(u, A.EmailAuthProvider.credential(u.email, oldP));
    await A.updatePassword(u, newP);
  };

  return api;
}

/* ======================= وضع تجريبي ======================= */
function demoApi() {
  const L = {
    get(k, d) { try { return JSON.parse(localStorage.getItem("demo:" + k)) ?? d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("demo:" + k, JSON.stringify(v)); } catch (e) {} },
  };
  const listeners = new Set();
  const emit = () => listeners.forEach(f => f());
  const api = { mode: "demo", profile: null };
  let authCb = () => {};

  const users = () => L.get("users", {});
  const loadProfile = uid => { const u = users()[uid]; return u ? { uid, ...u } : null; };

  api.setupDone = async () => !!L.get("setup", null);
  api.onAuth = cb => { authCb = cb; const uid = L.get("session", null); api.profile = uid ? loadProfile(uid) : null; setTimeout(() => cb(api.profile), 0); return () => {}; };
  api.signIn = async (u, p) => {
    const all = users(); const uid = Object.keys(all).find(k => all[k].username === u.trim().toLowerCase());
    if (!uid || all[uid].pw !== p) { const e = new Error("bad"); e.code = "auth/invalid-credential"; throw e; }
    L.set("session", uid); api.profile = loadProfile(uid); authCb(api.profile);
  };
  api.signOut = async () => { L.set("session", null); api.profile = null; authCb(null); };
  api.setupOwner = async (name, u, p) => {
    const uid = "u" + Date.now();
    const all = users(); all[uid] = { name, username: u.trim().toLowerCase(), role: "admin", active: true, pw: p }; L.set("users", all);
    L.set("setup", { ownerUid: uid }); L.set("session", uid); api.profile = loadProfile(uid); authCb(api.profile);
    return api.profile;
  };
  const watch = (fn) => { listeners.add(fn); setTimeout(fn, 0); return () => listeners.delete(fn); };
  api.watchShift = (key, cb) => watch(() => cb(L.get("shift:" + key, null)));
  api.patchShift = async (key, patch) => {
    const cur = L.get("shift:" + key, {}) || {};
    L.set("shift:" + key, deepMerge(cur, patch));
    const idx = L.get("shiftIndex", []); if (!idx.includes(key)) { idx.push(key); L.set("shiftIndex", idx); }
    emit();
  };
  api.watchHistory = cb => watch(() => cb(L.get("shiftIndex", []).map(k => L.get("shift:" + k, null)).filter(Boolean).sort((a, b) => (b.date + b.shift).localeCompare(a.date + a.shift))));
  api.watchUsers = cb => watch(() => { const all = users(); cb(Object.keys(all).map(uid => ({ uid, ...all[uid], pw: undefined }))); });
  api.createUser = async (name, u, p, role) => {
    const all = users(); const un = u.trim().toLowerCase();
    if (Object.values(all).some(x => x.username === un)) { const e = new Error("exists"); e.code = "auth/email-already-in-use"; throw e; }
    all["u" + Date.now()] = { name, username: un, role, active: true, pw: p }; L.set("users", all); emit();
  };
  api.updateUser = async (uid, patch) => { const all = users(); all[uid] = { ...all[uid], ...patch }; L.set("users", all); emit(); };
  api.changePassword = async (oldP, newP) => {
    const all = users(); const me = all[api.profile.uid];
    if (me.pw !== oldP) { const e = new Error("bad"); e.code = "auth/invalid-credential"; throw e; }
    me.pw = newP; L.set("users", all);
  };
  return api;
}

function deepMerge(a, b) {
  const out = { ...(a || {}) };
  for (const k in b) {
    const v = b[k];
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? deepMerge(out[k], v) : v;
  }
  return out;
}
