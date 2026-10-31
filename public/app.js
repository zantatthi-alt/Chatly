const $ = s => document.querySelector(s);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

let token = null, socket = null;
let state = { me: null, friends: [], requests: [], rooms: [], publicRooms: [] };
let currentRoom = null;
let messages = [];          // messages of the open room
let hasOlder = false;       // server has older messages for the open room
const unread = {};          // roomId -> count
let authMode = 'login';
let pendingAvatar;          // undefined = unchanged, null = remove, string = new data URL

try { token = localStorage.getItem('token'); } catch (e) {}
let savedLang = 'en';
try { savedLang = localStorage.getItem('lang') || (navigator.language || 'en').slice(0, 2); } catch (e) {}

// ---------- text size (also remembered on this device so the login page uses it) ----------
function applyTextSize(size) {
  document.documentElement.style.setProperty('--text-scale', size);
  try { localStorage.setItem('textSize', size); } catch (e) {}
}
try { const saved = localStorage.getItem('textSize'); if (saved) applyTextSize(saved); } catch (e) {}

// ---------- language selects ----------
document.querySelectorAll('.lang-select').forEach(sel => {
  for (const code in LANGUAGES) sel.append(new Option(LANGUAGES[code], code));
});
$('#authLang').onchange = e => { setLang(e.target.value); setAuthMode(authMode); };
setLang(savedLang);
$('#authLang').value = currentLang;

function showError(target, code) { $(target).textContent = code ? t(code) : ''; }

// ---------- auth screen ----------
function setAuthMode(mode) {
  authMode = mode;
  $('#auth').classList.toggle('signup', mode === 'signup');
  document.querySelectorAll('#auth .tab').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  $('#authSubmit').textContent = t(mode);
  $('#authForm').password.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  showError('#authError');
}
document.querySelectorAll('#auth .tab').forEach(b => b.onclick = () => setAuthMode(b.dataset.mode));

$('#authForm').onsubmit = async e => {
  e.preventDefault();
  const f = e.target;
  const body = { username: f.username.value, password: f.password.value, displayName: f.displayName.value, lang: currentLang };
  const res = await fetch('/api/' + authMode, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (data.error) return showError('#authError', data.error);
  token = data.token;
  try { localStorage.setItem('token', token); } catch (e) {}
  f.reset();
  connect();
};

function showAuth() {
  $('#app').classList.add('hidden');
  $('#auth').classList.remove('hidden');
  setAuthMode(authMode);
}

$('#logout').onclick = async () => {
  const sub = await currentSub().catch(() => null);
  if (sub && socket) await emit('push:unsubscribe', { endpoint: sub.endpoint });
  await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  try { localStorage.removeItem('token'); } catch (e) {}
  token = null;
  if (socket) socket.disconnect();
  socket = null; currentRoom = null;
  state = { me: null, friends: [], requests: [], rooms: [], publicRooms: [] };
  showAuth();
};

// ---------- socket ----------
function connect() {
  if (socket) socket.disconnect();
  socket = io({ auth: { token } });
  socket.on('connect', () => socket.emit('visible', document.visibilityState === 'visible'));
  socket.on('connect_error', err => {
    if (err.message === 'unauthorized') {
      try { localStorage.removeItem('token'); } catch (e) {}
      token = null;
      socket.disconnect();
      showAuth();
    }
  });
  socket.on('state', s => {
    const first = !state.me;
    state = s;
    if (first || s.me.lang !== currentLang) setLang(s.me.lang);
    applyTextSize(s.me.textSize);
    $('#auth').classList.add('hidden');
    $('#app').classList.remove('hidden');
    if (currentRoom && !s.rooms.find(r => r.id === currentRoom)) closeRoom();
    renderAll();
    if (first) { syncPush(); updateBanners(); handleLink(pendingLink); pendingLink = null; }
  });
  socket.on('msg:new', ({ roomId, msg }) => {
    const room = state.rooms.find(r => r.id === roomId);
    if (room) room.last = msg;
    if (roomId === currentRoom) {
      messages.push(msg);
      renderMessages(true);
    } else if (msg.from !== state.me.username) {
      unread[roomId] = (unread[roomId] || 0) + 1;
    }
    renderRooms();
  });
  socket.on('msg:reactions', ({ roomId, msgId, reactions }) => {
    if (roomId !== currentRoom) return;
    const m = messages.find(x => x.id === msgId);
    if (m) { m.reactions = reactions; renderMessages(false); }
  });
  let typingTimer;
  socket.on('typing', ({ roomId, username }) => {
    if (roomId !== currentRoom) return;
    const u = findUser(username);
    $('#typing').textContent = (u ? u.displayName : username) + ' ' + t('typing');
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => { $('#typing').textContent = ''; }, 2500);
  });
}

