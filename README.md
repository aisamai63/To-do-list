# To-do-list

This repository contains a full-stack to-do app: `todo-app` (Express + Mongoose) and `todo-frontend` (Create React App).

Quick start

- Start backend first (port 5000), then start frontend (port 3000). The CRA dev server proxies `/tasks` to the backend by default.

## Development (one-line)

To avoid frontend proxy errors, start the backend first and then the frontend.

PowerShell quick start (Windows):

```powershell
# from repo root
./start-dev.ps1
```

Manual (explicit)

1. Start backend in terminal A:

```powershell
cd A:\To-do-list-main\todo-app
node server.js
```

2. Start frontend in terminal B (after backend is up):

```powershell
cd A:\To-do-list-main\todo-frontend
npm start
```

If you see "Could not add the task" in the UI, check that the backend is running and reachable at http://localhost:5000/health before retrying.

See `start-dev.ps1` for a Windows convenience script.
