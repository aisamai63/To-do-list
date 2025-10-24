# To-do App (backend)

This is the simple Node/Express backend for the To-do app. It supports MongoDB via `MONGODB_URI` and falls back to an in-memory store when MongoDB is unavailable (useful for development).

Quick start

1. Copy `.env.example` to `.env` and update `MONGODB_URI`:

```
MONGODB_URI=mongodb+srv://iabdo17_db_user:<ENCODED_PASSWORD>@abdulsalam.boaz05z.mongodb.net/todo-app?retryWrites=true&w=majority
PORT=5000
```

2. Start the server:

```powershell
# from repository root
node 'a:\To-do-list-main\todo-app\server.js'
```

3. Health check:

Visit `http://localhost:5000/health` — the response includes `mongo: true` when connected to MongoDB.

Notes

- If your password contains special characters (e.g. `@`, `/`), URL-encode them before inserting into `MONGODB_URI`.
- If no `MONGODB_URI` is provided or connection fails, the server will continue running using an in-memory fallback (data lost on restart).
- The server will attempt to connect to MongoDB up to three times with exponential backoff before falling back.

Security

- Do NOT commit your `.env` file with real credentials. Use `.env.example` as a template.
