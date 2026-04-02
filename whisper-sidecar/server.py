"""Whisper transcription sidecar — FastAPI + faster-whisper."""

import os
import tempfile
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel

model: WhisperModel | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    model_size = os.getenv("MODEL_SIZE", "base")
    device = os.getenv("DEVICE", "auto")
    compute_type = os.getenv("COMPUTE_TYPE", "auto")
    model = WhisperModel(model_size, device=device, compute_type=compute_type)
    yield
    model = None


app = FastAPI(title="Whisper Sidecar", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": model is not None}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    if model is None:
        return JSONResponse(
            status_code=503, content={"error": "Model not loaded"}
        )

    suffix = os.path.splitext(file.filename or "audio.webm")[1]
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp.flush()

        segments, info = model.transcribe(tmp.name, beam_size=5)
        text = " ".join(seg.text.strip() for seg in segments)

    return {
        "text": text,
        "language": info.language,
        "duration": info.duration,
    }
