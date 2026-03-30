// backend/sockets/roomHandler.js
const {
  generateRoomCode,
  getPublicBoard,
  getComposition,
} = require("../utils/helpers");

module.exports = (io, socket, activeRooms, globalActiveUsers) => {
  // handle device conflict: if the same username logs in from another device, force the previous one to log out
  function handleDeviceConflict(username) {
    if (
      globalActiveUsers[username] &&
      globalActiveUsers[username] !== socket.id
    ) {
      io.to(globalActiveUsers[username]).emit("force_logout", {
        msgCode: "MSG_FORCE_LOGOUT",
      });
    }
    globalActiveUsers[username] = socket.id;
    socket.username = username;
  }

  socket.on("user_login", ({ username }, callback) => {
    const oldSocketId = globalActiveUsers[username];
    if (oldSocketId && oldSocketId !== socket.id) {
      io.to(oldSocketId).emit("force_logout");
    }

    globalActiveUsers[username] = socket.id;

    let foundRoomId = null;
    for (const roomId in activeRooms) {
      const room = activeRooms[roomId];
      const player = room.players.find((p) => p.username === username);

      if (player) {
        foundRoomId = roomId;
        player.status = "active";
        socket.join(roomId);

        io.to(roomId).emit("room_state", room);
        break;
      }
    }

    if (typeof callback === "function") {
      callback({ roomId: foundRoomId });
    }
  });

  socket.on("create_room", (data) => {
    const { username } = data;
    handleDeviceConflict(username);

    const roomId = generateRoomCode();
    socket.join(roomId);

    activeRooms[roomId] = {
      gameState: "waiting",
      settings: {
        showPlayerList: true,
        broadcastComposition: true,
        accessMode: "allow_all",
        deathMode: false,
      },
      blacklist: [],
      whitelist: [username],
      compositionInfo: {},
      players: [
        {
          socketId: socket.id,
          username,
          isHost: true,
          status: "online",
          role: null,
          isRevealed: false,
          isDead: false,
        },
      ],
    };

    socket.emit("join_success", {
      roomId,
      isHost: true,
      roomData: activeRooms[roomId],
    });

    io.to(roomId).emit("room_state_update", {
      msgCode: "MSG_ROOM_CREATED",
      roomData: activeRooms[roomId],
    });
  });

  socket.on("join_room", (data) => {
    const { roomId, username } = data;
    handleDeviceConflict(username);

    const room = activeRooms[roomId];
    if (!room)
      return socket.emit("error_msg", {
        msgCode: "ERR_ROOM_NOT_FOUND",
      });

    const isGuest = username.toLowerCase().startsWith("guest_");
    if (room.settings.accessMode !== "allow_all" && isGuest) {
      return socket.emit("error_msg", {
        msgCode: "ERR_GUEST_FORBIDDEN",
      });
    }

    const isHostRejoin = room.players.some(
      (p) => p.username === username && p.isHost,
    );
    if (!isHostRejoin) {
      if (
        room.settings.accessMode === "blacklist" &&
        room.blacklist.includes(username)
      ) {
        return socket.emit("error_msg", {
          msgCode: "ERR_BLACKLISTED",
        });
      }
      if (
        room.settings.accessMode === "whitelist" &&
        !room.whitelist.includes(username)
      ) {
        return socket.emit("error_msg", {
          msgCode: "ERR_NOT_IN_WHITELIST",
        });
      }
    }

    let player = room.players.find((p) => p.username === username);
    if (player) {
      player.socketId = socket.id;
      player.status = "online";
      socket.join(roomId);

      socket.emit("join_success", {
        roomId,
        isHost: player.isHost,
        roomData: room,
      });
      if (player.role && room.gameState === "playing") {
        socket.emit("receive_role", {
          roleName: player.role.name,
          isHidden: player.role.isHidden,
          color: player.role.color,
        });
        socket.emit("death_status_update", { isDead: player.isDead });
      }
      io.to(roomId).emit("room_state_update", {
        msgCode: "MSG_RECONNECTED",
        args: { user: username },
        roomData: room,
      });
    } else {
      if (room.gameState === "playing")
        return socket.emit("error_msg", {
          msgCode: "ERR_GAME_STARTED",
        });

      player = {
        socketId: socket.id,
        username,
        isHost: false,
        status: "online",
        role: null,
        isRevealed: false,
        isDead: false,
      };
      room.players.push(player);
      socket.join(roomId);

      socket.emit("join_success", { roomId, isHost: false, roomData: room });
      io.to(roomId).emit("room_state_update", {
        msgCode: "MSG_JOINED",
        args: { user: username },
        roomData: room,
      });
    }
  });

  socket.on("update_lists_batch", (data) => {
    const { roomId, whitelist, blacklist } = data;
    const room = activeRooms[roomId];
    if (!room) return;
    const host = room.players.find((p) => p.socketId === socket.id);
    if (!host || !host.isHost) return;

    let newWl = [...new Set(whitelist)];
    let newBl = [...new Set(blacklist)];

    if (!newWl.includes(host.username)) newWl.push(host.username);
    newBl = newBl.filter((u) => u !== host.username);
    newWl = newWl.filter((u) => !newBl.includes(u));

    room.whitelist = newWl;
    room.blacklist = newBl;
    io.to(roomId).emit("room_state_update", {
      msgCode: "MSG_LISTS_UPDATED",
      roomData: room,
    });
  });

  socket.on("add_to_list", (data) => {
    const { roomId, type, targetUsername } = data;
    const room = activeRooms[roomId];
    if (!room) return;
    const host = room.players.find((p) => p.socketId === socket.id);
    if (!host || !host.isHost) return;

    if (type === "whitelist") {
      if (!room.whitelist.includes(targetUsername))
        room.whitelist.push(targetUsername);
      room.blacklist = room.blacklist.filter((u) => u !== targetUsername);
    } else if (type === "blacklist") {
      if (targetUsername === host.username) return;
      if (!room.blacklist.includes(targetUsername))
        room.blacklist.push(targetUsername);
      room.whitelist = room.whitelist.filter((u) => u !== targetUsername);
    }
    io.to(roomId).emit("room_state_update", {
      msgCode: "MSG_ADDED_TO_LIST",
      args: { user: targetUsername, list: type },
      roomData: room,
    });
  });

  socket.on("enforce_access_rules", (roomId) => {
    const room = activeRooms[roomId];
    if (!room) return;
    const host = room.players.find((p) => p.socketId === socket.id);
    if (!host || !host.isHost) return;

    let kickedCount = 0;
    room.players.forEach((p) => {
      if (p.isHost || p.status === "left") return;
      let shouldKick = false;
      const isGuest = p.username.startsWith("guest_");

      if (room.settings.accessMode !== "allow_all" && isGuest)
        shouldKick = true;
      if (
        room.settings.accessMode === "blacklist" &&
        room.blacklist.includes(p.username)
      )
        shouldKick = true;
      if (
        room.settings.accessMode === "whitelist" &&
        !room.whitelist.includes(p.username)
      )
        shouldKick = true;

      if (shouldKick) {
        p.status = "left";
        kickedCount++;
        io.to(p.socketId).emit("player_kicked", {
          targetUsername: p.username,
          ban: false,
          msgCode: "MSG_KICKED_BY_RULES",
        });
      }
    });

    if (kickedCount > 0) {
      room.players = room.players.filter((p) => p.status !== "left");
      io.to(roomId).emit("room_state_update", {
        msgCode: "MSG_ENFORCE_RULES_KICKED",
        args: { count: kickedCount },
        roomData: room,
      });
      if (room.gameState === "playing") {
        io.to(roomId).emit("board_update", {
          publicBoard: getPublicBoard(room),
          composition: getComposition(room),
          broadcastComposition: room.settings.broadcastComposition,
        });
      }
    } else {
      socket.emit("room_state_update", {
        msgCode: "MSG_ENFORCE_RULES_OK",
        roomData: room,
      });
    }
  });

  socket.on("kick_player", (data) => {
    const { roomId, targetUsername, ban } = data;
    const room = activeRooms[roomId];
    if (!room) return;
    const host = room.players.find((p) => p.socketId === socket.id);
    if (!host || !host.isHost) return;

    if (ban) {
      if (!room.blacklist.includes(targetUsername))
        room.blacklist.push(targetUsername);
      room.whitelist = room.whitelist.filter((u) => u !== targetUsername);
    }
    room.players = room.players.filter((p) => p.username !== targetUsername);

    io.to(roomId).emit("player_kicked", { targetUsername, ban });
    io.to(roomId).emit("room_state_update", {
      msgCode: ban ? "MSG_KICKED_BAN" : "MSG_KICKED",
      args: { user: targetUsername },
      roomData: room,
    });
    if (room.gameState === "playing") {
      io.to(roomId).emit("board_update", {
        publicBoard: getPublicBoard(room),
        composition: getComposition(room),
        broadcastComposition: room.settings.broadcastComposition,
      });
    }
  });

  socket.on("update_settings", (data) => {
    const { roomId, settings } = data;
    if (activeRooms[roomId]) {
      activeRooms[roomId].settings = {
        ...activeRooms[roomId].settings,
        ...settings,
      };
      io.to(roomId).emit("room_state_update", {
        msgCode: "MSG_SETTINGS_UPDATED",
        roomData: activeRooms[roomId],
      });
    }
  });

  socket.on("exit_room", (roomId) => {
    const room = activeRooms[roomId];
    if (!room) return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (player) {
      room.players = room.players.filter((p) => p.socketId !== socket.id);
      socket.leave(roomId);
      io.to(roomId).emit("room_state_update", {
        msgCode: "MSG_LEFT",
        args: { user: player.username },
        roomData: room,
      });
      if (room.gameState === "playing") {
        io.to(roomId).emit("board_update", {
          publicBoard: getPublicBoard(room),
          composition: getComposition(room),
          broadcastComposition: room.settings.broadcastComposition,
        });
      }
    }
  });

  socket.on("disband_room", (roomId) => {
    const room = activeRooms[roomId];
    if (!room) return;
    io.to(roomId).emit("room_disbanded", { msgCode: "MSG_ROOM_DISBANDED" });
    delete activeRooms[roomId];
  });

  socket.on("disconnect", () => {
    if (socket.username && globalActiveUsers[socket.username] === socket.id) {
      delete globalActiveUsers[socket.username];
    }
    for (const roomId in activeRooms) {
      const room = activeRooms[roomId];
      const player = room.players.find((p) => p.socketId === socket.id);
      if (player && player.status === "online") {
        player.status = "offline";
        io.to(roomId).emit("room_state_update", {
          msgCode: "MSG_DISCONNECTED",
          args: { user: player.username },
          roomData: room,
        });
      }
    }
  });
};
