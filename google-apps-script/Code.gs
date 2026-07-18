/**
 * PONTO! — backend multiplayer para Google Apps Script + Google Sheets.
 *
 * Publique como aplicativo da Web:
 *   Executar como: você
 *   Quem pode acessar: qualquer pessoa
 *
 * A primeira chamada cria automaticamente a planilha e suas quatro abas.
 */

const APP_ID = 'ponto-game-v1';
const DATABASE_PROPERTY = 'PONTO_DATABASE_ID';
const SECRET_PROPERTY = 'PONTO_TOKEN_SECRET';
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const PENALTY_MS = 3000;

const SHEETS = {
  PROFILES: ['id', 'name', 'avatar', 'tokenHash', 'pinHash', 'games', 'wins', 'roundWins', 'bestStreak', 'createdAt', 'lastSeenAt'],
  ROOMS: ['code', 'stateJson', 'updatedAt', 'expiresAt'],
  EVENTS: ['id', 'roomCode', 'type', 'profileId', 'createdAt', 'payloadJson'],
  MATCHES: ['id', 'roomCode', 'mode', 'winnerIds', 'participantsJson', 'startedAt', 'endedAt'],
};

const MODE_LIMITS = { tower: 8, well: 8, potato: 4, gift: 4 };

function doGet() {
  const db = ensureDatabase_();
  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    app: 'PONTO!',
    message: 'Backend ativo. Cole a URL terminada em /exec no aplicativo.',
    spreadsheetUrl: db.getUrl(),
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(event) {
  try {
    const request = parseRequest_(event);
    if (request.appId && request.appId !== APP_ID) throw new Error('Aplicativo não reconhecido.');
    const result = dispatch_(request);
    return json_({ ok: true, serverTime: Date.now(), ...result });
  } catch (error) {
    return json_({ ok: false, error: error && error.message ? error.message : String(error) });
  }
}

function dispatch_(request) {
  const action = String(request.action || 'status');
  const payload = request.payload || {};
  ensureDatabase_();

  if (action === 'status') {
    return { initialized: true, version: 1, spreadsheetUrl: getDatabase_().getUrl() };
  }
  if (action === 'createProfile') return withLock_(() => createProfile_(request, payload));
  if (action === 'updateProfile') return withLock_(() => updateProfile_(request, payload));
  if (action === 'createRoom') return withLock_(() => createRoom_(request, payload));
  if (action === 'openRooms') return openRooms_();
  if (action === 'joinRoom') return withLock_(() => joinRoom_(request, payload));
  if (action === 'addBot') return withLock_(() => addBot_(request, payload));
  if (action === 'leaveRoom') return withLock_(() => leaveRoom_(request, payload));
  if (action === 'startGame') return withLock_(() => startGame_(request, payload));
  if (action === 'claim') return withLock_(() => claim_(request, payload));
  if (action === 'room') return withLock_(() => readRoom_(request, payload));
  if (action === 'ranking') return ranking_();
  throw new Error('Ação desconhecida.');
}

function parseRequest_(event) {
  const raw = event && event.postData && event.postData.contents ? event.postData.contents : '{}';
  try { return JSON.parse(raw); }
  catch (_) { throw new Error('Pedido inválido.'); }
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function withLock_(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) throw new Error('O servidor está decidindo outra jogada. Tente novamente.');
  try { return callback(); }
  finally { lock.releaseLock(); }
}

function ensureDatabase_() {
  const properties = PropertiesService.getScriptProperties();
  let databaseId = properties.getProperty(DATABASE_PROPERTY);
  let spreadsheet = null;
  if (databaseId) {
    try { spreadsheet = SpreadsheetApp.openById(databaseId); }
    catch (_) { spreadsheet = null; }
  }
  if (!spreadsheet) {
    spreadsheet = SpreadsheetApp.create('PONTO! — Banco de dados');
    properties.setProperty(DATABASE_PROPERTY, spreadsheet.getId());
    properties.setProperty(SECRET_PROPERTY, Utilities.getUuid() + Utilities.getUuid());
  }

  Object.keys(SHEETS).forEach((name, index) => {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      sheet = index === 0 && spreadsheet.getSheets().length === 1 && spreadsheet.getSheets()[0].getLastRow() === 0
        ? spreadsheet.getSheets()[0].setName(name)
        : spreadsheet.insertSheet(name);
    }
    const headers = SHEETS[name];
    if (name === 'PROFILES' && sheet.getLastRow() > 0) {
      const existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(String);
      if (existingHeaders.indexOf('tokenHash') >= 0 && existingHeaders.indexOf('pinHash') < 0) sheet.insertColumnAfter(existingHeaders.indexOf('tokenHash') + 1);
    }
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#17233c').setFontColor('#ffffff');
    } else {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  });
  return spreadsheet;
}

