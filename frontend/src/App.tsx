import { useEffect, useState } from "react";
import DrawingStage from "./DrawingStage";

type Status = "checking" | "online" | "offline";

export default function App() {
  const [status, setStatus] = useState<Status>("checking");

  async function checkBackend() {
    setStatus("checking");
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      setStatus(res.ok && data.status === "ok" ? "online" : "offline");
    } catch {
      setStatus("offline");
    }
  }

  useEffect(() => {
    checkBackend();
  }, []);

  const message = {
    checking: "Checking the backend...",
    online: "Backend connected.",
    offline: "Backend not reachable. Start the FastAPI server and try again.",
  }[status];

  return (
    <main className="page">
      <h1 className="title">AirCanvas</h1>
      <p className="tagline">Draw in the air with your webcam.</p>

      <DrawingStage />

      <div className="status-row">
        <span className={`dot dot-${status}`} aria-hidden="true" />
        <span role="status">{message}</span>
        <button className="button button-right" onClick={checkBackend}>
          Check again
        </button>
      </div>
    </main>
  );
}
