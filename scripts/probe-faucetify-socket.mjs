import { io } from "socket.io-client";

const socket = io("https://servers.faucetify.io/", {
  transports: ["websocket", "polling"],
  extraHeaders: {},
});

socket.on("connect", () => console.log("connected", socket.id));
socket.on("connect_error", (e) => console.log("connect_error", e.message));
socket.on("activityFeed", (e) => console.log("activityFeed", JSON.stringify(e).slice(0, 800)));
socket.on("activityFeedPacket", (e) =>
  console.log("activityFeedPacket", JSON.stringify(e).slice(0, 800))
);

setTimeout(() => {
  console.log("done");
  socket.close();
  process.exit(0);
}, 15000);
