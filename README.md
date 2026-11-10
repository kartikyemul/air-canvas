# AirCanvas

A free, lightweight, browser-based app that will eventually let you draw in the air using your webcam.

This is the starter project: a React homepage that talks to a FastAPI backend. Hand tracking is not added yet.

## Tech

- Frontend: React + TypeScript + Vite
- Backend: Python + FastAPI
- Later: MediaPipe Tasks Vision

## Folder layout

```
AirCanvas/
  backend/    FastAPI server (main.py, requirements.txt)
  frontend/   React app (Vite)
```

## Requirements

- Python 3.10 or newer
- Node.js 18 or newer (LTS)

## Run the backend

Open a terminal in the `backend` folder:

```
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Check it: http://127.0.0.1:8000/api/health should show `{"status":"ok","app":"AirCanvas"}`.

## Run the frontend

Open a second terminal in the `frontend` folder:

```
npm install
npm run dev
```

Open http://localhost:5173. You should see "Backend connected."

## How the two connect

Vite forwards any request starting with `/api` to the backend on port 8000 (see `frontend/vite.config.ts`).
