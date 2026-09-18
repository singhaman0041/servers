const express=require("express"),http=require("http"),{WebSocketServer}=require("ws"),crypto=require("crypto"),path=require("path");
const app=express(),server=http.createServer(app),wss=new WebSocketServer({server,path:"/signal"});
app.use(express.static(path.join(__dirname,"public")));
app.get("/watch/:room",(req,res)=>res.sendFile(path.join(__dirname,"public","watch.html")));
const rooms=new Map();
function send(c,o){if(c.readyState===1)c.send(JSON.stringify(o))}
wss.on("connection",(ws)=>{
 let role,id,room;
 ws.on("message",raw=>{
  let m;try{m=JSON.parse(raw)}catch{return}
  if(m.type==="host"){
   role="host";room=m.room;
   if(!rooms.has(room))rooms.set(room,{host:null,viewers:new Map()});
   const r=rooms.get(room); if(r.host&&r.host!==ws)return ws.close();
   r.host=ws; broadcastCount(r);
  }
  if(m.type==="viewer"){
   role="viewer";room=m.room;id=crypto.randomBytes(5).toString("hex");
   const r=rooms.get(room); if(!r||!r.host||r.viewers.size>=3)return send(ws,{type:"error",message:"Room full or offline."}),ws.close();
   r.viewers.set(id,ws); send(r.host,{type:"viewer-joined",id}); broadcastCount(r);
  }
  if(["offer","answer","ice"].includes(m.type)){
   const r=rooms.get(room); if(!r)return;
   const target=m.target==="host"?r.host:r.viewers.get(m.target);
   if(target)send(target,{...m,id});
  }
  if(m.type==="stop"){cleanupRoom(room)}
 });
 ws.on("close",()=>{if(role==="host")cleanupRoom(room);else if(role==="viewer"&&rooms.has(room)){const r=rooms.get(room);r.viewers.delete(id);broadcastCount(r);}});
});
function broadcastCount(r){if(r.host)send(r.host,{type:"count",count:r.viewers.size})}
function cleanupRoom(room){const r=rooms.get(room);if(!r)return;for(const v of r.viewers.values())send(v,{type:"ended"});rooms.delete(room)}
server.listen(process.env.PORT||3000,()=>console.log("StudyStream server running"));