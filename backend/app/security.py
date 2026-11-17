"""Security headers as a pure ASGI middleware.

API responses are JSON only, so they get the strictest policy and are never cached. Everything else (the built
frontend, when this app serves it) gets a policy that allows exactly what the app loads: its own scripts, styles,
fonts and images, and calls back to itself. No third-party origin is used anywhere.
"""
from __future__ import annotations

API_CSP = "default-src 'none'; frame-ancestors 'none'"
APP_CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
           "font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; "
           "form-action 'self'; frame-ancestors 'none'")
COMMON = [
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"no-referrer"),
    (b"x-frame-options", b"DENY"),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=(), payment=(), usb=()"),
    (b"cross-origin-opener-policy", b"same-origin"),
]


class SecurityHeadersMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        is_api = scope["path"].startswith("/api/")

        async def send_with_headers(msg):
            if msg["type"] == "http.response.start":
                headers = [(k, v) for k, v in msg.get("headers", []) if k.lower() not in {h for h, _ in COMMON} | {b"content-security-policy"}]
                headers += COMMON
                headers.append((b"content-security-policy", (API_CSP if is_api else APP_CSP).encode()))
                if is_api and not any(k.lower() == b"cache-control" for k, _ in headers):
                    headers.append((b"cache-control", b"no-store"))
                msg = {**msg, "headers": headers}
            await send(msg)

        await self.app(scope, receive, send_with_headers)
