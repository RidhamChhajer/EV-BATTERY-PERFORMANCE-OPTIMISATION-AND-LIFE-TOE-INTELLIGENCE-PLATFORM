"""Request body size limit as a pure ASGI middleware (works for Content-Length and chunked uploads).

When a chunked body grows past the limit we answer 413 ourselves, then tell the app the client went away and drop
anything it tries to send afterwards (FastAPI would otherwise turn a failed body read into a generic 400).
"""
from __future__ import annotations

import json


class BodyLimitMiddleware:
    def __init__(self, app, max_bytes: int):
        self.app, self.max_bytes = app, max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        cl = dict(scope["headers"]).get(b"content-length")
        if cl is not None and cl.isdigit() and int(cl) > self.max_bytes:
            return await self._reject(send)
        total, rejected = 0, False

        async def counting_receive():
            nonlocal total, rejected
            if rejected:
                return {"type": "http.disconnect"}
            msg = await receive()
            if msg["type"] == "http.request":
                total += len(msg.get("body", b""))
                if total > self.max_bytes:
                    rejected = True
                    await self._reject(send)
                    return {"type": "http.disconnect"}
            return msg

        async def guarded_send(msg):
            if not rejected:
                await send(msg)

        await self.app(scope, counting_receive, guarded_send)

    async def _reject(self, send):
        body = json.dumps({"error": {"code": "payload_too_large", "message": f"Body larger than {self.max_bytes} bytes",
                                     "fields": []}}).encode()
        await send({"type": "http.response.start", "status": 413,
                    "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})
