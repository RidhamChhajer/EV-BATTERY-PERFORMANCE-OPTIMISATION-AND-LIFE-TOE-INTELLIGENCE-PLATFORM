"""Settings from environment variables with safe defaults (no secrets are needed by this app)."""
from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


def load_env_file(path: Path = ENV_FILE) -> int:
    """Read KEY=VALUE lines from a local `.env` (git-ignored) into the environment, so settings such as the mail password survive between runs.
    Variables already set in the environment win; blank values, comments and malformed lines are skipped. Returns how many were set.
    Set EV_NO_DOTENV=1 to turn this off (the tests do)."""
    if os.environ.get("EV_NO_DOTENV") or not path.is_file():
        return 0
    n = 0
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip().removeprefix("export ").strip(), val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
            val = val[1:-1]
        if key.startswith("EV_") and val and key not in os.environ:
            os.environ[key] = val
            n += 1
    return n


load_env_file()

# Without EV_AUTH_SECRET each process signs tokens with its own random key, so nobody can forge a token from the public
# source code. Sign-ins then end when the server restarts; with more than one worker, set EV_AUTH_SECRET.
_PROCESS_SECRET = secrets.token_urlsafe(32)


def _origins() -> list[str]:
    raw = os.environ.get("EV_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return [o.strip() for o in raw.split(",") if o.strip()]


@dataclass(frozen=True)
class Settings:
    allowed_origins: list[str] = field(default_factory=_origins)
    max_body_bytes: int = field(default_factory=lambda: int(os.environ.get("EV_MAX_BODY_BYTES", 1_000_000)))
    artifact_dir: str = field(default_factory=lambda: os.environ.get("EV_ARTIFACT_DIR", "engine/artifacts"))
    # "reference": the NREL BLAST-Lite LFP models (shown in the app). "lab": our own fit on public laboratory cells, kept for comparison.
    engine: str = field(default_factory=lambda: os.environ.get("EV_ENGINE", "reference").lower())
    # Demo login. Defaults are for local demos only; set real values in the environment (.env) for anything shared.
    auth_required: bool = field(default_factory=lambda: os.environ.get("EV_AUTH_REQUIRED", "true").lower() != "false")
    demo_user: str = field(default_factory=lambda: os.environ.get("EV_DEMO_USER", "demo"))
    demo_password: str = field(default_factory=lambda: os.environ.get("EV_DEMO_PASSWORD", "PackHorizon-2026"))
    auth_secret: str = field(default_factory=lambda: os.environ.get("EV_AUTH_SECRET") or _PROCESS_SECRET)
    # Built frontend served by the API itself (set by scripts/run_all.sh). Missing folder means API only.
    static_dir: str = field(default_factory=lambda: os.environ.get("EV_STATIC_DIR", "frontend/dist"))
    # Report email (SMTP, e.g. Gmail with an app password). Without a user and password the email option is switched off and the PDF download still works.
    smtp_host: str = field(default_factory=lambda: os.environ.get("EV_SMTP_HOST", "smtp.gmail.com"))
    smtp_port: int = field(default_factory=lambda: int(os.environ.get("EV_SMTP_PORT", 587)))
    smtp_user: str = field(default_factory=lambda: os.environ.get("EV_SMTP_USER", ""))
    # Google shows app passwords in groups of four with spaces; they are not part of the password
    smtp_password: str = field(default_factory=lambda: "".join(os.environ.get("EV_SMTP_PASSWORD", "").split()))
    mail_from: str = field(default_factory=lambda: os.environ.get("EV_MAIL_FROM", ""))
    token_ttl_s: int = field(default_factory=lambda: int(os.environ.get("EV_TOKEN_TTL_S", 8 * 3600)))


def get_settings() -> Settings:
    return Settings()
