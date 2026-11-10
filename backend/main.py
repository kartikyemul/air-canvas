from fastapi import FastAPI

app = FastAPI(title="AirCanvas API")


@app.get("/")
def root():
    return {"app": "AirCanvas API", "health": "/api/health", "docs": "/docs"}


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "AirCanvas"}