// Saves the chat data so it survives server restarts.
// - DATABASE_URL set  -> PostgreSQL (use this on Render; e.g. a free Neon database)
// - otherwise         -> a JSON file in ./data (fine for running on your own computer)
//
// The server keeps everything in memory and calls save() after changes.
// The Postgres backend works out what changed since the last save and only writes that.
const fs = require('fs');
const path = require('path');

const KEEP_IN_MEMORY = 500; // newest messages per chat loaded at startup

function fileStore() {
  const file = path.join(__dirname, 'data', 'db.json');
  let timer = null, db;
  return {
    async load() {
      db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { users: {}, sessions: {}, rooms: {} };
      return db;
    },
    save() {
      clearTimeout(timer);
      timer = setTimeout(() => this.flush(), 300);
    },
    async flush() {
      clearTimeout(timer);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(db));
    },
  };
}

function pgStore(url) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url, max: 4 });
  let db, timer = null, running = null, again = false;
  // last saved JSON for each row, so we only write what changed
  const saved = { users: new Map(), sessions: new Map(), rooms: new Map(), messages: new Map() };

  const roomMeta = r => { const { messages, ...meta } = r; return meta; };

  async function flushOnce() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // users
      for (const [name, u] of Object.entries(db.users)) {
        const json = JSON.stringify(u);
        if (saved.users.get(name) === json) continue;
        await client.query('INSERT INTO users (username, data) VALUES ($1, $2) ON CONFLICT (username) DO UPDATE SET data = EXCLUDED.data', [name, json]);
        saved.users.set(name, json);
      }
      // sessions (logins)
      for (const [token, name] of Object.entries(db.sessions)) {
        if (saved.sessions.get(token) === name) continue;
        await client.query('INSERT INTO sessions (token, username) VALUES ($1, $2) ON CONFLICT (token) DO UPDATE SET username = EXCLUDED.username', [token, name]);
        saved.sessions.set(token, name);
      }
      for (const token of [...saved.sessions.keys()]) {
        if (!(token in db.sessions)) { await client.query('DELETE FROM sessions WHERE token = $1', [token]); saved.sessions.delete(token); }
      }
      // rooms + their messages
      for (const [id, r] of Object.entries(db.rooms)) {
        const json = JSON.stringify(roomMeta(r));
        if (saved.rooms.get(id) !== json) {
          await client.query('INSERT INTO rooms (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data', [id, json]);
          saved.rooms.set(id, json);
        }
        for (const m of r.messages) {
          const mj = JSON.stringify(m);
          if (saved.messages.get(m.id) === mj) continue;
          await client.query(
            'INSERT INTO messages (id, room_id, ts, data) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
            [m.id, id, m.ts, mj]);
          saved.messages.set(m.id, mj);
        }
      }
      for (const id of [...saved.rooms.keys()]) {
        if (!(id in db.rooms)) {
          await client.query('DELETE FROM messages WHERE room_id = $1', [id]);
          await client.query('DELETE FROM rooms WHERE id = $1', [id]);
          saved.rooms.delete(id);
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  return {
    async load() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, data JSONB NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, username TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, data JSONB NOT NULL);
        CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, ts BIGINT NOT NULL, data JSONB NOT NULL);
        CREATE INDEX IF NOT EXISTS messages_room_ts ON messages (room_id, ts);
      `);
      db = { users: {}, sessions: {}, rooms: {} };
      for (const row of (await pool.query('SELECT username, data FROM users')).rows) {
        db.users[row.username] = row.data;
        saved.users.set(row.username, JSON.stringify(row.data));
      }
      for (const row of (await pool.query('SELECT token, username FROM sessions')).rows) {
        db.sessions[row.token] = row.username;
        saved.sessions.set(row.token, row.username);
      }
      for (const row of (await pool.query('SELECT id, data FROM rooms')).rows) {
        db.rooms[row.id] = { ...row.data, messages: [] };
        saved.rooms.set(row.id, JSON.stringify(row.data));
      }
      const msgs = await pool.query(`
        SELECT room_id, data FROM (
          SELECT room_id, ts, data, ROW_NUMBER() OVER (PARTITION BY room_id ORDER BY ts DESC) AS n FROM messages
        ) t WHERE n <= $1 ORDER BY ts`, [KEEP_IN_MEMORY]);
      for (const row of msgs.rows) {
        const room = db.rooms[row.room_id];
        if (!room) continue;
        room.messages.push(row.data);
        saved.messages.set(row.data.id, JSON.stringify(row.data));
      }
      return db;
    },
    save() {
      clearTimeout(timer);
      timer = setTimeout(() => this.flush().catch(e => console.error('Database save failed:', e.message)), 300);
    },
    // one flush at a time; changes made during a flush are picked up by a follow-up flush
    async flush() {
      clearTimeout(timer);
      if (running) { again = true; return running; }
      running = (async () => {
        try {
          do { again = false; await flushOnce(); } while (again);
        } finally {
          running = null;
        }
      })();
      return running;
    },
    // messages older than the ones kept in memory
    async olderMessages(roomId, beforeTs, limit) {
      const res = await pool.query(
        'SELECT data FROM messages WHERE room_id = $1 AND ts < $2 ORDER BY ts DESC LIMIT $3', [roomId, beforeTs, limit]);
      return res.rows.map(r => r.data).reverse();
    },
  };
}

module.exports = process.env.DATABASE_URL ? pgStore(process.env.DATABASE_URL) : fileStore();
module.exports.KEEP_IN_MEMORY = KEEP_IN_MEMORY;
