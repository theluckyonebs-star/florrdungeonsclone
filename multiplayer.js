/* ══════════════════════════════════════════════════════════════════════════════════════
   MULTIPLAYER  ·  Firebase-backed accounts, cloud saves, and live player presence.

   Loaded as an ES module (Firebase's web SDK is module-only). It initializes Firebase, then
   exposes a small `window.MP` API that index.html's main (classic) script calls into — the
   game code never imports Firebase directly. When init finishes it fires a `mp-ready` event.

   Data model in the Realtime Database:
     users/<uid>/profile/username   → the player's chosen display name
     users/<uid>/save               → their persistent progress (level, petals, essence, …).
                                       NEVER deleted on disconnect — this is what makes progress
                                       survive leaving/closing the game.
     players/<uid>                   → live presence (position, petals, health). Ephemeral:
                                       auto-removed the moment the tab closes (onDisconnect),
                                       so other players stop seeing a ghost, but the save stays.
   ══════════════════════════════════════════════════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getDatabase, ref, set, get, onValue, onDisconnect, remove, push, update,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

/* ── your Firebase project config ────────────────────────────────────────────────────────
   Safe to commit: Firebase web config is public by design — access is controlled by the
   database security rules, not by keeping these values secret.
   IMPORTANT: `databaseURL` is NOT in the snippet Firebase shows when you register the web app.
   It's the URL printed at the top of the Realtime Database page in the console. If yours is in
   a non-US region it looks like https://<id>-default-rtdb.<region>.firebasedatabase.app —
   replace the value below to match exactly, or presence/saves won't connect. */
const firebaseConfig = {
  apiKey: "AIzaSyC5JP56N6KS45s7tm8MDJygyIr3n7g7u0M",
  authDomain: "florrclone.firebaseapp.com",
  databaseURL: "https://florrclone-default-rtdb.firebaseio.com",
  projectId: "florrclone",
  storageBucket: "florrclone.firebasestorage.app",
  messagingSenderId: "390794435046",
  appId: "1:390794435046:web:3ea2f2fdcfca7fb4da5e27",
};

// players type a plain username; we map it onto a fake-but-valid email so we can lean on
// Firebase's built-in email/password auth. Players never see or type the email form.
const USERNAME_DOMAIN = "@florrclone.local";
const emailFor = (username) => username.trim().toLowerCase() + USERNAME_DOMAIN;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// keep the login across reloads (auto-resume) — no token handling of our own needed
setPersistence(auth, browserLocalPersistence).catch(() => {});

let uid = null;
let username = null;
let presenceTimer = null;
let presenceRef = null;

function stopPresence() {
  if (presenceTimer) { clearInterval(presenceTimer); presenceTimer = null; }
  if (presenceRef) { try { remove(presenceRef); } catch (e) {} presenceRef = null; }
}
// best-effort clear on tab close; onDisconnect() below is the real server-side guarantee
window.addEventListener('beforeunload', stopPresence);

