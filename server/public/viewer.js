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
  console.log("Viewer connected");

  ws.send(JSON.stringify({
    type: "viewer",
    room: room
  }));
};

ws.onmessage = async (e) => {
  try {
    const m = JSON.parse(e.data);

    console.log("SIGNAL:", m);

    // -------------------------
    // HOST OFFER
    // -------------------------
    if (m.type === "offer") {

      if (pc) {
        pc.close();
        pc = null;
      }

      pc = new RTCPeerConnection({
        iceServers: [
          {
            urls: "stun:stun.l.google.com:19302"
          }
        ]
      });

      // Receive audio + video
      pc.ontrack = async (event) => {

        console.log("TRACK RECEIVED:", event.track.kind);

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
          msg.textContent = "Click the video to start";
        }
      };

      // Send viewer ICE to HOST
      pc.onicecandidate = (event) => {

        if (!event.candidate) return;

        ws.send(JSON.stringify({
          type: "ice",
          room: room,
          target: "host",
          candidate: event.candidate
        }));
      };

      pc.onconnectionstatechange = () => {

        console.log(
          "Connection state:",
          pc.connectionState
        );

        if (pc.connectionState === "connected") {
          state.textContent = "LIVE";
          msg.textContent = "Live stream connected";
        }

        if (pc.connectionState === "connecting") {
          state.textContent = "CONNECTING";
        }

        if (pc.connectionState === "disconnected") {
          state.textContent = "DISCONNECTED";
          msg.textContent = "Connection interrupted";
        }

        if (pc.connectionState === "failed") {
          state.textContent = "FAILED";
          msg.textContent = "WebRTC connection failed";
        }
      };

      // Set offer received from HOST
      await pc.setRemoteDescription(m.offer);

      // Add ICE candidates received before offer
      for (const candidate of pendingIce) {

        try {
          await pc.addIceCandidate(candidate);
        } catch (err) {
          console.log("Queued ICE error:", err);
        }
      }

      pendingIce = [];

      // Create ANSWER
      const answer = await pc.createAnswer();

      await pc.setLocalDescription(answer);

      // Send ANSWER back to HOST
      ws.send(JSON.stringify({
        type: "answer",
        room: room,
        target: "host",
        answer: pc.localDescription
      }));
    }

    // -------------------------
    // ICE FROM HOST
    // -------------------------
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

    // -------------------------
    // SERVER ERROR
    // -------------------------
    if (m.type === "error") {

      console.log("Server error:", m.message);

      state.textContent = "OFFLINE";
      msg.textContent = m.message;
    }

    // -------------------------
    // STREAM ENDED
    // -------------------------
    if (m.type === "ended") {

      state.textContent = "ENDED";
      msg.textContent = "Host stopped the stream.";

      if (pc) {
        pc.close();
        pc = null;
      }

      video.srcObject = null;
    }

  } catch (err) {

    console.error(
      "Viewer message error:",
      err
    );

  }
};

// Manual playback if autoplay is blocked
video.addEventListener("click", () => {

  video.play().catch(err => {
    console.log("Play error:", err);
  });

});
