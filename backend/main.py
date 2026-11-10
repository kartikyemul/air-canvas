from fastapi import FastAPI

app = FastAPI(title="AirCanvas API")


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "AirCanvas"}
