// كاش للأبلكيشن علشان يفتح حتى لو النت ضعيف. غيّر VERSION مع كل تحديث.
const VERSION = "v1";
const SHELL = [
  "./", "index.html", "app.js", "data.js", "machines.js", "firebase-config.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/favicon.png",
  "images/m1.jpg",
  "images/m2.jpg",
  "images/m3.jpg",
  "images/m4.jpg",
  "images/m5.jpg",
  "images/m6.jpg",
  "images/m7.jpg",
  "images/m8.jpg",
  "images/m9.jpg",
  "images/m10.jpg",
  "images/m11.jpg",
  "images/m12.jpg",
  "images/m13.jpg",
  "images/m14.jpg",
  "images/m15.jpg",
  "images/m16.jpg",
  "images/m17.jpg",
  "images/m18.jpg",
  "images/m19.jpg",
  "images/m20.jpg",
  "images/m21.jpg",
  "images/m22.jpg",
  "images/m23.jpg",
  "images/m24.jpg",
  "images/m25.jpg",
  "images/m26.jpg",
  "images/m27.jpg",
  "images/m28.jpg",
  "images/m29.jpg",
  "images/m30.jpg",
  "images/m31.jpg",
  "images/m32.jpg",
  "images/m33.jpg",
  "images/m34.jpg",
  "images/m35.jpg"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // طلبات Firestore و Auth ما تتكاشش
  if (/googleapis\.com$/.test(url.hostname) && !url.hostname.startsWith("fonts")) return;
  const sameOrigin = url.origin === location.origin;
  const isCode = sameOrigin && (/\.(js|html|webmanifest)$/.test(url.pathname) || url.pathname.endsWith("/"));
  if (isCode) {
    // الكود: من النت الأول علشان التحديثات توصل، ولو مفيش نت من الكاش
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); return r; }).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  if (sameOrigin || url.hostname === "www.gstatic.com" || url.hostname.startsWith("fonts.")) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); return r; })));
  }
});
