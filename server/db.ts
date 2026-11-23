import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { ChatMessage, TrackItem } from '../shared/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'tearoom.sqlite');
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for high concurrency and performance
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS queue_tracks (
    id TEXT PRIMARY KEY,
    videoId TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    thumbnail TEXT NOT NULL,
    duration INTEGER NOT NULL,
    durationText TEXT NOT NULL,
    requestedBy TEXT NOT NULL,
    requestedByClientId TEXT NOT NULL,
    requestedByAvatar TEXT NOT NULL,
    dedicationMessage TEXT,
    createdAt INTEGER NOT NULL,
    sortOrder INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS history_tracks (
    id TEXT PRIMARY KEY,
    videoId TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    thumbnail TEXT NOT NULL,
    duration INTEGER NOT NULL,
    durationText TEXT NOT NULL,
    requestedBy TEXT NOT NULL,
    requestedByClientId TEXT NOT NULL,
    requestedByAvatar TEXT NOT NULL,
    dedicationMessage TEXT,
    playedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    clientId TEXT NOT NULL,
    nickname TEXT NOT NULL,
    avatar TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS room_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

export const dbService = {
  getQueue(): TrackItem[] {
    const stmt = db.prepare('SELECT * FROM queue_tracks ORDER BY sortOrder ASC, createdAt ASC');
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      videoId: String(r.videoId),
      title: String(r.title),
      author: String(r.author),
      thumbnail: String(r.thumbnail),
      duration: Number(r.duration),
      durationText: String(r.durationText),
      requestedBy: String(r.requestedBy),
      requestedByClientId: String(r.requestedByClientId),
      requestedByAvatar: String(r.requestedByAvatar),
      dedicationMessage: r.dedicationMessage ? String(r.dedicationMessage) : undefined,
      createdAt: Number(r.createdAt),
      priorityVotes: [],
    }));
  },

  addTrackToQueue(track: TrackItem): void {
    const maxOrderRow = db.prepare('SELECT COALESCE(MAX(sortOrder), 0) as maxOrder FROM queue_tracks').get() as { maxOrder: number };
    const nextOrder = (maxOrderRow?.maxOrder ?? 0) + 1;

    const stmt = db.prepare(`
      INSERT INTO queue_tracks (
        id, videoId, title, author, thumbnail, duration, durationText,
        requestedBy, requestedByClientId, requestedByAvatar, dedicationMessage, createdAt, sortOrder
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      track.id,
      track.videoId,
      track.title,
      track.author,
      track.thumbnail,
      track.duration,
      track.durationText,
      track.requestedBy,
      track.requestedByClientId,
      track.requestedByAvatar,
      track.dedicationMessage ?? null,
      track.createdAt,
      nextOrder
    );
  },

  moveTrackToTopOfQueue(id: string): void {
    const minOrderRow = db.prepare('SELECT COALESCE(MIN(sortOrder), 0) as minOrder FROM queue_tracks').get() as { minOrder: number };
    const topOrder = (minOrderRow?.minOrder ?? 0) - 1;
    db.prepare('UPDATE queue_tracks SET sortOrder = ? WHERE id = ?').run(topOrder, id);
  },

  removeTrackFromQueue(id: string): void {
    db.prepare('DELETE FROM queue_tracks WHERE id = ?').run(id);
  },

  clearQueue(): void {
    db.prepare('DELETE FROM queue_tracks').run();
  },

  addTrackToHistory(track: TrackItem): void {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO history_tracks (
        id, videoId, title, author, thumbnail, duration, durationText,
        requestedBy, requestedByClientId, requestedByAvatar, dedicationMessage, playedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      track.id,
      track.videoId,
      track.title,
      track.author,
      track.thumbnail,
      track.duration,
      track.durationText,
      track.requestedBy,
      track.requestedByClientId,
      track.requestedByAvatar,
      track.dedicationMessage ?? null,
      Date.now()
    );

    // Keep last 40 history items
    db.prepare(`
      DELETE FROM history_tracks WHERE id NOT IN (
        SELECT id FROM history_tracks ORDER BY playedAt DESC LIMIT 40
      )
    `).run();
  },

  getHistory(): TrackItem[] {
    const stmt = db.prepare('SELECT * FROM history_tracks ORDER BY playedAt DESC LIMIT 30');
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map((r) => ({
      id: String(r.id),
      videoId: String(r.videoId),
      title: String(r.title),
      author: String(r.author),
      thumbnail: String(r.thumbnail),
      duration: Number(r.duration),
      durationText: String(r.durationText),
      requestedBy: String(r.requestedBy),
      requestedByClientId: String(r.requestedByClientId),
      requestedByAvatar: String(r.requestedByAvatar),
      dedicationMessage: r.dedicationMessage ? String(r.dedicationMessage) : undefined,
      createdAt: Number(r.playedAt),
      priorityVotes: [],
    }));
  },

  addChatMessage(msg: ChatMessage): void {
    const stmt = db.prepare(`
      INSERT INTO chat_messages (id, clientId, nickname, avatar, content, type, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(msg.id, msg.clientId, msg.nickname, msg.avatar, msg.content, msg.type, msg.createdAt);

    // Keep last 100 chat messages
    db.prepare(`
      DELETE FROM chat_messages WHERE id NOT IN (
        SELECT id FROM chat_messages ORDER BY createdAt DESC LIMIT 100
      )
    `).run();
  },

  getRecentMessages(): ChatMessage[] {
    const stmt = db.prepare('SELECT * FROM chat_messages ORDER BY createdAt DESC LIMIT 80');
    const rows = stmt.all() as Record<string, unknown>[];
    return rows
      .map((r) => ({
        id: String(r.id),
        clientId: String(r.clientId),
        nickname: String(r.nickname),
        avatar: String(r.avatar),
        content: String(r.content),
        type: (r.type as ChatMessage['type']) || 'user',
        createdAt: Number(r.createdAt),
      }))
      .reverse();
  },

  getMeta(key: string): string | null {
    const row = db.prepare('SELECT value FROM room_meta WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? row.value : null;
  },

  setMeta(key: string, value: string): void {
    db.prepare('INSERT OR REPLACE INTO room_meta (key, value) VALUES (?, ?)').run(key, value);
  },
};