const emit = (ev, data) => new Promise(res => socket.emit(ev, data, res));

// ---------- helpers ----------
function colorFor(str) {
  let h = 0;
  for (const c of str) h = (h * 31 + c.codePointAt(0)) % 360;
  return `hsl(${h} 60% 52%)`;
}
function avatar(user, size = '') {
  const a = el('span', 'avatar ' + size);
  if (user.avatar) a.style.backgroundImage = `url("${user.avatar}")`;
  else {
    a.style.backgroundColor = colorFor(user.username || user.name || '?');
    a.textContent = [...(user.displayName || user.name || '?')][0].toUpperCase();
  }
  if (user.online) a.classList.add('online');
  return a;
}
function findUser(username) {
  if (state.me && username === state.me.username) return state.me;
  for (const r of state.rooms) {
    const m = r.members.find(x => x.username === username);
    if (m) return m;
  }
  return state.friends.find(f => f.username === username);
}
function roomTitle(room) {
  if (room.type === 'dm') {
    const other = room.members.find(m => m.username !== state.me.username) || state.me;
    return { name: other.displayName, avatarUser: other };
  }
  return { name: room.name, avatarUser: { username: room.id, name: room.name } };
}
function previewText(msg) {
  if (!msg) return '';
  if (msg.system) return systemText(msg);
  const who = msg.from === state.me.username ? t('you') : (findUser(msg.from) || {}).displayName || msg.from;
  return who + ': ' + msg.text;
}
function systemText(msg) {
  const name = u => (findUser(u) || {}).displayName || u;
  return t('sys_' + msg.system, { a: name(msg.from), b: msg.target ? name(msg.target) : '' });
}
function timeStr(ts) {
  return new Date(ts).toLocaleTimeString(currentLang, { hour: '2-digit', minute: '2-digit' });
}

// ---------- sidebar ----------
function renderAll() {
  const me = state.me;
  $('#meAvatar').replaceWith(Object.assign(avatar(me), { id: 'meAvatar' }));
  $('#meName').textContent = me.displayName;
  $('#meUser').textContent = '@' + me.username;
  renderRooms();
  renderFriends();
  if (currentRoom) renderChatHead();
  if (currentRoom) renderMessages(false);
}

function renderRooms() {
  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);
  if (navigator.setAppBadge) (totalUnread ? navigator.setAppBadge(totalUnread) : navigator.clearAppBadge()).catch(() => {});
  const list = $('#roomList');
  list.innerHTML = '';
  const rooms = [...state.rooms].sort((a, b) => ((b.last && b.last.ts) || 0) - ((a.last && a.last.ts) || 0));
  for (const room of rooms) {
    const { name, avatarUser } = roomTitle(room);
    const li = el('li', 'clickable' + (room.id === currentRoom ? ' active' : ''));
    li.append(avatar(avatarUser));
    const info = el('div', 'info');
    info.append(el('b', '', (room.type === 'group' ? '👥 ' : '') + name), el('small', 'muted', previewText(room.last)));
    li.append(info);
    if (unread[room.id]) li.append(el('span', 'unread', unread[room.id]));
    li.onclick = () => openRoom(room.id);
    list.append(li);
  }
  $('#noChats').classList.toggle('hidden', rooms.length > 0);

  const pub = $('#publicList');
  pub.innerHTML = '';
  for (const r of state.publicRooms) {
    const li = el('li');
    li.append(avatar({ username: r.id, name: r.name }));
    const info = el('div', 'info');
    info.append(el('b', '', '👥 ' + r.name), el('small', 'muted', r.count + ' ' + t('members')));
    const btn = el('button', 'btn small primary', t('join'));
    btn.onclick = async () => { const res = await emit('group:join', { roomId: r.id }); if (res.roomId) openRoom(res.roomId); };
    li.append(info, btn);
    pub.append(li);
  }
  $('#discoverTitle').classList.toggle('hidden', state.publicRooms.length === 0);
}

