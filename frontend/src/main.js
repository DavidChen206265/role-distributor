import "./style.css";
import { socket, setupSocketListeners } from "./socket.js";
import { state } from "./state.js";
import { DOM, enterLobby, resetToLobby, updateUIRender } from "./ui.js";
import { getRandomHexColor, parseBatchList } from "./utils.js";
import { t } from "./i18n.js";

const langSelect = document.getElementById("lang-select");
langSelect.value = state.currentLang;
langSelect.addEventListener("change", (e) => {
  state.currentLang = e.target.value;
  localStorage.setItem("app_lang", state.currentLang);
  updateUIRender();
  window.location.reload();
});

updateUIRender();
setupSocketListeners();

// adding a new role config row with default values
function createRoleConfigRow(
  name = t("new_role"),
  count = 1,
  isHidden = true,
  color = getRandomHexColor(),
) {
  const rowId = `config-${state.configIdCounter++}`;
  const div = document.createElement("div");
  div.id = rowId;
  div.style =
    "display: flex; gap: 5px; margin-bottom: 8px; align-items: center;";

  div.innerHTML = `
    <input type="color" class="role-color" value="${color}" style="flex: 0 0 30px; width: 30px; height: 30px; padding: 0; border: 1px solid #555; border-radius: 4px; cursor: pointer;" />
    <input type="text" class="role-name" value="${name}" style="flex: 2; padding: 5px;" />
    <input type="number" class="role-count" value="${count}" min="1" style="flex: 1; padding: 5px;" />
    <label style="color: white; font-size: 11px; display: flex; align-items: center;">
      <input type="radio" name="autofill-role" class="role-autofill" style="margin-right:2px;" /> ${t("autofill")}
    </label>
    <label style="color: white; font-size: 11px; display: flex; align-items: center; margin-left: 5px;">
      <input type="checkbox" class="role-hidden" ${isHidden ? "checked" : ""} /> ${t("hide")}
    </label>
    <button onclick="document.getElementById('${rowId}').remove()" class="btn-remove-config" style="background: #c0392b; color: white; border: none; padding: 5px; margin-left: 5px;">X</button>
    <button class="btn-reveal-role" style="display: none; background: #9b59b6; color: white; border: none; padding: 5px; border-radius: 3px; font-size: 12px; margin-left: 5px;">${t("reveal")}</button>
    <button class="btn-kill-role" style="display: none; background: #c0392b; color: white; border: none; padding: 5px; border-radius: 3px; font-size: 12px; margin-left: 2px;">${t("kill")}</button>
    <button class="btn-revive-role" style="display: none; background: #27ae60; color: white; border: none; padding: 5px; border-radius: 3px; font-size: 12px; margin-left: 2px;">${t("revive")}</button>
  `;
  DOM.roleConfigContainer.appendChild(div);
}

// default starting roles
createRoleConfigRow(t("role_werewolf"), 1, true);
createRoleConfigRow(t("role_villager"), 1, true);

// perform login or guest access
async function performLogin(username, password, isGuest = false) {
  const response = await fetch("http://localhost:3000/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, isGuest }),
  });
  const data = await response.json();
  if (!response.ok) {
    if (data.errorCode) throw new Error(t(data.errorCode, data.args || {}));
    throw new Error(data.error || t("ERR_NETWORK"));
  }
  return data;
}

function handleAuthSuccess(authData) {
  state.currentUserToken = authData.token;
  state.currentUsername = authData.user.username;
  DOM.displayUsername.textContent = state.currentUsername;

  socket.emit("user_login", { username: state.currentUsername }, (response) => {
    if (response && response.roomId) {
      DOM.authSection.style.display = "none";
      socket.emit("join_room", {
        roomId: response.roomId,
        username: state.currentUsername,
      });
    } else {
      enterLobby();
    }
  });
}

function sendSettingsUpdate() {
  if (!state.isHost) return;
  socket.emit("update_settings", {
    roomId: state.currentRoomId,
    settings: {
      broadcastComposition: DOM.cbBroadcastComp.checked,
      showPlayerList: DOM.cbShowList.checked,
      accessMode: DOM.selectAccessMode.value,
      deathMode: DOM.cbDeathMode.checked,
    },
  });
}

DOM.btnAddRole.addEventListener("click", () =>
  createRoleConfigRow("", 1, true),
);
DOM.cbBroadcastComp.addEventListener("change", sendSettingsUpdate);
DOM.cbShowList.addEventListener("change", sendSettingsUpdate);
DOM.selectAccessMode.addEventListener("change", sendSettingsUpdate);
DOM.cbDeathMode.addEventListener("change", sendSettingsUpdate);

DOM.publicBoardList.addEventListener("click", (e) => {
  if (e.target.classList.contains("btn-reveal-single")) {
    const targetUser = e.target.dataset.target;
    if (confirm(t("confirm_reveal_single", { user: targetUser })))
      socket.emit("reveal_single", {
        roomId: state.currentRoomId,
        targetUsername: targetUser,
      });
  } else if (e.target.classList.contains("btn-toggle-death")) {
    socket.emit("toggle_death", {
      roomId: state.currentRoomId,
      targetUsername: e.target.dataset.target,
    });
  }
});

DOM.realtimeMembersList.addEventListener("click", (e) => {
  if (e.target.tagName === "BUTTON" && e.target.dataset.action) {
    const action = e.target.dataset.action;
    const targetUser = e.target.dataset.target;
    if (action === "kick" && confirm(t("confirm_kick", { user: targetUser })))
      socket.emit("kick_player", {
        roomId: state.currentRoomId,
        targetUsername: targetUser,
        ban: false,
      });
    else if (
      action === "ban" &&
      confirm(t("confirm_ban", { user: targetUser }))
    ) {
      socket.emit("add_to_list", {
        roomId: state.currentRoomId,
        type: "blacklist",
        targetUsername: targetUser,
      });
      socket.emit("kick_player", {
        roomId: state.currentRoomId,
        targetUsername: targetUser,
        ban: true,
      });
    } else if (action === "white")
      socket.emit("add_to_list", {
        roomId: state.currentRoomId,
        type: "whitelist",
        targetUsername: targetUser,
      });
  }
});