function getDatabase_() {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty(DATABASE_PROPERTY));
}

function sheet_(name) {
  return getDatabase_().getSheetByName(name);
}

function rows_(name) {
  const sheet = sheet_(name);
  const headers = SHEETS[name];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, headers.length).getValues().map((values, index) => {
    const row = { _row: index + 2 };
    headers.forEach((header, column) => { row[header] = values[column]; });
    return row;
  });
}

function append_(name, object) {
  const headers = SHEETS[name];
  sheet_(name).appendRow(headers.map((header) => object[header] === undefined ? '' : object[header]));
}

function writeRow_(name, rowNumber, object) {
  const headers = SHEETS[name];
  sheet_(name).getRange(rowNumber, 1, 1, headers.length).setValues([headers.map((header) => object[header] === undefined ? '' : object[header])]);
}

function cleanName_(value) {
  return String(value || 'Jogador').replace(/[<>\n\r]/g, '').trim().slice(0, 18) || 'Jogador';
}

function cleanAvatar_(value) {
  return String(value || '⚡').replace(/[<>\n\r]/g, '').trim().slice(0, 8) || '⚡';
}

function randomToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function tokenHash_(token) {
  const secret = PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY) || '';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, `${secret}:${token}`, Utilities.Charset.UTF_8);
  return bytes.map((value) => (`0${((value + 256) % 256).toString(16)}`).slice(-2)).join('');
}

function secretHash_(scope, value) {
  const secret = PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY) || '';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, `${secret}:${scope}:${value}`, Utilities.Charset.UTF_8);
  return bytes.map((byte) => (`0${((byte + 256) % 256).toString(16)}`).slice(-2)).join('');
}

function profileFromRow_(row) {
  return {
    id: String(row.id), name: String(row.name), avatar: String(row.avatar),
    games: Number(row.games || 0), wins: Number(row.wins || 0),
    roundWins: Number(row.roundWins || 0), bestStreak: Number(row.bestStreak || 0),
  };
}

function findProfile_(id) {
  return rows_('PROFILES').find((row) => String(row.id) === String(id)) || null;
}

function requireProfile_(request) {
  const id = String(request.profileId || '');
  const token = String(request.token || '');
  const row = findProfile_(id);
  if (!row || !token || row.tokenHash !== tokenHash_(token)) throw new Error('Perfil ou sessão inválidos. Salve seu perfil novamente.');
  row.lastSeenAt = Date.now();
  writeRow_('PROFILES', row._row, row);
  return row;
}

function createProfile_(request, payload) {
  const requestedId = String(payload.id || request.profileId || Utilities.getUuid());
  const existing = findProfile_(requestedId);
  if (existing) throw new Error('Esse perfil já existe neste servidor. Reconecte ou crie outro perfil.');
  const token = randomToken_();
  const pin = String(payload.pin || '');
  if (!/^\d{3}$/.test(pin)) throw new Error('A senha do perfil deve ter exatamente 3 números.');
  const row = {
    id: requestedId,
    name: cleanName_(payload.name),
    avatar: cleanAvatar_(payload.avatar),
    tokenHash: tokenHash_(token),
    pinHash: secretHash_(`profile:${requestedId}`, pin),
    games: 0, wins: 0, roundWins: 0, bestStreak: 0,
    createdAt: Date.now(), lastSeenAt: Date.now(),
  };
  append_('PROFILES', row);
  return { token, profile: profileFromRow_(row) };
}

function updateProfile_(request, payload) {
  const row = requireProfile_(request);
  row.name = cleanName_(payload.name);
  row.avatar = cleanAvatar_(payload.avatar);
  if (payload.pin !== undefined && payload.pin !== '') {
    const pin = String(payload.pin);
    if (!/^\d{3}$/.test(pin)) throw new Error('A senha do perfil deve ter exatamente 3 números.');
    row.pinHash = secretHash_(`profile:${row.id}`, pin);
  }
  row.lastSeenAt = Date.now();
  writeRow_('PROFILES', row._row, row);
  return { profile: profileFromRow_(row) };
}

function roomCode_() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < 5; index += 1) code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  return code;
}

