import { useEffect, useRef, useState } from "react";
import { DrawingUtils, HandLandmarker } from "@mediapipe/tasks-vision";
import { createHandTracker } from "./handTracker";
import { CameraIcon, DownloadIcon, StopIcon, TrashIcon, UndoIcon } from "./icons";

type Point = { x: number; y: number };
type Phase = "idle" | "loading" | "running" | "error";
type Stroke = { color: string; width: number; points: Point[] };
type Crop = { vw: number; vh: number; cw: number; ch: number; offX: number; offY: number };

const THUMB_TIP = 4;
const INDEX_TIP = 8;
const WRIST = 0;
const MIDDLE_KNUCKLE = 9;

// Pinching thumb and index finger together draws.
const PINCH_RATIO = 0.3;
const SMOOTHING = 0.5;
const COLORS = [
  { name: "Cyan", value: "#00e5ff" },
  { name: "White", value: "#ffffff" },
  { name: "Coral", value: "#ff5a4d" },
  { name: "Lime", value: "#c8ff3d" },
];
const PEN_WIDTH = 6;

// A fist: every fingertip is pulled in closer to the wrist than its knuckle.
const FINGERS = [
  [8, 5],
  [12, 9],
  [16, 13],
  [20, 17],
];
const PALM = [0, 5, 9, 13, 17];
const RATIOS = [
  { label: "4:3", value: 4 / 3 },
  { label: "16:9", value: 16 / 9 },
  { label: "2:1", value: 2 },
  { label: "Cinemascope", value: 2.39 },
];
const FOLD_LIMIT = 1;
const ERASER_SIZE = 0.7;

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function drawSegment(ctx: CanvasRenderingContext2D, stroke: Stroke, from: Point, to: Point) {
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  for (let i = 1; i < stroke.points.length; i++) {
    drawSegment(ctx, stroke, stroke.points[i - 1], stroke.points[i]);
  }
}

