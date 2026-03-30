import { io } from "socket.io-client";
import { state } from "./state.js";
import {
  DOM,
  addLog,
  renderComposition,
  renderPublicBoard,
  resetToLobby,
} from "./ui.js";
import { TEXT_SHADOW } from "./utils.js";
import { t } from "./i18n.js";

export const socket = io();

export function setupSocketListeners() {
  socket.on("connect", () => {
    DOM.statusEl.setAttribute("data-i18n", "connected");
    DOM.statusEl.textContent = t("connected");
  });

  socket.on("force_logout", (data) => {
    alert("⚠️ " + (data.msgCode ? t(data.msgCode, data.args) : data.message));
    window.location.reload();
  });

  socket.on("error_msg", (data) => {
    alert("❌ " + (data.msgCode ? t(data.msgCode, data.args) : data.message));
  });

  socket.on("join_success", (data) => {
    state.currentRoomId = data.roomId;
    state.isHost = data.isHost;
    localStorage.setItem("lastActiveRoomId", state.currentRoomId);
    state.savedRoomId = state.currentRoomId;

    DOM.lobbySection.style.display = "none";
    DOM.roomSection.style.display = "block";
    DOM.displayRoomId.textContent = state.currentRoomId;

    DOM.hostPanel.style.display = state.isHost ? "block" : "none";
    DOM.btnDisband.style.display = state.isHost ? "block" : "none";
    DOM.btnExit.style.display = state.isHost ? "none" : "block";

    const isPlaying = data.roomData.gameState === "playing";
    state.currentDeathMode = data.roomData.settings.deathMode || false;
    DOM.cbDeathMode.checked = state.currentDeathMode;

    DOM.btnEnforceRules.style.display =
      state.isHost && !isPlaying ? "block" : "none";
    DOM.btnDeal.style.display = isPlaying ? "none" : "block";
    DOM.btnReset.style.display = state.isHost && isPlaying ? "block" : "none";

    DOM.selectAccessMode.disabled = isPlaying;
    DOM.taWhitelist.disabled = isPlaying;
    DOM.taBlacklist.disabled = isPlaying;
    DOM.btnSaveLists.disabled = isPlaying;
    DOM.cbHostParticipate.disabled = isPlaying;
    DOM.cbDeathMode.disabled = isPlaying;
  });

  socket.on("player_kicked", (data) => {
    if (data.targetUsername === state.currentUsername) {
      alert(t("kicked_notice"));
      localStorage.removeItem("lastActiveRoomId");
      state.savedRoomId = "";
      resetToLobby();
    }
  });

  socket.on("manage_offline_players", (data) => {
    if (
      confirm(
        `${t("MSG_OFFLINE_PLAYERS")}:\n${data.offlineList.join(", ")}\n${t("confirm")} ?`,
      )
    ) {
      data.offlineList.forEach((username) => {
        socket.emit("kick_player", {
          roomId: state.currentRoomId,
          targetUsername: username,
          ban: false,
        });
      });
    }
  });

  socket.on("room_state_update", (data) => {
    const room = data.roomData;
    const isPlaying = room.gameState === "playing";
    state.currentDeathMode = room.settings.deathMode || false;

    addLog(data);

    const activePlayers = room.players.filter((p) => p.status !== "left");
    state.currentPlayersCount = activePlayers.length;
    DOM.displayCount.textContent = state.currentPlayersCount;

    if (state.isHost && !isPlaying) {
      if (document.activeElement !== DOM.selectAccessMode)
        DOM.selectAccessMode.value = room.settings.accessMode || "allow_all";
      if (document.activeElement !== DOM.taWhitelist)
        DOM.taWhitelist.value = room.whitelist.join("\n");
      if (document.activeElement !== DOM.taBlacklist)
        DOM.taBlacklist.value = room.blacklist.join("\n");
    }

    DOM.realtimeMembersList.innerHTML = "";
    if (!state.isHost && !room.settings.showPlayerList) {
      DOM.realtimeMembersList.style.display = "none";
      DOM.hiddenListMsg.style.display = "block";
    } else {
      DOM.realtimeMembersList.style.display = "block";
      DOM.hiddenListMsg.style.display = "none";
      room.players.forEach((p) => {
        const li = document.createElement("li");
        li.style.marginBottom = "4px";
        let statusHtml =
          p.status === "offline"
            ? `<span style='color:#ff9800; font-size:12px;'>${t("offline")}</span>`
            : "";
        const isWhite = room.whitelist.includes(p.username);
        const nameColor = isWhite ? "#aed581" : "inherit";

        let actionsHtml = "";
        if (state.isHost && !p.isHost && !isPlaying) {
          // 【修复】应用翻译字典
          let whiteBtn = isWhite
            ? ""
            : `<button data-action="white" data-target="${p.username}" style="font-size:11px; margin-left:5px; padding:2px 5px; background:#4CAF50; color:white; border:none; border-radius:3px; cursor:pointer;">+${t("add_white")}</button>`;
          actionsHtml = `${whiteBtn}<button data-action="kick" data-target="${p.username}" style="font-size:11px; margin-left:3px; padding:2px 5px; background:#e67e22; color:white; border:none; border-radius:3px; cursor:pointer;">${t("kick")}</button><button data-action="ban" data-target="${p.username}" style="font-size:11px; margin-left:3px; padding:2px 5px; background:#c0392b; color:white; border:none; border-radius:3px; cursor:pointer;">${t("ban")}</button>`;
        }
        li.innerHTML = `<strong style="color:${nameColor}">${p.username}</strong> ${p.isHost ? "👑" : ""} ${statusHtml} ${actionsHtml}`;
        DOM.realtimeMembersList.appendChild(li);
      });
    }
  });

  socket.on("receive_role", (data) => {
    DOM.gameBoard.style.display = "block";
    DOM.personalDeathTag.style.display = "none";
    DOM.myRoleText.textContent = data.roleName;
    DOM.myRoleText.style.color = data.color;
    DOM.myRoleText.style.cssText += TEXT_SHADOW + "font-size: 3em;";

    DOM.myRoleType.textContent = data.isHidden
      ? t("hidden_identity")
      : t("public_identity");
  });

  socket.on("death_status_update", (data) => {
    DOM.personalDeathTag.style.display = data.isDead ? "block" : "none";
    if (data.isDead && navigator.vibrate) navigator.vibrate([300, 100, 300]);
  });

  socket.on("roles_distributed", (data) => {
    addLog(data);
    renderComposition(data.composition, data.broadcastComposition);

    if (state.isHost) {
      DOM.btnEnforceRules.style.display = "none";
      DOM.btnDeal.style.display = "none";
      DOM.btnReset.style.display = "block";
      DOM.btnAddRole.style.display = "none";

      for (let node of DOM.roleConfigContainer.children) {
        node.querySelector(".role-name").disabled = true;
        node.querySelector(".role-count").disabled = true;
        node.querySelector(".role-hidden").disabled = true;
        node.querySelector(".role-color").disabled = true;
        node.querySelector(".role-autofill").disabled = true;
        node.querySelector(".btn-remove-config").style.display = "none";
        node.querySelector(".btn-reveal-role").style.display = "block";

        if (state.currentDeathMode) {
          node.querySelector(".btn-kill-role").style.display = "block";
          node.querySelector(".btn-revive-role").style.display = "block";
        }
      }
      DOM.selectAccessMode.disabled = true;
      DOM.taWhitelist.disabled = true;
      DOM.taBlacklist.disabled = true;
      DOM.btnSaveLists.disabled = true;
      DOM.cbHostParticipate.disabled = true;
      DOM.cbDeathMode.disabled = true;
    }
    renderPublicBoard(data.publicBoard);
  });

  socket.on("board_update", (data) => {
    if (data.msgCode || data.message) addLog(data);

    renderComposition(data.composition, data.broadcastComposition);
    renderPublicBoard(data.publicBoard);
  });

  socket.on("room_reset", (data) => {
    addLog(data);
    alert(data.msgCode ? t(data.msgCode, data.args) : data.message);

    DOM.gameBoard.style.display = "none";
    DOM.compositionDisplay.style.display = "none";
    DOM.publicBoardList.innerHTML = "";

    if (state.isHost) {
      DOM.btnEnforceRules.style.display = "block";
      DOM.btnDeal.style.display = "block";
      DOM.btnReset.style.display = "none";
      DOM.btnAddRole.style.display = "block";

      for (let node of DOM.roleConfigContainer.children) {
        node.querySelector(".role-name").disabled = false;
        node.querySelector(".role-count").disabled = false;
        node.querySelector(".role-hidden").disabled = false;
        node.querySelector(".role-color").disabled = false;
        node.querySelector(".role-autofill").disabled = false;
        node.querySelector(".btn-remove-config").style.display = "block";
        node.querySelector(".btn-reveal-role").style.display = "none";
        node.querySelector(".btn-kill-role").style.display = "none";
        node.querySelector(".btn-revive-role").style.display = "none";
      }

      DOM.selectAccessMode.disabled = false;
      DOM.taWhitelist.disabled = false;
      DOM.taBlacklist.disabled = false;
      DOM.btnSaveLists.disabled = false;
      DOM.cbHostParticipate.disabled = false;
      DOM.cbDeathMode.disabled = false;
    }
  });

  socket.on("room_disbanded", (data) => {
    alert("⚠️ " + (data.msgCode ? t(data.msgCode, data.args) : data.message));
    resetToLobby();
  });
}
