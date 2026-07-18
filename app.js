(() => {
  "use strict";

  const STORAGE_KEY = "ponto_app_state_v1";
  const ACTIVE_POLL_MS = 250;
  const LOBBY_POLL_MS = 500;
  const PENALTY_MS = 3000;
  const ASSET_VERSION = "9";
  const THEME_ROOT = "themes/letters-numbers";
  const SYNC_URL = String(window.PONTO_CONFIG?.appsScriptUrl || "https://script.google.com/macros/s/AKfycbxMNe2tp1R0D0IaPxm4OemPqfO2WwIVX9ghnlU47vJw2v8mWKjoq5_Nb4InpIwXVpU/exec").trim().replace(/\/+$/, "");
  const ADMIN_PROFILE_ID = "admin_lincoln";

  const MODES = [
    {
      id: "tower",
      number: 1,
      title: "Torre do caos",
      icon: "🗼",
      short: "A carta central ganha vira sua nova carta. Quem juntar mais vence.",
      objective: "Compare sua carta com a central. Quem acertar primeiro coloca a central sobre a própria pilha e passa a usá-la na jogada seguinte. Os demais mantêm suas cartas. Vence quem acumular mais cartas.",
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
      objective: "Compare o topo da sua pilha com a carta central. Ao acertar, sua carta vira a nova central e você revela a próxima. O primeiro jogador a ficar sem cartas vence.",
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
      short: "Passe toda a sua mão antes dos outros. Até 4 jogadores.",
      objective: "Toque no avatar de outro jogador e compare a carta no topo da sua mão com a dele. Ao acertar, você entrega a ele todas as suas cartas. Quem termina a rodada com tudo perde e guarda essas cartas. No final, vence quem tiver menos.",
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
      short: "Ache o par e mande a carta central ao adversário.",
      objective: "Toque no avatar do adversário que quiser e compare a carta central com a carta dele. Um acerto coloca a central sobre a pilha escolhida; essa passa a ser a nova carta do adversário. Vence quem receber menos cartas.",
      players: "2–4 jogadores",
      duration: "5–8 min",
      maxPlayers: 4,
      scoreLabel: "presentes",
      observedLabel: "CARTA CENTRAL",
    },
  ];

  const AVATARS = ["🦊", "🐯", "🐸", "🦄", "🐼", "🦁", "🐨", "🐲", "🦋", "😎", "🐶", "🐱"];
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
    const savedAvatar = saved.profile?.avatar;
    return {
      syncUrl: SYNC_URL,
      sound: saved.sound !== false,
      profile: {
        id: saved.profile?.id || uid("player"),
        name: saved.profile?.name || "Jogador",
        avatar: AVATARS.includes(savedAvatar) ? savedAvatar : AVATARS[0],
        token: saved.profile?.token || "",
        pinHash: saved.profile?.pinHash || "",
        games: Number(saved.profile?.games || 0),
        wins: Number(saved.profile?.wins || 0),
        roundWins: Number(saved.profile?.roundWins || 0),
        bestStreak: Number(saved.profile?.bestStreak || 0),
        isAdmin: saved.profile?.isAdmin === true,
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
  let pollGeneration = 0;
  let botTimer = 0;
  let penaltyTimer = 0;
  let feedbackTimer = 0;
  let toastTimer = 0;
  let claimPending = false;
  let lastRenderedRound = "";
  let currentStreak = 0;
  let openRooms = [];
  let joinSource = "code";
  let createPending = false;
  let activeCreateId = "";
  let botMutationPending = false;
  let botSyncRunning = false;
  const botMutationQueue = [];
  const confirmedBotIds = new Map();
  let rankingCache = null;
  let rankingRequestId = 0;
  let serverClockOffset = 0;
  const serverClockSamples = [];
  let symbolsLoaded = false;
  let roundRevealTimer = 0;
  let roundRevealReadyId = "";
  let selectedTargetId = "";
  let audioContext = null;

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  async function hashPinFor(profileId, pin) {
    const bytes = new TextEncoder().encode(`ponto:${profileId}:${pin}`);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  }

  function hashPin(pin) {
    return hashPinFor(state.profile.id, pin);
  }

  function isAdminProfile() {
    return state.profile.id === ADMIN_PROFILE_ID && state.profile.isAdmin === true;
  }

  function sessionPin() {
    return sessionStorage.getItem("ponto_profile_pin") || "";
  }

  function setSessionPin(pin) {
    sessionStorage.setItem("ponto_profile_pin", pin);
    sessionStorage.setItem(`ponto_profile_unlocked_${state.profile.id}`, "1");
  }

  function symbolPath(symbolId) {
    return `${THEME_ROOT}/symbols/${String(symbolId).padStart(2, "0")}.png?v=${ASSET_VERSION}`;
  }

  const symbolPreloadPromise = Promise.all(Array.from({ length: 57 }, (_, symbolId) => new Promise((resolve) => {
    const image = new Image();
    image.onload = async () => {
      try { if (image.decode) await image.decode(); } catch (_) { /* A imagem já pode ser exibida. */ }
      resolve();
    };
    image.onerror = resolve;
    image.src = symbolPath(symbolId);
  }))).then(() => { symbolsLoaded = true; });

  function renderCard(element, cardId, _roundKey, options = {}) {
    if (!element) return;
    const card = FULL_DECK[Number(cardId)] || FULL_DECK[0];
    const layoutKey = `immutable-card-${cardId}`;
    if (element.dataset.layoutKey === layoutKey && element.querySelectorAll(".symbol").length === 8) return;
    const random = randomFrom(hashSeed(`${layoutKey}:layout`));
    const symbols = shuffled(card, hashSeed(`${layoutKey}:symbols`));
    element.innerHTML = "";
    element.dataset.cardId = String(cardId);
    element.dataset.layoutKey = layoutKey;

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
      joinSource = "code";
      $("#joinPasswordField").hidden = true;
      $("#roomPasswordJoin").value = "";
      setTimeout(() => $("#roomCodeInput")?.focus(), 120);
      refreshOpenRooms();
    }
  }

  function showScreen(screen) {
    if (!$( `[data-screen="${screen}"]` )) screen = "home";
    if (screen === "settings" && !isAdminProfile()) {
      toast("Somente o administrador pode abrir essas configurações.", "error");
      screen = "profile";
    }
    currentScreen = screen;
    document.body.classList.toggle("is-gaming", screen === "game");
    if (screen !== "game") {
      clearInterval(roundRevealTimer);
      $("#roundReadyOverlay").hidden = true;
    }
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
    if (!options.silent) updateSyncPill("busy");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 9000);
    let response;
    const requestStartedAt = now();
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
    if (Number(json.serverTime || 0) > 0) {
      const responseAt = now();
      const serverReceivedAt = Number(json.serverReceivedAt || json.serverTime);
      const serverSentAt = Number(json.serverTime);
      const networkRtt = Math.max(0, (responseAt - requestStartedAt) - Math.max(0, serverSentAt - serverReceivedAt));
      serverClockSamples.push({
        offset: Math.round(((serverReceivedAt - requestStartedAt) + (serverSentAt - responseAt)) / 2),
        rtt: networkRtt,
      });
      if (serverClockSamples.length > 8) serverClockSamples.shift();
      const bestSamples = [...serverClockSamples].sort((a, b) => a.rtt - b.rtt).slice(0, 3);
      serverClockOffset = Math.round(bestSamples.reduce((sum, sample) => sum + sample.offset, 0) / bestSamples.length);
    }
    if (json.token) {
      state.profile.token = json.token;
      if (json.profile?.id) state.profile.id = json.profile.id;
      saveState();
    }
    if (json.profile && json.profile.isAdmin !== undefined) {
      state.profile.isAdmin = json.profile.isAdmin === true;
      saveState();
    }
    if (!options.silent) updateSyncPill("online");
    return json;
  }

  function serverNow() {
    return now() + serverClockOffset;
  }

  function acceptRemoteRoom(incoming, force = false) {
    if (!incoming) return false;
    const sameRoom = room && String(room.code) === String(incoming.code);
    const currentRevision = Number(room?.revision || 0);
    const incomingRevision = Number(incoming.revision || 0);
    const currentUpdatedAt = Number(room?.updatedAt || 0);
    const incomingUpdatedAt = Number(incoming.updatedAt || 0);
    if (!force && sameRoom && (incomingRevision < currentRevision || (incomingRevision === currentRevision && incomingUpdatedAt < currentUpdatedAt))) return false;
    room = { ...incoming, transport: "remote" };
    return true;
  }

  function showActivity(title = "Entrando na sala…", detail = "Sincronizando jogadores e partida.") {
    $("#activityTitle").textContent = title;
    $("#activityDetail").textContent = detail;
    $("#activityOverlay").hidden = false;
  }

  function hideActivity() {
    $("#activityOverlay").hidden = true;
  }

  async function ensureRemoteProfile(forceUpdate = false) {
    if (!state.syncUrl) return;
    if (state.profile.token && !forceUpdate) return;
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

  function normalizeRoundsPreset(value) {
    const preset = String(value || "16");
    return ["8", "16", "32", "55"].includes(preset) ? preset : "16";
  }

  function resolveRoundsTotal(_modeId, presetValue, _playerCount) {
    const preset = normalizeRoundsPreset(presetValue);
    return Number(preset);
  }

  function createDemoRoom(modeId, maxPlayers, roundsPreset, botCount = 0, password = "") {
    const players = buildDemoPlayers(Math.min(maxPlayers, modeById(modeId).maxPlayers), botCount);
    const normalizedPreset = normalizeRoundsPreset(roundsPreset);
    return {
      transport: "demo",
      code: makeRoomCode(),
      hostId: state.profile.id,
      mode: modeId,
      maxPlayers,
      roundsPreset: normalizedPreset,
      roundsTotal: resolveRoundsTotal(modeId, normalizedPreset, players.length),
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

  async function createRoom({ modeId, maxPlayers, roundsPreset, quick = false, botCount = 0, password = "" }) {
    selectedMode = modeId;
    if (!quick && room && room.hostId === state.profile.id && ["lobby", "active"].includes(room.status)) {
      showScreen(room.status === "active" ? "game" : "lobby");
      toast("Você já tem uma sala aberta.");
      return;
    }
    if (!quick && createPending) return toast("Sua sala já está sendo criada.");

    if (quick) {
      room = createDemoRoom(modeId, maxPlayers, roundsPreset, botCount, password);
      addRecentRoom(room);
      renderLobby();
      showScreen("lobby");
      await sleep(350);
      startGame();
      return;
    }

    const createId = uid("create");
    const requestedCode = makeRoomCode();
    activeCreateId = createId;
    createPending = true;
    room = createDemoRoom(modeId, maxPlayers, roundsPreset, botCount, password);
    room.code = requestedCode;
    room.transport = "remote-pending";
    room.pendingCreateId = createId;
    renderLobby();
    showScreen("lobby");
    toast("Sala criada; sincronizando…", "good");

    try {
      await ensureRemoteProfile();
      const result = await api("createRoom", { mode: modeId, maxPlayers, roundsPreset: normalizeRoundsPreset(roundsPreset), theme: "letters-numbers", botCount, password, requestedCode });
      if (activeCreateId !== createId) {
        api("closeRoom", { code: result.room.code }, { timeout: 7000 }).catch(() => {});
        return;
      }
      acceptRemoteRoom(result.room, true);
      addRecentRoom(room);
      renderLobby();
      showScreen(room.status === "active" ? "game" : "lobby");
      if (result.reused) toast("Sua sala que já estava aberta foi recuperada.", "good");
    } catch (error) {
      if (activeCreateId !== createId) return;
      room = null;
      showScreen("rooms");
      toast(error.message, "error");
    } finally {
      if (activeCreateId === createId) {
        createPending = false;
        activeCreateId = "";
      }
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

  async function joinRoom(code, password = "", source = "code") {
    const normalized = String(code).trim().toUpperCase();
    if (normalized.length !== 5) return toast("Digite os 5 caracteres do código.", "error");
    if (!state.syncUrl) {
      toast("Conecte o Apps Script para entrar em uma sala real.", "error");
      showScreen("settings");
      return;
    }
    showActivity("Entrando na sala…", "Buscando a sala e sincronizando os jogadores.");
    try {
      await ensureRemoteProfile();
      const result = await api("joinRoom", { code: normalized, password, source });
      acceptRemoteRoom(result.room, true);
      addRecentRoom(room);
      renderLobby();
      showScreen(room.status === "active" ? "game" : "lobby");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      hideActivity();
    }
  }

  function renderLobby() {
    if (!room) return;
    const mode = modeById(room.mode);
    const isHost = room.hostId === state.profile.id;
    $("#lobbyCode").textContent = room.code;
    $("#playerCount").textContent = String(room.players?.length || 0);
    $("#lobbyMode").innerHTML = `<span class="mode-emoji">${mode.icon}</span><div><strong>${mode.title}</strong><small>${mode.short}</small></div>`;
    $("#lobbyPlayers").innerHTML = (room.players || []).map((player) => `
      <div class="player-row${player.pending ? " is-pending" : ""}">
        <div class="player-avatar">${escapeHTML(player.avatar)}</div>
        <div><strong>${escapeHTML(player.name)}${player.id === state.profile.id ? " (você)" : ""}</strong><small>${player.isHost ? "Anfitrião" : player.bot ? "Jogador de treino" : "Conectado agora"}</small></div>
        <div class="player-actions"><span class="ready-pill">${player.pending ? "sincronizando" : "pronto"}</span>${isHost && player.bot ? `<button class="remove-bot-button" type="button" data-remove-bot="${escapeHTML(player.id)}" aria-label="Remover ${escapeHTML(player.name)}">×</button>` : ""}</div>
      </div>`).join("");
    const waitingServer = room.transport === "remote-pending" || botMutationPending;
    $("#startGameBtn").hidden = !isHost;
    $("#startGameBtn").disabled = (room.players?.length || 0) < 2 || waitingServer;
    $("#addTrainingPlayerBtn").hidden = !isHost || (room.players?.length || 0) >= room.maxPlayers;
    $("#addTrainingPlayerBtn").disabled = room.transport === "remote-pending";
    $("#closeRoomBtn").hidden = !isHost;
    $("#closeRoomBtn").disabled = false;
    $("#leaveGameBtn").textContent = isHost ? "■" : "×";
    $("#leaveGameBtn").setAttribute("aria-label", isHost ? "Encerrar sala" : "Sair da partida");
    $("#hostHint").textContent = isHost ? "Você é o anfitrião. A partida começa para todos ao mesmo tempo." : "Aguardando o anfitrião começar a partida.";
  }

  function addTrainingPlayer() {
    if (!room || room.hostId !== state.profile.id || room.players.length >= room.maxPlayers || room.transport === "remote-pending") return;
    const usedNames = new Set(room.players.map((player) => player.name));
    const botIndex = room.players.filter((player) => player.bot).length;
    const name = room.transport === "remote" ? BOT_NAMES[botIndex % BOT_NAMES.length] : BOT_NAMES.find((entry) => !usedNames.has(entry)) || `Treino ${room.players.length}`;
    const index = room.players.length;
    const tempBot = {
      id: `pending_${uid("training")}`, name, avatar: room.transport === "remote" ? AVATARS[botIndex % 7] : AVATARS[(index + 2) % AVATARS.length],
      isHost: false, ready: true, score: 0, cardCount: 0, remaining: 8,
      penaltyCards: 0, penaltyUntil: 0, bot: true, pending: room.transport === "remote",
    };
    room.players.push(tempBot);
    renderLobby();
    toast("Jogador de treino adicionado.", "good");
    if (room.transport !== "remote") return;
    botMutationQueue.push({ type: "add", roomCode: room.code, tempId: tempBot.id });
    processBotMutationQueue();
  }

  function removeTrainingPlayer(botId) {
    if (!room || room.hostId !== state.profile.id) return;
    const bot = room.players.find((player) => player.id === botId && player.bot);
    if (!bot) return;
    const roomCode = room.code;
    const originalIndex = room.players.indexOf(bot);
    room.players = room.players.filter((player) => player.id !== botId);
    renderLobby();
    toast("Jogador de treino removido.", "good");
    if (room.transport !== "remote") return;
    botMutationQueue.push({ type: "remove", roomCode, botId, bot, originalIndex });
    processBotMutationQueue();
  }

  async function processBotMutationQueue() {
    if (botSyncRunning) return;
    botSyncRunning = true;
    botMutationPending = true;
    stopPolling();
    if (room) renderLobby();
    try {
      while (botMutationQueue.length) {
        const operation = botMutationQueue[0];
        if (!room || room.code !== operation.roomCode) {
          botMutationQueue.shift();
          continue;
        }
        try {
          if (operation.type === "add") {
            const knownIds = new Set(room.players.filter((player) => player.bot && !player.pending).map((player) => player.id));
            confirmedBotIds.forEach((value) => { if (value) knownIds.add(value); });
            const result = await api("addBot", { code: operation.roomCode, clientBotId: operation.tempId });
            const addedBot = result.room?.players?.find((player) => player.bot && !knownIds.has(player.id));
            const serverBotId = result.botId || addedBot?.id || "";
            confirmedBotIds.set(operation.tempId, serverBotId || null);
            const localBot = room?.code === operation.roomCode ? room.players.find((player) => player.id === operation.tempId) : null;
            if (localBot && addedBot) Object.assign(localBot, addedBot, { pending: false });
            else if (localBot) localBot.pending = false;
          } else {
            const serverBotId = confirmedBotIds.has(operation.botId) ? confirmedBotIds.get(operation.botId) : operation.botId;
            if (serverBotId && !String(serverBotId).startsWith("pending_")) await api("removeBot", { code: operation.roomCode, botId: serverBotId });
          }
        } catch (error) {
          if (room?.code === operation.roomCode) {
            if (operation.type === "add") room.players = room.players.filter((player) => player.id !== operation.tempId);
            else if (!room.players.some((player) => player.id === operation.bot.id)) room.players.splice(Math.max(0, operation.originalIndex), 0, operation.bot);
            toast(error.message, "error");
          }
        } finally {
          botMutationQueue.shift();
          if (room?.code === operation.roomCode) renderLobby();
        }
      }
    } finally {
      botSyncRunning = false;
      botMutationPending = botMutationQueue.length > 0;
      if (botMutationQueue.length) processBotMutationQueue();
      else if (room?.transport === "remote" && currentScreen === "lobby") startPolling();
    }
  }

  async function closeCurrentRoom() {
    if (!room || room.hostId !== state.profile.id) return;
    if (!window.confirm("Encerrar esta sala para todos os jogadores?")) return;
    const closingRoom = room;
    const closingCode = room.code;
    const closingScreen = currentScreen;
    activeCreateId = "";
    createPending = false;
    stopPolling();
    clearTimeout(botTimer);
    room = null;
    showScreen("home");
    toast("Sala encerrada.", "good");
    if (closingRoom.transport === "demo" || closingRoom.transport === "remote-pending") return;
    try {
      await api("closeRoom", { code: closingCode }, { timeout: 7000 });
    } catch (error) {
      room = closingRoom;
      showScreen(closingScreen === "game" ? "game" : "lobby");
      toast(error.message, "error");
    }
  }

  function leaveCurrentRoom() {
    if (!room) return showScreen("home");
    if (room.hostId === state.profile.id) return closeCurrentRoom();
    const leavingRoom = room;
    stopPolling();
    clearTimeout(botTimer);
    room = null;
    showScreen("home");
    toast("Você saiu da sala.");
    if (leavingRoom.transport === "remote") api("leaveRoom", { code: leavingRoom.code }, { timeout: 7000 }).catch(() => {});
  }

  function takeDeckCard(used = new Set()) {
    for (let attempts = 0; attempts < 57; attempts += 1) {
      const card = room.deckOrder[room.deckCursor % room.deckOrder.length];
      room.deckCursor += 1;
      if (!used.has(card)) return card;
    }
    return Math.floor(Math.random() * 57);
  }

  function prepareDemoPotatoHands() {
    room.potatoStep = 1;
    room.players.forEach((player) => {
      player.topCardId = takeDeckCard();
      player.handCount = 1;
    });
  }

  function setupDemoGame() {
    room.roundsTotal = resolveRoundsTotal(room.mode, room.roundsPreset, room.players.length);
    room.isTiebreak = false;
    room.tiebreakPlayerIds = [];
    room.players.forEach((player) => {
      player.score = 0;
      player.cardCount = 0;
      player.penaltyCards = 0;
      player.penaltyUntil = 0;
      player.currentStreak = 0;
      player.pile = [];
      player.handCount = 0;
      player.topCardId = null;
    });
    if (room.mode === "well") {
      room.centralCardId = takeDeckCard();
      let playerIndex = 0;
      while (room.deckCursor < 57) {
        room.players[playerIndex % room.players.length].pile.push(takeDeckCard());
        playerIndex += 1;
      }
      room.players.forEach((player) => {
        player.remaining = player.pile.length;
        player.topCardId = player.pile[0];
      });
    } else if (room.mode === "potato") {
      prepareDemoPotatoHands();
    } else {
      room.players.forEach((player) => { player.topCardId = takeDeckCard(); });
    }
  }

  function prepareDemoRound(firstRound = false) {
    const playerCardIds = {};
    const observedCardIds = {};
    const targetIds = {};
    let observedCardId = room.centralCardId;
    let eligiblePlayerIds = room.players.map((player) => player.id);

    if (room.isTiebreak) {
      eligiblePlayerIds = room.tiebreakPlayerIds.slice();
      observedCardId = takeDeckCard();
      eligiblePlayerIds.forEach((playerId) => {
        playerCardIds[playerId] = takeDeckCard();
        observedCardIds[playerId] = observedCardId;
      });
    } else if (room.mode === "potato") {
      const active = room.players.filter((player) => Number(player.handCount || 0) > 0);
      eligiblePlayerIds = active.map((player) => player.id);
      active.forEach((player, index) => {
        const target = active[(index + 1) % active.length];
        playerCardIds[player.id] = player.topCardId;
        observedCardIds[player.id] = target.topCardId;
        targetIds[player.id] = target.id;
      });
      observedCardId = null;
    } else {
      if (room.mode === "tower" || room.mode === "gift") room.centralCardId = takeDeckCard();
      observedCardId = room.centralCardId;
      room.players.forEach((player, index) => {
        if (room.mode === "gift") {
          const offset = 1 + ((room.roundNumber - 1) % Math.max(1, room.players.length - 1));
          const target = room.players[(index + offset) % room.players.length];
          targetIds[player.id] = target.id;
          playerCardIds[player.id] = target.topCardId;
        } else {
          playerCardIds[player.id] = player.topCardId;
        }
        observedCardIds[player.id] = observedCardId;
      });
    }

    room.round = {
      id: `${room.code}_${room.roundNumber}_${room.potatoStep || 0}_${uid("round")}`,
      number: room.roundNumber,
      observedCardId,
      observedCardIds,
      playerCardIds,
      targetIds,
      eligiblePlayerIds,
      isTiebreak: room.isTiebreak,
      claimedBy: "",
      claimedAt: 0,
      locked: false,
      revealAt: now() + (firstRound ? 4200 : 1800),
      startedAt: now(),
    };
  }

  async function startGame() {
    if (!room) return;
    if (room.transport === "remote-pending" || botMutationPending) return toast("Aguarde a sincronização da sala.");
    try {
      if (room.transport === "remote") {
        const result = await api("startGame", { code: room.code });
        acceptRemoteRoom(result.room, true);
      } else {
        room.status = "active";
        room.roundNumber = 1;
        setupDemoGame();
        prepareDemoRound(true);
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
    if (room.round?.isTiebreak) return "CARTA DO DESEMPATE";
    const targetId = selectedTargetForRoom()?.id || room.round?.targetIds?.[state.profile.id] || room.round?.targetId;
    if (room.mode === "potato" && targetId) {
      const target = room.players.find((player) => player.id === targetId);
      return target ? `CARTA DE ${target.name.toUpperCase()}` : mode.observedLabel;
    }
    return mode.observedLabel;
  }

  function playerCardLabelForRoom() {
    if (room.round?.isTiebreak) return "SUA CARTA";
    const targetId = selectedTargetForRoom()?.id || room.round?.targetIds?.[state.profile.id];
    if (room.mode === "gift" && targetId) {
      const target = room.players.find((player) => player.id === targetId);
      return target ? `CARTA DE ${target.name.toUpperCase()}` : "CARTA DO ADVERSÁRIO";
    }
    return "SUA CARTA";
  }

  function availableTargetsForRoom() {
    if (!room || room.round?.isTiebreak || !["gift", "potato"].includes(room.mode)) return [];
    return room.players.filter((player) => player.id !== state.profile.id && player.topCardId !== null && player.topCardId !== undefined && (room.mode !== "potato" || Number(player.handCount || 0) > 0));
  }

  function selectedTargetForRoom() {
    const targets = availableTargetsForRoom();
    let target = targets.find((player) => player.id === selectedTargetId);
    if (!target) {
      const suggestedId = room?.round?.targetIds?.[state.profile.id];
      target = targets.find((player) => player.id === suggestedId) || targets[0] || null;
      selectedTargetId = target?.id || "";
    }
    return target;
  }

  function observedCardFor(playerId = state.profile.id) {
    if (!room.round?.isTiebreak && playerId === state.profile.id && room.mode === "potato") return selectedTargetForRoom()?.topCardId;
    return room.round?.observedCardIds?.[playerId] ?? room.round?.observedCardId;
  }

  function renderGame(force = false) {
    if (!room?.round) return;
    const player = currentPlayer();
    const mode = modeById(room.mode);
    const roundChanged = lastRenderedRound !== room.round.id;
    if (roundChanged) selectedTargetId = "";
    const selectedTarget = selectedTargetForRoom();
    $("#gameModeTitle").textContent = mode.title;
    $("#gameRoomCode").textContent = room.code;
    $("#observedLabel").textContent = observedLabelForRoom();
    $("#playerCardLabel").textContent = playerCardLabelForRoom();
    $("#roundCounter").textContent = room.round.isTiebreak ? "DESEMPATE" : room.mode === "potato" && Number(room.potatoStep || 1) > 1 ? `${room.roundNumber} / ${room.roundsTotal} · passe ${room.potatoStep}` : `${room.roundNumber} / ${room.roundsTotal}`;
    $("#playerCardCount").textContent = room.mode === "well" ? `${player?.remaining ?? 0} restantes` : room.mode === "potato" ? (Number(player?.handCount || 0) > 0 ? `${player.handCount} na mão` : "você passou") : room.mode === "gift" ? `${player?.penaltyCards || 0} recebidas` : `+${player?.cardCount ?? player?.score ?? 0} cartas`;
    $("#soundBtn").textContent = state.sound ? "♪" : "×";

    $("#scoreStrip").innerHTML = room.players.map((entry) => {
      const score = room.mode === "well" ? entry.remaining : room.mode === "gift" || room.mode === "potato" ? entry.penaltyCards : entry.score;
      const canTarget = !room.round.isTiebreak && ["gift", "potato"].includes(room.mode) && entry.id !== state.profile.id && entry.topCardId !== null && entry.topCardId !== undefined && (room.mode !== "potato" || Number(entry.handCount || 0) > 0);
      const tag = canTarget ? "button" : "span";
      const targetAttribute = canTarget ? ` type="button" data-target-player="${escapeHTML(entry.id)}"` : "";
      return `<${tag}${targetAttribute} class="score-chip${entry.id === state.profile.id ? " is-you" : ""}${selectedTarget?.id === entry.id ? " is-target" : ""}"><span class="score-avatar">${escapeHTML(entry.avatar)}</span><span>${escapeHTML(entry.name)}</span><b>${score ?? 0}</b></${tag}>`;
    }).join("");

    if (force || roundChanged) {
      const playerCardId = room.mode === "gift" && !room.round.isTiebreak ? selectedTarget?.topCardId : room.round.playerCardIds?.[state.profile.id];
      const observedCardId = observedCardFor();
      if (observedCardId === undefined || observedCardId === null || playerCardId === undefined || playerCardId === null) {
        $("#observedCard").innerHTML = '<span class="waiting-card-text">Aguarde os outros jogadores.</span>';
        $("#playerCard").innerHTML = '<span class="waiting-card-text">Você já passou suas cartas nesta rodada.</span>';
        $("#observedCard").classList.add("is-waiting");
        $("#playerCard").classList.add("is-waiting");
      } else {
        $("#observedCard").classList.remove("is-waiting");
        $("#playerCard").classList.remove("is-waiting");
        renderCard($("#observedCard"), observedCardId, room.round.id, { interactive: true, variant: "observed" });
        renderCard($("#playerCard"), playerCardId, room.round.id, { interactive: true, variant: "player" });
      }
      lastRenderedRound = room.round.id;
      claimPending = false;
      updatePenaltyCover();
      if (roundChanged) scheduleRoundReveal();
      else if (roundRevealReadyId === room.round.id) {
        $("#observedCard").classList.remove("is-concealed");
        $("#playerCard").classList.remove("is-concealed");
      }
    }
  }

  function scheduleRoundReveal() {
    clearInterval(roundRevealTimer);
    roundRevealReadyId = "";
    const roundId = room?.round?.id;
    const overlay = $("#roundReadyOverlay");
    const count = $("#roundReadyCount");
    if (!roundId) return;
    let roundImagesLoaded = false;
    $("span", overlay).textContent = room.round.isTiebreak ? "RODADA DE DESEMPATE" : "TODO MUNDO PRONTO?";
    const roundImagePromise = Promise.all($$(".game-card img").map((image) => new Promise((resolve) => {
      const finish = async () => {
        try { if (image.decode) await image.decode(); } catch (_) { /* O carregamento já terminou. */ }
        resolve();
      };
      if (image.complete) finish();
      else {
        image.addEventListener("load", finish, { once: true });
        image.addEventListener("error", resolve, { once: true });
      }
    }))).then(() => { roundImagesLoaded = true; });
    overlay.hidden = false;
    $("#observedCard").classList.add("is-concealed");
    $("#playerCard").classList.add("is-concealed");
    setCardButtonsDisabled(true);

    const update = () => {
      if (!room?.round || room.round.id !== roundId || currentScreen !== "game") {
        clearInterval(roundRevealTimer);
        return;
      }
      const remaining = Number(room.round.revealAt || 0) - serverNow();
      const assetsReady = symbolsLoaded && roundImagesLoaded;
      count.textContent = !assetsReady ? "…" : remaining > 0 ? String(Math.max(1, Math.ceil(remaining / 1000))) : "VAI!";
      if (remaining <= 0 && assetsReady) {
        clearInterval(roundRevealTimer);
        roundRevealReadyId = roundId;
        $("#observedCard").classList.remove("is-concealed");
        $("#playerCard").classList.remove("is-concealed");
        overlay.hidden = true;
        updatePenaltyCover();
        scheduleBotClaim();
      }
    };
    update();
    roundRevealTimer = setInterval(update, 80);
    Promise.all([symbolPreloadPromise, roundImagePromise]).then(update);
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
      if (!claimPending && !room.round?.locked && roundRevealReadyId === room.round?.id) setCardButtonsDisabled(false);
      return;
    }
    setCardButtonsDisabled(true);
    clearInterval(penaltyTimer);
    penaltyTimer = setInterval(updatePenaltyCover, 80);
  }

  async function handleSymbolTap(symbolId) {
    if (!room?.round || room.status !== "active" || claimPending || room.round.locked || roundRevealReadyId !== room.round.id) return;
    if (Array.isArray(room.round.eligiblePlayerIds) && !room.round.eligiblePlayerIds.includes(state.profile.id)) return;
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
          targetId: selectedTargetForRoom()?.id || "",
        }, { timeout: 7000 });
        acceptRemoteRoom(result.room, true);
        if (result.result === "notReady") {
          claimPending = false;
          scheduleRoundReveal();
        } else if (result.result === "wrong") {
          claimPending = false;
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
          showFeedback(room.mode === "potato" && !room.round?.isTiebreak ? "VOCÊ PASSOU AS CARTAS!" : "VOCÊ FOI PRIMEIRO!", false, 900);
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
    if (!room?.round || room.round.locked || roundRevealReadyId !== room.round.id) return;
    if (Array.isArray(room.round.eligiblePlayerIds) && !room.round.eligiblePlayerIds.includes(playerId)) return;
    const player = room.players.find((entry) => entry.id === playerId);
    if (!player) return;
    if (playerId === state.profile.id && ["gift", "potato"].includes(room.mode)) {
      const target = selectedTargetForRoom();
      if (!target) return;
      room.round.targetIds[player.id] = target.id;
      if (room.mode === "gift") room.round.playerCardIds[player.id] = target.topCardId;
      else room.round.observedCardIds[player.id] = target.topCardId;
    }
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
      showFeedback(room.mode === "potato" && !room.round.isTiebreak ? "VOCÊ PASSOU AS CARTAS!" : "VOCÊ FOI PRIMEIRO!", false, 850);
      playTone("win");
      vibrate([30, 30, 60]);
    } else {
      currentStreak = 0;
      showFeedback(`${player.name.toUpperCase()} FOI PRIMEIRO`, true, 850);
      playTone("late");
    }

    setTimeout(advanceDemoRound, 1200);
  }

  function applyRoundWin(player) {
    player.score += 1;
    if (room.round?.isTiebreak) return;
    if (room.mode === "tower") {
      player.cardCount += 1;
      player.topCardId = room.centralCardId;
    } else if (room.mode === "well") {
      const discarded = player.pile.shift();
      room.centralCardId = discarded;
      player.remaining = player.pile.length;
      player.topCardId = player.pile[0] ?? null;
      player.cardCount += 1;
    } else if (room.mode === "potato") {
      const targetId = room.round.targetIds?.[player.id];
      const target = room.players.find((entry) => entry.id === targetId);
      if (target) {
        target.handCount = Number(target.handCount || 0) + Number(player.handCount || 0);
        target.topCardId = player.topCardId;
        player.handCount = 0;
        player.topCardId = null;
      }
    } else if (room.mode === "gift") {
      const targetId = room.round.targetIds?.[player.id] || room.round.targetId;
      const target = room.players.find((entry) => entry.id === targetId) || room.players.find((entry) => entry.id !== player.id);
      if (target) {
        target.penaltyCards += 1;
        target.topCardId = room.centralCardId;
      }
      player.cardCount += 1;
    }
  }

  function advanceDemoRound() {
    if (!room || room.status !== "active") return;
    if (room.round?.isTiebreak) {
      finishDemoGame(room.round.claimedBy);
      return;
    }
    if (room.mode === "potato") {
      const active = room.players.filter((player) => Number(player.handCount || 0) > 0);
      if (active.length <= 1) {
        if (active[0]) active[0].penaltyCards += Number(active[0].handCount || room.players.length);
        if (room.roundNumber >= room.roundsTotal) return completeDemoGame();
        room.roundNumber += 1;
        prepareDemoPotatoHands();
      } else {
        room.potatoStep = Number(room.potatoStep || 1) + 1;
      }
      prepareDemoRound();
      lastRenderedRound = "";
      claimPending = false;
      renderGame(true);
      return;
    }
    const wellWinner = room.mode === "well" ? room.players.find((player) => player.remaining <= 0) : null;
    if (wellWinner) return finishDemoGame(wellWinner.id);
    if (room.roundNumber >= room.roundsTotal) return completeDemoGame();
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
      return player.cardCount;
    });
    const best = Math.max(...values);
    return room.players.filter((_, index) => values[index] === best);
  }

  function completeDemoGame() {
    const tied = determineWinners();
    if (tied.length <= 1) return finishDemoGame(tied[0]?.id || "");
    room.isTiebreak = true;
    room.tiebreakPlayerIds = tied.map((player) => player.id);
    prepareDemoRound();
    lastRenderedRound = "";
    claimPending = false;
    renderGame(true);
    showFeedback("DESEMPATE!", false, 900);
  }

  function finishDemoGame(forcedWinnerId = "") {
    room.status = "finished";
    room.winners = determineWinners(forcedWinnerId || determineWinners()[0]?.id || "");
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
    const eligibleIds = new Set(room.round.eligiblePlayerIds || room.players.map((player) => player.id));
    const bots = room.players.filter((player) => player.bot && eligibleIds.has(player.id) && room.round.playerCardIds?.[player.id] !== undefined);
    if (!bots.length) return;
    const delay = 3300 + Math.random() * 2600;
    const roundId = room.round.id;
    botTimer = setTimeout(() => {
      if (!room?.round || room.round.id !== roundId || room.round.locked || currentScreen !== "game") return;
      const bot = bots[Math.floor(Math.random() * bots.length)];
      const answer = commonSymbol(observedCardFor(bot.id), room.round.playerCardIds[bot.id]);
      handleDemoClaim(bot.id, answer);
    }, delay);
  }

  function stopPolling() {
    clearTimeout(pollTimer);
    pollTimer = 0;
    pollGeneration += 1;
  }

  function startPolling() {
    stopPolling();
    if (room?.transport !== "remote" || botMutationPending) return;
    const generation = pollGeneration;
    const poll = async () => {
      if (generation !== pollGeneration || !room || room.transport !== "remote") return;
      const pollStartedAt = now();
      const roomCode = room.code;
      const delay = currentScreen === "game" && room.status === "active" ? ACTIVE_POLL_MS : LOBBY_POLL_MS;
      try {
        const result = await api("room", { code: roomCode, knownRoundId: room.round?.id || "", knownRevision: Number(room.revision || 0) }, { timeout: 6500, silent: true });
        if (generation !== pollGeneration || botMutationPending || !room || room.code !== roomCode) return;
        if (result.room) acceptRemoteRoom(result.room);
        if (room.status === "closed") {
          stopPolling();
          room = null;
          showScreen("home");
          toast("A sala foi encerrada.");
          return;
        }
        if (room.status === "active" && currentScreen !== "game") showScreen("game");
        else if (currentScreen === "game") renderGame();
        else if (currentScreen === "lobby") renderLobby();
        if (room.status === "finished" && currentScreen === "game") {
          room.winners = room.players.filter((player) => (room.winnerIds || [room.winnerId]).includes(player.id));
          showResults(room.winners.some((winner) => winner.id === state.profile.id));
          return;
        }
      } catch (_) {
        if (generation !== pollGeneration) return;
        updateSyncPill("demo", "Reconectando…");
      }
      if (generation !== pollGeneration) return;
      const nextDelay = document.visibilityState === "visible" ? Math.max(25, delay - (now() - pollStartedAt)) : 5000;
      pollTimer = setTimeout(poll, nextDelay);
    };
    pollTimer = setTimeout(poll, 100);
  }

  function renderProfile() {
    $("#profileBadge").textContent = state.profile.avatar;
    $("#profileNavIcon").textContent = state.profile.avatar;
    $("#profileNameInput").value = state.profile.name;
    $("#profilePinInput").value = "";
    $("#avatarPicker").innerHTML = AVATARS.map((avatar) => `<button type="button" class="avatar-choice${avatar === state.profile.avatar ? " is-selected" : ""}" data-avatar="${avatar}" aria-label="Avatar ${avatar}">${avatar}</button>`).join("");
    const winRate = state.profile.games ? Math.round(state.profile.wins / state.profile.games * 100) : 0;
    $("#profileStats").innerHTML = `
      <div class="profile-stat"><strong>${state.profile.wins}</strong><span>vitórias</span></div>
      <div class="profile-stat"><strong>${winRate}%</strong><span>aproveitamento</span></div>
      <div class="profile-stat"><strong>${state.profile.roundWins}</strong><span>rodadas</span></div>`;
    $("#bestStreakText").textContent = `${state.profile.bestStreak} acertos seguidos`;
    const admin = isAdminProfile();
    $("#adminAccessCard").hidden = admin;
    $("#adminBadgeCard").hidden = !admin;
    $("#adminSettingsLink").hidden = !admin;
  }

  async function loginAdministrator(pin) {
    const result = await api("loginProfile", { id: ADMIN_PROFILE_ID, pin }, { timeout: 10000 });
    if (!result.profile?.isAdmin || !result.token) throw new Error("Este perfil não tem permissão administrativa.");
    state.profile = {
      ...state.profile,
      ...result.profile,
      token: result.token,
      isAdmin: true,
      pinHash: await hashPinFor(ADMIN_PROFILE_ID, pin),
    };
    setSessionPin(pin);
    saveState();
    renderProfile();
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
    const requestId = ++rankingRequestId;
    $$('[data-rank-tab]').forEach((button) => button.classList.toggle("is-selected", button.dataset.rankTab === rankingTab));
    if (rankingCache) renderRanking(rankingCache);
    else {
      $("#rankingNote").textContent = "Carregando estatísticas…";
      $("#podium").innerHTML = '<div class="ranking-loading">Carregando…</div>';
      $("#rankingList").innerHTML = "";
    }
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
    if (requestId !== rankingRequestId) return;
    rankingCache = ranking;
    renderRanking(ranking);
  }

  function selectRankingTab(tab) {
    rankingTab = tab === "rate" ? "rate" : "wins";
    $$('[data-rank-tab]').forEach((button) => button.classList.toggle("is-selected", button.dataset.rankTab === rankingTab));
    if (rankingCache) renderRanking(rankingCache);
    else {
      $("#rankingNote").textContent = "Carregando estatísticas…";
      $("#podium").innerHTML = '<div class="ranking-loading">Carregando…</div>';
      $("#rankingList").innerHTML = "";
    }
    refreshRanking();
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
    const card = $("#syncStatusCard");
    card.classList.add("is-online");
    $("#syncStatusTitle").textContent = "Google conectado";
    $("#syncStatusDetail").textContent = "Integração fixa e protegida para perfis, salas, partidas e ranking.";
    updateSyncPill("online");
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
        $("#profileNavIcon").textContent = state.profile.avatar;
      }
      const symbol = event.target.closest(".game-card .symbol");
      if (symbol) handleSymbolTap(Number(symbol.dataset.symbolId));
      const targetPlayer = event.target.closest("[data-target-player]");
      if (targetPlayer && room && ["gift", "potato"].includes(room.mode)) {
        selectedTargetId = targetPlayer.dataset.targetPlayer;
        renderGame(true);
      }
      const rankTabButton = event.target.closest("[data-rank-tab]");
      if (rankTabButton) {
        selectRankingTab(rankTabButton.dataset.rankTab);
      }
      const openRoomButton = event.target.closest("[data-open-room]");
      if (openRoomButton) {
        joinSource = "open-list";
        $("#roomCodeInput").value = openRoomButton.dataset.openRoom;
        $("#roomPasswordJoin").value = "";
        const needsPassword = openRoomButton.dataset.roomPassword === "1";
        $("#joinPasswordField").hidden = !needsPassword;
        if (needsPassword) $("#roomPasswordJoin").focus();
        else $("#joinRoomForm").requestSubmit();
      }
      const removeBotButton = event.target.closest("[data-remove-bot]");
      if (removeBotButton) removeTrainingPlayer(removeBotButton.dataset.removeBot);
    });

    $("#quickPlayBtn").addEventListener("click", () => createRoom({ modeId: "tower", maxPlayers: 4, roundsPreset: "8", quick: true, botCount: 3 }));
    $("#createRoomForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const password = $("#roomPasswordCreate").value.trim();
      if (password && !/^\d{3,8}$/.test(password)) return toast("A senha da sala deve ter de 3 a 8 números.", "error");
      const maxPlayers = Number($("#maxPlayersInput").value);
      createRoom({ modeId: selectedMode, maxPlayers, roundsPreset: $("#roundsInput").value, botCount: 0, password });
    });
    $("#joinRoomForm").addEventListener("submit", (event) => {
      event.preventDefault();
      joinRoom($("#roomCodeInput").value, $("#roomPasswordJoin").value.trim(), joinSource);
    });
    $("#roomCodeInput").addEventListener("input", (event) => {
      event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
      joinSource = "code";
      $("#joinPasswordField").hidden = true;
      $("#roomPasswordJoin").value = "";
    });
    $("#copyRoomCode").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(room.code); toast("Código copiado!", "good"); }
      catch (_) { toast(`Código: ${room.code}`); }
    });
    $("#startGameBtn").addEventListener("click", startGame);
    $("#addTrainingPlayerBtn").addEventListener("click", addTrainingPlayer);
    $("#closeRoomBtn").addEventListener("click", closeCurrentRoom);
    $("#refreshRoomsBtn").addEventListener("click", refreshOpenRooms);
    $("#leaveGameBtn").addEventListener("click", leaveCurrentRoom);
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
          await ensureRemoteProfile(true);
          toast("Perfil salvo e protegido.", "good");
        }
        catch (error) { toast(error.message, "error"); }
      } else toast("Perfil salvo e protegido neste aparelho.", "good");
    });

    [$("#profilePinInput"), $("#pinUnlockInput"), $("#adminPinInput"), $("#roomPasswordCreate"), $("#roomPasswordJoin")].forEach((input) => {
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

    $("#adminLoginBtn").addEventListener("click", () => {
      $("#adminPinInput").value = "";
      $("#adminPinError").hidden = true;
      $("#adminDialog").showModal();
      setTimeout(() => $("#adminPinInput").focus(), 80);
    });
    $("#adminCancelBtn").addEventListener("click", () => $("#adminDialog").close());
    $("#adminLoginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const pin = $("#adminPinInput").value;
      try {
        await loginAdministrator(pin);
        $("#adminDialog").close();
        toast("Administrador conectado.", "good");
      } catch (error) {
        $("#adminPinError").textContent = error.message;
        $("#adminPinError").hidden = false;
        $("#adminPinInput").value = "";
        $("#adminPinInput").focus();
      }
    });

    $("#playAgainBtn").addEventListener("click", () => {
      $("#resultDialog").close();
      createRoom({ modeId: room?.mode || "tower", maxPlayers: room?.maxPlayers || 4, roundsPreset: room?.roundsPreset || "8", quick: true, botCount: room?.players?.filter((player) => player.bot).length || 0 });
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
    api("status", {}, { timeout: 10000 })
      .then((status) => { if (Number(status.version || 0) < 4) updateSyncPill("busy", "Atualize o Code.gs"); })
      .catch(() => updateSyncPill("demo", "Reconectando…"));
    if (!validateDeck()) console.error("Falha na validação matemática do baralho.");
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        location.reload();
      });
      navigator.serviceWorker.register(`service-worker.js?v=${ASSET_VERSION}`).then((registration) => registration.update()).catch(() => {});
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
