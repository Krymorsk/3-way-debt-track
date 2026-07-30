# Splitwise Trio

A premium, mobile-first shared expense tracker for **Arish**, **Ayman**, and **Vishist**.

## Setup

1. Open `firebase.js`
2. Paste your Firebase Web App config into `firebaseConfig`
3. Create a Firestore collection named `transactions`
4. Deploy the folder to GitHub Pages

## Features

- Firestore realtime sync
- Offline cache support when available
- Add / edit / delete / undo transactions
- Expense, borrow, and repayment flows
- Automatic settlement suggestions
- Filters, search, sort, and analytics charts
- Export / import JSON backups
- Dark mode by default

## Firestore document shape

Each transaction document uses:

- amount
- description
- paidBy
- splitBetween
- transactionType
- lender
- borrower
- notes
- date
- time
- createdAt
- updatedAt
