# devdash

A floating desktop dashboard for Linux developers, built with Tauri and React. It lives as a small always-on-top orb that expands into a dock of tools you'd otherwise have scattered across terminal tabs and browser windows.

## Features

**System**
- Live RAM, battery, disk, and temperature dials
- systemd unit manager (start, stop, restart)
- Docker containers, images, and volumes, with Compose stacks detected and grouped automatically
- Open ports with one-click kill

**Projects**
- Auto-scans configured folders and classifies each project by kind (TypeScript, Rust, Python, Go, and more)
- Git status at a glance (branch, dirty state, ahead/behind)
- Open any project in your preferred editor, picked per project
- `.env` secret exposure warnings
- Disk bloat scanner for `node_modules`, `target`, `venv`, and friends, with one-click prune

**Workflow**
- Notes, a task list, and a journal with a rich text editor
- Cron job viewer and creator with a human-readable schedule builder
- REST client for quick API calls
- Database client for Postgres, MySQL, and SQLite, including LAN discovery of local DB servers
- Tunnel viewer surfacing ngrok's public URL (and cloudflared's presence) so you're not digging through terminal scrollback for a link to hand someone
- A local music player for whatever's in your library

**Command palette**
- Cmd/Ctrl+K to search across every panel, project, task, journal entry, saved request, and DB connection
- Recently and frequently used items surface first when the query is empty

## Tech stack

- [Tauri 2](https://tauri.app/) with a Rust backend
- React 19 and TypeScript on the frontend, built with Vite
- `sysinfo`, `zbus` (systemd over D-Bus), `bollard` (Docker), `sqlx`, `reqwest`, `rodio`, and `lofty` on the Rust side

## Getting started

Requires Node.js, [pnpm](https://pnpm.io/), and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform.

```bash
pnpm install
pnpm tauri dev
```

To build a release bundle:

```bash
pnpm tauri build
```

## Development notes

- The frontend lives in `src/`: one hook per feature in `src/hooks/`, one presentation component per feature in `src/panels/`, wired together in `src/App.tsx`.
- The backend is a single `src-tauri/src/lib.rs`, exposing one `#[tauri::command]` per operation.
- Settings and per-feature data persist via `tauri-plugin-store`, one JSON file per concern (`settings.json`, `project-roots.json`, and so on).
- Any Tauri-provided window/plugin API you call needs an explicit entry in `src-tauri/capabilities/default.json`, or it fails silently at runtime. Plain Web APIs (like `navigator.clipboard`) don't need one.
