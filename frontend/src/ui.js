import { state } from "./state.js";
import { TEXT_SHADOW } from "./utils.js";
import { t } from "./i18n.js";

export function updateUIRender() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.placeholder = t(key);
    } else {
      el.textContent = t(key);
    }
  });

  if (state.currentUsername) {
    DOM.displayUsername.textContent = state.currentUsername;
  }
}

export function addLog(data) {
  const text =
    typeof data === "object" && data.msgCode
      ? t(data.msgCode, data.args)
      : data.message || data;

  const li = document.createElement("li");
  li.textContent = `[${t("system")}]: ${text}`;
  DOM.logEl.appendChild(li);
}

export const DOM = {
  statusEl: document.getElementById("status"),
  logEl: document.getElementById("log"),
  authSection: document.getElementById("auth-section"),
  lobbySection: document.getElementById("lobby-section"),
  roomSection: document.getElementById("room-section"),
  hostPanel: document.getElementById("host-panel"),
  roleConfigContainer: document.getElementById("role-config-container"),
  publicBoardList: document.getElementById("public-board-list"),
  realtimeMembersList: document.getElementById("realtime-members-list"),
  displayUsername: document.getElementById("display-username"),
  quickReconnectArea: document.getElementById("quick-reconnect-area"),
  quickRoomId: document.getElementById("quick-room-id"),
  displayRoomId: document.getElementById("display-roomId"),
  displayCount: document.getElementById("display-count"),
  btnDisband: document.getElementById("btnDisband"),
  btnExit: document.getElementById("btnExit"),
  cbDeathMode: document.getElementById("cb-death-mode"),
  btnEnforceRules: document.getElementById("btnEnforceRules"),
  btnDeal: document.getElementById("btnDeal"),
  btnReset: document.getElementById("btnReset"),
  selectAccessMode: document.getElementById("select-access-mode"),
  taWhitelist: document.getElementById("ta-whitelist"),
  taBlacklist: document.getElementById("ta-blacklist"),
  btnSaveLists: document.getElementById("btnSaveLists"),
  cbHostParticipate: document.getElementById("cb-host-participate"),
  cbBroadcastComp: document.getElementById("cb-broadcast-comp"),
  cbShowList: document.getElementById("cb-show-list"),
  hiddenListMsg: document.getElementById("hidden-list-msg"),
  gameBoard: document.getElementById("game-board"),
  personalDeathTag: document.getElementById("personal-death-tag"),
  myRoleText: document.getElementById("my-role-text"),
  myRoleType: document.getElementById("my-role-type"),
  compositionDisplay: document.getElementById("composition-display"),
  btnAddRole: document.getElementById("btnAddRole"),
  btnReveal: document.getElementById("btnReveal"),
  btnRevealGroup: document.getElementById("btnRevealGroup"),
};

export function renderComposition(compData, broadcastComposition) {
  if (broadcastComposition && compData) {
    const compStr = Object.entries(compData)
      .map(([name, info]) => {
        const deadStr =
          info.deadCount > 0
            ? `<span style="color:#e74c3c; font-size:12px; margin-left:4px;">(${info.deadCount}${t("dead_count_unit")})</span>`
            : "";
        return `<span style="color: ${info.color}; ${TEXT_SHADOW}"><span style="font-weight:bold;">${name}</span> x${info.count}${deadStr}</span>`;
      })
      .join('<span style="margin:0 8px; color:#666;">|</span>');
    DOM.compositionDisplay.innerHTML = `${t("current_comp")}<br>${compStr}`;
    DOM.compositionDisplay.style.display = "block";
  } else {
    DOM.compositionDisplay.style.display = "none";
  }
}

export function renderPublicBoard(boardData) {
  DOM.publicBoardList.innerHTML = "";
  boardData.forEach((p) => {
    const li = document.createElement("li");
    li.style.marginBottom = "8px";

    let revealBtn = "";
    let deathBtn = "";

    if (state.isHost && p.displayRole === "???") {
      revealBtn = `<button class="btn-reveal-single" data-target="${p.username}" style="margin-left: 10px; font-size: 11px; padding: 2px 6px; background: #e74c3c; color: white; border: none; border-radius: 3px; cursor: pointer;">${t("reveal")}</button>`;
    }
    if (state.isHost && state.currentDeathMode) {
      const actionName = p.isDead ? t("revive") : t("kill");
      const btnColor = p.isDead ? "#27ae60" : "#7f8c8d";
      deathBtn = `<button class="btn-toggle-death" data-target="${p.username}" style="margin-left: 5px; font-size: 11px; padding: 2px 6px; background: ${btnColor}; color: white; border: none; border-radius: 3px; cursor: pointer;">${actionName}</button>`;
    }

    const deathTag = p.isDead
      ? `<span style="color:#7f8c8d; font-weight:bold; margin-right:5px;">【${t("status_dead")}】</span>`
      : "";

    li.innerHTML = `${deathTag}<strong>${p.username}</strong> : <span style="color: ${p.color}; ${TEXT_SHADOW} font-weight: bold; font-size: 15px; letter-spacing: 1px;">${p.displayRole === "???" ? "???" : p.displayRole}</span> ${revealBtn} ${deathBtn}`;
    DOM.publicBoardList.appendChild(li);
  });
}

export function enterLobby() {
  DOM.authSection.style.display = "none";
  DOM.lobbySection.style.display = "block";
  if (state.savedRoomId) {
    DOM.quickReconnectArea.style.display = "block";
    DOM.quickRoomId.textContent = state.savedRoomId;
  }
}

export function resetToLobby() {
  DOM.roomSection.style.display = "none";
  DOM.lobbySection.style.display = "block";
  DOM.gameBoard.style.display = "none";
  DOM.btnReveal.style.display = "none";
  DOM.compositionDisplay.style.display = "none";
  DOM.logEl.innerHTML = "";
  state.currentRoomId = "";
}
