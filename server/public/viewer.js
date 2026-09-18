const room = location.pathname.split("/").pop();

const video = document.getElementById("video");
const state = document.getElementById("state");
const msg = document.getElementById("msg");

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelay",
    credential: "openrelay"
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelay",
    credential: "openrelay"
  }
];

const ws = new WebSocket(
  (location.protocol === "https:" ? "wss://" : "ws://") +
  location.host +
  "/signal"
);

let pc = null;
let pendingIce = [];

function setLive() {
  state.textContent = "LIVE";
  state.className = "ml-auto px-3 py-1 rounded-full bg-emerald-500/15 text-xs text-emerald-300";
  msg.textContent = "Click on the video if sound is muted";
}

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: "viewer",
    room: room
  }));
};

ws.onmessage = async (e) => {
  try {
    const m = JSON.parse(e.data);

    if (m.type === "offer") {
      if (pc) {
        pc.close();
        pc = null;
      }

      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      pc.ontrack = (event) => {
        console.log("Track received:", event.track.kind);
        
        video.srcObject = event.streams[0];
        video.muted = true; // Mute initially to bypass browser autoplay blocks
        video.play();
        
        setLive();
      };

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

      await pc.setRemoteDescription(m.offer);

      for (const candidate of pendingIce) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (err) {}
      }
      pendingIce = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      ws.send(JSON.stringify({
        type: "answer",
        room: room,
        target: "host",
        answer: pc.localDescription
      }));
    }

    if (m.type === "ice") {
      if (!pc || !pc.remoteDescription) {
        pendingIce.push(m.candidate);
      } else {
        try {
          await pc.addIceCandidate(m.candidate);
        } catch (err) {}
      }
    }

    if (m.type === "ended") {
      msg.textContent = "Host stopped stream.";
      state.textContent = "ENDED";
      if (pc) pc.close();
      video.srcObject = null;
    }

  } catch (err) {
    console.error("Viewer error:", err);
  }
};

// Click to enable audio fallback
video.addEventListener("click", () => {
  video.muted = false;
  video.play();
});