export default function DrawingStage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const showSkeletonRef = useRef(true);
  const cursorRef = useRef<HTMLDivElement>(null);
  const eraserRef = useRef<HTMLDivElement>(null);
  const cropRef = useRef<Crop | null>(null);
  const ratioRef = useRef(RATIOS[0].value);
  const trackerRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef(0);
  const strokesRef = useRef<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);
  const colorRef = useRef(COLORS[0].value);
  const widthRef = useRef(PEN_WIDTH);
  const withCameraRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [ratio, setRatio] = useState(RATIOS[0].value);
  const [drawing, setDrawing] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [handVisible, setHandVisible] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [color, setColor] = useState(COLORS[0].value);
  const [width, setWidth] = useState(PEN_WIDTH);
  const [withCamera, setWithCamera] = useState(false);

  // The canvas covers a centered crop of the camera frame. Strokes are stored in
  // full-frame pixels, so changing the ratio keeps them attached to the video.
  function applyCrop(value: number) {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!video || !canvas || !overlay || !video.videoWidth) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    let cw = vw;
    let ch = vh;
    if (value > vw / vh) ch = Math.round(vw / value);
    else cw = Math.round(vh * value);
    const offX = Math.round((vw - cw) / 2);
    const offY = Math.round((vh - ch) / 2);
    cropRef.current = { vw, vh, cw, ch, offX, offY };
    canvas.width = cw;
    canvas.height = ch;
    overlay.width = cw;
    overlay.height = ch;
    canvas.getContext("2d")!.setTransform(1, 0, 0, 1, -offX, -offY);
    redraw();
  }

  function pickRatio(value: number) {
    setRatio(value);
    ratioRef.current = value;
    applyCrop(value);
  }

  async function start() {
    setPhase("loading");
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      applyCrop(ratioRef.current);

      if (!trackerRef.current) {
        trackerRef.current = await createHandTracker();
      }

      setPhase("running");
      loop();
    } catch (err) {
      stop();
      setError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Camera access was blocked. Allow the camera in your browser and try again."
          : "Could not start the camera or load hand tracking. Check your internet connection and try again."
      );
      setPhase("error");
    }
  }

  function stop() {
    cancelAnimationFrame(frameRef.current);
    endStroke();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (cursorRef.current) cursorRef.current.style.display = "none";
    if (eraserRef.current) eraserRef.current.style.display = "none";
    setErasing(false);
    const overlay = overlayRef.current;
    overlay?.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height);
    setDrawing(false);
    setHandVisible(false);
    setPhase("idle");
  }

  function loop() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const cursor = cursorRef.current;
    const tracker = trackerRef.current;
    if (!video || !canvas || !cursor || !tracker) return;

    const eraser = eraserRef.current!;
    const overlay = overlayRef.current!;
    const overlayCtx = overlay.getContext("2d")!;
    const utils = new DrawingUtils(overlayCtx);

    const ctx = canvas.getContext("2d")!;

    let lastTime = -1;
    let lastPoint: Point | null = null;
    let smooth: Point | null = null;
    let wasDrawing = false;
    let wasVisible = false;
    let wasErasing = false;

    const tick = () => {
      frameRef.current = requestAnimationFrame(tick);
      if (video.readyState < 2 || video.currentTime === lastTime) return;
      lastTime = video.currentTime;
      const crop = cropRef.current;
      if (!crop) return;

      const hand = tracker.detectForVideo(video, performance.now()).landmarks[0];

      overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

      if (!hand) {
        if (wasVisible) {
          wasVisible = false;
          setHandVisible(false);
        }
        cursor.style.display = "none";
        eraser.style.display = "none";
        if (wasErasing) {
          wasErasing = false;
          setErasing(false);
        }
        endStroke();
        lastPoint = null;
        smooth = null;
        if (wasDrawing) {
          wasDrawing = false;
          setDrawing(false);
        }
        return;
      }

      if (!wasVisible) {
        wasVisible = true;
        setHandVisible(true);
      }

      if (showSkeletonRef.current) {
        const shown = hand.map((l) => ({
          ...l,
          x: (l.x * crop.vw - crop.offX) / crop.cw,
          y: (l.y * crop.vh - crop.offY) / crop.ch,
        }));
        utils.drawConnectors(shown, HandLandmarker.HAND_CONNECTIONS, {
          color: "#ffffff",
          lineWidth: 2,
        });
        utils.drawLandmarks(shown, {
          color: "#000000",
          fillColor: "#ffffff",
          lineWidth: 1,
          radius: 4,
        });
      }

      const thumb = hand[THUMB_TIP];
      const index = hand[INDEX_TIP];
      const handSize = distance(hand[WRIST], hand[MIDDLE_KNUCKLE]);
      const fist = FINGERS.every(
        ([tip, knuckle]) =>
          distance(hand[tip], hand[WRIST]) < distance(hand[knuckle], hand[WRIST]) * FOLD_LIMIT
      );
      const pinching = !fist && distance(thumb, index) / handSize < PINCH_RATIO;

      const raw = {
        x: ((thumb.x + index.x) / 2) * crop.vw,
        y: ((thumb.y + index.y) / 2) * crop.vh,
      };
      smooth = smooth
        ? {
            x: smooth.x + (raw.x - smooth.x) * SMOOTHING,
            y: smooth.y + (raw.y - smooth.y) * SMOOTHING,
          }
        : raw;

      // The camera view is mirrored, so the cursor is flipped to match.
      cursor.style.display = fist ? "none" : "block";
      cursor.style.left = `${(1 - (smooth.x - crop.offX) / crop.cw) * 100}%`;
      cursor.style.top = `${((smooth.y - crop.offY) / crop.ch) * 100}%`;
      cursor.classList.toggle("cursor-down", pinching);

      if (pinching) {
        let stroke = currentRef.current;
        if (!stroke) {
          stroke = { color: colorRef.current, width: widthRef.current, points: [] };
          currentRef.current = stroke;
          lastPoint = null;
        }
        if (lastPoint) drawSegment(ctx, stroke, lastPoint, smooth);
        stroke.points.push({ ...smooth });
        lastPoint = { ...smooth };
      } else {
        endStroke();
        lastPoint = null;
      }

      if (fist) {
        const palmX = (PALM.reduce((sum, i) => sum + hand[i].x, 0) / PALM.length) * crop.vw;
        const palmY = (PALM.reduce((sum, i) => sum + hand[i].y, 0) / PALM.length) * crop.vh;
        const radius = handSize * crop.vw * ERASER_SIZE;
        eraseAt(palmX, palmY, radius);
        eraser.style.display = "block";
        eraser.style.left = `${(1 - (palmX - crop.offX) / crop.cw) * 100}%`;
        eraser.style.top = `${((palmY - crop.offY) / crop.ch) * 100}%`;
        eraser.style.width = `${((radius * 2) / crop.cw) * 100}%`;
      } else {
        eraser.style.display = "none";
      }

      if (fist !== wasErasing) {
        wasErasing = fist;
        setErasing(fist);
      }

      if (pinching !== wasDrawing) {
        wasDrawing = pinching;
        setDrawing(pinching);
      }
    };

    tick();
  }

  function endStroke() {
    const stroke = currentRef.current;
    if (stroke && stroke.points.length > 1) strokesRef.current.push(stroke);
    currentRef.current = null;
  }

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    strokesRef.current.forEach((s) => drawStroke(ctx, s));
  }

  function pickColor(value: string) {
    setColor(value);
    colorRef.current = value;
  }

  function eraseAt(x: number, y: number, radius: number) {
    const kept: Stroke[] = [];
    let changed = false;
    for (const stroke of strokesRef.current) {
      let piece: Point[] = [];
      for (const p of stroke.points) {
        if (Math.hypot(p.x - x, p.y - y) < radius) {
          changed = true;
          if (piece.length > 1) kept.push({ ...stroke, points: piece });
          piece = [];
        } else {
          piece.push(p);
        }
      }
      if (piece.length > 1) kept.push({ ...stroke, points: piece });
    }
    if (changed) {
      strokesRef.current = kept;
      redraw();
    }
  }

  function undo() {
    endStroke();
    strokesRef.current.pop();
    redraw();
  }

  function clear() {
    endStroke();
    strokesRef.current = [];
    redraw();
  }

  function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, out.width, out.height);
    // Flip so the saved image matches what you saw on screen.
    ctx.translate(out.width, 0);
    ctx.scale(-1, 1);
    const video = videoRef.current;
    const crop = cropRef.current;
    if (withCameraRef.current && video && video.videoWidth && crop) {
      ctx.drawImage(video, crop.offX, crop.offY, crop.cw, crop.ch, 0, 0, out.width, out.height);
    }
    ctx.drawImage(canvas, 0, 0);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const link = document.createElement("a");
    link.download = `aircanvas-${stamp}.png`;
    link.href = out.toDataURL("image/png");
    link.click();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "z") undo();
      if (e.key === "c") clear();
      if (e.key === "s") save();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      trackerRef.current?.close();
    };
  }, []);

  const running = phase === "running";
  const isCustom = !COLORS.some((c) => c.value === color);

  return (
    <section>
      <div className="stage-bar">
        <div className="segmented" role="group" aria-label="Camera aspect ratio">
          {RATIOS.map((r) => (
            <button
              key={r.label}
              type="button"
              aria-pressed={ratio === r.value}
              onClick={() => pickRatio(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="stage" style={{ aspectRatio: `${ratio}` }}>
        <video ref={videoRef} className="stage-layer stage-video" playsInline muted />
        <canvas ref={canvasRef} className="stage-layer stage-canvas" />
        <canvas ref={overlayRef} className="stage-layer" />
        <div ref={cursorRef} className="cursor" />
        <div ref={eraserRef} className="eraser" />
        {phase !== "running" && (
          <div className="stage-message">
            {phase === "loading"
              ? "Starting camera and loading hand tracking..."
              : phase === "error"
              ? error
              : "Turn on your camera to start drawing."}
          </div>
        )}
      </div>

      <div className="toolbar">
        {running ? (
          <button className="button" onClick={stop}>
            <StopIcon />
            Stop camera
          </button>
        ) : (
          <button
            className="button button-solid"
            onClick={start}
            disabled={phase === "loading"}
          >
            <CameraIcon />
            Start camera
          </button>
        )}
        <span className="divider" />
        <button className="button" onClick={undo}>
          <UndoIcon />
          Undo
          <kbd>Z</kbd>
        </button>
        <button className="button" onClick={clear}>
          <TrashIcon />
          Clear
          <kbd>C</kbd>
        </button>
        <button className="button" onClick={save}>
          <DownloadIcon />
          Save
          <kbd>S</kbd>
        </button>
        {running && (
          <span className="hint">
            {!handVisible
              ? "Show your hand to the camera."
              : erasing
              ? "Erasing. Open your hand to stop."
              : drawing
              ? "Drawing"
              : "Pinch to draw. Make a fist to erase."}
          </span>
        )}
      </div>

      <div className="toolbar">
        <div className="swatches" role="group" aria-label="Pen color">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`swatch${color === c.value ? " swatch-on" : ""}`}
              style={{ background: c.value }}
              aria-label={c.name}
              aria-pressed={color === c.value}
              onClick={() => pickColor(c.value)}
            />
          ))}
          <label
            className={`swatch swatch-custom${isCustom ? " swatch-on" : ""}`}
            style={isCustom ? { background: color } : undefined}
            title="Custom color"
          >
            <input
              type="color"
              value={color}
              aria-label="Custom color"
              onChange={(e) => pickColor(e.target.value)}
            />
          </label>
        </div>
        <label className="size">
          Size
          <span className="pen-slot">
            <span className="pen-preview" style={{ width, height: width, background: color }} />
          </span>
          <input
            type="range"
            min={2}
            max={16}
            value={width}
            onChange={(e) => {
              const next = Number(e.target.value);
              setWidth(next);
              widthRef.current = next;
            }}
          />
          <output className="size-value">{width}</output>
        </label>
        <span className="divider" />
        <label className="switch">
          <input
            type="checkbox"
            role="switch"
            checked={showSkeleton}
            onChange={(e) => {
              setShowSkeleton(e.target.checked);
              showSkeletonRef.current = e.target.checked;
            }}
          />
          Hand tracking view
        </label>
        <label className="switch">
          <input
            type="checkbox"
            role="switch"
            checked={withCamera}
            onChange={(e) => {
              setWithCamera(e.target.checked);
              withCameraRef.current = e.target.checked;
            }}
          />
          Save with camera
        </label>
      </div>
    </section>
  );
}