function uniqueRoomCode_() {
  const existing = new Set(rows_('ROOMS').map((row) => String(row.code)));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = roomCode_();
    if (!existing.has(code)) return code;
  }
  throw new Error('Não consegui gerar um código de sala. Tente de novo.');
}

function playerFromProfile_(profile, isHost) {
  return {
    id: String(profile.id), name: String(profile.name), avatar: String(profile.avatar),
    isHost: Boolean(isHost), ready: true, score: 0, cardCount: 0, remaining: 8,
    penaltyCards: 0, penaltyUntil: 0, currentStreak: 0,
  };
}

function botPlayer_(index) {
  const names = ['Bia', 'Caio', 'Malu', 'Nina', 'Theo', 'Zeca', 'Iara'];
  const avatars = ['🦊', '🐯', '🐸', '🦄', '🐼', '🦁', '🐙'];
  return {
    id: `bot_${Utilities.getUuid()}`, name: names[index % names.length], avatar: avatars[index % avatars.length],
    isHost: false, ready: true, score: 0, cardCount: 0, remaining: 8,
    penaltyCards: 0, penaltyUntil: 0, currentStreak: 0, bot: true,
  };
}

function createRoom_(request, payload) {
  const profile = requireProfile_(request);
  const mode = MODE_LIMITS[payload.mode] ? String(payload.mode) : 'tower';
  const maxPlayers = Math.max(2, Math.min(Number(payload.maxPlayers || 4), MODE_LIMITS[mode]));
  const roundsTotal = Math.max(5, Math.min(Number(payload.roundsTotal || 12), 30));
  const password = String(payload.password || '');
  if (password && !/^\d{3,8}$/.test(password)) throw new Error('A senha da sala deve ter de 3 a 8 números.');
  const code = uniqueRoomCode_();
  const timestamp = Date.now();
  const room = {
    code, hostId: String(profile.id), mode, maxPlayers, roundsTotal,
    theme: 'letters-numbers', status: 'lobby', createdAt: timestamp, startedAt: 0,
    updatedAt: timestamp, expiresAt: timestamp + ROOM_TTL_MS,
    hasPassword: Boolean(password), passwordHash: password ? secretHash_(`room:${code}`, password) : '',
    players: [playerFromProfile_(profile, true)], roundNumber: 0, round: null,
    deckOrder: [], deckCursor: 0, finalized: false, winnerIds: [], recentRequestIds: [],
  };
  const botCount = Math.min(Math.max(0, Number(payload.botCount || 0)), maxPlayers - 1);
  for (let index = 0; index < botCount; index += 1) room.players.push(botPlayer_(index));
  saveRoom_(room);
  event_('ROOM_CREATED', room.code, profile.id, { mode, maxPlayers });
  return { room: publicRoom_(room) };
}

function getRoom_(code) {
  const normalized = String(code || '').trim().toUpperCase();
  const row = rows_('ROOMS').find((item) => String(item.code) === normalized);
  if (!row) throw new Error('Sala não encontrada.');
  let room;
  try { room = JSON.parse(row.stateJson); }
  catch (_) { throw new Error('Os dados desta sala estão corrompidos.'); }
  room._row = row._row;
  if (Number(room.expiresAt || 0) < Date.now()) throw new Error('Essa sala expirou. Crie uma nova.');
  return room;
}

function saveRoom_(room) {
  room.updatedAt = Date.now();
  room.expiresAt = Math.max(Number(room.expiresAt || 0), Date.now() + ROOM_TTL_MS);
  const row = room._row || null;
  const stored = { code: room.code, stateJson: JSON.stringify(stripInternalRoom_(room)), updatedAt: room.updatedAt, expiresAt: room.expiresAt };
  if (row) writeRow_('ROOMS', row, stored); else append_('ROOMS', stored);
}

function stripInternalRoom_(room) {
  const copy = JSON.parse(JSON.stringify(room));
  delete copy._row;
  return copy;
}

function publicRoom_(room) {
  const copy = stripInternalRoom_(room);
  delete copy.deckOrder;
  delete copy.deckCursor;
  delete copy.recentRequestIds;
  delete copy.passwordHash;
  return copy;
}

function openRooms_() {
  const timestamp = Date.now();
  const rooms = rows_('ROOMS').map((row) => {
    try { return JSON.parse(row.stateJson); } catch (_) { return null; }
  }).filter((room) => room && room.status === 'lobby' && Number(room.expiresAt || 0) > timestamp && room.players.length < room.maxPlayers)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, 30)
    .map((room) => ({
      code: room.code, mode: room.mode, playerCount: room.players.length,
      maxPlayers: room.maxPlayers, hasPassword: Boolean(room.hasPassword), createdAt: room.createdAt,
    }));
  return { rooms };
}

