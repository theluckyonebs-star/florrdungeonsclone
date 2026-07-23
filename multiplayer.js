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
  getDatabase, ref, set, get, onValue, onDisconnect, remove,
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

  // subscribe to everyone's presence; cb gets a plain object of OTHER players (self excluded)
  subscribePlayers(cb) {
    onValue(ref(db, 'players'), (snap) => {
      const all = snap.val() || {};
      const others = {};
      for (const k in all) { if (k !== uid) others[k] = all[k]; }
      cb(others);
    });
  },
};

window.MP = MP;
window.dispatchEvent(new Event('mp-ready'));
