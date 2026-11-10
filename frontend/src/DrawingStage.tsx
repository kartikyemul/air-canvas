import { useEffect, useRef, useState } from "react";
import { DrawingUtils, HandLandmarker } from "@mediapipe/tasks-vision";
import { createHandTracker } from "./handTracker";

type Point = { x: number; y: number };
type Phase = "idle" | "loading" | "running" | "error";

const THUMB_TIP = 4;
const INDEX_TIP = 8;
const WRIST = 0;
const MIDDLE_KNUCKLE = 9;

// Pinching thumb and index finger together draws.
const PINCH_RATIO = 0.3;
const SMOOTHING = 0.5;

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
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

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [aspect, setAspect] = useState("4 / 3");
  const [drawing, setDrawing] = useState(false);
  const [handVisible, setHandVisible] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);

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
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#00e5ff";

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
        if (lastPoint) {
          ctx.beginPath();
          ctx.moveTo(lastPoint.x, lastPoint.y);
          ctx.lineTo(smooth.x, smooth.y);
          ctx.stroke();
        }
        lastPoint = { ...smooth };
      } else {
        lastPoint = null;
      }

      if (pinching !== wasDrawing) {
        wasDrawing = pinching;
        setDrawing(pinching);
      }
    };

    tick();
  }

  function clear() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
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
    ctx.drawImage(canvas, 0, 0);
    const link = document.createElement("a");
    link.download = "aircanvas.png";
    link.href = out.toDataURL("image/png");
    link.click();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
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
        <button className="button" onClick={clear}>
          Clear (C)
        </button>
        <button className="button" onClick={save}>
          Save PNG (S)
        </button>
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
