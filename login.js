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
// Profile Selection
// --------------------

document.querySelectorAll(".profile").forEach(card => {

    card.addEventListener("click", () => {

        selectedUser = card.dataset.user;

        selectedName.textContent =
            selectedUser.charAt(0).toUpperCase() +
            selectedUser.slice(1);

        selectedAvatar.textContent =
            selectedUser.charAt(0).toUpperCase();

        selectedAvatar.className =
            `avatar ${selectedUser}`;

        profiles.classList.add("hidden");

        loginPanel.classList.remove("hidden");

        passwordEl.value = "";

        errorMessage.textContent = "";

        passwordEl.focus();

    });

});

// --------------------
// Back
// --------------------

backBtn.addEventListener("click", () => {

    selectedUser = "";

    passwordEl.value = "";

    errorMessage.textContent = "";

    loginPanel.classList.add("hidden");

    profiles.classList.remove("hidden");

});

// --------------------
// Login
// --------------------

async function login() {

    if (!selectedUser) {

        errorMessage.textContent =
            "Please choose a profile.";

        return;

    }

    if (!passwordEl.value.trim()) {

        errorMessage.textContent =
            "Please enter your password.";

        passwordEl.focus();

        return;

    }

    if (!auth) {

        errorMessage.textContent =
            "Firebase not configured.";

        return;

    }

    setLoading(true);

    try {

        await setPersistence(
            auth,
            browserLocalPersistence
        );

        await signInWithEmailAndPassword(

            auth,

            USER_MAP[selectedUser],

            passwordEl.value

        );

        window.location.href =
            "./dashboard.html";

    }

    catch (err) {

        console.error(err);

        switch (err.code) {

            case "auth/wrong-password":
                errorMessage.textContent =
                    "Wrong password.";
                break;

            case "auth/user-not-found":
                errorMessage.textContent =
                    "Account not found.";
                break;

            case "auth/invalid-credential":
                errorMessage.textContent =
                    "Invalid credentials.";
                break;

            default:
                errorMessage.textContent =
                    "Unable to sign in.";
        }

    }

    finally {

        setLoading(false);

    }

}

// --------------------

loginBtn.addEventListener("click", login);

passwordEl.addEventListener("keydown", e => {

    if (e.key === "Enter") {

        login();

    }

});

// --------------------
// Init Firebase
// --------------------

if (isRealConfig(firebaseConfig)) {

    const app = initializeApp(firebaseConfig);

    auth = getAuth(app);

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

}
