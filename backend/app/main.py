"""FastAPI app: thin HTTP layer over the engine. Run: uvicorn backend.app.main:app --port 8000"""
from __future__ import annotations

import hashlib
import json
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.app import auth, errors, routes, service
from backend.app.limits import BodyLimitMiddleware
from backend.app.security import SecurityHeadersMiddleware
from backend.app.static import mount_frontend
from backend.app.config import get_settings
from engine.cell.uncertainty import load_models

ARTIFACTS = ("calendar_params.json", "cycle_params.json", "early_life.json", "uncertainty.json", "metrics.json")


def artifact_versions(art_dir: str) -> dict[str, str]:
    out = {}
    for name in ARTIFACTS:
        path = os.path.join(art_dir, name)
        if not os.path.exists(path):
            raise RuntimeError(f"required model artifact missing: {name} (run scripts/train_all.sh)")
        out[name] = hashlib.sha256(open(path, "rb").read()).hexdigest()[:12]
    return out


@asynccontextmanager
async def lifespan(app: FastAPI):
    st = get_settings()
    app.state.versions = artifact_versions(st.artifact_dir)     # fails fast with the missing artifact named
    app.state.models = load_models(st.artifact_dir, engine=st.engine)
    ident = {**app.state.versions, "engine": st.engine}
    if st.engine == "reference":
        from engine.reference import blast_lfp
        ident["reference"] = hashlib.sha256(json.dumps({k: m.params for k, m in blast_lfp.MODELS.items()}, sort_keys=True).encode()).hexdigest()[:12]
    app.state.model_version = hashlib.sha256(json.dumps(ident, sort_keys=True).encode()).hexdigest()[:12]
    app.state.cache = service.LRUCache(512)
    yield


def create_app() -> FastAPI:
    st = get_settings()
    app = FastAPI(title="E-bus battery lifecycle tool", version="0.1.0", lifespan=lifespan,
                  description="Prior mode only: published laboratory-fitted LFP cell models, scenario inputs are assumptions, "
                              "nothing is validated on buses.")
    # CORS is added after the body limit so it is outermost: 413 responses still carry CORS headers.
    app.add_middleware(BodyLimitMiddleware, max_bytes=st.max_body_bytes)
    app.add_middleware(CORSMiddleware, allow_origins=st.allowed_origins, allow_methods=["GET", "POST", "OPTIONS"],
                       allow_headers=["Content-Type", "Authorization"], expose_headers=["X-Cache"])

    # Outermost, so every response (including 413s and errors) carries the security headers.
    app.add_middleware(SecurityHeadersMiddleware)

    errors.install(app)

    @app.get("/api/v1/health", tags=["meta"])
    async def health(request: Request):
        return {"status": "ok", "mode": "prior", "model_version": request.app.state.model_version,
                "artifacts": request.app.state.versions}

    app.include_router(auth.router)
    app.include_router(routes.router)
    mount_frontend(app, st.static_dir)   # last: its catch-all route must not shadow the API
    return app


app = create_app()
