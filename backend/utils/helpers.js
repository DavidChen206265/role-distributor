// backend/utils/helpers.js

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getPublicBoard(room) {
  return room.players
    .filter((p) => p.status !== "left")
    .map((p) => ({
      username: p.username,
      displayRole:
        p.role && p.role.isHidden && !p.isRevealed
          ? "???"
          : p.role
            ? p.role.name
            : "Error: No Role",
      color:
        p.role && p.role.isHidden && !p.isRevealed
          ? "#888"
          : p.role
            ? p.role.color
            : "#888",
      isDead: p.isDead || false,
    }));
}

function getComposition(room) {
  const comp = {};
  if (room.compositionInfo) {
    Object.keys(room.compositionInfo).forEach((k) => {
      comp[k] = {
        count: 0,
        deadCount: 0,
        color: room.compositionInfo[k].color,
      };
    });
    room.players.forEach((p) => {
      if (p.status !== "left" && p.role && comp[p.role.name]) {
        if (p.isDead) comp[p.role.name].deadCount++;
        else comp[p.role.name].count++;
      }
    });
  }
  return comp;
}

module.exports = {
  generateRoomCode,
  shuffleArray,
  getPublicBoard,
  getComposition,
};