function renderFriends() {
  const req = $('#requestList');
  req.innerHTML = '';
  for (const u of state.requests) {
    const li = el('li');
    const info = el('div', 'info');
    info.append(el('b', '', u.displayName), el('small', 'muted', '@' + u.username));
    const acts = el('div', 'actions');
    const ok = el('button', 'btn small primary', t('accept'));
    ok.onclick = () => emit('friend:accept', { username: u.username });
    const no = el('button', 'btn small', t('decline'));
    no.onclick = () => emit('friend:decline', { username: u.username });
    acts.append(ok, no);
    li.append(avatar(u), info, acts);
    req.append(li);
  }
  $('#reqTitle').classList.toggle('hidden', !state.requests.length);
  $('#reqBadge').textContent = state.requests.length;
  $('#reqBadge').classList.toggle('hidden', !state.requests.length);

  const list = $('#friendList');
  list.innerHTML = '';
  const friends = [...state.friends].sort((a, b) => (b.online - a.online) || a.displayName.localeCompare(b.displayName));
  for (const u of friends) {
    const li = el('li');
    const info = el('div', 'info');
    info.append(el('b', '', u.displayName), el('small', 'muted', '@' + u.username + ' · ' + t(u.online ? 'online' : 'offline')));
    const acts = el('div', 'actions');
    const msg = el('button', 'btn small primary', '💬');
    msg.title = t('message');
    msg.onclick = async () => { const r = await emit('dm:open', { username: u.username }); if (r.roomId) { switchSide('chats'); openRoom(r.roomId); } };
    const rm = el('button', 'btn small', '✕');
    rm.title = t('removeFriend');
    rm.onclick = async () => { if (await askConfirm(t('removeConfirm'))) emit('friend:remove', { username: u.username }); };
    acts.append(msg, rm);
    li.append(avatar(u), info, acts);
    list.append(li);
  }
  $('#noFriends').classList.toggle('hidden', friends.length > 0);
}

