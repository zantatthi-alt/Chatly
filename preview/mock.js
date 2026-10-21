// PREVIEW ONLY: fakes the server inside the browser so the app can be tried without uploading anything.
// Demo users (bob, carol, dana) live here and reply automatically.
(function () {
  const KEY = 'chatly-preview-db';
  const rid = () => Math.random().toString(16).slice(2, 18);
  const BOT_REPLIES = ['Haha nice 😂', 'Sounds good! 👍', 'Wow 😮', 'I agree 💯', 'Hello! 👋', 'Love it ❤️', 'Let’s do it 🎉', 'Hmm 🤔 tell me more', '🔥🔥', 'Same here 😄'];

  function seed() {
    const now = Date.now();
    const users = {};
    [['bob', 'Bob'], ['carol', 'Carol'], ['dana', 'Dana']].forEach(([u, d]) => {
      users[u] = { username: u, displayName: d, password: 'demo123', avatar: null, lang: 'en', friends: [], requests: [], bot: true };
    });
    users.bob.friends = ['carol']; users.carol.friends = ['bob'];
    const lounge = {
      id: 'lounge', type: 'group', name: 'Welcome Lounge', owner: 'bob', isPublic: true, members: ['bob', 'carol', 'dana'],
      messages: [
        { id: rid(), system: 'created', from: 'bob', ts: now - 3600e3, reactions: {} },
        { id: rid(), from: 'bob', text: 'Welcome everyone! 👋', ts: now - 3500e3, reactions: { '❤️': ['carol'] } },
        { id: rid(), from: 'carol', text: 'Hi hi! 😄', ts: now - 3400e3, reactions: {} },
        { id: rid(), from: 'dana', text: '🎉🎉', ts: now - 3300e3, reactions: {} },
      ],
    };
    return { users, sessions: {}, rooms: { lounge } };
  }

  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!db) db = seed();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };
  const online = new Set(['bob', 'carol']);

  // ---------- fake HTTP ----------
  const realFetch = window.fetch;
  window.fetch = async (url, opts) => {
    if (!String(url).startsWith('/api/')) return realFetch(url, opts);
    const body = JSON.parse((opts && opts.body) || '{}');
    const reply = (status, data) => ({ ok: status < 400, status, json: async () => data });
    const name = String(body.username || '').trim().toLowerCase();
    if (url === '/api/signup') {
      if (!/^[a-z0-9_]{3,20}$/.test(name)) return reply(400, { error: 'badUsername' });
      if (String(body.password || '').length < 6) return reply(400, { error: 'shortPassword' });
      if (db.users[name]) return reply(409, { error: 'userExists' });
      db.users[name] = { username: name, displayName: String(body.displayName || name).trim().slice(0, 30) || name, password: body.password, avatar: null, lang: body.lang || 'en', friends: [], requests: ['bob'] };
      const token = rid(); db.sessions[token] = name; save();
      return reply(200, { token });
    }
    if (url === '/api/login') {
      const u = db.users[name];
      if (!u || u.password !== body.password) return reply(401, { error: 'badLogin' });
      const token = rid(); db.sessions[token] = name; save();
      return reply(200, { token });
    }
    if (url === '/api/logout') { delete db.sessions[body.token]; save(); return reply(200, { ok: true }); }
    return reply(404, {});
  };

  // ---------- fake socket ----------
  window.io = function ({ auth }) {
    const handlers = {};
    const me = db.sessions[auth.token];
    const fire = (ev, data) => setTimeout(() => (handlers[ev] || []).forEach(h => h(data)), 0);
    const pub = u => ({ username: u.username, displayName: u.displayName, avatar: u.avatar, online: online.has(u.username) });
    const roomView = r => ({ id: r.id, name: r.name, type: r.type, owner: r.owner, isPublic: !!r.isPublic, members: r.members.map(m => pub(db.users[m])), last: r.messages[r.messages.length - 1] || null });
    const sendState = () => {
      const u = db.users[me];
      fire('state', {
        me: { ...pub(u), lang: u.lang },
        friends: u.friends.map(f => pub(db.users[f])),
        requests: u.requests.map(f => pub(db.users[f])),
        rooms: Object.values(db.rooms).filter(r => r.members.includes(me)).map(roomView),
        publicRooms: Object.values(db.rooms).filter(r => r.isPublic && !r.members.includes(me)).map(r => ({ id: r.id, name: r.name, count: r.members.length })),
      });
    };
    const push = (room, msg) => {
      room.messages.push(msg); save();
      if (room.members.includes(me)) fire('msg:new', { roomId: room.id, msg });
    };
    const sys = (room, kind, a, b) => push(room, { id: rid(), system: kind, from: a, target: b || null, ts: Date.now(), reactions: {} });
    const makeFriends = (a, b) => {
      const A = db.users[a], B = db.users[b];
      A.requests = A.requests.filter(x => x !== b); B.requests = B.requests.filter(x => x !== a);
      if (!A.friends.includes(b)) A.friends.push(b);
      if (!B.friends.includes(a)) B.friends.push(a);
      save();
    };
    // bots answer after a short pause and sometimes react
    const botsReply = (room, msg) => {
      const bots = room.members.filter(m => db.users[m].bot);
      if (!bots.length) return;
      const bot = bots[Math.floor(Math.random() * bots.length)];
      setTimeout(() => {
        fire('typing', { roomId: room.id, username: bot });
        if (Math.random() < 0.5) {
          msg.reactions[['👍', '❤️', '😂'][Math.floor(Math.random() * 3)]] = [bot];
          fire('msg:reactions', { roomId: room.id, msgId: msg.id, reactions: msg.reactions });
        }
      }, 700);
      setTimeout(() => push(room, { id: rid(), from: bot, text: BOT_REPLIES[Math.floor(Math.random() * BOT_REPLIES.length)], ts: Date.now(), reactions: {} }), 1800);
    };

    const api = {
      'profile:update': ({ displayName, avatar, lang }) => {
        const u = db.users[me];
        if (displayName && displayName.trim()) u.displayName = displayName.trim().slice(0, 30);
        if (avatar !== undefined) u.avatar = avatar;
        if (lang) u.lang = lang;
        save(); sendState(); return { ok: true };
      },
      'friend:request': ({ username }) => {
        const name = String(username || '').trim().toLowerCase(), them = db.users[name], u = db.users[me];
        if (!them) return { error: 'noSuchUser' };
        if (name === me) return { error: 'cantAddSelf' };
        if (u.friends.includes(name)) return { error: 'alreadyFriends' };
        if (u.requests.includes(name)) { makeFriends(me, name); sendState(); return { ok: true }; }
        if (!them.requests.includes(me)) them.requests.push(me);
        save();
        if (them.bot) setTimeout(() => { makeFriends(me, name); sendState(); }, 1200);
        return { ok: true };
      },
      'friend:accept': ({ username }) => { makeFriends(me, username); sendState(); return { ok: true }; },
      'friend:decline': ({ username }) => { const u = db.users[me]; u.requests = u.requests.filter(r => r !== username); save(); sendState(); return { ok: true }; },
      'friend:remove': ({ username }) => {
        const u = db.users[me], t = db.users[username];
        u.friends = u.friends.filter(f => f !== username); t.friends = t.friends.filter(f => f !== me);
        save(); sendState(); return { ok: true };
      },
      'dm:open': ({ username }) => {
        let room = Object.values(db.rooms).find(r => r.type === 'dm' && r.members.includes(me) && r.members.includes(username));
        if (!room) { room = { id: rid(), type: 'dm', name: '', members: [me, username], messages: [] }; db.rooms[room.id] = room; save(); sendState(); }
        return { roomId: room.id };
      },
      'group:create': ({ name, members, isPublic }) => {
        const title = String(name || '').trim().slice(0, 40);
        if (!title) return { error: 'needName' };
        const room = { id: rid(), type: 'group', name: title, owner: me, isPublic: !!isPublic, members: [...new Set([me, ...(members || [])])], messages: [] };
        db.rooms[room.id] = room;
        sys(room, 'created', me); sendState(); return { roomId: room.id };
      },
      'group:add': ({ roomId, username }) => {
        const room = db.rooms[roomId];
        if (!room.members.includes(username)) { room.members.push(username); sys(room, 'added', me, username); sendState(); }
        return { ok: true };
      },
      'group:join': ({ roomId }) => {
        const room = db.rooms[roomId];
        if (!room.members.includes(me)) { room.members.push(me); sys(room, 'joined', me); sendState(); botsReply(room, room.messages[room.messages.length - 1]); }
        return { roomId };
      },
      'group:leave': ({ roomId }) => {
        const room = db.rooms[roomId];
        room.members = room.members.filter(m => m !== me);
        if (!room.members.length) delete db.rooms[roomId]; else sys(room, 'left', me);
        save(); sendState(); return { ok: true };
      },
      'room:history': ({ roomId }) => ({ messages: (db.rooms[roomId] || { messages: [] }).messages.slice(-200) }),
      'msg:send': ({ roomId, text }) => {
        const room = db.rooms[roomId];
        const msg = { id: rid(), from: me, text: String(text).slice(0, 2000), ts: Date.now(), reactions: {} };
        push(room, msg); botsReply(room, msg); return { ok: true };
      },
      'msg:react': ({ roomId, msgId, emoji }) => {
        const msg = db.rooms[roomId].messages.find(m => m.id === msgId);
        const who = msg.reactions[emoji] || [];
        msg.reactions[emoji] = who.includes(me) ? who.filter(w => w !== me) : [...who, me];
        if (!msg.reactions[emoji].length) delete msg.reactions[emoji];
        save(); fire('msg:reactions', { roomId, msgId, reactions: msg.reactions });
      },
      'typing': () => {},
    };

    const sock = {
      on(ev, h) { (handlers[ev] = handlers[ev] || []).push(h); return sock; },
      emit(ev, data, cb) {
        const res = api[ev] ? api[ev](data || {}) : undefined;
        if (typeof cb === 'function') setTimeout(() => cb(res || {}), 0);
      },
      disconnect() { for (const k in handlers) delete handlers[k]; },
    };
    if (!me || !db.users[me]) fire('connect_error', { message: 'unauthorized' });
    else sendState();
    return sock;
  };
})();
