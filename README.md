# Splitwise Trio

A premium, Firebase-backed shared expense tracker for exactly three friends:

- Arish
- Ayman
- Vishist

## Files

- `index.html` — dashboard entry point
- `app.js` — main app logic
- `firebase.js` — paste your Firebase config here
- `auth.js` — Firebase Authentication helpers
- `login.html` — anime-style login page
- `login.js` — login page interactions
- `style.css` — dashboard styling
- `README.md` — this file

## Setup

1. Paste your real Firebase config into `firebase.js`.
2. Enable **Email/Password** in Firebase Authentication.
3. Create the three user accounts for Arish, Ayman, and Vishist.
4. Deploy to GitHub Pages.
5. Open `login.html` first, or keep `index.html` as the landing page and let `app.js` redirect unauthenticated users.

## Notes

- The app uses Firestore for transactions and balances.
- The login page uses Firebase Auth and maps the three profile buttons to hidden emails.
- Keep Firestore rules locked down before using the app outside testing.
