import { io } from "socket.io-client";

const socket = io("https://servers.faucetify.io/", {
  transports: ["websocket", "polling"],
});

socket.on("connect", () => {
  console.log("connected");
  socket.emit("getUserDetails", { user: "61265" });
  socket.emit("getUserDetails", { user: 61265 });
});

socket.on("userDetails", (e) => console.log("userDetails", JSON.stringify(e, null, 2)));
socket.on("connect_error", (e) => console.log("err", e.message));

setTimeout(() => {
  socket.close();
  process.exit(0);
}, 10000);
