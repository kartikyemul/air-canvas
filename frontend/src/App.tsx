import { useEffect, useState } from "react";
import DrawingStage from "./DrawingStage";
import { MoonIcon, SunIcon } from "./icons";

type Status = "checking" | "online" | "offline";
type Theme = "dark" | "light";

export default function App() {
  const [status, setStatus] = useState<Status>("checking");
  const [theme, setTheme] = useState<Theme>(
    document.documentElement.dataset.theme === "light" ? "light" : "dark"
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("aircanvas-theme", theme);
  }, [theme]);

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
      <header className="brand">
        <div>
          <span className="bars" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <h1 className="title">AirCanvas</h1>
        </div>
        <p className="tagline">Draw in the air with your webcam.</p>
      </header>

      <DrawingStage />

      <div className="status-row">
        <span className={`dot dot-${status}`} aria-hidden="true" />
        <span role="status">{message}</span>
        <button className="button button-right" onClick={checkBackend}>
          Check again
        </button>
      </div>
      <button
        className="button theme-toggle"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        title={theme === "dark" ? "Light mode" : "Dark mode"}
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>
    </main>
  );
}