function switchSide(which) {
  document.querySelectorAll('.side-tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.side === which));
  $('#panel-chats').classList.toggle('hidden', which !== 'chats');
  $('#panel-friends').classList.toggle('hidden', which !== 'friends');
}
document.querySelectorAll('.side-tabs .tab').forEach(b => b.onclick = () => switchSide(b.dataset.side));

$('#addFriendForm').onsubmit = async e => {
  e.preventDefault();
  const input = $('#addFriendInput');
  const name = input.value.trim().replace(/^@/, '');
  if (!name) return;
  const res = await emit('friend:request', { username: name });
  const note = $('#friendNote');
  note.style.color = res.error ? 'var(--danger)' : '';
  note.textContent = res.error ? t(res.error) : t('requestSent');
  if (!res.error) input.value = '';
  setTimeout(() => { note.textContent = ''; }, 3000);
};

// ---------- chat ----------
async function openRoom(roomId) {
  currentRoom = roomId;
  unread[roomId] = 0;
  if (swReg) swReg.getNotifications({ tag: 'room-' + roomId }).then(ns => ns.forEach(n => n.close())).catch(() => {});
  $('#placeholder').classList.add('hidden');
  $('#chatInner').classList.remove('hidden');
  $('#app').classList.add('in-chat');
  $('#typing').textContent = '';
  messages = [];
  renderChatHead();
  renderRooms();
  const res = await emit('room:history', { roomId });
  if (currentRoom !== roomId) return;
  messages = res.messages || [];
  hasOlder = !!res.more;
  renderMessages(true);
  $('#msgInput').focus();
}
function closeRoom() {
  currentRoom = null;
  $('#placeholder').classList.remove('hidden');
  $('#chatInner').classList.add('hidden');
  $('#app').classList.remove('in-chat');
}
$('#backBtn').onclick = () => { closeRoom(); renderRooms(); };

function renderChatHead() {
  const room = state.rooms.find(r => r.id === currentRoom);
  if (!room) return;
  const { name, avatarUser } = roomTitle(room);
  $('#chatAvatar').replaceWith(Object.assign(avatar(avatarUser), { id: 'chatAvatar' }));
  $('#chatName').textContent = name;
  if (room.type === 'dm') {
    $('#chatSub').textContent = t(avatarUser.online ? 'online' : 'offline');
  } else {
    $('#chatSub').textContent = room.members.length + ' ' + t('members') + ' · ' + room.members.map(m => m.displayName).join(', ');
  }
  $('#addMemberBtn').classList.toggle('hidden', room.type !== 'group');
  $('#leaveBtn').classList.toggle('hidden', room.type !== 'group');
}

// only emoji (up to 3) -> show big
const isJumbo = s => {
  if (!/^(\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s)+$/u.test(s)) return false;
  const n = [...s].filter(c => /\p{Extended_Pictographic}/u.test(c)).length;
  return n >= 1 && n <= 3;
};

function renderMessages(scrollToEnd) {
  const box = $('#messages');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  box.innerHTML = '';
  if (hasOlder) {
    const more = el('button', 'btn small load-older', t('loadOlder'));
    more.onclick = loadOlder;
    box.append(more);
  }
  const room = state.rooms.find(r => r.id === currentRoom);
  let prev = null;
  for (const m of messages) {
    if (m.system) {
      box.append(el('div', 'system', systemText(m)));
      prev = null;
      continue;
    }
    const mine = m.from === state.me.username;
    const first = !prev || prev.from !== m.from || m.ts - prev.ts > 5 * 60 * 1000;
    const user = findUser(m.from) || { username: m.from, displayName: m.from };
    const row = el('div', 'msg' + (mine ? ' mine' : '') + (first ? ' first' : ''));
    row.append(avatar({ ...user, online: false }, 'sm'));
    const wrap = el('div', 'bubble-wrap');
    if (first && !mine && room && room.type === 'group') wrap.append(el('div', 'sender', user.displayName));
    wrap.append(el('div', 'bubble' + (isJumbo(m.text) ? ' jumbo' : ''), m.text));
    const reacts = Object.entries(m.reactions || {});
    if (reacts.length) {
      const rbox = el('div', 'reactions');
      for (const [emo, who] of reacts) {
        const b = el('button', 'reaction' + (who.includes(state.me.username) ? ' me' : ''), emo + ' ' + who.length);
        b.title = who.map(w => (findUser(w) || {}).displayName || w).join(', ');
        b.onclick = () => socket.emit('msg:react', { roomId: currentRoom, msgId: m.id, emoji: emo });
        rbox.append(b);
      }
      wrap.append(rbox);
    }
    wrap.append(el('div', 'time', timeStr(m.ts)));
    const rb = el('button', 'react-btn', '☺');
    rb.onclick = e => { e.stopPropagation(); showReactBar(row, m); };
    row.append(wrap, rb);
    box.append(row);
    prev = m;
  }
  if (scrollToEnd || atBottom) box.scrollTop = box.scrollHeight;
}

async function loadOlder() {
  if (!messages.length) return;
  const roomId = currentRoom, box = $('#messages');
  const res = await emit('room:history', { roomId, before: messages[0].ts });
  if (roomId !== currentRoom) return;
  hasOlder = !!res.more;
  // keep the view where it was while adding messages above it
  const fromBottom = box.scrollHeight - box.scrollTop;
  messages = [...(res.messages || []), ...messages];
  renderMessages(false);
  box.scrollTop = box.scrollHeight - fromBottom;
}

function showReactBar(row, m) {
  document.querySelectorAll('.react-bar').forEach(b => b.remove());
  const bar = el('div', 'react-bar');
  for (const emo of QUICK_REACTIONS) {
    const b = el('button', '', emo);
    b.onclick = () => { socket.emit('msg:react', { roomId: currentRoom, msgId: m.id, emoji: emo }); bar.remove(); };
    bar.append(b);
  }
  row.append(bar);
}
document.addEventListener('click', e => {
  if (!e.target.closest('.react-bar')) document.querySelectorAll('.react-bar').forEach(b => b.remove());
  if (!e.target.closest('#emojiPicker') && !e.target.closest('#emojiBtn')) $('#emojiPicker').classList.add('hidden');
});

// composer
const input = $('#msgInput');
let lastTyping = 0;
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = input.scrollHeight + 'px';
  if (Date.now() - lastTyping > 1500) { lastTyping = Date.now(); socket.emit('typing', { roomId: currentRoom }); }
});
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#composer').requestSubmit(); }
});
$('#composer').onsubmit = e => {
  e.preventDefault();
  const text = emojify(input.value.trim());
  if (!text || !currentRoom) return;
  socket.emit('msg:send', { roomId: currentRoom, text });
  input.value = '';
  input.style.height = 'auto';
  $('#emojiPicker').classList.add('hidden');
};

