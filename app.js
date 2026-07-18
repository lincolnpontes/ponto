(() => {
  "use strict";

  const STORAGE_KEY = "ponto_app_state_v1";
  const ACTIVE_POLL_MS = 250;
  const LOBBY_POLL_MS = 650;
  const PENALTY_MS = 3000;
  const THEME_ROOT = "themes/letters-numbers";

  const MODES = [
    {
      id: "tower",
      number: 1,
      title: "Torre do caos",
      icon: "🗼",
      short: "Ganhe a carta central a cada acerto. Quem juntar mais vence.",
      objective: "Encontre o símbolo entre a carta central e a sua. O mais rápido leva a carta; no fim, vence quem acumulou mais.",
      players: "2–8 jogadores",
      duration: "5–10 min",
      maxPlayers: 8,
      scoreLabel: "cartas",
      observedLabel: "CARTA CENTRAL",
    },
    {
      id: "well",
      number: 2,
      title: "O poço",
      icon: "🕳️",
      short: "Descarte sua pilha. O primeiro a ficar sem cartas vence.",
      objective: "Acerte o símbolo comum e descarte sua carta sobre a central. O primeiro jogador a zerar a pilha ganha.",
      players: "2–8 jogadores",
      duration: "5–10 min",
      maxPlayers: 8,
      scoreLabel: "descartes",
      observedLabel: "CARTA DO POÇO",
    },
    {
      id: "potato",
      number: 3,
      title: "Batata quente",
      icon: "🔥",
      short: "Passe a batata antes dos outros. Até 4 jogadores.",
      objective: "Ache a combinação com a carta observada para passar a batata. Ao final das rodadas, quem recebeu menos cartas vence.",
      players: "2–4 jogadores",
      duration: "5 rodadas",
      maxPlayers: 4,
      scoreLabel: "passes",
      observedLabel: "CARTA DA BATATA",
    },
    {
      id: "gift",
      number: 4,
      title: "Presente de grego",
      icon: "🎁",
      short: "Ache o par e mande uma carta indesejada ao adversário.",
      objective: "Compare sua carta com a carta do adversário indicado. Um acerto envia o presente para ele; vence quem recebe menos.",
      players: "2–4 jogadores",
      duration: "5–8 min",
      maxPlayers: 4,
      scoreLabel: "presentes",
      observedLabel: "CARTA DO ADVERSÁRIO",
    },
  ];

  const AVATARS = ["⚡", "🦊", "🐯", "🐸", "🦄", "🐼", "🦁", "🐙", "🚀", "🐲", "👾", "😎"];
  const BOT_NAMES = ["Bia", "Caio", "Malu", "Nina", "Theo", "Zeca", "Iara"];
  const SYMBOL_LABELS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", ..."ABCDEFGHIJKLMNOPQRSTU"];
  const CARD_LAYOUT = [
    [50, 17, 24], [25, 31, 15], [75, 31, 27], [50, 48, 19],
    [19, 60, 28], [81, 59, 14], [36, 79, 17], [67, 78, 25],
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const now = () => Date.now();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function uid(prefix = "id") {
    if (crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function modeById(id) {
    return MODES.find((mode) => mode.id === id) || MODES[0];
  }

  function modulo(value, base) {
    return ((value % base) + base) % base;
  }

  // Plano projetivo de ordem 7: 57 pontos/símbolos, 57 retas/cartas, 8 por carta.
  function generatePerfectDeck() {
    const cards = [];
    for (let slope = 0; slope < 7; slope += 1) {
      for (let intercept = 0; intercept < 7; intercept += 1) {
        const card = [];
        for (let x = 0; x < 7; x += 1) {
          const y = modulo(slope * x + intercept, 7);
          card.push(x * 7 + y);
        }
        card.push(49 + slope);
        cards.push(card);
      }
    }
    for (let x = 0; x < 7; x += 1) {
      const card = [];
      for (let y = 0; y < 7; y += 1) card.push(x * 7 + y);
      card.push(56);
      cards.push(card);
    }
    cards.push([49, 50, 51, 52, 53, 54, 55, 56]);
    return cards;
  }

  const FULL_DECK = generatePerfectDeck();
  const DECK = FULL_DECK;

  function commonSymbol(cardAId, cardBId) {
    const a = FULL_DECK[Number(cardAId)] || [];
    const b = new Set(FULL_DECK[Number(cardBId)] || []);
    return a.find((symbol) => b.has(symbol));
  }

  function hashSeed(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function randomFrom(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6D2B79F5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(items, seed = now()) {
    const result = [...items];
    const random = randomFrom(typeof seed === "number" ? seed : hashSeed(seed));
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }

  function loadState() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch (_) { saved = {}; }
    return {
      syncUrl: saved.syncUrl || "",
      sound: saved.sound !== false,
      profile: {
        id: saved.profile?.id || uid("player"),
        name: saved.profile?.name || "Lincoln",
        avatar: saved.profile?.avatar || "⚡",
        token: saved.profile?.token || "",
        pinHash: saved.profile?.pinHash || "",
        games: Number(saved.profile?.games || 0),
        wins: Number(saved.profile?.wins || 0),
        roundWins: Number(saved.profile?.roundWins || 0),
        bestStreak: Number(saved.profile?.bestStreak || 0),
      },
      recentRooms: Array.isArray(saved.recentRooms) ? saved.recentRooms.slice(0, 6) : [],
    };
  }

  const state = loadState();
  let currentScreen = "home";
  let selectedMode = "tower";
  let rankingTab = "wins";
  let roomTab = "create";
  let room = null;
  let pollTimer = 0;
  let botTimer = 0;
  let penaltyTimer = 0;
  let feedbackTimer = 0;
  let toastTimer = 0;
  let claimPending = false;
  let lastRenderedRound = "";
  let currentStreak = 0;
  let openRooms = [];
  let audioContext = null;

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  async function hashPin(pin) {
    const bytes = new TextEncoder().encode(`ponto:${state.profile.id}:${pin}`);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  }

  function sessionPin() {
    return sessionStorage.getItem("ponto_profile_pin") || "";
  }

  function setSessionPin(pin) {
    sessionStorage.setItem("ponto_profile_pin", pin);
    sessionStorage.setItem(`ponto_profile_unlocked_${state.profile.id}`, "1");
  }

  function symbolPath(symbolId) {
    return `${THEME_ROOT}/symbols/${String(symbolId).padStart(2, "0")}.png`;
  }

  function renderCard(element, cardId, roundKey, options = {}) {
    if (!element) return;
    const card = FULL_DECK[Number(cardId)] || FULL_DECK[0];
    const random = randomFrom(hashSeed(`${cardId}:${roundKey}:${options.variant || "card"}`));
    const symbols = shuffled(card, hashSeed(`${roundKey}:${cardId}:symbols`));
    element.innerHTML = "";
    element.dataset.cardId = String(cardId);

    symbols.forEach((symbolId, index) => {
      const [left, top, size] = CARD_LAYOUT[index];
      const node = document.createElement(options.interactive ? "button" : "span");
      node.className = "symbol";
      if (options.interactive) node.type = "button";
      node.dataset.symbolId = String(symbolId);
      node.setAttribute("aria-label", `Símbolo ${SYMBOL_LABELS[symbolId]}${symbolId >= 36 ? ", segunda forma" : ""}`);
      node.style.left = `${left + (random() - .5) * 3}%`;
      node.style.top = `${top + (random() - .5) * 3}%`;
      node.style.setProperty("--size", `${Math.max(11, size + (random() - .5) * 8).toFixed(1)}%`);
      node.style.setProperty("--rotation", `${Math.round(random() * 150 - 75)}deg`);
      node.style.setProperty("--scale", String((.78 + random() * .50).toFixed(2)));
      node.innerHTML = `<img src="${symbolPath(symbolId)}" alt="" draggable="false">`;
      element.appendChild(node);
    });

    element.classList.remove("is-dealing");
    void element.offsetWidth;
    element.classList.add("is-dealing");
  }

  function renderHeroCards() {
    renderCard($("#heroCardBack"), 23, "hero-back", { variant: "back" });
    renderCard($("#heroCardFront"), 8, "hero-front", { variant: "front" });
  }

  function renderModeCards() {
    $("#homeModeRail").innerHTML = MODES.map((mode) => `
      <article class="mode-card">
        <span class="mode-number">MINIJOGO #${mode.number}</span>
        <h3>${mode.title}</h3>
        <p>${mode.short}</p>
        <span class="mode-icon" aria-hidden="true">${mode.icon}</span>
      </article>`).join("");

    $("#modePicker").innerHTML = MODES.map((mode) => `
      <label class="mode-option${mode.id === selectedMode ? " is-selected" : ""}" data-mode-id="${mode.id}">
        <input type="radio" name="gameMode" value="${mode.id}" ${mode.id === selectedMode ? "checked" : ""}>
        <span class="mode-number">#${mode.number}</span>
        <h3>${mode.title}</h3>
        <p>${mode.players}</p>
        <span class="mode-icon" aria-hidden="true">${mode.icon}</span>
      </label>`).join("");

    $("#rulesList").innerHTML = MODES.map((mode) => `
      <article class="rule-card">
        <div class="rule-index">${mode.number}</div>
        <div><h2>${mode.title}</h2><p>${mode.objective}</p><div class="rule-meta"><span>${mode.players}</span><span>${mode.duration}</span></div></div>
      </article>`).join("");
  }

  function setRoomTab(tab) {
    roomTab = tab;
    $$('[data-room-tab]').forEach((button) => button.classList.toggle("is-selected", button.dataset.roomTab === tab));
    $$('[data-room-panel]').forEach((panel) => panel.classList.toggle("is-active", panel.dataset.roomPanel === tab));
    if (tab === "join") {
      setTimeout(() => $("#roomCodeInput")?.focus(), 120);
      refreshOpenRooms();
    }
  }

  function showScreen(screen) {
    if (!$( `[data-screen="${screen}"]` )) screen = "home";
    currentScreen = screen;
    document.body.classList.toggle("is-gaming", screen === "game");
    $$(".screen").forEach((node) => node.classList.toggle("is-active", node.dataset.screen === screen));
    $$(".bottom-nav [data-go]").forEach((button) => button.classList.toggle("is-selected", button.dataset.go === screen));
    window.scrollTo({ top: 0, behavior: "instant" });

    if (screen === "profile") renderProfile();
    if (screen === "ranking") refreshRanking();
    if (screen === "settings") renderSyncStatus();
    if (screen === "lobby") renderLobby();
    if (screen === "game") {
      renderGame(true);
      startPolling();
    } else if (room?.transport === "remote" && ["lobby"].includes(screen)) {
      startPolling();
    } else {
      stopPolling();
    }
  }

  function toast(message, type = "") {
    const node = $("#toast");
    clearTimeout(toastTimer);
    node.textContent = message;
    node.className = `toast is-visible${type ? ` is-${type}` : ""}`;
    toastTimer = setTimeout(() => { node.className = "toast"; }, 2600);
  }

  function showFeedback(message, wrong = false, duration = 950) {
    const node = $("#gameFeedback");
    clearTimeout(feedbackTimer);
    node.textContent = message;
    node.className = `game-feedback is-visible${wrong ? " is-wrong" : ""}`;
    feedbackTimer = setTimeout(() => { node.className = "game-feedback"; }, duration);
  }

  function updateSyncPill(status = state.syncUrl ? "online" : "demo", text = "") {
    const pill = $("#syncPill");
    pill.classList.toggle("is-online", status === "online");
    pill.classList.toggle("is-busy", status === "busy");
    $("#syncPillText").textContent = text || (status === "online" ? "Sincronizado" : status === "busy" ? "Atualizando" : "Modo demonstração");
  }

  async function api(action, payload = {}, options = {}) {
    if (!state.syncUrl) throw new Error("Configure a URL do Apps Script primeiro.");
    updateSyncPill("busy");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 9000);
    let response;
    try {
      response = await fetch(state.syncUrl, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          appId: "ponto-game-v1",
          action,
          token: state.profile.token || "",
          profileId: state.profile.id,
          payload,
          clientTime: now(),
        }),
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(error.name === "AbortError" ? "O Google demorou para responder." : "Não foi possível acessar o Apps Script.");
    } finally {
      clearTimeout(timeout);
    }
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch (_) { throw new Error("O Apps Script devolveu uma resposta inválida."); }
    if (!response.ok || json.ok === false) throw new Error(json.error || "Falha na sincronização.");
    if (json.token) {
      state.profile.token = json.token;
      if (json.profile?.id) state.profile.id = json.profile.id;
      saveState();
    }
    updateSyncPill("online");
    return json;
  }

  async function ensureRemoteProfile() {
    if (!state.syncUrl) return;
    const pin = sessionPin();
    if (!state.profile.token && !/^\d{3}$/.test(pin)) throw new Error("Salve o perfil com uma senha de 3 números antes de conectar.");
    try {
      const result = await api(state.profile.token ? "updateProfile" : "createProfile", {
        id: state.profile.id,
        name: state.profile.name,
        avatar: state.profile.avatar,
        pin,
      });
      if (result.profile) Object.assign(state.profile, result.profile, { token: result.token || state.profile.token });
      saveState();
    } catch (error) {
      if (state.profile.token) {
        state.profile.token = "";
        saveState();
        if (!/^\d{3}$/.test(pin)) throw new Error("Digite novamente a senha de 3 números no perfil.");
        const result = await api("createProfile", { id: state.profile.id, name: state.profile.name, avatar: state.profile.avatar, pin });
        if (result.profile) Object.assign(state.profile, result.profile, { token: result.token || "" });
        saveState();
      } else {
        throw error;
      }
    }
  }

  function buildDemoPlayers(maxPlayers, botCount = 0) {
    const players = [{
      id: state.profile.id, name: state.profile.name, avatar: state.profile.avatar,
      isHost: true, ready: true, score: 0, cardCount: 0, remaining: 8,
      penaltyCards: 0, penaltyUntil: 0,
    }];
    const bots = shuffled(BOT_NAMES, `${state.profile.id}:${now()}`).slice(0, Math.min(botCount, Math.max(0, maxPlayers - 1)));
    bots.forEach((name, index) => players.push({
      id: `bot_${index}`, name, avatar: AVATARS[(index + 2) % AVATARS.length],
      isHost: false, ready: true, score: 0, cardCount: 0, remaining: 8,
      penaltyCards: 0, penaltyUntil: 0, bot: true,
    }));
    return players;
  }

  function makeRoomCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  }

  function createDemoRoom(modeId, maxPlayers, roundsTotal, botCount = 0, password = "") {
    const players = buildDemoPlayers(Math.min(maxPlayers, modeById(modeId).maxPlayers), botCount);
    return {
      transport: "demo",
      code: makeRoomCode(),
      hostId: state.profile.id,
      mode: modeId,
      maxPlayers,
      roundsTotal,
      theme: "letters-numbers",
      hasPassword: Boolean(password),
      password,
      status: "lobby",
      players,
      createdAt: now(),
      roundNumber: 0,
      deckOrder: shuffled(Array.from({ length: 57 }, (_, index) => index), hashSeed(uid("deck"))),
      deckCursor: 0,
      round: null,
    };
  }

  function addRecentRoom(value) {
    state.recentRooms = [{ code: value.code, mode: value.mode, at: now() }, ...state.recentRooms.filter((item) => item.code !== value.code)].slice(0, 6);
    saveState();
  }

  async function createRoom({ modeId, maxPlayers, roundsTotal, quick = false, botCount = 0, password = "" }) {
    selectedMode = modeId;
    try {
      if (state.syncUrl && !quick) {
        await ensureRemoteProfile();
        const result = await api("createRoom", { mode: modeId, maxPlayers, roundsTotal, theme: "letters-numbers", botCount, password });
        room = { ...result.room, transport: "remote" };
      } else {
        room = createDemoRoom(modeId, maxPlayers, roundsTotal, botCount, password);
      }
      addRecentRoom(room);
      renderLobby();
      showScreen("lobby");
      if (quick) {
        await sleep(350);
        startGame();
      }
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function renderOpenRooms() {
    const list = $("#openRoomList");
    if (!list) return;
    if (!state.syncUrl) {
      list.innerHTML = '<p class="empty-rooms">Conecte o Google Apps Script para ver as salas abertas.</p>';
      return;
    }
    if (!openRooms.length) {
      list.innerHTML = '<p class="empty-rooms">Nenhuma sala aberta agora.</p>';
      return;
    }
    list.innerHTML = openRooms.map((entry) => {
      const mode = modeById(entry.mode);
      return `<button class="open-room-row" type="button" data-open-room="${escapeHTML(entry.code)}" data-room-password="${entry.hasPassword ? "1" : "0"}">
        <span class="open-room-icon">${mode.icon}</span>
        <span><strong>${escapeHTML(entry.code)} · ${mode.title}</strong><small>${entry.playerCount}/${entry.maxPlayers} jogadores</small></span>
        <span class="room-lock" aria-label="${entry.hasPassword ? "Sala com senha" : "Sala sem senha"}">${entry.hasPassword ? "🔒" : "→"}</span>
      </button>`;
    }).join("");
  }

  async function refreshOpenRooms() {
    if (!state.syncUrl) return renderOpenRooms();
    try {
      const result = await api("openRooms", {}, { timeout: 7000 });
      openRooms = Array.isArray(result.rooms) ? result.rooms : [];
      renderOpenRooms();
    } catch (error) {
      $("#openRoomList").innerHTML = `<p class="empty-rooms">${escapeHTML(error.message)}</p>`;
    }
  }

  async function joinRoom(code, password = "") {
    const normalized = String(code).trim().toUpperCase();
    if (normalized.length !== 5) return toast("Digite os 5 caracteres do código.", "error");
    if (!state.syncUrl) {
      toast("Conecte o Apps Script para entrar em uma sala real.", "error");
      showScreen("settings");
      return;
    }
    try {
      await ensureRemoteProfile();
      const result = await api("joinRoom", { code: normalized, password });
      room = { ...result.room, transport: "remote" };
      addRecentRoom(room);
      renderLobby();
      showScreen(room.status === "active" ? "game" : "lobby");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function renderLobby() {
    if (!room) return;
    const mode = modeById(room.mode);
    $("#lobbyCode").textContent = room.code;
    $("#playerCount").textContent = String(room.players?.length || 0);
    $("#lobbyMode").innerHTML = `<span class="mode-emoji">${mode.icon}</span><div><strong>${mode.title}</strong><small>${mode.short}</small></div>`;
    $("#lobbyPlayers").innerHTML = (room.players || []).map((player) => `
      <div class="player-row">
        <div class="player-avatar">${escapeHTML(player.avatar)}</div>
        <div><strong>${escapeHTML(player.name)}${player.id === state.profile.id ? " (você)" : ""}</strong><small>${player.isHost ? "Anfitrião" : player.bot ? "Jogador de treino" : "Conectado agora"}</small></div>
        <span class="ready-pill">pronto</span>
      </div>`).join("");
    const isHost = room.hostId === state.profile.id;
    $("#startGameBtn").hidden = !isHost;
    $("#startGameBtn").disabled = (room.players?.length || 0) < 2;
    $("#addTrainingPlayerBtn").hidden = !isHost || (room.players?.length || 0) >= room.maxPlayers;
    $("#hostHint").textContent = isHost ? "Você é o anfitrião. A partida começa para todos ao mesmo tempo." : "Aguardando o anfitrião começar a partida.";
  }

  async function addTrainingPlayer() {
    if (!room || room.hostId !== state.profile.id || room.players.length >= room.maxPlayers) return;
    try {
      if (room.transport === "remote") {
        const result = await api("addBot", { code: room.code });
        room = { ...result.room, transport: "remote" };
      } else {
        const usedNames = new Set(room.players.map((player) => player.name));
        const name = BOT_NAMES.find((entry) => !usedNames.has(entry)) || `Treino ${room.players.length}`;
        const index = room.players.length;
        room.players.push({
          id: `bot_${uid("training")}`, name, avatar: AVATARS[(index + 2) % AVATARS.length],
          isHost: false, ready: true, score: 0, cardCount: 0, remaining: 8,
          penaltyCards: 0, penaltyUntil: 0, bot: true,
        });
      }
      renderLobby();
      toast("Jogador de treino adicionado.", "good");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function takeDeckCard(used = new Set()) {
    for (let attempts = 0; attempts < 57; attempts += 1) {
      const card = room.deckOrder[room.deckCursor % room.deckOrder.length];
      room.deckCursor += 1;
      if (!used.has(card)) return card;
    }
    return Math.floor(Math.random() * 57);
  }

  function prepareDemoRound() {
    const used = new Set();
    const observedCardId = takeDeckCard(used);
    used.add(observedCardId);
    const playerCardIds = {};
    room.players.forEach((player) => {
      playerCardIds[player.id] = takeDeckCard(used);
      used.add(playerCardIds[player.id]);
    });
    const observedCardIds = {};
    const targetIds = {};
    room.players.forEach((player, index) => {
      if (room.mode === "gift") {
        const target = room.players[(index + 1) % room.players.length];
        targetIds[player.id] = target.id;
        observedCardIds[player.id] = playerCardIds[target.id];
      } else {
        observedCardIds[player.id] = observedCardId;
      }
    });
    room.round = {
      id: `${room.code}_${room.roundNumber}_${uid("round")}`,
      number: room.roundNumber,
      observedCardId,
      observedCardIds,
      playerCardIds,
      targetIds,
      claimedBy: "",
      claimedAt: 0,
      locked: false,
      startedAt: now(),
    };
  }

  async function startGame() {
    if (!room) return;
    try {
      if (room.transport === "remote") {
        const result = await api("startGame", { code: room.code });
        room = { ...result.room, transport: "remote" };
      } else {
        room.status = "active";
        room.roundNumber = 1;
        room.players.forEach((player) => {
          player.score = 0;
          player.cardCount = 0;
          player.remaining = 8;
          player.penaltyCards = 0;
          player.penaltyUntil = 0;
        });
        prepareDemoRound();
      }
      currentStreak = 0;
      lastRenderedRound = "";
      showScreen("game");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function currentPlayer() {
    return room?.players?.find((player) => player.id === state.profile.id) || null;
  }

  function observedLabelForRoom() {
    const mode = modeById(room.mode);
    const targetId = room.round?.targetIds?.[state.profile.id] || room.round?.targetId;
    if (room.mode === "gift" && targetId) {
      const target = room.players.find((player) => player.id === targetId);
      return target ? `CARTA DE ${target.name.toUpperCase()}` : mode.observedLabel;
    }
    return mode.observedLabel;
  }

  function observedCardFor(playerId = state.profile.id) {
    return room.round?.observedCardIds?.[playerId] ?? room.round?.observedCardId;
  }

  function renderGame(force = false) {
    if (!room?.round) return;
    const player = currentPlayer();
    const mode = modeById(room.mode);
    $("#gameModeTitle").textContent = mode.title;
    $("#gameRoomCode").textContent = room.code;
    $("#observedLabel").textContent = observedLabelForRoom();
    $("#roundCounter").textContent = `${room.roundNumber} / ${room.roundsTotal}`;
    $("#playerCardCount").textContent = room.mode === "well" ? `${player?.remaining ?? 0} restantes` : `+${player?.cardCount ?? player?.score ?? 0} cartas`;
    $("#soundBtn").textContent = state.sound ? "♪" : "×";

    $("#scoreStrip").innerHTML = room.players.map((entry) => {
      const score = room.mode === "well" ? entry.remaining : room.mode === "gift" || room.mode === "potato" ? entry.penaltyCards : entry.score;
      return `<span class="score-chip${entry.id === state.profile.id ? " is-you" : ""}">${escapeHTML(entry.avatar)} ${escapeHTML(entry.name)} <b>${score ?? 0}</b></span>`;
    }).join("");

    if (force || lastRenderedRound !== room.round.id) {
      const playerCardId = room.round.playerCardIds?.[state.profile.id];
      renderCard($("#observedCard"), observedCardFor(), room.round.id, { interactive: true, variant: "observed" });
      renderCard($("#playerCard"), playerCardId, room.round.id, { interactive: true, variant: "player" });
      lastRenderedRound = room.round.id;
      claimPending = false;
      updatePenaltyCover();
      scheduleBotClaim();
    }
  }

  function setCardButtonsDisabled(disabled) {
    $$(".game-card .symbol").forEach((button) => { button.disabled = disabled; });
  }

  function updatePenaltyCover() {
    if (!room) return;
    const player = currentPlayer();
    const remaining = Math.max(0, Number(player?.penaltyUntil || 0) - now());
    if (remaining <= 0) {
      clearInterval(penaltyTimer);
      if (!claimPending && !room.round?.locked) setCardButtonsDisabled(false);
      return;
    }
    setCardButtonsDisabled(true);
    clearInterval(penaltyTimer);
    penaltyTimer = setInterval(updatePenaltyCover, 80);
  }

  async function handleSymbolTap(symbolId) {
    if (!room?.round || room.status !== "active" || claimPending || room.round.locked) return;
    const player = currentPlayer();
    if (Number(player?.penaltyUntil || 0) > now()) return;
    claimPending = true;
    setCardButtonsDisabled(true);
    vibrate(14);

    try {
      if (room.transport === "remote") {
        const result = await api("claim", {
          code: room.code,
          roundId: room.round.id,
          symbolId: Number(symbolId),
          requestId: uid("claim"),
          clientSentAt: now(),
        }, { timeout: 7000 });
        room = { ...result.room, transport: "remote" };
        if (result.result === "wrong") {
          currentStreak = 0;
          showFeedback("ERROU — 3 SEGUNDOS!", true, 1200);
          playTone("wrong");
          renderGame();
          updatePenaltyCover();
        } else if (result.result === "won") {
          currentStreak += 1;
          state.profile.roundWins += 1;
          state.profile.bestStreak = Math.max(state.profile.bestStreak, currentStreak);
          saveState();
          showFeedback("VOCÊ FOI PRIMEIRO!", false, 900);
          playTone("win");
          vibrate([35, 35, 70]);
        } else {
          currentStreak = 0;
          showFeedback(result.winnerName ? `${result.winnerName.toUpperCase()} FOI PRIMEIRO` : "RODADA ENCERRADA", true, 900);
          playTone("late");
        }
        renderGame();
      } else {
        handleDemoClaim(state.profile.id, Number(symbolId));
      }
    } catch (error) {
      claimPending = false;
      setCardButtonsDisabled(false);
      toast(error.message, "error");
    }
  }

  function handleDemoClaim(playerId, symbolId) {
    if (!room?.round || room.round.locked) return;
    const player = room.players.find((entry) => entry.id === playerId);
    if (!player) return;
    const expected = commonSymbol(observedCardFor(playerId), room.round.playerCardIds[playerId]);
    if (symbolId !== expected) {
      claimPending = false;
      currentStreak = 0;
      player.penaltyUntil = now() + PENALTY_MS;
      if (playerId === state.profile.id) {
        showFeedback("ERROU — 3 SEGUNDOS!", true, 1200);
        playTone("wrong");
        updatePenaltyCover();
      }
      return;
    }

    room.round.locked = true;
    room.round.claimedBy = playerId;
    room.round.claimedAt = now();
    clearTimeout(botTimer);
    applyRoundWin(player);
    renderGame();

    if (playerId === state.profile.id) {
      currentStreak += 1;
      state.profile.roundWins += 1;
      state.profile.bestStreak = Math.max(state.profile.bestStreak, currentStreak);
      saveState();
      showFeedback("VOCÊ FOI PRIMEIRO!", false, 850);
      playTone("win");
      vibrate([30, 30, 60]);
    } else {
      currentStreak = 0;
      showFeedback(`${player.name.toUpperCase()} FOI PRIMEIRO`, true, 850);
      playTone("late");
    }

    setTimeout(advanceDemoRound, 920);
  }

  function applyRoundWin(player) {
    player.score += 1;
    if (room.mode === "tower") {
      player.cardCount += 1;
    } else if (room.mode === "well") {
      player.remaining = Math.max(0, player.remaining - 1);
    } else if (room.mode === "potato") {
      const targets = room.players.filter((entry) => entry.id !== player.id);
      const target = targets[Math.floor(Math.random() * targets.length)];
      if (target) target.penaltyCards += 1;
    } else if (room.mode === "gift") {
      const targetId = room.round.targetIds?.[player.id] || room.round.targetId;
      const target = room.players.find((entry) => entry.id === targetId) || room.players.find((entry) => entry.id !== player.id);
      if (target) target.penaltyCards += 1;
      player.cardCount += 1;
    }
  }

  function advanceDemoRound() {
    if (!room || room.status !== "active") return;
    const wellWinner = room.mode === "well" ? room.players.find((player) => player.remaining <= 0) : null;
    if (wellWinner || room.roundNumber >= room.roundsTotal) {
      finishDemoGame(wellWinner?.id || "");
      return;
    }
    room.roundNumber += 1;
    prepareDemoRound();
    lastRenderedRound = "";
    claimPending = false;
    renderGame(true);
  }

  function determineWinners(forcedId = "") {
    if (forcedId) return room.players.filter((player) => player.id === forcedId);
    const values = room.players.map((player) => {
      if (room.mode === "well") return -player.remaining;
      if (room.mode === "gift" || room.mode === "potato") return -player.penaltyCards;
      return player.score;
    });
    const best = Math.max(...values);
    return room.players.filter((_, index) => values[index] === best);
  }

  function finishDemoGame(forcedWinnerId = "") {
    room.status = "finished";
    room.winners = determineWinners(forcedWinnerId);
    clearTimeout(botTimer);
    const userWon = room.winners.some((winner) => winner.id === state.profile.id);
    state.profile.games += 1;
    if (userWon) state.profile.wins += 1;
    saveState();
    showResults(userWon);
  }

  function showResults(userWon) {
    const winners = room.winners?.length ? room.winners : determineWinners(room.winnerId || "");
    const player = currentPlayer();
    $("#resultAvatar").textContent = userWon ? "🏆" : winners[0]?.avatar || "★";
    $("#resultTitle").textContent = userWon ? "Você venceu!" : `${winners[0]?.name || "Alguém"} venceu!`;
    $("#resultText").textContent = userWon ? "Olho afiado e dedo mais rápido da sala." : "Foi por pouco. A próxima rodada pode ser sua.";
    $("#resultScore").innerHTML = `
      <div><strong>${player?.score || 0}</strong><span>acertos</span></div>
      <div><strong>${state.profile.bestStreak}</strong><span>melhor sequência</span></div>
      <div><strong>${room.roundNumber}</strong><span>rodadas</span></div>`;
    $("#resultDialog").showModal();
  }

  function scheduleBotClaim() {
    clearTimeout(botTimer);
    if (room?.transport !== "demo" || room.status !== "active" || room.round?.locked) return;
    const bots = room.players.filter((player) => player.bot);
    if (!bots.length) return;
    const delay = 3300 + Math.random() * 2600;
    botTimer = setTimeout(() => {
      if (!room?.round || room.round.locked || currentScreen !== "game") return;
      const bot = bots[Math.floor(Math.random() * bots.length)];
      const answer = commonSymbol(observedCardFor(bot.id), room.round.playerCardIds[bot.id]);
      handleDemoClaim(bot.id, answer);
    }, delay);
  }

  function stopPolling() {
    clearTimeout(pollTimer);
    pollTimer = 0;
  }

  function startPolling() {
    stopPolling();
    if (room?.transport !== "remote") return;
    const poll = async () => {
      if (!room || room.transport !== "remote") return;
      const delay = currentScreen === "game" && room.status === "active" ? ACTIVE_POLL_MS : LOBBY_POLL_MS;
      try {
        const result = await api("room", { code: room.code, knownRoundId: room.round?.id || "" }, { timeout: 6500 });
        if (result.room) room = { ...result.room, transport: "remote" };
        if (room.status === "active" && currentScreen !== "game") showScreen("game");
        else if (currentScreen === "game") renderGame();
        else if (currentScreen === "lobby") renderLobby();
        if (room.status === "finished" && currentScreen === "game") {
          room.winners = room.players.filter((player) => (room.winnerIds || [room.winnerId]).includes(player.id));
          showResults(room.winners.some((winner) => winner.id === state.profile.id));
          return;
        }
      } catch (_) {
        updateSyncPill("demo", "Reconectando…");
      }
      pollTimer = setTimeout(poll, document.visibilityState === "visible" ? delay : 5000);
    };
    pollTimer = setTimeout(poll, 100);
  }

  function renderProfile() {
    $("#profileBadge").textContent = state.profile.avatar;
    $("#profileNameInput").value = state.profile.name;
    $("#profilePinInput").value = "";
    $("#avatarPicker").innerHTML = AVATARS.map((avatar) => `<button type="button" class="avatar-choice${avatar === state.profile.avatar ? " is-selected" : ""}" data-avatar="${avatar}" aria-label="Avatar ${avatar}">${avatar}</button>`).join("");
    const winRate = state.profile.games ? Math.round(state.profile.wins / state.profile.games * 100) : 0;
    $("#profileStats").innerHTML = `
      <div class="profile-stat"><strong>${state.profile.wins}</strong><span>vitórias</span></div>
      <div class="profile-stat"><strong>${winRate}%</strong><span>aproveitamento</span></div>
      <div class="profile-stat"><strong>${state.profile.roundWins}</strong><span>rodadas</span></div>`;
    $("#bestStreakText").textContent = `${state.profile.bestStreak} acertos seguidos`;
  }

  function showProfileLockIfNeeded() {
    if (!state.profile.pinHash || sessionStorage.getItem(`ponto_profile_unlocked_${state.profile.id}`) === "1") return;
    $("#pinDialogAvatar").textContent = state.profile.avatar;
    $("#pinDialogTitle").textContent = `Olá, ${state.profile.name}!`;
    $("#pinUnlockInput").value = "";
    $("#pinError").hidden = true;
    if (!$("#pinDialog").open) $("#pinDialog").showModal();
    setTimeout(() => $("#pinUnlockInput").focus(), 80);
  }

  async function refreshRanking() {
    let ranking = [{ ...state.profile }];
    const self = { ...state.profile };
    const existing = ranking.findIndex((entry) => entry.id === self.id);
    if (existing >= 0) ranking[existing] = self; else ranking.push(self);
    if (state.syncUrl) {
      try {
        const result = await api("ranking", {}, { timeout: 7000 });
        if (Array.isArray(result.ranking) && result.ranking.length) ranking = result.ranking.filter((entry) => !entry.bot);
      } catch (_) { /* O ranking demonstrativo continua disponível. */ }
    }
    renderRanking(ranking);
  }

  function renderRanking(ranking) {
    const sorted = [...ranking].sort((a, b) => {
      const rateA = a.games >= 5 ? a.wins / a.games : -1;
      const rateB = b.games >= 5 ? b.wins / b.games : -1;
      return rankingTab === "rate" ? rateB - rateA || b.wins - a.wins : b.wins - a.wins || rateB - rateA;
    });
    $("#rankingNote").textContent = rankingTab === "rate" ? "Mínimo de 5 partidas para entrar no ranking de aproveitamento." : "Vitórias em partidas completas.";
    $$('[data-rank-tab]').forEach((button) => button.classList.toggle("is-selected", button.dataset.rankTab === rankingTab));
    const top = sorted.slice(0, 3);
    const ordered = [top[1], top[0], top[2]].filter(Boolean);
    $("#podium").innerHTML = ordered.map((entry) => {
      const position = sorted.indexOf(entry) + 1;
      const value = rankingTab === "rate" ? `${Math.round(entry.wins / Math.max(1, entry.games) * 100)}%` : `${entry.wins}V`;
      return `<div class="podium-player ${position === 1 ? "is-first" : position === 3 ? "is-third" : ""}"><div class="podium-avatar">${escapeHTML(entry.avatar)}</div><strong>${escapeHTML(entry.name)}</strong><span>${value}</span><div class="podium-block">${position}º</div></div>`;
    }).join("");
    $("#rankingList").innerHTML = sorted.slice(3).map((entry, index) => {
      const rate = Math.round(entry.wins / Math.max(1, entry.games) * 100);
      return `<div class="rank-row"><span class="rank-position">${index + 4}</span><span class="rank-avatar">${escapeHTML(entry.avatar)}</span><div class="rank-name"><strong>${escapeHTML(entry.name)}</strong><small>${entry.games} partidas · ${entry.bestStreak || 0} sequência</small></div><span class="rank-value">${rankingTab === "rate" ? `${rate}%` : entry.wins}</span></div>`;
    }).join("");
  }

  function renderSyncStatus() {
    $("#syncUrlInput").value = state.syncUrl;
    const card = $("#syncStatusCard");
    card.classList.toggle("is-online", Boolean(state.syncUrl));
    $("#syncStatusTitle").textContent = state.syncUrl ? "Google conectado" : "Modo demonstração";
    $("#syncStatusDetail").textContent = state.syncUrl ? "Perfis, salas, partidas e ranking sincronizados." : "As partidas de treino funcionam somente neste aparelho.";
    updateSyncPill(state.syncUrl ? "online" : "demo");
  }

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  function playTone(kind) {
    if (!state.sound) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = kind === "wrong" ? "sawtooth" : "sine";
      oscillator.frequency.setValueAtTime(kind === "win" ? 620 : kind === "wrong" ? 150 : 250, audioContext.currentTime);
      if (kind === "win") oscillator.frequency.exponentialRampToValueAtTime(980, audioContext.currentTime + .16);
      gain.gain.setValueAtTime(.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.16, audioContext.currentTime + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + .25);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + .27);
    } catch (_) { /* Som é um detalhe opcional. */ }
  }

  function validateDeck() {
    if (FULL_DECK.length !== 57 || FULL_DECK.some((card) => card.length !== 8)) return false;
    for (let a = 0; a < DECK.length; a += 1) {
      for (let b = a + 1; b < DECK.length; b += 1) {
        const shared = DECK[a].filter((symbol) => DECK[b].includes(symbol));
        if (shared.length !== 1) return false;
      }
    }
    return true;
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const go = event.target.closest("[data-go]");
      if (go) {
        const roomAction = go.dataset.roomAction;
        if (roomAction) setRoomTab(roomAction);
        showScreen(go.dataset.go);
      }
      const roomTabButton = event.target.closest("[data-room-tab]");
      if (roomTabButton) setRoomTab(roomTabButton.dataset.roomTab);
      const modeOption = event.target.closest("[data-mode-id]");
      if (modeOption) {
        selectedMode = modeOption.dataset.modeId;
        $$(".mode-option").forEach((node) => node.classList.toggle("is-selected", node === modeOption));
        $("input", modeOption).checked = true;
        const max = modeById(selectedMode).maxPlayers;
        $$("#maxPlayersInput option").forEach((option) => { option.disabled = Number(option.value) > max; });
        if (Number($("#maxPlayersInput").value) > max) $("#maxPlayersInput").value = String(max);
      }
      const avatar = event.target.closest("[data-avatar]");
      if (avatar) {
        state.profile.avatar = avatar.dataset.avatar;
        $$(".avatar-choice").forEach((button) => button.classList.toggle("is-selected", button === avatar));
        $("#profileBadge").textContent = state.profile.avatar;
      }
      const symbol = event.target.closest(".game-card .symbol");
      if (symbol) handleSymbolTap(Number(symbol.dataset.symbolId));
      const rankTabButton = event.target.closest("[data-rank-tab]");
      if (rankTabButton) {
        rankingTab = rankTabButton.dataset.rankTab;
        refreshRanking();
      }
      const openRoomButton = event.target.closest("[data-open-room]");
      if (openRoomButton) {
        $("#roomCodeInput").value = openRoomButton.dataset.openRoom;
        $("#roomPasswordJoin").value = "";
        $("#roomPasswordJoin").focus();
        if (openRoomButton.dataset.roomPassword !== "1") $("#joinRoomForm").requestSubmit();
      }
    });

    $("#quickPlayBtn").addEventListener("click", () => createRoom({ modeId: "tower", maxPlayers: 4, roundsTotal: 8, quick: true, botCount: 3 }));
    $("#createRoomForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const password = $("#roomPasswordCreate").value.trim();
      if (password && !/^\d{3,8}$/.test(password)) return toast("A senha da sala deve ter de 3 a 8 números.", "error");
      const maxPlayers = Number($("#maxPlayersInput").value);
      const botCount = $("#addBotsInput").checked ? Math.min(3, maxPlayers - 1) : 0;
      createRoom({ modeId: selectedMode, maxPlayers, roundsTotal: Number($("#roundsInput").value), botCount, password });
    });
    $("#joinRoomForm").addEventListener("submit", (event) => {
      event.preventDefault();
      joinRoom($("#roomCodeInput").value, $("#roomPasswordJoin").value.trim());
    });
    $("#roomCodeInput").addEventListener("input", (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5); });
    $("#copyRoomCode").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(room.code); toast("Código copiado!", "good"); }
      catch (_) { toast(`Código: ${room.code}`); }
    });
    $("#startGameBtn").addEventListener("click", startGame);
    $("#addTrainingPlayerBtn").addEventListener("click", addTrainingPlayer);
    $("#refreshRoomsBtn").addEventListener("click", refreshOpenRooms);
    $("#leaveGameBtn").addEventListener("click", () => { clearTimeout(botTimer); showScreen("home"); });
    $("#soundBtn").addEventListener("click", () => { state.sound = !state.sound; saveState(); renderGame(); });

    $("#profileForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const pin = $("#profilePinInput").value.trim();
      if (!/^\d{3}$/.test(pin)) return toast("A senha do perfil deve ter exatamente 3 números.", "error");
      state.profile.name = $("#profileNameInput").value.trim().slice(0, 18) || "Jogador";
      state.profile.pinHash = await hashPin(pin);
      setSessionPin(pin);
      saveState();
      renderProfile();
      if (state.syncUrl) {
        try {
          await ensureRemoteProfile();
          toast("Perfil salvo e protegido.", "good");
        }
        catch (error) { toast(error.message, "error"); }
      } else toast("Perfil salvo e protegido neste aparelho.", "good");
    });

    [$("#profilePinInput"), $("#pinUnlockInput"), $("#roomPasswordCreate"), $("#roomPasswordJoin")].forEach((input) => {
      input.addEventListener("input", () => { input.value = input.value.replace(/\D/g, ""); });
    });
    $("#pinUnlockForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const pin = $("#pinUnlockInput").value;
      if (await hashPin(pin) !== state.profile.pinHash) {
        $("#pinError").hidden = false;
        $("#pinUnlockInput").value = "";
        $("#pinUnlockInput").focus();
        return;
      }
      setSessionPin(pin);
      $("#pinDialog").close();
      toast("Perfil desbloqueado.", "good");
    });
    $("#pinDialog").addEventListener("cancel", (event) => event.preventDefault());

    $("#syncForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = $("#syncUrlInput").value.trim().replace(/\/+$/, "");
      if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/i.test(value)) return toast("Use a URL /exec do Apps Script.", "error");
      const previous = state.syncUrl;
      state.syncUrl = value;
      saveState();
      try {
        const status = await api("status", {}, { timeout: 10000 });
        if (!status.initialized) throw new Error("O script ainda não inicializou a planilha.");
        await ensureRemoteProfile();
        renderSyncStatus();
        toast("Google conectado com sucesso!", "good");
      } catch (error) {
        state.syncUrl = previous;
        saveState();
        renderSyncStatus();
        toast(error.message, "error");
      }
    });
    $("#clearSyncBtn").addEventListener("click", () => {
      state.syncUrl = "";
      state.profile.token = "";
      saveState();
      renderSyncStatus();
      toast("Sincronização desconectada.");
    });

    $("#playAgainBtn").addEventListener("click", () => {
      $("#resultDialog").close();
      createRoom({ modeId: room?.mode || "tower", maxPlayers: room?.maxPlayers || 4, roundsTotal: room?.roundsTotal || 8, quick: true, botCount: room?.players?.filter((player) => player.bot).length || 0 });
    });
    $("#closeResultBtn").addEventListener("click", () => { $("#resultDialog").close(); showScreen("home"); });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && room?.transport === "remote") startPolling(); });
  }

  function init() {
    renderHeroCards();
    renderModeCards();
    renderProfile();
    renderSyncStatus();
    bindEvents();
    setRoomTab("create");
    showScreen("home");
    showProfileLockIfNeeded();
    if (!validateDeck()) console.error("Falha na validação matemática do baralho.");
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
