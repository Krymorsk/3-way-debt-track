// login.js
import {
  loginWithEmail,
  mapUsernameToEmail,
  waitForAuth
} from "./auth.js";

const form = document.getElementById("loginForm");
const username = document.getElementById("username");
const password = document.getElementById("password");
const togglePw = document.getElementById("togglePw");
const loginBtn = document.getElementById("loginBtn");
const loginBtnText = document.getElementById("loginBtnText");
const toast = document.getElementById("toast");
const toastTitle = document.getElementById("toastTitle");
const toastBody = document.getElementById("toastBody");

function showToast(title, message, kind = "info") {
  toast.className = `toast show ${kind}`;
  toastTitle.textContent = title;
  toastBody.textContent = message;
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

function setLoading(state) {
  loginBtn.disabled = state;
  loginBtn.classList.toggle("loading", state);
  loginBtnText.textContent = state ? "Unlocking..." : "Enter the dashboard";
}

togglePw.addEventListener("click", () => {
  const isHidden = password.type === "password";
  password.type = isHidden ? "text" : "password";
  togglePw.textContent = isHidden ? "🙈" : "👁️";
});

document.querySelectorAll(".preset").forEach((btn) => {
  btn.addEventListener("click", () => {
    username.value = btn.dataset.user;
    username.focus();
    showToast("Username filled", `${btn.dataset.user} selected`, "success");
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = mapUsernameToEmail(username.value);
  const pass = password.value.trim();

  if (!email || !pass) {
    showToast("Missing details", "Enter username/email and password.", "error");
    return;
  }

  try {
    setLoading(true);
    await loginWithEmail(email, pass);
    showToast("Success", "Redirecting...", "success");
    setTimeout(() => {
      window.location.href = "./index.html";
    }, 600);
  } catch (err) {
    console.error(err);
    showToast("Login failed", "Check username/password or Firebase Auth setup.", "error");
  } finally {
    setLoading(false);
  }
});

waitForAuth().then((user) => {
  if (user) {
    window.location.href = "./index.html";
  }
});
