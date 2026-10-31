const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const store = require('./storage');

// all data lives in memory while running; storage.js saves it (database or file)
let db = { users: {}, sessions: {}, rooms: {} };
const save = () => store.save();

const id = () => crypto.randomBytes(8).toString('hex');
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const LANGS = ['en', 'es', 'fr', 'ja', 'th', 'zh'];
const MAX_AVATAR = 300 * 1024;
const MAX_HISTORY = store.KEEP_IN_MEMORY;
const PAGE = 100; // messages sent to the browser at a time

function publicUser(u) {
  return { username: u.username, displayName: u.displayName, avatar: u.avatar, online: online.has(u.username) };
}

function roomView(r) {
  return {
    id: r.id, name: r.name, type: r.type, owner: r.owner, isPublic: !!r.isPublic,
    members: r.members.map(m => db.users[m]).filter(Boolean).map(publicUser),
    last: r.messages[r.messages.length - 1] || null,
  };
}

// ---------- HTTP: sign up / log in ----------
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/signup', (req, res) => {
  const { username, password, displayName, lang } = req.body || {};
  const name = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(name)) return res.status(400).json({ error: 'badUsername' });
  if (String(password || '').length < 6) return res.status(400).json({ error: 'shortPassword' });
  if (db.users[name]) return res.status(409).json({ error: 'userExists' });
  const salt = crypto.randomBytes(16).toString('hex');
  db.users[name] = {
    username: name,
    displayName: String(displayName || name).trim().slice(0, 30) || name,
    salt, passHash: hash(password, salt),
    avatar: null, lang: LANGS.includes(lang) ? lang : 'en',
    friends: [], requests: [], createdAt: Date.now(),
  };
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = name;
  save();
  res.json({ token });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = db.users[String(username || '').trim().toLowerCase()];
  if (!u || hash(String(password || ''), u.salt) !== u.passHash) return res.status(401).json({ error: 'badLogin' });
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = u.username;
  save();
  res.json({ token });
});

app.post('/api/logout', (req, res) => {
  delete db.sessions[req.body && req.body.token];
  save();
  res.json({ ok: true });
});

// ---------- realtime ----------
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6 });
const online = new Map(); // username -> count of open sockets

io.use((socket, next) => {
  const name = db.sessions[socket.handshake.auth && socket.handshake.auth.token];
  if (!name || !db.users[name]) return next(new Error('unauthorized'));
  socket.user = name;
  next();
});

// push fresh state (friends, requests, rooms) to every socket of a user
function sendState(username) {
  const u = db.users[username];
  if (!u) return;
  io.to('user:' + username).emit('state', {
    me: { ...publicUser(u), lang: u.lang },
    friends: u.friends.map(f => db.users[f]).filter(Boolean).map(publicUser),
    requests: u.requests.map(f => db.users[f]).filter(Boolean).map(publicUser),
    rooms: Object.values(db.rooms).filter(r => r.members.includes(username)).map(roomView),
    publicRooms: Object.values(db.rooms)
      .filter(r => r.isPublic && !r.members.includes(username))
      .map(r => ({ id: r.id, name: r.name, count: r.members.length })),
  });
}
const sendStateAll = names => names.forEach(sendState);

function joinRoomSockets(username, roomId) {
  io.in('user:' + username).socketsJoin('room:' + roomId);
}

