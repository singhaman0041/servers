const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);

const wss = new WebSocketServer({
  server,
  path: "/signal"
});

app.use(express.static(path.join(__dirname, "public")));

// Root route - Render URL open karne par ye dikhega
app.get("/", (req, res) => {
  res.send("StudyStream server is running!");
});

app.get("/watch/:room", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "watch.html"));
});

const rooms = new Map();

function send(c, o) {
  if (c.readyState === 1) {
    c.send(JSON.stringify(o));
  }
}

wss.on("connection", (ws) => {
  let role, id, room;

  ws.on("message", (raw) => {
    let m;

    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }

    if (m.type === "host") {
      role = "host";
      room = m.room;

      if (!rooms.has(room)) {
        rooms.set(room, {
          host: null,
          viewers: new Map()
        });
      }

      const r = rooms.get(room);

      if (r.host && r.host !== ws) {
        return ws.close();
      }

      r.host = ws;
      broadcastCount(r);
    }

    if (m.type === "viewer") {
      role = "viewer";
      room = m.room;
      id = crypto.randomBytes(5).toString("hex");

      const r = rooms.get(room);

      if (!r || !r.host || r.viewers.size >= 3) {
        send(ws, {
          type: "error",
          message: "Room full or offline."
        });

        return ws.close();
      }

      r.viewers.set(id, ws);

      send(r.host, {
        type: "viewer-joined",
        id
      });

      broadcastCount(r);
    }

    if (["offer", "answer", "ice"].includes(m.type)) {
      const r = rooms.get(room);

      if (!r) return;

      const target =
        m.target === "host"
          ? r.host
          : r.viewers.get(m.target);

      if (target) {
        send(target, {
          ...m,
          id
        });
      }
    }

    if (m.type === "stop") {
      cleanupRoom(room);
    }
  });

  ws.on("close", () => {
    if (role === "host") {
      cleanupRoom(room);
    } else if (role === "viewer" && rooms.has(room)) {
      const r = rooms.get(room);

      r.viewers.delete(id);
      broadcastCount(r);
    }
  });
});

function broadcastCount(r) {
  if (r.host) {
    send(r.host, {
      type: "count",
      count: r.viewers.size
    });
  }
}

function cleanupRoom(room) {
  const r = rooms.get(room);

  if (!r) return;

  for (const v of r.viewers.values()) {
    send(v, {
      type: "ended"
    });
  }

  rooms.delete(room);
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`StudyStream server running on port ${PORT}`);
});
