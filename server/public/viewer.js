const room=location.pathname.split("/").pop(),video=document.getElementById("video"),state=document.getElementById("state"),msg=document.getElementById("msg");
const ws=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host+"/signal");let pc;
ws.onopen=()=>ws.send(JSON.stringify({type:"viewer",room}));
ws.onmessage=async e=>{
 const m=JSON.parse(e.data);
 if(m.type==="offer"){
  pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
  pc.ontrack=e=>{video.srcObject=e.streams[0];state.textContent="LIVE";state.className="ml-auto px-3 py-1 rounded-full bg-emerald-500/15 text-xs text-emerald-300";msg.textContent="Live stream connected"};
  pc.onicecandidate=e=>e.candidate&&ws.send(JSON.stringify({type:"ice",room,target:"host",candidate:e.candidate}));
  await pc.setRemoteDescription(m.offer);const a=await pc.createAnswer();await pc.setLocalDescription(a);
  ws.send(JSON.stringify({type:"answer",room,target:m.id,answer:pc.localDescription}));
 }
 if(m.type==="ice"&&pc)try{await pc.addIceCandidate(m.candidate)}catch{}
 if(m.type==="error"){msg.textContent=m.message;state.textContent="OFFLINE"}
 if(m.type==="ended"){msg.textContent="Host stopped the stream.";state.textContent="ENDED";if(pc)pc.close()}
};