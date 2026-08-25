// shared/auth.js
//
// Central Firebase Auth + user-profile helper for every Prakambanam page.
// Import the pieces you need — e.g.
//   import { onAuth, signIn, signOutUser, getProfile, saveProfile,
//            getDisplayName, setDisplayName, db, auth } from "../shared/auth.js";
//
// Firebase Auth sessions persist automatically across pages on the same
// origin (IndexedDB-backed), so a person who signs in on the home page is
// still signed in when they land on /pookkalam/ or /gallery/ — no tokens
// need to be passed around manually between pages.

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAO_QSIYU-H80s0FRM_DzS2jZ7tDNr9OnE",
  authDomain: "prakambanam-56e32.firebaseapp.com",
  projectId: "prakambanam-56e32",
  storageBucket: "prakambanam-56e32.firebasestorage.app",
  messagingSenderId: "14080913373",
  appId: "1:14080913373:web:bc0fff6b059e8adb8e1034"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// On-screen debug log -- visit any page with ?debug=1 in the URL (e.g.
// https://vu3zxk.github.io/Prakambanam/?debug=1) to get a small black
// readout at the bottom of the screen showing exactly what the auth flow
// is doing. This exists because on a phone there's no easy way to see the
// browser console, so when sign-in silently does nothing we've had no way
// to see why. Screenshot the panel after trying to sign in and that tells
// us precisely where it's failing.
const DEBUG = /[?&]debug=1(?:&|$)/.test(location.search);
let debugPanel = null;
function debugLog(msg) {
  console.log('[auth]', msg);
  if (!DEBUG) return;
  if (!debugPanel) {
    debugPanel = document.createElement('div');
    debugPanel.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:45vh;overflow:auto;' +
      'background:rgba(0,0,0,0.9);color:#7CFC7C;font:11px/1.5 monospace;padding:8px 10px;' +
      'z-index:999999;white-space:pre-wrap;word-break:break-all;';
    var title = document.createElement('div');
    title.textContent = '--- auth debug (?debug=1) ---';
    title.style.cssText = 'color:#fff;font-weight:bold;margin-bottom:4px;';
    debugPanel.appendChild(title);
    (document.body || document.documentElement).appendChild(debugPanel);
  }
  const line = document.createElement('div');
  const t = new Date();
  const ts = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') + ':' + String(t.getSeconds()).padStart(2, '0');
  line.textContent = ts + '  ' + msg;
  debugPanel.appendChild(line);
}
if (DEBUG) debugLog('page loaded: ' + location.href);

const provider = new GoogleAuthProvider();

// Google blocks its OAuth screen entirely inside "in-app browsers" (the
// mini-browser WhatsApp / Instagram / Facebook / etc. open when someone
// taps a link inside those apps) — the redirect goes out but Google just
// shows a blank "disallowed_useragent" page and never comes back, which is
// exactly the "just says Redirecting..., nothing happens" symptom. Since
// most people will be opening this from a WhatsApp group link, detect that
// case up front so we can tell them to open in a real browser instead of
// silently hanging.
export function isInAppBrowser() {
  var ua = navigator.userAgent || '';
  var result = /FBAN|FBAV|FB_IAB|Instagram|Line\/|WhatsApp|MicroMessenger|TikTok|Snapchat|; wv\)/i.test(ua);
  if (DEBUG) debugLog('isInAppBrowser -> ' + result + '  (UA: ' + ua + ')');
  return result;
}

// signInWithRedirect (not a popup) — mobile Safari blocks popups often
// enough that redirect is the only reliable choice across iPhone + Android.
// Always await/catch this — signInWithRedirect can reject synchronously
// (e.g. auth/unauthorized-domain, auth/operation-not-supported-in-this-environment)
// and an uncaught rejection here is exactly what left the old "Redirecting…"
// button stuck forever with no error shown to the user.
export function signIn() {
  debugLog('signIn() called, storage check: localStorage=' + storageCheck('localStorage') + ' indexedDB=' + (window.indexedDB ? 'available' : 'MISSING'));
  return signInWithRedirect(auth, provider);
}

function storageCheck(kind) {
  try {
    var s = window[kind];
    var k = '__onam_test__';
    s.setItem(k, '1');
    s.removeItem(k);
    return 'ok';
  } catch (e) {
    return 'BLOCKED (' + e.message + ')';
  }
}

// Friendlier text for the handful of sign-in failures people will actually
// hit, so a stuck/failed sign-in shows a real message instead of nothing.
export function describeAuthError(err) {
  var code = err && err.code;
  if (code === 'auth/unauthorized-domain') {
    return "This site's domain isn't authorized for sign-in yet (Firebase console → Authentication → Settings → Authorized domains).";
  }
  if (code === 'auth/operation-not-supported-in-this-environment' || code === 'auth/web-storage-unsupported') {
    return "Sign-in isn't supported in this browser. Try opening the link in Chrome or Safari.";
  }
  if (code === 'auth/network-request-failed') {
    return "Network error — check your connection and try again.";
  }
  return 'Could not sign in — please try again.';
}

export function signOutUser() {
  localStorage.removeItem('onam-display-name');
  return signOut(auth);
}

// users/{uid} — the account-level profile: real name + apartment, set once
// right after first sign-in and reused everywhere (votes, submissions,
// future games' scoreboards).
export async function getProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

export async function saveProfile(uid, data) {
  await setDoc(doc(db, 'users', uid), Object.assign({}, data, { updatedAt: Date.now() }), { merge: true });
}

// "Playing as" name — a local override so a child using a parent's signed-in
// Google account can put their own name on a pookalam or a game score
// without changing the account's stored profile name. Apartment always
// stays tied to the account, never overridden here.
export function getDisplayName(fallbackName) {
  return localStorage.getItem('onam-display-name') || fallbackName || '';
}
export function setDisplayName(name) {
  if (name && name.trim()) localStorage.setItem('onam-display-name', name.trim());
}

// Fires `callback(user, profile)` whenever auth state changes, after first
// resolving any pending Google redirect. `profile` is null if the user is
// signed in but hasn't completed the name/apartment step yet.
export function onAuth(callback) {
  debugLog('onAuth() started, calling getRedirectResult...');
  getRedirectResult(auth).then(function (result) {
    // Diagnostic: if this logs `null` right after landing back from
    // Google, the redirect itself worked (Google sent a code back) but
    // Firebase found no matching pending sign-in to complete it with --
    // typically a browser (e.g. Brave Shields, aggressive private-mode
    // storage blocking) clearing the storage Firebase needs to carry the
    // sign-in across the trip to accounts.google.com and back.
    debugLog('getRedirectResult -> ' + (result ? ('signed in as ' + result.user.email) : 'null (no pending redirect found)'));
  }).catch(function (err) {
    debugLog('getRedirectResult ERROR -> ' + (err && err.code) + ' / ' + (err && err.message));
    console.error('Redirect sign-in error:', err);
  });
  onAuthStateChanged(auth, async function (user) {
    debugLog('onAuthStateChanged -> ' + (user ? user.email : 'null'));
    if (!user) {
      callback(null, null);
      return;
    }
    let profile = null;
    try {
      profile = await getProfile(user.uid);
    } catch (err) {
      console.error('Could not load profile:', err);
    }
    callback(user, profile);
  });
}