// emoji picker
const catIcons = { smileys: '😀', people: '👋', animals: '🐶', food: '🍔', activity: '⚽', travel: '✈️', objects: '💡', symbols: '❤️' };
function showEmojiCat(cat) {
  document.querySelectorAll('#emojiCats button').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
  const grid = $('#emojiGrid');
  grid.innerHTML = '';
  for (const emo of EMOJI[cat]) {
    const b = el('button', '', emo);
    b.type = 'button';
    b.onclick = () => insertAtCursor(emo);
    grid.append(b);
  }
  grid.scrollTop = 0;
}
for (const cat in EMOJI) {
  const b = el('button', '', catIcons[cat]);
  b.type = 'button';
  b.dataset.cat = cat;
  b.dataset.i18nTitle = 'cat_' + cat;
  b.title = t('cat_' + cat);
  b.onclick = () => showEmojiCat(cat);
  $('#emojiCats').append(b);
}
showEmojiCat('smileys');
$('#emojiBtn').onclick = () => $('#emojiPicker').classList.toggle('hidden');
function insertAtCursor(text) {
  const s = input.selectionStart ?? input.value.length, e = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, s) + text + input.value.slice(e);
  input.selectionStart = input.selectionEnd = s + text.length;
  input.focus();
}

// ---------- modals ----------
function openModal(id) { $(id).classList.remove('hidden'); }
document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m || e.target.hasAttribute('data-close')) m.classList.add('hidden'); });
});

// in-page yes/no box (browser confirm() is blocked in some embeds)
function askConfirm(text) {
  return new Promise(resolve => {
    $('#confirmText').textContent = text;
    openModal('#confirmModal');
    const done = ok => { $('#confirmModal').classList.add('hidden'); $('#confirmOk').onclick = $('#confirmCancel').onclick = null; resolve(ok); };
    $('#confirmOk').onclick = () => done(true);
    $('#confirmCancel').onclick = () => done(false);
  });
}

