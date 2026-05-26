"""Local demo server: static site + EDI-PHI redaction API."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "models" / "sentedel-edi-phi-v1"

_classifier = None
_load_error: str | None = None
_device_label: str | None = None


def _resolve_device() -> int | str:
    """Map env / hardware to a pipeline device (auto is not valid for pipeline)."""
    import torch

    requested = os.environ.get("SENTEDEL_DEVICE", "auto").strip().lower()

    if requested in ("cpu", "-1"):
        return -1
    if requested in ("cuda", "gpu", "0", "cuda:0"):
        return 0 if torch.cuda.is_available() else -1
    if requested.startswith("cuda:"):
        return 0 if torch.cuda.is_available() else -1

    # auto: prefer GPU when available
    return 0 if torch.cuda.is_available() else -1


def _load_classifier():
    global _classifier, _load_error, _device_label
    if not (MODEL_DIR / "model.safetensors").is_file():
        _load_error = f"Missing weights: {MODEL_DIR / 'model.safetensors'}"
        return

    try:
        from transformers import pipeline

        device = _resolve_device()
        _device_label = "cuda" if device == 0 else "cpu"
        _classifier = pipeline(
            "token-classification",
            model=str(MODEL_DIR),
            aggregation_strategy="simple",
            device=device,
        )
        _load_error = None
    except Exception as exc:  # noqa: BLE001
        _load_error = str(exc)
        _classifier = None
        _device_label = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _load_classifier()
    yield


app = FastAPI(title="Sentedel EDI-PHI Demo", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class RedactRequest(BaseModel):
    text: str = Field(min_length=1, max_length=200_000)


class Entity(BaseModel):
    label: str
    start: int
    end: int
    score: float


class RedactResponse(BaseModel):
    redacted: str
    entities: list[Entity]
    latency_ms: int


def redact_text(text: str, entities: list[dict]) -> str:
    sorted_entities = sorted(entities, key=lambda e: e.get("start", 0), reverse=True)
    out = text
    for ent in sorted_entities:
        start, end = ent.get("start"), ent.get("end")
        if start is None or end is None:
            continue
        out = out[:start] + "[REDACTED]" + out[end:]
    return out


@app.get("/api/health")
def health():
    return {
        "ok": _classifier is not None,
        "model_dir": str(MODEL_DIR),
        "device": _device_label,
        "error": _load_error,
    }


@app.post("/api/redact", response_model=RedactResponse)
def redact(body: RedactRequest):
    if _classifier is None:
        raise HTTPException(
            status_code=503,
            detail=_load_error or "Model is not loaded.",
        )

    import time

    t0 = time.perf_counter()
    raw = _classifier(body.text)
    latency_ms = int((time.perf_counter() - t0) * 1000)

    entities = [
        Entity(
            label=str(item.get("entity_group") or item.get("label") or "unknown"),
            start=int(item["start"]),
            end=int(item["end"]),
            score=float(item.get("score", 0.0)),
        )
        for item in raw
        if item.get("start") is not None and item.get("end") is not None
    ]

    return RedactResponse(
        redacted=redact_text(body.text, raw),
        entities=entities,
        latency_ms=latency_ms,
    )


app.mount("/", StaticFiles(directory=ROOT, html=True), name="site")
