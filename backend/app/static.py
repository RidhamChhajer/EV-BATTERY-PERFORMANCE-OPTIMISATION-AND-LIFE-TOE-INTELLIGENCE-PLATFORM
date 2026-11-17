"""Serves the built frontend from the same process, so one command runs the whole app.

Single-page-app behaviour: any path that is not under /api and does not name a real file returns index.html, so a
reload on /optimise works. File lookups are resolved and must stay inside the build folder (no path traversal).
Built asset names carry a content hash, so they are cached for a year; index.html is never cached.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse, Response


def mount_frontend(app: FastAPI, root: str) -> bool:
    base = Path(root).resolve()
    index = base / "index.html"
    if not index.is_file():
        return False

    def _file(rel: str) -> Path | None:
        try:
            p = (base / rel).resolve()
        except (OSError, ValueError):
            return None
        return p if p.is_file() and base in p.parents else None

    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def frontend(path: str):
        if path.startswith("api/") or path == "api":
            return JSONResponse(status_code=404, content={"error": {"code": "http_error", "message": "Not Found", "fields": []}})
        f = _file(path) if path else None
        if f is not None:
            immutable = "assets" in f.relative_to(base).parts[:1]
            return FileResponse(f, headers={"Cache-Control": "public, max-age=31536000, immutable" if immutable else "no-cache"})
        if "." in path.rsplit("/", 1)[-1]:      # looks like a missing file, not an app route
            return Response(status_code=404)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

    return True
