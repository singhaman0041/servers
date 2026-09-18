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

ws.onopen = () => {
  console.log("Viewer connected to signaling server");

  ws.send(JSON.stringify({
    type: "viewer",
    room
  }));
};

ws.onmessage = async (e) => {
  try {
    const m = JSON.parse(e.data);

    console.log("SIGNAL:", m);

    // HOST OFFER
    if (m.type === "offer") {

      if (pc) {
        pc.close();
      }

      pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" }
        ]
      });

      // Receive video + audio
      pc.ontrack = async (event) => {

        console.log("REMOTE TRACK:", event.track.kind);

        if (event.streams && event.streams[0]) {
          video.srcObject = event.streams[0];
        }

        state.textContent = "LIVE";
        state.className =
          "ml-auto px-3 py-1 rounded-full bg-emerald-500/15 text-xs text-emerald-300";

        msg.textContent = "Live stream connected";

        try {
          await video.play();
        } catch (err) {
          console.log("Autoplay blocked:", err);
          msg.textContent = "Click video to start playback";
        }
      };

      // Send ICE candidate to HOST
      pc.onicecandidate = (event) => {

        if (event.candidate) {

          ws.send(JSON.stringify({
            type: "ice",
            room,
            target: "host",
            candidate: event.candidate
          }));

        }
      };

      pc.onconnectionstatechange = () => {

        console.log(
          "WebRTC state:",
          pc.connectionState
        );

        if (pc.connectionState === "connected") {
          state.textContent = "LIVE";
        }

        if (pc.connectionState === "failed") {
          state.textContent = "CONNECTION FAILED";
          msg.textContent = "WebRTC connection failed";
        }

        if (pc.connectionState === "disconnected") {
          state.textContent = "DISCONNECTED";
        }
      };

      // Set HOST offer
      await pc.setRemoteDescription(m.offer);

      // Add ICE candidates that arrived early
      for (const candidate of pendingIce) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (err) {
          console.log("Queued ICE error:", err);
        }
      }

      pendingIce = [];

      // Create answer
      const answer = await pc.createAnswer();

      await pc.setLocalDescription(answer);

      // IMPORTANT:
      // Answer goes back to HOST
      ws.send(JSON.stringify({
        type: "answer",
        room,
        target: "host",
        answer: pc.localDescription
      }));
    }

    // ICE FROM HOST
    if (m.type === "ice") {

      if (!pc || !pc.remoteDescription) {
        pendingIce.push(m.candidate);
      } else {
        try {
          await pc.addIceCandidate(m.candidate);
        } catch (err) {
          console.log("ICE error:", err);
        }
      }
    }

    // ERROR
    if (m.type === "error") {
      msg.textContent = m.message;
      state.textContent = "OFFLINE";
    }

    // STREAM ENDED
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


// If browser blocks autoplay,
// clicking video will start it.
video.addEventListener("click", () => {
  video.play().catch(err => {
    console.log("Play error:", err);
  });
});
