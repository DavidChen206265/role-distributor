// backend/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const setupSockets = require("./sockets/index");

require("./config/db");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", authRoutes);

const path = require("path");

app.use(express.static(path.join(__dirname, "../frontend/dist")));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

setupSockets(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`server started on port ${PORT}`));
