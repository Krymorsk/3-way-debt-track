// auth.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { firebaseConfig } from "./firebase.js";

let app = null;
let auth = null;

function ensureFirebase() {
  if (!app) app = initializeApp(firebaseConfig);
  if (!auth) auth = getAuth(app);
  return auth;
}

export function getAuthInstance() {
  return ensureFirebase();
}

export function waitForAuth() {
  const authRef = ensureFirebase();
  return new Promise((resolve) => {
    onAuthStateChanged(authRef, (user) => resolve(user));
  });
}

export async function loginWithEmail(email, password) {
  const authRef = ensureFirebase();
  return signInWithEmailAndPassword(authRef, email, password);
}

export async function logoutUser() {
  const authRef = ensureFirebase();
  return signOut(authRef);
}

export async function requireAuth(redirectTo = "./login.html") {
  const user = await waitForAuth();
  if (!user) {
    window.location.href = redirectTo;
    return null;
  }
  return user;
}

export function mapUsernameToEmail(value) {
  const cleaned = String(value || "").trim().toLowerCase();

  const map = {
    arish: "arish@splitwise.local",
    ayman: "ayman@splitwise.local",
    vishist: "vishist@splitwise.local"
  };

  if (cleaned.includes("@")) return cleaned;
  return map[cleaned] || cleaned;
}
