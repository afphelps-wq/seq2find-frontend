# Seq2Find — frontend

The web interface for **Seq2Find**: describe a study (assay, organism, tissue, treatment
conditions, data availability) and get a short, AI-ranked list of GEO series with download links.

| | |
|---|---|
| **Live site** | https://afphelps-wq.github.io/seq2find-frontend/ |
| **Backend repo** | https://github.com/afphelps-wq/HW4_Backend |
| **Live API** | https://seq2find.onrender.com ([docs](https://seq2find.onrender.com/docs)) |

Accounts are invite-only — there is no public signup. The backend README explains how they are
created.

## What's here

Plain HTML, CSS and JavaScript. No build step, no dependencies, no framework — GitHub Pages serves
these four files as they are.

| File | Purpose |
|---|---|
| `index.html` | Page structure: sign-in panel, search form, results, saved searches |
| `app.js` | All behaviour — `fetch()` calls, rendering, error handling, theme toggle |
| `styles.css` | Frosted-glass design system, light and dark |
| `config.js` | The one setting: the backend's base URL |

## How it talks to the backend

Everything goes through `fetch()` to the API in `config.js`. **The frontend holds no secrets** —
the OpenAI and NCBI keys live only on the backend, which is the reason the backend exists: the
browser calls Seq2Find, and Seq2Find calls the third-party APIs.

| When | Call | What happens with the response |
|---|---|---|
| Sign-in submitted | `POST /auth/login` | Stores the JWT in `localStorage`, then calls `/auth/me` |
| After login, and on load if a token is stored | `GET /auth/me` | Shows the email, reveals the app, shows admin-only controls if `is_admin` |
| Search submitted | `POST /search` (`?refresh=true` if an admin skips the cache) | Renders a card per match and updates the summary cards; `cached` decides whether it says "fresh search" or "cached result from …" |
| On sign-in and after any bookmark change | `GET /saved-searches` | Renders the bookmark list and count |
| "Save this search" | `POST /saved-searches` | Confirms on the button, reloads the list |
| "Delete" | `DELETE /saved-searches/{id}` | Reloads the list after confirming |

Every authenticated request sends `Authorization: Bearer <token>` from `localStorage`.

## Error handling

| Situation | What the user sees |
|---|---|
| Blank required field | Caught before any request is sent |
| Wrong credentials | The backend's message, with the same reply for an unknown email as for a bad password |
| Expired or invalid token (`401`) | Signed out with "your session expired" |
| GEO or OpenAI failing (`502`) | "could not be reached, try again in a moment" |
| Server unreachable | "it may be waking up" — Render's free tier sleeps when idle |
| No matches | A suggestion to use broader wording |
| Slow search | A progress overlay with an elapsed counter; a fresh search takes 20–30 s, and it gives up after 3 minutes |

## Safety

Every string from the API is inserted as a **text node**, never as HTML, and only `http(s)` URLs
become links. A hostile study title or a `javascript:` download link is shown as literal text
rather than executed. NCBI's `ftp://` links are rewritten to `https://`, which browsers can open.

## Running it locally

```bash
python -m http.server 8080        # then open http://localhost:8080
```

Serve it rather than opening `index.html` directly: a `file://` page has an `origin` of `null`,
which the backend's CORS allowlist rejects.

To point it at a local backend, edit `config.js`:

```js
window.SEQ2FIND_API = "http://127.0.0.1:8000";
```

and add `http://localhost:8080` to `ALLOWED_ORIGINS` on the backend. **Change `config.js` back
before pushing.**

## Tests

The frontend checks live in the backend repo, because they run the real API against this page:
`tests/frontend/` there loads these files in a headless DOM and drives them against the real
FastAPI app on SQLite with the upstreams stubbed — 61 checks covering sign-in, session expiry,
search, caching, bookmarks, and every error path above.

```bash
# with both repos checked out side by side
cd ../HW4_Backend
python tests/frontend/stub_api.py &
node tests/frontend/test.mjs
```

## Deploying

GitHub Pages, from `main` at the repository root. `config.js` must point at the deployed backend,
and the backend's `ALLOWED_ORIGINS` must include this site's **origin** — `https://afphelps-wq.github.io`,
with no path and no trailing slash, or the browser blocks every request.
