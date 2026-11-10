# AirCanvas

A free, lightweight, browser-based app that lets you draw in the air using your webcam.

Pinch your thumb and index finger together to draw. Open your fingers to stop.

## Tech

- Frontend: React + TypeScript + Vite
- Hand tracking: MediaPipe Tasks Vision (runs in the browser)
- Backend: Python + FastAPI

## Folder layout

```
AirCanvas/
  backend/    FastAPI server (main.py, requirements.txt)
  frontend/   React app (Vite)
    src/App.tsx            page and backend status
    src/DrawingStage.tsx   camera, drawing, clear and save
    src/handTracker.ts     loads the MediaPipe hand model
```

## Requirements

- Python 3.10 or newer
- Node.js 18 or newer (LTS)
- A webcam and an internet connection (the hand model loads from a CDN on first use)

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

Open http://localhost:5173, click **Start camera**, and allow camera access.

## How the two connect

Vite forwards any request starting with `/api` to the backend on port 8000 (see `frontend/vite.config.ts`).
The drawing itself runs fully in your browser. Your camera video is not uploaded anywhere.

## Shortcuts

- `C` clears the drawing
- `S` saves it as a PNG

## Troubleshooting

- **Camera is blocked:** allow camera access for localhost in your browser's site settings, then click Start camera again.
- **Stuck on loading:** the hand model downloads on first use, so check your internet connection.
- **"Backend not reachable":** start the FastAPI server in the `backend` folder, then click Check again.
- **Drawing is hard to trigger:** change `PINCH_RATIO` in `frontend/src/DrawingStage.tsx`.