// profile
$('#openProfile').onclick = () => {
  pendingAvatar = undefined;
  $('#profileAvatar').replaceWith(Object.assign(avatar(state.me, 'xl'), { id: 'profileAvatar' }));
  $('#profileName').value = state.me.displayName;
  $('#profileLang').value = currentLang;
  $('#profileTextSize').value = String(state.me.textSize);
  showError('#profileError');
  openModal('#profileModal');
};
$('#avatarFile').onchange = e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    // crop to a square and shrink to 160x160 so it stays small
    const size = 160, c = document.createElement('canvas');
    c.width = c.height = size;
    const s = Math.min(img.width, img.height);
    c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    pendingAvatar = c.toDataURL('image/jpeg', 0.85);
    URL.revokeObjectURL(img.src);
    $('#profileAvatar').replaceWith(Object.assign(avatar({ ...state.me, avatar: pendingAvatar, online: false }, 'xl'), { id: 'profileAvatar' }));
  };
  img.onerror = () => showError('#profileError', 'badImage');
  img.src = URL.createObjectURL(file);
};
$('#removeAvatar').onclick = () => {
  pendingAvatar = null;
  $('#profileAvatar').replaceWith(Object.assign(avatar({ ...state.me, avatar: null, online: false }, 'xl'), { id: 'profileAvatar' }));
};
$('#saveProfile').onclick = async () => {
  const data = { displayName: $('#profileName').value, lang: $('#profileLang').value, textSize: Number($('#profileTextSize').value) };
  if (pendingAvatar !== undefined) data.avatar = pendingAvatar;
  const res = await emit('profile:update', data);
  if (res.error) return showError('#profileError', res.error);
  $('#profileModal').classList.add('hidden');
};

// new group
$('#newGroupBtn').onclick = () => {
  $('#groupName').value = '';
  $('#groupPublic').checked = false;
  showError('#groupError');
  const list = $('#groupFriends');
  list.innerHTML = '';
  for (const f of state.friends) {
    const li = el('li');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.value = f.username;
    const info = el('div', 'info');
    info.append(el('b', '', f.displayName), el('small', 'muted', '@' + f.username));
    li.append(cb, avatar(f, 'sm'), info);
    li.onclick = e => { if (e.target !== cb) cb.checked = !cb.checked; };
    list.append(li);
  }
  if (!state.friends.length) list.append(el('p', 'muted empty', t('noFriends')));
  openModal('#groupModal');
  $('#groupName').focus();
};
$('#createGroup').onclick = async () => {
  const members = [...document.querySelectorAll('#groupFriends input:checked')].map(c => c.value);
  const res = await emit('group:create', { name: $('#groupName').value, members, isPublic: $('#groupPublic').checked });
  if (res.error) return showError('#groupError', res.error);
  $('#groupModal').classList.add('hidden');
  switchSide('chats');
  openRoom(res.roomId);
};

// add member
$('#addMemberBtn').onclick = () => {
  const room = state.rooms.find(r => r.id === currentRoom);
  const list = $('#addMemberList');
  list.innerHTML = '';
  const candidates = state.friends.filter(f => !room.members.some(m => m.username === f.username));
  for (const f of candidates) {
    const li = el('li');
    const info = el('div', 'info');
    info.append(el('b', '', f.displayName), el('small', 'muted', '@' + f.username));
    const btn = el('button', 'btn small primary', '＋');
    btn.onclick = async () => { await emit('group:add', { roomId: currentRoom, username: f.username }); li.remove(); };
    li.append(avatar(f, 'sm'), info, btn);
    list.append(li);
  }
  if (!candidates.length) list.append(el('p', 'muted empty', t(state.friends.length ? 'nobodyToAdd' : 'noFriends')));
  openModal('#addMemberModal');
};

$('#leaveBtn').onclick = async () => {
  if (!(await askConfirm(t('leaveConfirm')))) return;
  const id = currentRoom;
  closeRoom();
  await emit('group:leave', { roomId: id });
};

// ---------- installable app + notifications ----------
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInstalled = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
let swReg = null, installEvent = null, pushOn = false;
let pendingLink = new URL(location.href);   // ?room=… or ?tab=friends from a notification

const isDismissed = k => { try { return localStorage.getItem('dismiss-' + k) === '1'; } catch (e) { return false; } };
document.querySelectorAll('[data-dismiss]').forEach(b => b.onclick = () => {
  try { localStorage.setItem('dismiss-' + b.dataset.dismiss, '1'); } catch (e) {}
  updateBanners();
});

