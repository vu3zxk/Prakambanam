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

const provider = new GoogleAuthProvider();

// signInWithRedirect (not a popup) — mobile Safari blocks popups often
// enough that redirect is the only reliable choice across iPhone + Android.
export function signIn() {
  return signInWithRedirect(auth, provider);
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
  getRedirectResult(auth).catch(function (err) {
    console.error('Redirect sign-in error:', err);
  });
  onAuthStateChanged(auth, async function (user) {
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
