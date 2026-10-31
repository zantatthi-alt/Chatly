// Phone / computer notifications (Web Push).
// The keys that sign notifications are created once and kept in the saved data,
// so devices stay subscribed across restarts. Nothing to configure.
const webpush = require('web-push');

const FRIEND_REQUEST = {
  en: '{a} sent you a friend request', es: '{a} te envió una solicitud de amistad',
  fr: "{a} vous a envoyé une demande d'ami", ja: '{a}から友だちリクエストが届きました',
  th: '{a} ส่งคำขอเป็นเพื่อนถึงคุณ', zh: '{a} 向你发送了好友请求',
};
const MAX_BODY = 300; // characters of a message shown in a notification

module.exports = function setupPush(db, save) {
  if (!db.settings.vapid) {
    db.settings.vapid = webpush.generateVAPIDKeys();
    save();
  }
  // Apple and Google want a contact URL for the sender of notifications
  const contact = process.env.RENDER_EXTERNAL_URL || 'https://github.com/zantatthi-alt/chatly';
  webpush.setVapidDetails(contact, db.settings.vapid.publicKey, db.settings.vapid.privateKey);

  // username -> ids of sockets where the app is on screen right now
  const looking = new Map();

  function setVisible(username, socketId, visible) {
    const set = looking.get(username) || new Set();
    if (visible) set.add(socketId); else set.delete(socketId);
    if (set.size) looking.set(username, set); else looking.delete(username);
  }

  function subscribe(username, sub) {
    if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return false;
    const clean = { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } };
    // a device belongs to whoever logged in on it last
    for (const u of Object.values(db.users)) {
      if (u.push) u.push = u.push.filter(s => s.endpoint !== clean.endpoint);
    }
    const u = db.users[username];
    u.push = [...(u.push || []), clean].slice(-10);
    save();
    return true;
  }

  function unsubscribe(username, endpoint) {
    const u = db.users[username];
    if (u && u.push) { u.push = u.push.filter(s => s.endpoint !== endpoint); save(); }
  }

  function send(username, payload) {
    const u = db.users[username];
    if (!u || !u.push || !u.push.length || looking.has(username)) return;
    const body = JSON.stringify(payload);
    for (const sub of u.push) {
      webpush.sendNotification(sub, body, { TTL: 24 * 3600, urgency: 'high' }).catch(err => {
        // 404/410: the device unsubscribed or the app was removed
        if (err.statusCode === 404 || err.statusCode === 410) unsubscribe(username, sub.endpoint);
        else console.error('Notification failed:', err.statusCode || '', err.body || err.message);
      });
    }
  }

  function notifyMessage(room, msg) {
    if (msg.system) return;
    const sender = db.users[msg.from];
    const name = sender ? sender.displayName : msg.from;
    const text = msg.text.length > MAX_BODY ? msg.text.slice(0, MAX_BODY) + '…' : msg.text;
    for (const member of room.members) {
      if (member === msg.from) continue;
      send(member, {
        title: room.type === 'dm' ? name : `${name} · ${room.name}`,
        body: text, tag: 'room-' + room.id, url: '/?room=' + room.id,
      });
    }
  }

  function notifyFriendRequest(to, from) {
    const u = db.users[to], f = db.users[from];
    if (!u || !f) return;
    const text = (FRIEND_REQUEST[u.lang] || FRIEND_REQUEST.en).replace('{a}', f.displayName);
    send(to, { title: 'Chatly', body: text, tag: 'friends', url: '/?tab=friends' });
  }

  return { publicKey: db.settings.vapid.publicKey, setVisible, subscribe, unsubscribe, notifyMessage, notifyFriendRequest };
};
