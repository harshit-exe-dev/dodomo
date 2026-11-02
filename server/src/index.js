const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const { router, SUBJECTS } = require("./routes");
const { User } = require("./models");

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || "";

const allowedOrigins = (process.env.ALLOWED_ORIGINS ||
  "http://localhost:5173,https://dodomo.vercel.app,https://dodomo.in,https://www.dodomo.in")
  .split(",").map((s) => s.trim()).filter(Boolean);

function originAllowed(origin) {
  if (!origin) return true; // curl, server-to-server
  return allowedOrigins.includes(origin);
}

const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: (origin, cb) => cb(null, originAllowed(origin)) }));
app.use(express.json({ limit: "32kb" }));
app.use("/api", router);
app.get("/", (req, res) => res.json({ name: "dodomo-api", ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: (origin, cb) => cb(null, originAllowed(origin)) }
});

// ---------- presence: who is studying, and where ----------
// In-memory on purpose. One small server, one campus — a socket map
// is the whole database this needs.
const sockets = new Map(); // socketId -> { userId, name, room }

function presenceSnapshot() {
  const rooms = {};
  SUBJECTS.forEach((s) => { rooms[s] = 0; });
  const people = new Set();
  sockets.forEach((info) => {
    if (info.userId) people.add(info.userId);
    if (info.room && rooms[info.room] !== undefined) rooms[info.room] += 1;
  });
  return { rooms, online: people.size };
}

function broadcastPresence() {
  io.emit("presence", presenceSnapshot());
}

io.on("connection", (socket) => {
  sockets.set(socket.id, { userId: null, name: "", room: "" });

  socket.on("identify", async (token) => {
    try {
      if (!token || typeof token !== "string") return;
      const user = await User.findOne({ token }).lean();
      if (!user) return;
      const info = sockets.get(socket.id);
      if (info) {
        info.userId = String(user._id);
        info.name = user.name;
      }
      broadcastPresence();
    } catch (err) { /* presence is best-effort */ }
  });

  socket.on("join-room", (subject) => {
    if (!SUBJECTS.includes(subject)) return;
    const info = sockets.get(socket.id);
    if (info) info.room = subject;
    broadcastPresence();
  });

  socket.on("leave-room", () => {
    const info = sockets.get(socket.id);
    if (info) info.room = "";
    broadcastPresence();
  });

  socket.on("disconnect", () => {
    sockets.delete(socket.id);
    broadcastPresence();
  });
});

setInterval(broadcastPresence, 30000);

async function start() {
  if (!MONGODB_URI) {
    console.error("MONGODB_URI is not set — the API cannot start without a database.");
    process.exit(1);
  }
  await mongoose.connect(MONGODB_URI, { dbName: "dodomo" });
  console.log("connected to mongodb (db: dodomo)");
  server.listen(PORT, () => console.log("dodomo-api listening on " + PORT));
}

if (require.main === module) {
  start().catch((err) => {
    console.error("startup failed:", err.message);
    process.exit(1);
  });
}

module.exports = { app, server };