io.on('connection', socket => {
  const me = socket.user;
  socket.join('user:' + me);
  Object.values(db.rooms).filter(r => r.members.includes(me)).forEach(r => socket.join('room:' + r.id));

  online.set(me, (online.get(me) || 0) + 1);
  sendState(me);
  sendStateAll(db.users[me].friends);

  const ack = (cb, data) => typeof cb === 'function' && cb(data);

  socket.on('profile:update', ({ displayName, avatar, lang } = {}, cb) => {
    const u = db.users[me];
    if (typeof displayName === 'string' && displayName.trim()) u.displayName = displayName.trim().slice(0, 30);
    if (avatar === null) u.avatar = null;
    else if (typeof avatar === 'string') {
      if (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(avatar) || avatar.length > MAX_AVATAR) return ack(cb, { error: 'badImage' });
      u.avatar = avatar;
    }
    if (LANGS.includes(lang)) u.lang = lang;
    save();
    sendState(me);
    sendStateAll(u.friends);
    ack(cb, { ok: true });
  });

  socket.on('friend:request', ({ username } = {}, cb) => {
    const name = String(username || '').trim().toLowerCase();
    const them = db.users[name], u = db.users[me];
    if (!them) return ack(cb, { error: 'noSuchUser' });
    if (name === me) return ack(cb, { error: 'cantAddSelf' });
    if (u.friends.includes(name)) return ack(cb, { error: 'alreadyFriends' });
    // they already asked us -> just become friends
    if (u.requests.includes(name)) return acceptFriend(name, cb);
    if (!them.requests.includes(me)) them.requests.push(me);
    save();
    sendState(name);
    ack(cb, { ok: true });
  });

  function acceptFriend(name, cb) {
    const u = db.users[me], them = db.users[name];
    if (!them || !u.requests.includes(name)) return ack(cb, { error: 'noSuchUser' });
    u.requests = u.requests.filter(r => r !== name);
    them.requests = them.requests.filter(r => r !== me);
    if (!u.friends.includes(name)) u.friends.push(name);
    if (!them.friends.includes(me)) them.friends.push(me);
    save();
    sendStateAll([me, name]);
    ack(cb, { ok: true });
  }
  socket.on('friend:accept', ({ username } = {}, cb) => acceptFriend(username, cb));

  socket.on('friend:decline', ({ username } = {}, cb) => {
    const u = db.users[me];
    u.requests = u.requests.filter(r => r !== username);
    save();
    sendState(me);
    ack(cb, { ok: true });
  });

  socket.on('friend:remove', ({ username } = {}, cb) => {
    const u = db.users[me], them = db.users[username];
    u.friends = u.friends.filter(f => f !== username);
    if (them) them.friends = them.friends.filter(f => f !== me);
    save();
    sendStateAll([me, username]);
    ack(cb, { ok: true });
  });

  // direct message room between two friends (created on first open)
  socket.on('dm:open', ({ username } = {}, cb) => {
    if (!db.users[me].friends.includes(username)) return ack(cb, { error: 'notFriends' });
    let room = Object.values(db.rooms).find(r => r.type === 'dm' && r.members.includes(me) && r.members.includes(username));
    if (!room) {
      room = { id: id(), type: 'dm', name: '', owner: null, members: [me, username], messages: [], createdAt: Date.now() };
      db.rooms[room.id] = room;
      save();
      joinRoomSockets(me, room.id);
      joinRoomSockets(username, room.id);
      sendStateAll([me, username]);
    }
    ack(cb, { roomId: room.id });
  });

  socket.on('group:create', ({ name, members, isPublic } = {}, cb) => {
    const title = String(name || '').trim().slice(0, 40);
    if (!title) return ack(cb, { error: 'needName' });
    const friends = db.users[me].friends;
    const list = [me, ...(Array.isArray(members) ? members : []).filter(m => friends.includes(m))];
    const room = { id: id(), type: 'group', name: title, owner: me, isPublic: !!isPublic, members: [...new Set(list)], messages: [], createdAt: Date.now() };
    db.rooms[room.id] = room;
    systemMessage(room, 'created', me);
    save();
    room.members.forEach(m => joinRoomSockets(m, room.id));
    sendStateAll(isPublic ? Object.keys(db.users) : room.members);
    ack(cb, { roomId: room.id });
  });

  socket.on('group:add', ({ roomId, username } = {}, cb) => {
    const room = db.rooms[roomId];
    if (!room || room.type !== 'group' || !room.members.includes(me)) return ack(cb, { error: 'noRoom' });
    if (!db.users[me].friends.includes(username)) return ack(cb, { error: 'notFriends' });
    if (!room.members.includes(username)) {
      room.members.push(username);
      joinRoomSockets(username, room.id);
      systemMessage(room, 'added', me, username);
      save();
      sendStateAll(room.members);
    }
    ack(cb, { ok: true });
  });

  socket.on('group:join', ({ roomId } = {}, cb) => {
    const room = db.rooms[roomId];
    if (!room || !room.isPublic) return ack(cb, { error: 'noRoom' });
    if (!room.members.includes(me)) {
      room.members.push(me);
      joinRoomSockets(me, room.id);
      systemMessage(room, 'joined', me);
      save();
      sendStateAll(room.members);
    }
    ack(cb, { roomId: room.id });
  });

  socket.on('group:leave', ({ roomId } = {}, cb) => {
    const room = db.rooms[roomId];
    if (!room || room.type !== 'group') return ack(cb, { error: 'noRoom' });
    room.members = room.members.filter(m => m !== me);
    io.in('user:' + me).socketsLeave('room:' + room.id);
    if (room.members.length === 0) delete db.rooms[room.id];
    else {
      if (room.owner === me) room.owner = room.members[0];
      systemMessage(room, 'left', me);
    }
    save();
    sendStateAll(room.isPublic ? Object.keys(db.users) : [me, ...room.members]);
    ack(cb, { ok: true });
  });

  // newest messages, or with `before` (a timestamp) the ones just older than that
  socket.on('room:history', async ({ roomId, before } = {}, cb) => {
    const room = db.rooms[roomId];
    if (!room || !room.members.includes(me)) return ack(cb, { error: 'noRoom' });
    const until = typeof before === 'number' ? before : Infinity;
    let messages = room.messages.filter(m => m.ts < until).slice(-PAGE);
    if (messages.length < PAGE && store.olderMessages) {
      const oldestInMemory = room.messages.length ? room.messages[0].ts : until;
      try {
        messages = [...await store.olderMessages(room.id, Math.min(until, oldestInMemory), PAGE - messages.length), ...messages];
      } catch (e) {
        console.error('Loading old messages failed:', e.message);
      }
    }
    ack(cb, { messages, more: messages.length === PAGE });
  });

  socket.on('msg:send', ({ roomId, text } = {}, cb) => {
    const room = db.rooms[roomId];
    const body = String(text || '').trim().slice(0, 2000);
    if (!room || !room.members.includes(me) || !body) return ack(cb, { error: 'noRoom' });
    const msg = { id: id(), from: me, text: body, ts: Date.now(), reactions: {} };
    pushMessage(room, msg);
    ack(cb, { ok: true });
  });

  socket.on('msg:react', ({ roomId, msgId, emoji } = {}) => {
    const room = db.rooms[roomId];
    if (!room || !room.members.includes(me) || typeof emoji !== 'string' || emoji.length > 16) return;
    const msg = room.messages.find(m => m.id === msgId);
    if (!msg) return;
    msg.reactions = msg.reactions || {};
    const who = msg.reactions[emoji] || [];
    msg.reactions[emoji] = who.includes(me) ? who.filter(w => w !== me) : [...who, me];
    if (!msg.reactions[emoji].length) delete msg.reactions[emoji];
    save();
    io.to('room:' + room.id).emit('msg:reactions', { roomId: room.id, msgId, reactions: msg.reactions });
  });

  socket.on('typing', ({ roomId } = {}) => {
    const room = db.rooms[roomId];
    if (room && room.members.includes(me)) socket.to('room:' + roomId).emit('typing', { roomId, username: me });
  });

  socket.on('disconnect', () => {
    const n = (online.get(me) || 1) - 1;
    if (n <= 0) online.delete(me); else online.set(me, n);
    if (n <= 0) sendStateAll(db.users[me] ? db.users[me].friends : []);
  });
});

function pushMessage(room, msg) {
  room.messages.push(msg);
  if (room.messages.length > MAX_HISTORY) room.messages.splice(0, room.messages.length - MAX_HISTORY);
  save();
  io.to('room:' + room.id).emit('msg:new', { roomId: room.id, msg });
}

// system messages are stored as keys so each user sees them in their own language
function systemMessage(room, kind, actor, target) {
  pushMessage(room, { id: id(), system: kind, from: actor, target: target || null, ts: Date.now(), reactions: {} });
}

// save everything before the server is stopped (Render does this on every deploy)
async function shutdown() {
  try { await store.flush(); } catch (e) { console.error('Final save failed:', e.message); }
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

store.load().then(data => {
  db = data;
  console.log(store.usingDatabase ? 'Using the database (DATABASE_URL)' : 'Saving to data/db.json');
  server.listen(PORT, () => console.log(`Web chat running on http://localhost:${PORT}`));
}).catch(e => {
  console.error('Could not load saved data:', e.message);
  process.exit(1);
});