let toastTimer;
function toast(text) {
  $('#toast').textContent = text;
  $('#toast').classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.add('hidden'), 4000);
}

function updateBanners() {
  const loggedIn = !!state.me;
  $('#installBanner').classList.toggle('hidden', !(loggedIn && installEvent && !isDismissed('install')));
  $('#iosBanner').classList.toggle('hidden', !(loggedIn && isIOS && !isInstalled && !isDismissed('ios')));
  // on iPhone/iPad notifications only work once Chatly is on the Home Screen, so show the install steps first
  const iosNotInstalled = isIOS && !isInstalled;
  $('#notifBanner').classList.toggle('hidden', !(loggedIn && !iosNotInstalled && pushSupported && Notification.permission === 'default' && !isDismissed('notif')));
  $('#notifBtn').textContent = pushOn ? '🔔' : '🔕';
  $('#notifBtn').title = t(pushOn ? 'notifOn' : 'notifOff');
}

function handleLink(url) {
  if (!url || !state.me) return;
  const room = url.searchParams.get('room');
  if (room && state.rooms.some(r => r.id === room)) { switchSide('chats'); openRoom(room); }
  if (url.searchParams.get('tab') === 'friends') switchSide('friends');
  if (location.search) history.replaceState(null, '', '/');
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(reg => { swReg = reg; syncPush(); }).catch(() => {});
  // a notification was tapped while the app was already open
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.type === 'open') handleLink(new URL(e.data.url, location.origin));
  });
}
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; updateBanners(); });
addEventListener('appinstalled', () => { installEvent = null; updateBanners(); });
$('#installBtn').onclick = async () => {
  if (!installEvent) return;
  installEvent.prompt();
  await installEvent.userChoice.catch(() => {});
  installEvent = null;
  updateBanners();
};

document.addEventListener('visibilitychange', () => {
  if (socket) socket.emit('visible', document.visibilityState === 'visible');
});

const keyBytes = b64 => {
  const raw = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};
const sameKey = (a, b) => a && b && a.byteLength === b.byteLength && new Uint8Array(a).every((x, i) => x === b[i]);

async function currentSub() {
  return swReg ? swReg.pushManager.getSubscription() : null;
}

// make sure this device is subscribed and the server knows it belongs to the logged-in user
async function syncPush() {
  pushOn = false;
  try {
    if (!socket || !state.me || !swReg || !pushSupported || Notification.permission !== 'granted') return;
    const { key } = await emit('push:key');
    let sub = await currentSub();
    if (sub && !sameKey(sub.options.applicationServerKey, keyBytes(key))) { await sub.unsubscribe(); sub = null; }
    if (!sub) sub = await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    const res = await emit('push:subscribe', { subscription: sub.toJSON() });
    pushOn = !!res.ok;
  } catch (e) {
    console.warn('Notifications not available:', e);
  } finally {
    updateBanners();
  }
}

async function turnOnNotifications() {
  if (isIOS && !isInstalled) return toast(t('iosNeedsInstall'));
  if (!pushSupported) return toast(t('notifUnsupported'));
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') { updateBanners(); return toast(t('notifBlocked')); }
  if (!swReg) swReg = await navigator.serviceWorker.ready;
  await syncPush();
  toast(t(pushOn ? 'notifTurnedOn' : 'notifUnsupported'));
}

async function turnOffNotifications() {
  const sub = await currentSub().catch(() => null);
  if (sub) {
    await emit('push:unsubscribe', { endpoint: sub.endpoint });
    await sub.unsubscribe().catch(() => {});
  }
  pushOn = false;
  updateBanners();
  toast(t('notifOff'));
}

$('#notifTurnOn').onclick = turnOnNotifications;
$('#notifBtn').onclick = async () => {
  if (!pushOn) return turnOnNotifications();
  if (await askConfirm(t('notifOffConfirm'))) turnOffNotifications();
};

// ---------- start ----------
if (token) connect(); else showAuth();
