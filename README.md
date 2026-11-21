# Project Workspace

A project and task manager with My Day, notes, a risk log, and Excel export. This copy starts with an empty workspace.

## Run locally

Install Node.js 22.23.2 or later in the 22.x series, then open a terminal in this directory and run:

```powershell
npm ci
npm run build
npm start
```

Open http://127.0.0.1:8767. You should see an empty dashboard. Create a project or a to-do, then reload the page to check that it was saved. Stop the server with Ctrl+C.

The local app listens on your computer only and stores records in `workspace.sqlite3` in the project-workspace-share folder under Windows Local AppData (or under your home directory on other systems). Anyone with access to that file can read the records. Keep it out of shared folders and Git. `WORKSPACE_DB` lets you choose a different database path. The app runs locally. The install step downloads the JavaScript dependencies from the npm registry.

## Checks

Run `npm run build` and then `npm run check`. The checks use synthetic records.

## Cloud hosting

The included Cloudflare Worker uses D1 for workspace records, KV for OAuth state, and GitHub for sign-in. `wrangler.example.jsonc` documents the bindings for a separate deployment. Copy it to `wrangler.jsonc` only if you intend to configure your own Cloudflare resources, and supply your own public origin, GitHub user ID, database and KV IDs. Keep OAuth credentials in Cloudflare secrets. A leaked OAuth client secret could be used to impersonate the OAuth application. Cloudflare would store any records entered in a deployed workspace, and GitHub would handle sign-in. Review account access and data handling before using workplace records.


## Source publishing rule

This repository is the neutral, empty edition. Keep the system font and the “Place your logo here” placeholder. Do not add company logos, proprietary fonts, personal records, database exports, credentials or production deployment identifiers. The separately maintained personal deployment uses its own branding and is not deployed from this repository. Do not copy the private working directory over this repository.

Before uploading changes, run `npm run check:publish`, `npm run build` and `npm run check`. The publishing check scans the committed file set and staged additions; it is a guard against known sensitive assets, not a complete privacy audit. Only stage explicitly reviewed source files.
