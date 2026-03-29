export const state = {
  currentUserToken: null,
  currentUsername: null,
  currentRoomId: "",
  isHost: false,
  configIdCounter: 0,
  currentPlayersCount: 0,
  currentDeathMode: false,
  savedRoomId: localStorage.getItem("lastActiveRoomId") || "",
  currentLang: localStorage.getItem("app_lang") || "zh",
};
