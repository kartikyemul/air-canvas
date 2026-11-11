# AirCanvas

Draw in the air with your webcam. AirCanvas tracks your hand in the browser and turns a thumb-and-index pinch into a pen.

## Features

- Live webcam view with hand tracking drawn over it (21 points and joints), which you can switch off
- Pinch your thumb and index finger together to draw, open them to lift the pen
- Smoothed lines, a cursor that squishes when you pinch, and a hint when no hand is visible
- Clear the canvas, or save your drawing as a PNG
- Keyboard shortcuts: `C` clears, `S` saves
- Backend status check against a small FastAPI server
- Dark ash design with a serif title, frosted glass panels, softly drifting light and spring animations. Animations turn off automatically if your system asks for reduced motion

## Tech

- Frontend: React, TypeScript, Vite, plain CSS
- Hand tracking: MediaPipe Tasks Vision (runs in the browser)
- Backend: Python, FastAPI

## Project structure

```
AirCanvas/
  backend/
    main.py              FastAPI app (/, /api/health)
    requirements.txt
  frontend/
    index.html
    src/
      main.tsx           entry point, loads the stylesheets
      App.tsx            header, drawing stage, backend status
      DrawingStage.tsx   camera, tracking, drawing, clear and save
      handTracker.ts     loads the MediaPipe hand model
      index.css          palette, type and layout
      backdrop.css       drifting light and grain
      glass.css          glass surfaces
      motion.css         spring animation and reduced motion
```

## Requirements

- Python 3.10 or newer
- Node.js 18 or newer (LTS)
- A webcam and an internet connection (the hand model downloads on first use)

## Run it

Open two terminals from the project root.

**Backend** (terminal 1):

```
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Check it at http://127.0.0.1:8000/api/health. Interactive docs are at http://127.0.0.1:8000/docs.

**Frontend** (terminal 2):

```
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

## How to use

1. Click **Start camera** and allow camera access.
2. Hold your hand up so the tracking dots appear.
3. Pinch your thumb and index finger together and move to draw.
4. Press `C` to clear or `S` to save.

## How it works

- Hand tracking and drawing run entirely in your browser. Your camera video is not uploaded anywhere.
- Vite forwards any request starting with `/api` to the backend on port 8000 (see `frontend/vite.config.ts`).
- Pinch sensitivity is set by `PINCH_RATIO` in `frontend/src/DrawingStage.tsx`. Line smoothing is set by `SMOOTHING` in the same file.

## Troubleshooting

- **Camera is blocked:** allow camera access for localhost in your browser's site settings, then click Start camera again.
- **Stuck on loading:** the hand model downloads on first use, so check your internet connection.
- **"Backend not reachable":** start the FastAPI server in the `backend` folder, then click Check again.
- **Drawing is hard to trigger:** change `PINCH_RATIO` in `frontend/src/DrawingStage.tsx`.
- **`activate` is blocked in PowerShell:** run `Set-ExecutionPolicy -Scope Process Bypass`, then try again.
