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
    arish: "arish.owais@gmail.com",
    ayman: "mohdayman000@gmail.com",
    vishist: "vishuthehero11@gmail.com"
};

const AVATAR_INITIALS = {
    arish: "AR",
    ayman: "AY",
    vishist: "VI"
};

let auth = null;

// --------------------
// Elements
// --------------------

const profiles = document.getElementById("profiles");
const loginPanel = document.getElementById("loginPanel");

const selectedName = document.getElementById("selectedName");
const selectedAvatar = document.getElementById("selectedAvatar");

const passwordEl = document.getElementById("password");

const loginBtn = document.getElementById("loginBtn");
const backBtn = document.getElementById("backBtn");

const errorMessage = document.getElementById("errorMessage");

let selectedUser = "";

// --------------------
// Firebase Check
// --------------------

function isRealConfig(cfg) {
    return cfg &&
        typeof cfg === "object" &&
        String(cfg.apiKey || "").trim() &&
        !String(cfg.apiKey).includes("YOUR_") &&
        !String(cfg.projectId || "").includes("YOUR_");
}

// --------------------
// Loading Button
// --------------------

function setLoading(loading) {

    loginBtn.disabled = loading;

    loginBtn.textContent = loading
        ? "Signing In..."
        : "Login";

}

// --------------------
// Premium Profile Animation
// --------------------

const cards = document.querySelectorAll(".profile");

cards.forEach(card => {

    card.addEventListener("click", () => {

        selectedUser = card.dataset.user;

        selectedName.textContent =
            selectedUser.charAt(0).toUpperCase() +
            selectedUser.slice(1);

        selectedAvatar.textContent =
            AVATAR_INITIALS[selectedUser] || selectedUser.charAt(0).toUpperCase();

        selectedAvatar.className =
            `avatar ${selectedUser}`;

        // Blur every other card
        cards.forEach(c => {

            if (c === card) {

                c.classList.add("active");
                c.classList.remove("fade");

            } else {

                c.classList.add("fade");
                c.classList.remove("active");

            }

        });

        passwordEl.value = "";

        errorMessage.textContent = "";

        // Wait for animation before opening login
        setTimeout(() => {

            loginPanel.classList.remove("hidden");

            requestAnimationFrame(() => {

                loginPanel.classList.add("show");

            });

            passwordEl.focus();

        }, 450);

    });

});

// --------------------
// Back
// --------------------

backBtn.addEventListener("click", () => {

    loginPanel.classList.remove("show");

    setTimeout(() => {

        loginPanel.classList.add("hidden");

        passwordEl.value = "";

        errorMessage.textContent = "";

        selectedUser = "";

        cards.forEach(card => {

            card.classList.remove("active");
            card.classList.remove("fade");

        });

    }, 400);

});

// --------------------
// Login
// --------------------

let isSubmitting = false;

async function attemptLogin() {

    if (isSubmitting) return;

    if (!selectedUser) {

        errorMessage.textContent =
            "Please choose a profile first.";

        return;

    }

    if (!auth) {

        errorMessage.textContent =
            "Firebase configuration missing.";

        return;

    }

    const email = USER_MAP[selectedUser];
    const password = passwordEl.value;

    if (!password) {

        errorMessage.textContent =
            "Please enter a password.";

        return;

    }

    isSubmitting = true;
    setLoading(true);
    errorMessage.textContent = "";

    try {

        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged (below) handles the redirect to dashboard.html

    } catch (err) {

        console.error(err);

        const code = err?.code || "";

        if (code === "auth/invalid-credential" ||
            code === "auth/wrong-password" ||
            code === "auth/user-not-found") {

            errorMessage.textContent =
                "Incorrect password. Please try again.";

        } else if (code === "auth/too-many-requests") {

            errorMessage.textContent =
                "Too many attempts. Please wait a moment and try again.";

        } else if (code === "auth/network-request-failed") {

            errorMessage.textContent =
                "Network error. Check your connection and try again.";

        } else {

            errorMessage.textContent =
                "Could not sign in. Please try again.";

        }

    } finally {

        isSubmitting = false;
        setLoading(false);

    }

}

loginBtn.addEventListener("click", attemptLogin);

passwordEl.addEventListener("keydown", e => {

    if (e.key === "Enter") {

        e.preventDefault();
        attemptLogin();

    }

});

// --------------------
// Init Firebase
// --------------------

if (isRealConfig(firebaseConfig)) {

    const app = initializeApp(firebaseConfig);

    auth = getAuth(app);

    setPersistence(auth, browserLocalPersistence).catch(err => {

        console.warn("Persistence setup failed:", err);

    });

    onAuthStateChanged(auth, user => {

        if (user) {

            window.location.href =
                "./dashboard.html";

        }

    });

}
else {

    errorMessage.textContent =
        "Firebase configuration missing.";

    loginBtn.disabled = true;

}
