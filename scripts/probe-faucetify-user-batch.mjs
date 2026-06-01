import { io } from "socket.io-client";

const socket = io("https://servers.faucetify.io/", {
  transports: ["websocket", "polling"],
});

const userIds = [];
const results = [];

socket.on("connect", () => {
  console.log("connected");
});

socket.on("activityFeedPacket", (e) => {
  for (const item of e.feedPack || []) {
    if (item.userId && item.feedType === "earn") userIds.push(item.userId);
  }
});

socket.on("userDetails", (e) => {
  results.push(e.userDetails);
});

setTimeout(async () => {
  const uniq = [...new Set(userIds)].slice(0, 12);
  for (const uid of uniq) {
    socket.emit("getUserDetails", { user: uid });
    await new Promise((r) => setTimeout(r, 300));
  }
  await new Promise((r) => setTimeout(r, 3000));
  console.log(
    "results",
    results.map((r) => ({
      user: r.username,
      country: r.country,
      visible: r.profileVisible,
    }))
  );
  socket.close();
  process.exit(0);
}, 8000);
