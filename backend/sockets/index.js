// backend/sockets/index.js
const roomHandler = require("./roomHandler");
const gameHandler = require("./gameHandler");

const activeRooms = {};
const globalActiveUsers = {};

module.exports = (io) => {
  io.on("connection", (socket) => {
    roomHandler(io, socket, activeRooms, globalActiveUsers);
    gameHandler(io, socket, activeRooms, globalActiveUsers);
  });
};
