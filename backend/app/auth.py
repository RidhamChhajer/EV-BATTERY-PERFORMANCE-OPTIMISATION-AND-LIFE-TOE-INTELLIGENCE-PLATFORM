"""Demo login with a signed, expiring bearer token. Standard library only (HMAC-SHA256).

One account, configured through the environment (EV_DEMO_USER / EV_DEMO_PASSWORD). No sign-up, no database.
Not a production identity system: it keeps the API closed to anonymous callers for demos and course assessment.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import threading
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.app.config import get_settings
from backend.app.errors import ApiError
from backend.app.schemas import LoginRequest, LoginResponse

log = logging.getLogger("ev.auth")
router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
_bearer = HTTPBearer(auto_error=False)
MAX_FAILS, WINDOW_S = 5, 60.0
_fails: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def make_token(user: str, secret: str, ttl_s: int, now: float | None = None) -> str:
    payload = _b64(json.dumps({"sub": user, "exp": int((now or time.time()) + ttl_s)}, separators=(",", ":")).encode())
    sig = _b64(hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{sig}"


def read_token(token: str, secret: str, now: float | None = None) -> str | None:
    """Return the username when the token is genuine and unexpired, else None."""
    try:
        payload, sig = token.split(".")
        good = _b64(hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, good):
            return None
        data = json.loads(_unb64(payload))
        return data["sub"] if data["exp"] > (now or time.time()) else None
    except Exception:
        return None


def _same(a: str, b: str) -> bool:
    return hmac.compare_digest(hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest())


def require_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> str:
    st = get_settings()
    if not st.auth_required:
        return "anonymous"
    user = read_token(creds.credentials, st.auth_secret) if creds else None
    if user is None:
        raise ApiError(401, "not_authenticated", "Please sign in to use this service.")
    return user


@router.post("/login", response_model=LoginResponse, summary="Exchange the demo username and password for a bearer token")
async def login(req: LoginRequest, request: Request):
    st = get_settings()
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    with _lock:
        q = _fails[ip]
        while q and now - q[0] > WINDOW_S:
            q.popleft()
        if len(q) >= MAX_FAILS:
            raise ApiError(429, "too_many_attempts", "Too many failed sign-in attempts. Wait a minute and try again.")
    ok = _same(req.username, st.demo_user) & _same(req.password, st.demo_password)   # non-short-circuit: same work either way
    if not ok:
        with _lock:
            _fails[ip].append(now)
        raise ApiError(401, "invalid_credentials", "Username or password is not correct.")
    if not os.environ.get("EV_AUTH_SECRET"):
        log.warning("EV_AUTH_SECRET is not set: tokens use a random per-process key and end when the server restarts.")
    return LoginResponse(access_token=make_token(req.username, st.auth_secret, st.token_ttl_s), expires_in=st.token_ttl_s, username=req.username)


@router.get("/me", summary="Who the current token belongs to")
async def me(user: str = Depends(require_user)):
    return {"username": user}
