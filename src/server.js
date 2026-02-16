// src/server.js
const { PORT } = require("./config");
const { createApp } = require("./app");

const app = createApp();

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