DOM.roleConfigContainer.addEventListener("click", (e) => {
  const roleName = e.target.parentElement.querySelector(".role-name").value;
  if (e.target.classList.contains("btn-reveal-role")) {
    if (confirm(t("confirm_reveal_group", { role: roleName })))
      socket.emit("reveal_group", { roomId: state.currentRoomId, roleName });
  } else if (e.target.classList.contains("btn-kill-role")) {
    if (confirm(t("confirm_batch_kill", { role: roleName })))
      socket.emit("batch_toggle_death", {
        roomId: state.currentRoomId,
        roleName,
        isDead: true,
      });
  } else if (e.target.classList.contains("btn-revive-role")) {
    if (confirm(t("confirm_batch_revive", { role: roleName })))
      socket.emit("batch_toggle_death", {
        roomId: state.currentRoomId,
        roleName,
        isDead: false,
      });
  }
});

document.getElementById("btnLogin").addEventListener("click", async () => {
  try {
    const authData = await performLogin(
      document.getElementById("name-input").value.trim(),
      document.getElementById("pwd-input").value.trim(),
      false,
    );
    handleAuthSuccess(authData);
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("btnGuest").addEventListener("click", async () => {
  try {
    const authData = await performLogin("", "", true);
    handleAuthSuccess(authData);
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("btnCreate").addEventListener("click", () =>
  socket.emit("create_room", {
    token: state.currentUserToken,
    username: state.currentUsername,
  }),
);

document.getElementById("btnJoin").addEventListener("click", () => {
  const roomId = document
    .getElementById("room-input")
    .value.trim()
    .toUpperCase();
  if (!roomId) return alert(t("alert_input_room"));
  socket.emit("join_room", { roomId, username: state.currentUsername });
});

document.getElementById("btnQuickReconnect").addEventListener("click", () => {
  if (state.savedRoomId)
    socket.emit("join_room", {
      roomId: state.savedRoomId,
      username: state.currentUsername,
    });
});

DOM.btnExit.addEventListener("click", () => {
  if (confirm(t("confirm_exit"))) {
    socket.emit("exit_room", state.currentRoomId);
    localStorage.removeItem("lastActiveRoomId");
    state.savedRoomId = "";
    resetToLobby();
  }
});

DOM.btnDisband.addEventListener("click", () => {
  if (confirm(t("confirm_disband"))) {
    socket.emit("disband_room", state.currentRoomId);
    resetToLobby();
  }
});

DOM.btnReset.addEventListener("click", () => {
  if (confirm(t("confirm_reset")))
    socket.emit("reset_room", state.currentRoomId);
});

document.getElementById("btnCopyRoom").addEventListener("click", () => {
  navigator.clipboard
    .writeText(state.currentRoomId)
    .then(() => alert(t("copy_success")))
    .catch(() => alert(t("alert_copy_fail")));
});

DOM.btnSaveLists.addEventListener("click", () => {
  socket.emit("update_lists_batch", {
    roomId: state.currentRoomId,
    whitelist: parseBatchList(DOM.taWhitelist.value),
    blacklist: parseBatchList(DOM.taBlacklist.value),
  });
});

DOM.btnEnforceRules.addEventListener("click", () => {
  if (confirm(t("confirm_enforce")))
    socket.emit("enforce_access_rules", state.currentRoomId);
});

DOM.btnDeal.addEventListener("click", () => {
  const configNodes = DOM.roleConfigContainer.children;
  const rolesConfig = [];
  let explicitCount = 0;

  const hostParticipates = DOM.cbHostParticipate.checked;
  const requiredCount = hostParticipates
    ? state.currentPlayersCount
    : state.currentPlayersCount - 1;

  if (requiredCount <= 0) return alert(t("alert_not_enough_players"));

  for (let node of configNodes) {
    if (!node.querySelector(".role-autofill").checked)
      explicitCount += parseInt(node.querySelector(".role-count").value) || 0;
  }

  let finalTotalCount = 0;
  for (let node of configNodes) {
    const name = node.querySelector(".role-name").value.trim();
    const isHidden = node.querySelector(".role-hidden").checked;
    const color = node.querySelector(".role-color").value;
    const isAutoFill = node.querySelector(".role-autofill").checked;

    let count = 0;
    if (isAutoFill) {
      count = requiredCount - explicitCount;
      if (count < 0)
        return alert(
          t("alert_explicit_exceed", {
            explicit: explicitCount,
            req: requiredCount,
          }),
        );
      node.querySelector(".role-count").value = count;
    } else count = parseInt(node.querySelector(".role-count").value) || 0;

    if (name && count > 0) {
      rolesConfig.push({ name, count, isHidden, color });
      finalTotalCount += count;
    }
  }

  if (rolesConfig.length === 0) return alert(t("alert_keep_one_role"));
  if (finalTotalCount !== requiredCount)
    return alert(
      t("alert_role_count_mismatch", {
        total: finalTotalCount,
        req: requiredCount,
      }),
    );

  socket.emit("distribute_roles", {
    roomId: state.currentRoomId,
    rolesConfig,
    hostParticipates,
  });
});

DOM.btnReveal.addEventListener("click", () => {
  if (confirm(t("confirm_reveal_all")))
    socket.emit("reveal_roles", state.currentRoomId);
});
