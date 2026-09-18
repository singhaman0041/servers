const room = location.pathname.split("/").pop();

const video = document.getElementById("video");
const state = document.getElementById("state");
const msg = document.getElementById("msg");

const ws = new WebSocket(
  (location.protocol === "https:" ? "wss://" : "ws://") +
  location.host +
  "/signal"
);

let pc = null;
let pendingIce = [];

function setLive() {
  state.textContent = "LIVE";
  state.className =
    "ml-auto px-3 py-1 rounded-full bg-emerald-500/15 text-xs text-emerald-300";
  msg.textContent = "Live stream connected";
}

ws.onopen = () => {
  console.log("Viewer connected to signaling server");

  ws.send(JSON.stringify({
    type: "viewer",
    room: room
  }));
};

ws.onmessage = async (e) => {
  try {
    const m = JSON.parse(e.data);

    console.log("SIGNAL:", m.type);

    // ---------------- OFFER ----------------
    if (m.type === "offer") {

      console.log("OFFER RECEIVED");

      if (pc) {
        pc.close();
        pc = null;
      }

      pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" }
        ]
      });

      // -------- REMOTE TRACK --------
      pc.ontrack = (event) => {
        console.log("REMOTE TRACK RECEIVED:", event.track.kind);

        if (event.streams && event.streams[0]) {
          video.srcObject = event.streams[0];
        } else {
          if (!video.srcObject) {
            video.srcObject = new MediaStream();
          }
          video.srcObject.addTrack(event.track);
        }

        video.autoplay = true;
        video.playsInline = true;

        setLive();

        video.play().then(() => {
          console.log("VIDEO PLAYING SUCCESSFULLY");
        }).catch((err) => {
          console.log("Autoplay blocked, falling back to muted play:", err);
          video.muted = true;
          video.play().catch(e => {
            console.error("Play error:", e);
            msg.textContent = "Click the video to play audio/video";
          });
        });
      };

      // -------- ICE --------
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          ws.send(JSON.stringify({
            type: "ice",
            room: room,
            target: "host",
            candidate: event.candidate
          }));
        }
      };

      // -------- CONNECTION STATE --------
      pc.onconnectionstatechange = () => {
        console.log("WebRTC state:", pc.connectionState);

        if (pc.connectionState === "connected") {
          console.log("WEBRTC CONNECTED");
          setLive();
        }

        if (pc.connectionState === "failed") {
          state.textContent = "CONNECTION FAILED";
          msg.textContent = "WebRTC connection failed";
        }

        if (pc.connectionState === "disconnected") {
          state.textContent = "DISCONNECTED";
        }
      };

      // -------- REMOTE DESCRIPTION --------
      await pc.setRemoteDescription(m.offer);

      console.log("Remote description set");

      // Add queued ICE
      for (const candidate of pendingIce) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (err) {
          console.log("Queued ICE error:", err);
        }
      }

      pendingIce = [];

      // -------- ANSWER --------
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      ws.send(JSON.stringify({
        type: "answer",
        room: room,
        target: "host",
        answer: pc.localDescription
      }));

      console.log("ANSWER SENT");
    }

    // ---------------- ICE ----------------
    if (m.type === "ice") {
      if (!pc || !pc.remoteDescription) {
        console.log("ICE QUEUED");
        pendingIce.push(m.candidate);
      } else {
        try {
          await pc.addIceCandidate(m.candidate);
        } catch (err) {
          console.log("ICE error:", err);
        }
      }
    }

    // ---------------- ERROR ----------------
    if (m.type === "error") {
      console.log("SERVER ERROR:", m.message);
      msg.textContent = m.message;
      state.textContent = "OFFLINE";
    }

    // ---------------- END ----------------
    if (m.type === "ended") {
      msg.textContent = "Host stopped the stream.";
      state.textContent = "ENDED";

      if (pc) {
        pc.close();
        pc = null;
      }

      video.srcObject = null;
    }

  } catch (err) {
    console.error("Viewer message error:", err);
  }
};

// Manual click play fallback
video.addEventListener("click", async () => {
  try {
    video.muted = false;
    await video.play();
    console.log("VIDEO PLAYING AFTER CLICK");
  } catch (err) {
    console.error("Play error:", err);
  }
});
