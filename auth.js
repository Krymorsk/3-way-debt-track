import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { firebaseConfig } from "./firebase.js";

let app = null;
let auth = null;

function isRealConfig(cfg) {
  return cfg &&
    typeof cfg === "object" &&
    String(cfg.apiKey || "").trim() &&
    !String(cfg.apiKey).includes("YOUR_") &&
    !String(cfg.projectId || "").includes("YOUR_");
}

function ensureAuth() {
  if (!isRealConfig(firebaseConfig)) {
    throw new Error("Firebase config is missing or still contains placeholders.");
  }

  if (!app) app = initializeApp(firebaseConfig);
  if (!auth) auth = getAuth(app);
  return auth;
}

export function getAuthInstance() {
  return ensureAuth();
}

export function waitForAuth() {
  const authRef = ensureAuth();
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(authRef, (user) => {
      unsubscribe?.();
      resolve(user || null);
    });
  });
}

export async function loginWithEmail(email, password) {
  const authRef = ensureAuth();
  return signInWithEmailAndPassword(authRef, email, password);
}

export async function logoutUser() {
  const authRef = ensureAuth();
  return signOut(authRef);
}

export async function requireAuth(redirectTo = "./index.html") {
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
