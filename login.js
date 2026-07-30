import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { firebaseConfig } from "./firebase.js";

const USER_MAP = {
  arish: "arish@splitwise.local",
  ayman: "ayman@splitwise.local",
  vishist: "vishist@splitwise.local"
};

const form = document.getElementById("loginForm");
const passwordEl = document.getElementById("password");
const togglePw = document.getElementById("togglePw");
const loginBtn = document.getElementById("loginBtn");
const loginBtnText = document.getElementById("loginBtnText");
const rememberMe = document.getElementById("rememberMe");
const toastEl = document.getElementById("toast");
const toastTitle = document.getElementById("toastTitle");
const toastBody = document.getElementById("toastBody");
const petalLayer = document.getElementById("petalLayer");
const shell = document.querySelector(".shell");

let auth = null;
let toastTimer = null;

function isRealConfig(cfg) {
  return cfg &&
    typeof cfg === "object" &&
    String(cfg.apiKey || "").trim() &&
    !String(cfg.apiKey).includes("YOUR_") &&
    !String(cfg.projectId || "").includes("YOUR_");
}

function toast(title, message, kind = "info") {
  toastTitle.textContent = title;
  toastBody.textContent = message;
  toastEl.className = `toast show ${kind}`;
  const icon = toastEl.querySelector(".badge-icon");
  icon.textContent = kind === "success" ? "✓" : kind === "error" ? "!" : "✦";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 3200);
}

function setLoading(loading) {
  loginBtn.disabled = loading;
  loginBtn.classList.toggle("loading", loading);
  loginBtnText.textContent = loading ? "Unlocking..." : "Enter the dashboard";
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9@._-]/g, "");
}

function mapUsernameToEmail(input) {
  const cleaned = normalizeUsername(input);
  if (cleaned.includes("@")) return cleaned;
  return USER_MAP[cleaned] || cleaned;
}

function spawnPetals() {
  const count = 18;
  for (let i = 0; i < count; i++) {
    const petal = document.createElement("span");
    petal.className = "petal";
    const left = Math.random() * 100;
    const size = 8 + Math.random() * 14;
    const delay = Math.random() * -18;
    const duration = 10 + Math.random() * 12;
    const drift = (-40 + Math.random() * 80).toFixed(0) + "px";
    petal.style.left = left + "vw";
    petal.style.width = size + "px";
    petal.style.height = (size * 0.7) + "px";
    petal.style.animationDelay = delay + "s";
    petal.style.animationDuration = duration + "s";
    petal.style.setProperty("--drift", drift);
    petal.style.opacity = (0.35 + Math.random() * 0.5).toFixed(2);
    petalLayer.appendChild(petal);
  }
}

const profileSelection=document.getElementById("profileSelection");
const backBtn=document.getElementById("backBtn");
const selectedUserName=document.getElementById("selectedUserName");
let selectedUser="";
document.querySelectorAll(".profile-card").forEach(btn=>{
 btn.addEventListener("click",()=>{
   selectedUser=btn.dataset.user;
   selectedUserName.textContent=btn.dataset.user;
   profileSelection.classList.add("hidden");
   form.classList.remove("hidden");
 });
});
backBtn?.addEventListener("click",()=>{
 form.classList.add("hidden");
 profileSelection.classList.remove("hidden");
 passwordEl.value="";
});

togglePw.addEventListener("click", () => {
  const isPassword = passwordEl.type === "password";
  passwordEl.type = isPassword ? "text" : "password";
  togglePw.textContent = isPassword ? "🙈" : "👁️";
  togglePw.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = mapUsernameToEmail(selectedUser);
  const password = passwordEl.value;

  if (!email || !password) {
    toast("Missing details","Select a profile and enter your password.","error");
    return;
  }

  if (!auth) {
    toast("Firebase not ready", "Add a real Firebase config in firebase.js.", "error");
    return;
  }

  setLoading(true);
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, email, password);
    toast("Success", "Redirecting...", "success");
    setTimeout(() => {
      window.location.href = "./dashboard.html";
    }, 700);
  } catch (err) {
    console.error(err);
    const message = err?.message?.includes("auth/user-not-found")
      ? "Account not found. Create the Firebase Auth user first."
      : err?.message?.includes("auth/wrong-password")
        ? "Wrong password. Try again."
        : err?.message?.includes("auth/invalid-email")
          ? "Use a valid profile name or email."
          : "Login failed. Check Firebase Auth and credentials.";
    toast("Login failed", message, "error");
  } finally {
    setLoading(false);
  }
});

shell?.addEventListener("mousemove", (e) => {
  const rect = shell.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width - 0.5;
  const y = (e.clientY - rect.top) / rect.height - 0.5;
  document.querySelectorAll(".hero, .card").forEach((el, index) => {
    const strength = index === 0 ? 8 : 6;
    el.style.transform = `translate3d(${x * strength}px, ${y * strength}px, 0)`;
  });
});

shell?.addEventListener("mouseleave", () => {
  document.querySelectorAll(".hero, .card").forEach((el) => {
    el.style.transform = "translate3d(0,0,0)";
  });
});

try {
  spawnPetals();
  toast("Ready", "Anime login loaded successfully.", "success");
} catch {}

if (isRealConfig(firebaseConfig)) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);

  onAuthStateChanged(auth, (user) => {
    if (user) {
      toast("Welcome back", "Redirecting to the dashboard...", "success");
      setTimeout(() => {
        window.location.href = "./dashboard.html";
      }, 500);
    }
  });
} else {
  toast("Firebase config missing", "Add your real config in firebase.js to enable login.", "error");
}
