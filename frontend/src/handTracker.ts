import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

// The recognizer finds the 21 hand points and also names the pose.
export async function createHandTracker(): Promise<GestureRecognizer> {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);

  const make = (delegate: "GPU" | "CPU") =>
    GestureRecognizer.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      numHands: 1,
    });

  try {
    return await make("GPU");
  } catch {
    return await make("CPU");
  }
}