function joinRoom_(request, payload) {
  const profile = requireProfile_(request);
  const room = getRoom_(payload.code);
  if (room.status !== 'lobby') throw new Error('Essa partida já começou.');
  if (room.hasPassword && room.passwordHash !== secretHash_(`room:${room.code}`, String(payload.password || ''))) throw new Error('Senha da sala incorreta.');
  let player = room.players.find((entry) => String(entry.id) === String(profile.id));
  if (!player) {
    if (room.players.length >= room.maxPlayers) throw new Error('A sala está cheia.');
    player = playerFromProfile_(profile, false);
    room.players.push(player);
    event_('PLAYER_JOINED', room.code, profile.id, {});
  } else {
    player.name = String(profile.name);
    player.avatar = String(profile.avatar);
  }
  saveRoom_(room);
  return { room: publicRoom_(room) };
}

function addBot_(request, payload) {
  const profile = requireProfile_(request);
  const room = getRoom_(payload.code);
  if (room.hostId !== String(profile.id)) throw new Error('Apenas o anfitrião pode adicionar treino.');
  if (room.status !== 'lobby') throw new Error('A partida já começou.');
  if (room.players.length >= room.maxPlayers) throw new Error('A sala está cheia.');
  room.players.push(botPlayer_(room.players.filter((player) => player.bot).length));
  saveRoom_(room);
  event_('BOT_ADDED', room.code, profile.id, {});
  return { room: publicRoom_(room) };
}

function leaveRoom_(request, payload) {
  const profile = requireProfile_(request);
  const room = getRoom_(payload.code);
  room.players = room.players.filter((player) => String(player.id) !== String(profile.id));
  if (!room.players.length) room.status = 'closed';
  else if (room.hostId === String(profile.id)) {
    room.hostId = String(room.players[0].id);
    room.players[0].isHost = true;
  }
  saveRoom_(room);
  event_('PLAYER_LEFT', room.code, profile.id, {});
  return { room: publicRoom_(room) };
}

function seededNumber_(seed) {
  let hash = 2166136261;
  const text = String(seed);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededShuffle_(items, seed) {
  const result = items.slice();
  let value = seededNumber_(seed);
  function random() {
    value += 0x6D2B79F5;
    let output = value;
    output = Math.imul(output ^ output >>> 15, output | 1);
    output ^= output + Math.imul(output ^ output >>> 7, output | 61);
    return ((output ^ output >>> 14) >>> 0) / 4294967296;
  }
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const temporary = result[index]; result[index] = result[swap]; result[swap] = temporary;
  }
  return result;
}

function startGame_(request, payload) {
  const profile = requireProfile_(request);
  const room = getRoom_(payload.code);
  if (room.hostId !== String(profile.id)) throw new Error('Apenas o anfitrião pode começar.');
  if (room.status !== 'lobby') throw new Error('A partida não está no lobby.');
  if (room.players.length < 2) throw new Error('É preciso ter pelo menos 2 jogadores.');
  room.status = 'active';
  room.startedAt = Date.now();
  room.roundNumber = 1;
  room.deckOrder = seededShuffle_(Array.from({ length: 57 }, (_, index) => index), `${room.code}:${room.startedAt}`);
  room.deckCursor = 0;
  room.players.forEach((player) => {
    player.score = 0; player.cardCount = 0; player.remaining = 8;
    player.penaltyCards = 0; player.penaltyUntil = 0; player.currentStreak = 0;
  });
  prepareRound_(room);
  saveRoom_(room);
  event_('GAME_STARTED', room.code, profile.id, { players: room.players.length, mode: room.mode });
  return { room: publicRoom_(room) };
}

function takeCard_(room, used) {
  for (let attempt = 0; attempt < 57; attempt += 1) {
    const cardId = room.deckOrder[room.deckCursor % room.deckOrder.length];
    room.deckCursor += 1;
    if (!used[cardId]) return cardId;
  }
  return Math.floor(Math.random() * 57);
}

