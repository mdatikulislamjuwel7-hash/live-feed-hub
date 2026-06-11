module.exports = {
  apps: [
    {
      name: "live-feed-hub",
      script: "src/index.js",
      cwd: __dirname,
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3847",
      },
      max_memory_restart: "700M",
      restart_delay: 5000,
      watch: false,
      time: true,
    },
  ],
};
