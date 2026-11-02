# dodomo

Ask the doubt. Clear it together.

Dodomo is an exam-season app for students: a **Doubt Wall** where doubts are posted subject-wise and unit-wise, answered by other students, and marked cleared when the asker pins a best answer — plus **silent Study Rooms** with live presence and a shared 25-minute focus timer.

Built for the December exam season at Bundelkhand University, open to any campus.

**Live:** https://dodomo.in

## Stack

- Client: React + Vite (deployed on Vercel)
- Server: Node + Express + Socket.io (deployed on Render)
- Database: MongoDB Atlas

## Layout

- `client/` — the web app
- `server/` — the API (`src/index.js` entry, `src/routes.js`, `src/models.js`)

## Run locally

```bash
cd server && npm install && MONGODB_URI=<your-uri> npm run dev   # API on :4000
cd client && npm install && npm run dev                          # app on :5173
```

Set `VITE_API_URL` for the client if the API is not on localhost:4000.
