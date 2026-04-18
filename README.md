# Payments App

This project has:

- a React frontend in `frontend/`
- a Flask API in `backend/`
- a storage layer that can run either on local JSON files or Firebase Firestore

## Local run

1. Create a Python environment and install `backend/requirements.txt`.
2. Install the frontend packages from `frontend/package.json`.
3. Start the Flask API from `backend/app.py`.
4. Start Vite from `frontend/` with `npm run dev`.

The frontend proxies `/api/*` requests to `http://127.0.0.1:5000` in development.
If port `5000` is busy on your machine, start Flask on another port and set `VITE_API_PROXY_TARGET` before running Vite.

## Firebase

Copy [backend/.env.example](/Users/hemraj/Downloads/PAYMENTS%20-%20Copy/backend/.env.example) to `backend/.env` or project `.env`, then set:

- `PAYMENTS_STORAGE_BACKEND=firestore`
- `FIREBASE_NAMESPACE` to the collection namespace you want
- one Firebase credential source:
  - `FIREBASE_SERVICE_ACCOUNT_PATH`
  - `FIREBASE_SERVICE_ACCOUNT_JSON`
  - or `GOOGLE_APPLICATION_CREDENTIALS`

When Firestore is enabled, the backend seeds Firebase from the existing local JSON files if the Firebase collections are empty.

## Railway Deploy

This repo includes a `Dockerfile` that:

- builds the React frontend
- installs the Flask backend
- serves both from a single Railway service

Set these Railway environment variables:

- `PAYMENTS_STORAGE_BACKEND=firestore`
- `ADMIN_USER=...`
- `ADMIN_PASS=...`
- `FIREBASE_NAMESPACE=event-booking`
- `FIREBASE_SERVICE_ACCOUNT_JSON=...`

For Railway, prefer `FIREBASE_SERVICE_ACCOUNT_JSON` instead of a local file path because the server will run remotely.
