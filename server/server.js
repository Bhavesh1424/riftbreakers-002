const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const { WebSocketServer } = require("ws");
const { AdaptiveAI } = require("./aiEngine");

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "profiles.json");

// ---- tiny JSON-file persistence ----
function loadAllProfiles() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch { return {}; }
}
function saveAllProfiles(all) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(all, null, 2));
}

const allProfiles = loadAllProfiles();
const engines = new Map();

function getEngine(playerId) {
  if (!engines.has(playerId)) {
    engines.set(playerId, new AdaptiveAI(playerId, allProfiles[playerId]));
  }
  return engines.get(playerId);
}
function persist(playerId) {
  const engine = engines.get(playerId);
  if (!engine) return;
  allProfiles[playerId] = engine.profile;
  saveAllProfiles(allProfiles);
}

// ─────────────────────────────────────────────
//  ROOM MANAGER — Online 1v1
// ─────────────────────────────────────────────
const rooms = new Map(); // code → { p1: ws, p2: ws|null, createdAt }

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? makeRoomCode() : code; // ensure unique
}

function sendTo(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

// Clean up stale rooms older than 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [code, room] of rooms) {
    if (room.createdAt < cutoff) rooms.delete(code);
  }
}, 60_000);

// Keep-alive heartbeat ping every 15 seconds to keep tunnel connections open
setInterval(() => {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      try { client.ping(); } catch {}
    }
  });
}, 15_000);

// ---- express app ----
const app = express();
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/profile/:playerId", (req, res) => {
  res.json(getEngine(req.params.playerId).summary());
});
app.post("/api/profile/:playerId/reset", (req, res) => {
  engines.delete(req.params.playerId);
  delete allProfiles[req.params.playerId];
  saveAllProfiles(allProfiles);
  res.json({ ok: true });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = request.url || "";
  if (url.startsWith("/ws")) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", (ws) => {
  let playerId = null;
  let engine = null;
  let roomCode = null;  // set when this socket is in an online room
  let roomSide = null;  // "p1" | "p2"

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ── Online Room Messages ──────────────────
    if (msg.type === "create_room") {
      const code = makeRoomCode();
      const p1Name = (msg.p1Name || "HOST").trim();
      rooms.set(code, { p1: ws, p2: null, p1Name, createdAt: Date.now() });
      roomCode = code;
      roomSide = "p1";
      sendTo(ws, { type: "room_created", code });
      return;
    }

    if (msg.type === "join_room") {
      const code = String(msg.code || "").toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) { sendTo(ws, { type: "room_error", message: "Room not found. Check the code." }); return; }
      if (room.p2) { sendTo(ws, { type: "room_error", message: "Room is already full." }); return; }

      room.p2 = ws;
      roomCode = code;
      roomSide = "p2";

      // Notify both players with their opponent's chosen name
      const p1Name = room.p1Name || "PLAYER 1";
      const p2Name = (msg.p2Name || "PLAYER 2").trim();
      sendTo(room.p1, { type: "match_start", side: "p1", opponentName: p2Name });
      sendTo(room.p2, { type: "match_start", side: "p2", opponentName: p1Name });
      return;
    }

    if (roomCode) {
      const room = rooms.get(roomCode);
      if (room) {
        const opponent = roomSide === "p1" ? room.p2 : room.p1;
        if (msg.type === "input") {
          sendTo(opponent, { type: "remote_input", keys: msg.keys, tick: msg.tick });
          return;
        }
        if (msg.type === "hit") {
          sendTo(opponent, { type: "remote_hit", hit: msg.hit });
          return;
        }
        if (msg.type === "super") {
          sendTo(opponent, { type: "remote_super", side: roomSide });
          return;
        }
        if (msg.type === "state_sync") {
          sendTo(opponent, { type: "state_sync", state: msg.state });
          return;
        }
        if (msg.type === "rematch") {
          sendTo(opponent, { type: "remote_rematch" });
          return;
        }
      }
    }

    if (msg.type === "ping_online") {
      sendTo(ws, { type: "pong_online", ts: msg.ts });
      return;
    }

    // ── Existing AI Messages ──────────────────
    switch (msg.type) {
      case "init": {
        playerId = String(msg.playerId || "anon").slice(0, 64);
        engine = getEngine(playerId);
        ws.send(JSON.stringify({ type: "init_ack", summary: engine.summary() }));
        break;
      }
      case "playerAction": {
        if (engine) engine.recordPlayerAction({ action: msg.action, result: msg.result, distance: msg.distance });
        break;
      }
      case "aiAttackOutcome": {
        if (engine) engine.recordAiAttackOutcome(msg.outcome);
        break;
      }
      case "aiWhiff": {
        if (engine) engine.recordAiWhiff();
        break;
      }
      case "roundEnd": {
        if (!engine) break;
        engine.recordRoundResult(!!msg.playerWon);
        persist(playerId);
        ws.send(JSON.stringify({ type: "summary", summary: engine.summary() }));
        break;
      }
      case "requestDecision": {
        if (!engine) break;
        const action = engine.decide(msg.gameState || {});
        ws.send(JSON.stringify({ type: "decision", action, requestId: msg.requestId }));
        break;
      }
    }
  });

  ws.on("close", () => {
    if (playerId) persist(playerId);
    // Notify opponent if in a room
    if (roomCode) {
      const room = rooms.get(roomCode);
      if (room) {
        const opponent = roomSide === "p1" ? room.p2 : room.p1;
        sendTo(opponent, { type: "opponent_left" });
        rooms.delete(roomCode);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Riftbreakers server running at http://localhost:${PORT}`);
});
