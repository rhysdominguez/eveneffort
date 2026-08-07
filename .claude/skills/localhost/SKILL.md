---
name: localhost
description: Launch this project's Next.js dev server and confirm it's serving on localhost. Use when the user asks to "launch localhost", "start the dev server", "run the app locally", or similar.
---

# localhost — run the eveneffort dev server

This project is a Next.js (Turbopack) app. The dev server is started with `npm run dev` and defaults to port 3000.

## Steps

1. **Check if a dev server is already running** before starting a new one:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
   ```
   If this returns `200`, the app is already up — skip straight to step 4.

2. **If nothing is running**, start it in the background:
   ```bash
   npm run dev
   ```
   Run this with `run_in_background: true` (Bash tool) — it's a long-running process, not a one-shot command.

3. **Wait a few seconds, then verify** it came up:
   ```bash
   curl -s http://localhost:3000 | head -20
   ```
   Note: if port 3000 was already occupied by another `next dev` process (common — Next.js detects this and either falls back to 3001 or refuses to start with "Another next dev server is already running"), check the background task's output log for the actual port and PID. Don't assume 3000 — read the log.

4. **Report the working URL** to the user (usually `http://localhost:3000`, but confirm from the actual server output).

## Notes

- Don't kill an existing dev server process unless the user explicitly asks — it may belong to another session or in-progress work.
- No need to open a browser or take a screenshot unless the user asks to see the UI rendered — confirming the HTTP response is sufficient to prove the app is running.
- This project has no auth and no DB required for the app to boot (see CLAUDE.md rule 9) — `npm run dev` should never fail due to a missing database connection.
