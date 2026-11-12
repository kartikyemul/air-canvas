import { useEffect, useRef, useState } from "react";
import { DrawingUtils, HandLandmarker } from "@mediapipe/tasks-vision";
import { createHandTracker } from "./handTracker";

type Point = { x: number; y: number };
type Phase = "idle" | "loading" | "running" | "error";
type Stroke = { color: string; width: number; points: Point[] };

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
  const [aspect, setAspect] = useState("4 / 3");
  const [drawing, setDrawing] = useState(false);
  const [handVisible, setHandVisible] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [color, setColor] = useState(COLORS[0].value);
  const [width, setWidth] = useState(PEN_WIDTH);
  const [withCamera, setWithCamera] = useState(false);

  async function start() {
    setPhase("loading");
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      const canvas = canvasRef.current!;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const overlay = overlayRef.current!;
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
      setAspect(`${video.videoWidth} / ${video.videoHeight}`);

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

    const overlay = overlayRef.current!;
    const overlayCtx = overlay.getContext("2d")!;
    const utils = new DrawingUtils(overlayCtx);

    const ctx = canvas.getContext("2d")!;

    let lastTime = -1;
    let lastPoint: Point | null = null;
    let smooth: Point | null = null;
    let wasDrawing = false;
    let wasVisible = false;

    const tick = () => {
      frameRef.current = requestAnimationFrame(tick);
      if (video.readyState < 2 || video.currentTime === lastTime) return;
      lastTime = video.currentTime;

      const hand = tracker.detectForVideo(video, performance.now()).landmarks[0];

      overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

      if (!hand) {
        if (wasVisible) {
          wasVisible = false;
          setHandVisible(false);
        }
        cursor.style.display = "none";
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
        utils.drawConnectors(hand, HandLandmarker.HAND_CONNECTIONS, {
          color: "#ffffff",
          lineWidth: 2,
        });
        utils.drawLandmarks(hand, {
          color: "#000000",
          fillColor: "#ffffff",
          lineWidth: 1,
          radius: 4,
        });
      }

      const thumb = hand[THUMB_TIP];
      const index = hand[INDEX_TIP];
      const handSize = distance(hand[WRIST], hand[MIDDLE_KNUCKLE]);
      const pinching = distance(thumb, index) / handSize < PINCH_RATIO;

      const raw = {
        x: ((thumb.x + index.x) / 2) * canvas.width,
        y: ((thumb.y + index.y) / 2) * canvas.height,
      };
      smooth = smooth
        ? {
            x: smooth.x + (raw.x - smooth.x) * SMOOTHING,
            y: smooth.y + (raw.y - smooth.y) * SMOOTHING,
          }
        : raw;

      // The camera view is mirrored, so the cursor is flipped to match.
      cursor.style.display = "block";
      cursor.style.left = `${(1 - smooth.x / canvas.width) * 100}%`;
      cursor.style.top = `${(smooth.y / canvas.height) * 100}%`;
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokesRef.current.forEach((s) => drawStroke(ctx, s));
  }

  function pickColor(value: string) {
    setColor(value);
    colorRef.current = value;
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
    if (withCameraRef.current && video && video.videoWidth) {
      ctx.drawImage(video, 0, 0, out.width, out.height);
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
      <div className="stage" style={{ aspectRatio: aspect }}>
        <video ref={videoRef} className="stage-layer stage-video" playsInline muted />
        <canvas ref={canvasRef} className="stage-layer stage-canvas" />
        <canvas ref={overlayRef} className="stage-layer" />
        <div ref={cursorRef} className="cursor" />
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
            Stop camera
          </button>
        ) : (
          <button
            className="button button-solid"
            onClick={start}
            disabled={phase === "loading"}
          >
            Start camera
          </button>
        )}
        <button className="button" onClick={undo}>
          Undo (Z)
        </button>
        <button className="button" onClick={clear}>
          Clear (C)
        </button>
        <button className="button" onClick={save}>
          Save PNG (S)
        </button>
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
        <label className="toggle">
          Size
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
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={showSkeleton}
            onChange={(e) => {
              setShowSkeleton(e.target.checked);
              showSkeletonRef.current = e.target.checked;
            }}
          />
          Hand tracking view
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={withCamera}
            onChange={(e) => {
              setWithCamera(e.target.checked);
              withCameraRef.current = e.target.checked;
            }}
          />
          Save with camera
        </label>
        {running && (
          <span className="hint">
            {!handVisible
              ? "Show your hand to the camera."
              : drawing
              ? "Drawing"
              : "Pinch your thumb and index finger to draw."}
          </span>
        )}
      </div>
    </section>
  );
}