const MP = {
  ready: true,
  get uid() { return uid; },
  get username() { return username; },

  // cb(user|null) fires on login, logout, and once on page load (auto-resume)
  onAuth(cb) {
    onAuthStateChanged(auth, (user) => {
      uid = user ? user.uid : null;
      if (!user) { stopPresence(); username = null; }
      cb(user);
    });
  },

  async signup(name, password) {
    const cred = await createUserWithEmailAndPassword(auth, emailFor(name), password);
    uid = cred.user.uid; username = name.trim();
    await set(ref(db, `users/${uid}/profile/username`), username);
    return cred.user;
  },
  async login(name, password) {
    const cred = await signInWithEmailAndPassword(auth, emailFor(name), password);
    uid = cred.user.uid; username = name.trim();
    return cred.user;
  },
  async logout() {
    stopPresence();
    await signOut(auth);
    uid = null; username = null;
  },

  // on a fresh reload the module doesn't know the display name yet — recover it from the DB
  async loadProfileUsername() {
    if (!uid) return null;
    const snap = await get(ref(db, `users/${uid}/profile/username`));
    if (snap.exists()) { username = snap.val(); return username; }
    return null;
  },

  async loadSave() {
    if (!uid) return null;
    const snap = await get(ref(db, `users/${uid}/save`));
    return snap.exists() ? snap.val() : null;
  },
  saveProgress(payload) {
    if (!uid) return;
    set(ref(db, `users/${uid}/save`), payload).catch(() => {});
  },

  // begin broadcasting our own live state ~hz times/sec, and register an auto-remove so our
  // presence node disappears the instant the tab closes (getState() returns the blob to send)
  startPresence(getState, hz = 9) {
    if (!uid) return;
    stopPresence();
    presenceRef = ref(db, `players/${uid}`);
    onDisconnect(presenceRef).remove().catch(() => {});
    presenceTimer = setInterval(() => {
      const s = getState();
      if (s) set(presenceRef, s).catch(() => {});
    }, 1000 / hz);
  },

  // subscribe to everyone's presence; cb(others, allUids) — `others` excludes self (for
  // rendering), `allUids` includes everyone (for host election)
  subscribePlayers(cb) {
    onValue(ref(db, 'players'), (snap) => {
      const all = snap.val() || {};
      const others = {};
      for (const k in all) { if (k !== uid) others[k] = all[k]; }
      cb(others, Object.keys(all));
    });
  },

  /* ── shared world (host-authoritative mobs) ──────────────────────────────────────────────
     One player (chosen by the game as the lowest uid online) is the "host". It simulates the
     mobs and publishes them here; everyone else mirrors them. Non-hosts report their petal
     hits, which the host applies; the host announces deaths, which everyone reacts to. */

  // host overwrites the whole active-mob set each tick (near-player mobs only — see index.html's
  // publishWorldMobs — this is the real-time one, kept small/fast for the ~7x/sec cadence)
  publishMobs(obj) { if (!uid) return; set(ref(db, 'world/mobs'), obj).catch(() => {}); },
  subscribeMobs(cb) { onValue(ref(db, 'world/mobs'), (s) => cb(s.val() || {})); },
  // best-effort: if the host vanishes, its published mob set is left for the next host to adopt
  // (a fresh lone host reseeds instead, so the world still recovers)

  // the FULL mob roster (every mob, not just near-player ones), written on a slow cadence purely
  // so the world survives having zero players online. A fresh host with nothing already
  // mirrored loads this before falling back to reseeding from scratch.
  saveWorldSnapshot(obj) { if (!uid) return; set(ref(db, 'world/snapshot'), obj).catch(() => {}); },
  async loadWorldSnapshot() {
    const snap = await get(ref(db, 'world/snapshot'));
    return snap.exists() ? snap.val() : null;
  },

  // non-host → host: "my petal hit mob <id> for <dmg>"
  sendHit(mobId, dmg) { if (!uid) return; push(ref(db, 'world/hits'), { m: mobId, d: dmg, from: uid }).catch(() => {}); },
  subscribeHits(cb) { onValue(ref(db, 'world/hits'), (s) => cb(s.val() || {})); },
  clearHits(keys) {
    if (!keys || !keys.length) return;
    const u = {}; for (const k of keys) u['world/hits/' + k] = null;
    update(ref(db), u).catch(() => {});
  },

  // host → everyone: "mob <id> died" (auto-expires so the list can't grow forever)
  publishDeath(id, info) {
    set(ref(db, 'world/deaths/' + id), info).catch(() => {});
    setTimeout(() => remove(ref(db, 'world/deaths/' + id)).catch(() => {}), 4000);
  },
  subscribeDeaths(cb) { onValue(ref(db, 'world/deaths'), (s) => cb(s.val() || {})); },
};

window.MP = MP;
window.dispatchEvent(new Event('mp-ready'));
