import { io } from "socket.io-client";

const socket = io("https://servers.faucetify.io/", {
  transports: ["websocket", "polling"],
});

const results = [];
let tested = 0;

socket.on("connect", () => console.log("connected"));

socket.on("activityFeedPacket", async (e) => {
  const ids = [...new Set((e.feedPack || []).map((x) => x.userId))].slice(0, 25);
  for (const uid of ids) {
    socket.emit("getUserDetails", { user: uid });
    await new Promise((r) => setTimeout(r, 150));
  }
});

socket.on("userDetails", (e) => {
  const u = e.userDetails;
  tested++;
  if (u.country || !u.profileVisible) results.push(u);
});

setTimeout(() => {
  console.log("tested", tested, "interesting", results);
  socket.close();
  process.exit(0);
}, 12000);