function prepareRound_(room) {
  const used = {};
  const central = takeCard_(room, used); used[central] = true;
  const playerCardIds = {};
  room.players.forEach((player) => {
    const cardId = takeCard_(room, used); used[cardId] = true;
    playerCardIds[player.id] = cardId;
  });

  const observedCardIds = {};
  const targetIds = {};
  room.players.forEach((player, index) => {
    if (room.mode === 'gift') {
      const target = room.players[(index + 1) % room.players.length];
      targetIds[player.id] = target.id;
      observedCardIds[player.id] = playerCardIds[target.id];
    } else {
      observedCardIds[player.id] = central;
    }
  });

  room.round = {
    id: `${room.code}_${room.roundNumber}_${Utilities.getUuid()}`,
    number: room.roundNumber,
    observedCardId: central,
    observedCardIds,
    playerCardIds,
    targetIds,
    claimedBy: '', claimedAt: 0, locked: false, nextAt: 0, startedAt: Date.now(),
    botClaimAt: room.players.some((player) => player.bot) ? Date.now() + 3200 + Math.floor(Math.random() * 2600) : 0,
  };
}

function projectiveDeck_() {
  const cards = [];
  for (let slope = 0; slope < 7; slope += 1) {
    for (let intercept = 0; intercept < 7; intercept += 1) {
      const card = [];
      for (let x = 0; x < 7; x += 1) {
        const y = ((slope * x + intercept) % 7 + 7) % 7;
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

function commonSymbol_(cardAId, cardBId) {
  const deck = projectiveDeck_();
  const second = {};
  deck[Number(cardBId)].forEach((symbol) => { second[symbol] = true; });
  return deck[Number(cardAId)].find((symbol) => second[symbol]);
}

function claim_(request, payload) {
  const profile = requireProfile_(request);
  let room = getRoom_(payload.code);
  room = maybeAdvanceRoom_(room);
  if (room.status !== 'active') return { result: 'late', room: publicRoom_(room) };
  const player = room.players.find((entry) => String(entry.id) === String(profile.id));
  if (!player) throw new Error('Você não está nesta sala.');
  const requestId = String(payload.requestId || '');
  room.recentRequestIds = Array.isArray(room.recentRequestIds) ? room.recentRequestIds : [];
  if (requestId && room.recentRequestIds.indexOf(requestId) >= 0) return { result: 'late', room: publicRoom_(room) };
  if (requestId) room.recentRequestIds = room.recentRequestIds.concat(requestId).slice(-30);
  if (Number(player.penaltyUntil || 0) > Date.now()) return { result: 'wrong', penaltyUntil: player.penaltyUntil, room: publicRoom_(room) };
  if (!room.round || String(room.round.id) !== String(payload.roundId) || room.round.locked) {
    const winner = room.players.find((entry) => entry.id === room.round?.claimedBy);
    return { result: 'late', winnerName: winner ? winner.name : '', room: publicRoom_(room) };
  }

  const observed = room.round.observedCardIds && room.round.observedCardIds[player.id] !== undefined
    ? room.round.observedCardIds[player.id]
    : room.round.observedCardId;
  const expected = commonSymbol_(observed, room.round.playerCardIds[player.id]);
  if (Number(payload.symbolId) !== Number(expected)) {
    player.penaltyUntil = Date.now() + PENALTY_MS;
    player.currentStreak = 0;
    saveRoom_(room);
    event_('MISS', room.code, profile.id, { roundId: room.round.id, symbolId: payload.symbolId, penaltyUntil: player.penaltyUntil });
    return { result: 'wrong', penaltyUntil: player.penaltyUntil, room: publicRoom_(room) };
  }

  room.round.locked = true;
  room.round.claimedBy = player.id;
  room.round.claimedAt = Date.now();
  room.round.nextAt = Date.now() + 900;
  player.score = Number(player.score || 0) + 1;
  player.currentStreak = Number(player.currentStreak || 0) + 1;
  applyWin_(room, player);
  updateRoundStats_(profile, player.currentStreak);
  saveRoom_(room);
  event_('CLAIM_WON', room.code, profile.id, {
    roundId: room.round.id,
    symbolId: expected,
    clientSentAt: Number(payload.clientSentAt || 0),
    serverReceivedAt: room.round.claimedAt,
  });
  return { result: 'won', winnerName: player.name, room: publicRoom_(room) };
}

function applyWin_(room, player) {
  if (room.mode === 'tower') {
    player.cardCount = Number(player.cardCount || 0) + 1;
  } else if (room.mode === 'well') {
    player.remaining = Math.max(0, Number(player.remaining || 8) - 1);
  } else if (room.mode === 'potato') {
    const targets = room.players.filter((entry) => entry.id !== player.id);
    if (targets.length) {
      const target = targets[room.roundNumber % targets.length];
      target.penaltyCards = Number(target.penaltyCards || 0) + 1;
    }
  } else if (room.mode === 'gift') {
    const targetId = room.round.targetIds && room.round.targetIds[player.id];
    const target = room.players.find((entry) => entry.id === targetId) || room.players.find((entry) => entry.id !== player.id);
    if (target) target.penaltyCards = Number(target.penaltyCards || 0) + 1;
    player.cardCount = Number(player.cardCount || 0) + 1;
  }
}

function updateRoundStats_(profileRow, streak) {
  profileRow.roundWins = Number(profileRow.roundWins || 0) + 1;
  profileRow.bestStreak = Math.max(Number(profileRow.bestStreak || 0), Number(streak || 0));
  profileRow.lastSeenAt = Date.now();
  writeRow_('PROFILES', profileRow._row, profileRow);
}

function maybeAdvanceRoom_(room) {
  if (room.status !== 'active' || !room.round) return room;
  if (!room.round.locked && Number(room.round.botClaimAt || 0) > 0 && Number(room.round.botClaimAt) <= Date.now()) {
    const bots = room.players.filter((player) => player.bot);
    if (bots.length) {
      const bot = bots[room.roundNumber % bots.length];
      room.round.locked = true;
      room.round.claimedBy = bot.id;
      room.round.claimedAt = Date.now();
      room.round.nextAt = Date.now() + 900;
      bot.score = Number(bot.score || 0) + 1;
      bot.currentStreak = Number(bot.currentStreak || 0) + 1;
      applyWin_(room, bot);
      event_('BOT_CLAIM_WON', room.code, bot.id, { roundId: room.round.id });
      saveRoom_(room);
    }
  }
  if (!room.round.locked || Number(room.round.nextAt || 0) > Date.now()) return room;
  const wellWinner = room.mode === 'well' ? room.players.find((player) => Number(player.remaining || 0) <= 0) : null;
  if (wellWinner || room.roundNumber >= room.roundsTotal) {
    finishRoom_(room, wellWinner ? wellWinner.id : '');
    saveRoom_(room);
    return room;
  }
  room.roundNumber += 1;
  prepareRound_(room);
  saveRoom_(room);
  return room;
}

function determineWinnerIds_(room, forcedId) {
  if (forcedId) return [String(forcedId)];
  const values = room.players.map((player) => {
    if (room.mode === 'well') return -Number(player.remaining || 0);
    if (room.mode === 'gift' || room.mode === 'potato') return -Number(player.penaltyCards || 0);
    return Number(player.score || 0);
  });
  const best = Math.max.apply(null, values);
  return room.players.filter((_, index) => values[index] === best).map((player) => String(player.id));
}

function finishRoom_(room, forcedWinnerId) {
  if (room.finalized) return;
  room.status = 'finished';
  room.finishedAt = Date.now();
  room.winnerIds = determineWinnerIds_(room, forcedWinnerId);
  room.winnerId = room.winnerIds[0] || '';
  room.finalized = true;

  room.players.forEach((player) => {
    const profile = findProfile_(player.id);
    if (!profile) return;
    profile.games = Number(profile.games || 0) + 1;
    if (room.winnerIds.indexOf(String(player.id)) >= 0) profile.wins = Number(profile.wins || 0) + 1;
    profile.lastSeenAt = Date.now();
    writeRow_('PROFILES', profile._row, profile);
  });

  append_('MATCHES', {
    id: Utilities.getUuid(), roomCode: room.code, mode: room.mode,
    winnerIds: JSON.stringify(room.winnerIds), participantsJson: JSON.stringify(room.players.map((player) => player.id)),
    startedAt: room.startedAt, endedAt: room.finishedAt,
  });
  event_('GAME_FINISHED', room.code, room.winnerId, { winnerIds: room.winnerIds });
}

function readRoom_(request, payload) {
  requireProfile_(request);
  let room = getRoom_(payload.code);
  room = maybeAdvanceRoom_(room);
  if (!room.players.some((player) => String(player.id) === String(request.profileId))) throw new Error('Você não está nesta sala.');
  return { room: publicRoom_(room) };
}

function ranking_() {
  const ranking = rows_('PROFILES').map(profileFromRow_).sort((a, b) => b.wins - a.wins || b.games - a.games).slice(0, 100);
  return { ranking };
}

function event_(type, roomCode, profileId, payload) {
  append_('EVENTS', {
    id: Utilities.getUuid(), roomCode: String(roomCode || ''), type: String(type),
    profileId: String(profileId || ''), createdAt: Date.now(), payloadJson: JSON.stringify(payload || {}),
  });
}
