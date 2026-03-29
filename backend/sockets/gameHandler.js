// backend/sockets/gameHandler.js
const {
  shuffleArray,
  getPublicBoard,
  getComposition,
} = require("../utils/helpers");

module.exports = (io, socket, activeRooms, globalActiveUsers) => {
  socket.on("distribute_roles", (data) => {
    const { roomId, rolesConfig, hostParticipates } = data;
    const room = activeRooms[roomId];
    if (!room) return;

    const offlinePlayers = room.players.filter((p) => p.status === "offline");
    if (offlinePlayers.length > 0)
      return socket.emit("manage_offline_players", {
        msgCode: "MSG_OFFLINE_PLAYERS",
        offlineList: offlinePlayers.map((p) => p.username),
      });

    const activePlayers = room.players.filter((p) => p.status !== "left");
    const playersToReceiveRoles = hostParticipates
      ? activePlayers
      : activePlayers.filter((p) => !p.isHost);

    let expandedRoles = [];
    const compositionInfo = {};
    rolesConfig.forEach((config) => {
      compositionInfo[config.name] = { color: config.color };
      for (let i = 0; i < config.count; i++)
        expandedRoles.push({
          name: config.name,
          isHidden: config.isHidden,
          color: config.color,
        });
    });

    if (expandedRoles.length !== playersToReceiveRoles.length)
      return socket.emit("error_msg", { msgCode: "ERR_DEAL_COUNT_MISMATCH" });

    room.gameState = "playing";
    room.compositionInfo = compositionInfo;
    const shuffledRoles = shuffleArray([...expandedRoles]);

    playersToReceiveRoles.forEach((player, index) => {
      player.role = shuffledRoles[index];
      player.isRevealed = false;
      player.isDead = false;
      if (player.status === "online") {
        io.to(player.socketId).emit("receive_role", {
          roleName: player.role.name,
          isHidden: player.role.isHidden,
          color: player.role.color,
        });
        io.to(player.socketId).emit("death_status_update", { isDead: false });
      }
    });

    if (!hostParticipates) {
      const host = activePlayers.find((p) => p.isHost);
      if (host) {
        host.role = { name: "法官(不参与)", isHidden: false, color: "#bdc3c7" };
        host.isRevealed = true;
        host.isDead = false;
        if (host.status === "online") {
          io.to(host.socketId).emit("receive_role", {
            roleName: host.role.name,
            isHidden: host.role.isHidden,
            color: host.role.color,
          });
          io.to(host.socketId).emit("death_status_update", { isDead: false });
        }
      }
    }

    io.to(roomId).emit("roles_distributed", {
      msgCode: "MSG_DEAL_DONE",
      publicBoard: getPublicBoard(room),
      broadcastComposition: room.settings.broadcastComposition,
      composition: getComposition(room),
    });
  });

  socket.on("reveal_single", (data) => {
    const { roomId, targetUsername } = data;
    const room = activeRooms[roomId];
    if (!room) return;
    const target = room.players.find((p) => p.username === targetUsername);
    if (target && target.role && target.role.isHidden) {
      target.isRevealed = true;
      io.to(roomId).emit("board_update", {
        msgCode: "MSG_REVEAL_SINGLE",
        args: { user: targetUsername, role: target.role.name },
        publicBoard: getPublicBoard(room),
        composition: getComposition(room),
        broadcastComposition: room.settings.broadcastComposition,
      });
    }
  });

  socket.on("reveal_group", (data) => {
    const { roomId, roleName } = data;
    const room = activeRooms[roomId];
    if (!room) return;
    let revealedCount = 0;
    room.players.forEach((p) => {
      if (
        p.role &&
        p.role.name === roleName &&
        p.role.isHidden &&
        !p.isRevealed
      ) {
        p.isRevealed = true;
        revealedCount++;
      }
    });
    if (revealedCount > 0) {
      io.to(roomId).emit("board_update", {
        msgCode: "MSG_REVEAL_GROUP",
        args: { role: roleName },
        publicBoard: getPublicBoard(room),
        composition: getComposition(room),
        broadcastComposition: room.settings.broadcastComposition,
      });
    } else
      socket.emit("error_msg", {
        msgCode: "ERR_NO_HIDDEN_ROLE",
        args: { role: roleName },
      });
  });

  socket.on("reveal_roles", (roomId) => {
    const room = activeRooms[roomId];
    if (!room) return;
    room.players.forEach((p) => (p.isRevealed = true));
    io.to(roomId).emit("reveal_all", {
      msgCode: "MSG_REVEAL_ALL",
      allRoles: getPublicBoard(room),
    });
  });

  socket.on("toggle_death", (data) => {
    const { roomId, targetUsername } = data;
    const room = activeRooms[roomId];
    if (!room) return;
    const host = room.players.find((p) => p.socketId === socket.id);
    if (!host || !host.isHost) return;

    const target = room.players.find((p) => p.username === targetUsername);
    if (target) {
      target.isDead = !target.isDead;
      if (target.status === "online")
        io.to(target.socketId).emit("death_status_update", {
          isDead: target.isDead,
        });

      io.to(roomId).emit("board_update", {
        msgCode: target.isDead ? "MSG_DEATH" : "MSG_REVIVE",
        args: { user: targetUsername },
        publicBoard: getPublicBoard(room),
        composition: getComposition(room),
        broadcastComposition: room.settings.broadcastComposition,
      });
    }
  });

  socket.on("batch_toggle_death", (data) => {
    const { roomId, roleName, isDead } = data;
    const room = activeRooms[roomId];
    if (!room) return;
    const host = room.players.find((p) => p.socketId === socket.id);
    if (!host || !host.isHost) return;

    let changedCount = 0;
    room.players.forEach((p) => {
      if (
        p.status !== "left" &&
        p.role &&
        p.role.name === roleName &&
        p.isDead !== isDead
      ) {
        p.isDead = isDead;
        changedCount++;
        if (p.status === "online")
          io.to(p.socketId).emit("death_status_update", { isDead: p.isDead });
      }
    });

    if (changedCount > 0) {
      io.to(roomId).emit("board_update", {
        msgCode: isDead ? "MSG_BATCH_DEATH" : "MSG_BATCH_REVIVE",
        args: { role: roleName },
        publicBoard: getPublicBoard(room),
        composition: getComposition(room),
        broadcastComposition: room.settings.broadcastComposition,
      });
    } else {
      socket.emit("error_msg", {
        msgCode: "ERR_NO_ROLE_TO_CHANGE",
        args: { role: roleName },
      });
    }
  });

  socket.on("reset_room", (roomId) => {
    const room = activeRooms[roomId];
    if (!room) return;
    room.gameState = "waiting";
    room.players.forEach((p) => {
      p.role = null;
      p.isRevealed = false;
      p.isDead = false;
    });
    io.to(roomId).emit("room_reset", {
      msgCode: "MSG_RESET",
    });
    io.to(roomId).emit("room_state_update", {
      msgCode: "MSG_STATE_RESET",
      roomData: room,
    });
  });
};
