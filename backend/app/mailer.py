"""Sends the comparison report by email over SMTP (built for a Gmail account with an app password; any STARTTLS SMTP server works).

Credentials come only from the environment (EV_SMTP_USER / EV_SMTP_PASSWORD), never from the repository. The message is a fixed template with the
server-built PDF attached: callers choose the recipient and nothing else, so the sender address cannot be used to send content of their own.
"""
from __future__ import annotations

import logging
import re
import smtplib
import ssl
import threading
import time
from collections import defaultdict, deque
from email.message import EmailMessage

from backend.app.config import Settings
from backend.app.errors import ApiError

log = logging.getLogger("ev.mail")

# one address, no separators or control characters that could add a second recipient or a header
_ADDR = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$")
PER_CLIENT, PER_ALL, WINDOW_S = 5, 30, 3600.0
_sent: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()


def valid_address(addr: str) -> bool:
    return len(addr) <= 254 and bool(_ADDR.match(addr))


def mask(addr: str) -> str:
    name, _, domain = addr.partition("@")
    return f"{name[:1]}{'*' * max(1, len(name) - 1)}@{domain}"


def enabled(st: Settings) -> bool:
    return bool(st.smtp_user and st.smtp_password)


def check_rate(client: str, now: float | None = None) -> None:
    """At most 5 emails an hour per client and 30 an hour for the whole service, so the mail account cannot be used to flood anyone."""
    now = time.time() if now is None else now
    with _lock:
        for key in (client, "*"):
            q = _sent[key]
            while q and now - q[0] > WINDOW_S:
                q.popleft()
        if len(_sent[client]) >= PER_CLIENT or len(_sent["*"]) >= PER_ALL:
            raise ApiError(429, "too_many_reports", "Too many reports sent in the last hour. Download the PDF instead, or try again later.")


def record(client: str, now: float | None = None) -> None:
    now = time.time() if now is None else now
    with _lock:
        _sent[client].append(now); _sent["*"].append(now)


def build_message(st: Settings, to: str, pdf: bytes, filename: str, summary: list[str]) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = "Pack Horizon: Bus A vs Bus B comparison report"
    msg["From"] = st.mail_from or st.smtp_user
    msg["To"] = to
    body = ("Hello,\n\nA battery comparison between two e-bus set-ups was prepared in Pack Horizon. The full report is attached as a PDF.\n\n"
            + "\n".join(f"- {s}" for s in summary)
            + "\n\nEvery figure is a forecast from published laboratory cell models with assumed inputs. Nothing in it has been validated on buses.\n")
    msg.set_content(body)
    msg.add_attachment(pdf, maintype="application", subtype="pdf", filename=filename)
    return msg


def send(st: Settings, msg: EmailMessage) -> None:
    """Blocking SMTP send (run it in a thread). Failures become short messages we wrote ourselves; details go to the server log only."""
    try:
        ctx = ssl.create_default_context()
        if st.smtp_port == 465:
            with smtplib.SMTP_SSL(st.smtp_host, st.smtp_port, timeout=20, context=ctx) as s:
                s.login(st.smtp_user, st.smtp_password); s.send_message(msg)
        else:
            with smtplib.SMTP(st.smtp_host, st.smtp_port, timeout=20) as s:
                s.starttls(context=ctx); s.login(st.smtp_user, st.smtp_password); s.send_message(msg)
    except smtplib.SMTPAuthenticationError:
        log.error("SMTP login was refused for %s (check the app password)", st.smtp_user)
        raise ApiError(502, "email_not_accepted", "The mail account refused the sign-in, so the report was not sent. Check the app password the server was given.")
    except smtplib.SMTPRecipientsRefused:
        raise ApiError(422, "recipient_refused", "The mail server did not accept that address. Check it for typos.")
    except (smtplib.SMTPException, OSError, TimeoutError) as e:
        log.error("SMTP send failed: %s: %s", type(e).__name__, e)
        raise ApiError(502, "email_failed", "The report could not be sent just now. Download the PDF instead, or try again in a minute.")
