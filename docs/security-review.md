# Security review (Phase 8.2)

Scope: the API (`backend/`), the demo login, the built frontend, dependencies and repository history. Checked against the project's security checklist (input limits, authentication, headers, error leakage, dependencies, secrets).

## Findings and what was done
| # | Finding | Severity | Action |
|---|---|---|---|
| 1 | The token-signing key had a public default (`dev-only-change-me`, visible in the repository). On a server started without `EV_AUTH_SECRET`, anyone could mint a valid token. | High for any shared deployment | **Fixed.** Without `EV_AUTH_SECRET` each process now signs with its own random key (restart ends sign-ins). A token signed with the old public string is rejected (test). With more than one worker, set `EV_AUTH_SECRET`. |
| 2 | No security headers. | Medium | **Fixed.** Every response carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy` and `Cross-Origin-Opener-Policy`. API responses get `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` and `Cache-Control: no-store`; the policy for the built app allows only its own origin. Headers also appear on 404, 422 and 413 responses (tests). |
| 3 | The demo password (`PackHorizon-2026`) is printed in the README and the repository is public. | Accepted, by design | It is a demo account that protects nothing sensitive (no personal data, public datasets only). Before showing a hosted copy to anyone, set `EV_DEMO_PASSWORD`. The login is rate-limited (5 failures a minute per address). |
| 4 | Ten moderate advisories in development tooling (`minimatch` through the ESLint and TypeScript-ESLint chain: a denial-of-service on crafted glob patterns). | Low, accepted | Development-time only; none of it is shipped or runs in production. `npm audit --omit=dev` reports **0**. Clearing them means a breaking major upgrade of the linter. |

## Checks run
| Check | Result |
|---|---|
| `pip-audit -r requirements.txt` | No known vulnerabilities |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `gitleaks detect` over all 28 commits | No leaks |
| Search of history for key, secret, token, password patterns | Only code that handles tokens, the documented demo credentials and test fixtures |
| Oversized body (2 MB) | 413 with JSON error, with security headers |
| Malformed JSON, wrong types | 422 with field messages, no traceback or file path in the body (tests) |
| Unhandled server error | Uniform `internal_error` message; the stack goes to the log only |
| Path traversal against the static host | Checked in Phase 8.3, when the API starts serving the built frontend |

## Still true, and worth saying
- This is a demo identity system (one account, signed expiring token, no database), not a production one.
- The model reads only its own committed artifacts; no raw dataset is needed at run time, so none is exposed.
- CORS allows only the origins in `EV_ALLOWED_ORIGINS` (default: local development servers).
- **Report email.** The mail account sits behind the same sign-in as everything else. The email endpoint takes one recipient address and nothing else: the subject, the body and the PDF are written by the server from the two scenarios, so it cannot be used to send content of someone's choosing. Addresses are checked for a single plain address (no commas, semicolons, spaces or line breaks), each client may send 5 reports an hour and the whole service 30, SMTP credentials come only from the environment and never appear in a response or log, and SMTP failures return short messages we wrote. Not yet done: per-recipient opt-out, bounce handling, a verified-domain sender (Gmail will show the account's own address).
