import os

# A developer's local .env (mail password and so on) must not leak into the tests.
os.environ["EV_NO_DOTENV"] = "1"

import pytest

# Existing API tests exercise the model, not login; auth has its own tests (tests/test_api_auth.py) that switch it on.
os.environ.setdefault("EV_AUTH_REQUIRED", "false")
# API tests add their own routes after create_app(); the frontend catch-all (tests/test_static.py) would shadow them.
os.environ.setdefault("EV_STATIC_DIR", "/nonexistent-static-dir")
