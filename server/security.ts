import { z } from 'zod';

/**
 * Strips dangerous HTML/script characters & control chars (preserving newlines \n for multi-line chat)
 */
export function sanitizeText(input: string, maxLength = 250): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/[<>]/g, '') // Remove HTML angle brackets to prevent XSS
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '') // Remove control chars except \n (\u000A)
    .trim()
    .slice(0, maxLength);
}

/**
 * Validates YouTube 11-character Video ID
 */
export const youtubeIdRegex = /^[a-zA-Z0-9_-]{11}$/;

export function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (youtubeIdRegex.test(trimmed)) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtube.com')) {
      const v = url.searchParams.get('v');
      if (v && youtubeIdRegex.test(v)) return v;
      const parts = url.pathname.split('/').filter(Boolean);
      if ((parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') && parts[1] && youtubeIdRegex.test(parts[1])) {
        return parts[1];
      }
    }
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0];
      if (id && youtubeIdRegex.test(id)) return id;
    }
  } catch {
    // Not a URL
  }
  return null;
}

export const JoinProfileSchema = z.object({
  clientId: z.string().min(6).max(64),
  nickname: z.string().min(1).max(32),
  avatar: z.string().min(1).max(16),
});

/**
 * Allow-listed safe image hosts for GIFs / Thumbnails to prevent SSRF / tracking pixel / malicious image URL injection
 */
const ALLOWED_IMAGE_HOSTS = new Set([
  'i.ytimg.com',
  'img.youtube.com',
  'i9.ytimg.com',
  'media.giphy.com',
  'media0.giphy.com',
  'media1.giphy.com',
  'media2.giphy.com',
  'media3.giphy.com',
  'media4.giphy.com',
]);

export function isAllowedMediaUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' && ALLOWED_IMAGE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export const AddTrackSchema = z.object({
  videoId: z.string().regex(youtubeIdRegex, 'Video ID không hợp lệ'),
  title: z.string().min(1).max(160),
  author: z.string().min(1).max(100),
  thumbnail: z
    .string()
    .url()
    .max(350)
    .refine(isAllowedMediaUrl, 'Nguồn ảnh thumbnail không nằm trong danh sách an toàn'),
  duration: z.number().min(0).max(36000),
  durationText: z.string().min(1).max(20),
  dedicationMessage: z.string().max(140).optional(),
});

export function isAllowedEphemeralImageDataUrl(raw: string): boolean {
  if (typeof raw !== 'string') return false;
  if (raw.length > 420_000) return false; // Max ~300KB binary compressed image
  return /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(raw);
}

export const ChatMessageSchema = z
  .object({
    content: z.string().max(280).optional().default(''),
    stickerUrl: z
      .string()
      .url()
      .max(350)
      .refine(isAllowedMediaUrl, 'Nguồn GIF/Sticker không hợp lệ')
      .optional(),
    stickerLabel: z.string().max(60).optional(),
    imageDataUrl: z
      .string()
      .max(420_000)
      .refine(isAllowedEphemeralImageDataUrl, 'Ảnh không hợp lệ hoặc vượt quá dung lượng cho phép')
      .optional(),
    replyTo: z
      .object({
        id: z.string().min(1).max(64),
        nickname: z.string().min(1).max(36),
        avatar: z.string().min(1).max(16),
        content: z.string().min(1).max(280),
      })
      .optional(),
  })
  .refine(
    (data) =>
      Boolean((data.content && data.content.trim().length > 0) || data.stickerUrl || data.imageDataUrl),
    {
      message: 'Tin nhắn, hình ảnh hoặc sticker không được để trống',
    }
  );

export const ChatReactSchema = z.object({
  messageId: z.string().min(1).max(64),
  emoji: z.string().min(1).max(12),
});

export const ChatSeenSchema = z.object({
  messageId: z.string().min(1).max(64),
});

export const ReactionSchema = z.object({
  emoji: z.string().min(1).max(12),
  label: z.string().min(1).max(24),
});

export const SeekSchema = z.object({
  position: z.number().min(0).max(36000),
});

/**
 * Sliding-window Rate Limiter with Temporary Penalty Mute
 */
interface Bucket {
  timestamps: number[];
  mutedUntil: number;
  violations: number;
}

export class SocketRateLimiter {
  private buckets = new Map<string, Bucket>();
  private maxActions: number;
  private windowMs: number;
  private muteDurationMs: number;

  constructor(maxActions: number, windowMs: number, muteDurationMs = 15000) {
    this.maxActions = maxActions;
    this.windowMs = windowMs;
    this.muteDurationMs = muteDurationMs;
  }

  public check(key: string): { allowed: boolean; retryAfterSec?: number; warning?: string } {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [], mutedUntil: 0, violations: 0 };
      this.buckets.set(key, bucket);
    }

    if (now < bucket.mutedUntil) {
      const retryAfterSec = Math.ceil((bucket.mutedUntil - now) / 1000);
      return {
        allowed: false,
        retryAfterSec,
        warning: `Bạn thao tác quá nhanh. Vui lòng thưởng trà đợi ${retryAfterSec} giây nhé!`,
      };
    }

    bucket.timestamps = bucket.timestamps.filter((t) => now - t < this.windowMs);

    if (bucket.timestamps.length >= this.maxActions) {
      bucket.violations += 1;
      if (bucket.violations >= 2 && this.muteDurationMs > 0) {
        bucket.mutedUntil = now + this.muteDurationMs;
        const retryAfterSec = Math.ceil(this.muteDurationMs / 1000);
        return {
          allowed: false,
          retryAfterSec,
          warning: `Phát hiện spam liên tục! Tạm khóa thao tác này trong ${retryAfterSec} giây.`,
        };
      }
      return {
        allowed: false,
        retryAfterSec: Math.ceil(this.windowMs / 1000),
        warning: 'Thao tác hơi nhanh rồi, bạn chậm lại một chút cho đúng chất phòng trà nhé!',
      };
    }

    bucket.timestamps.push(now);
    return { allowed: true };
  }

  public cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets.entries()) {
      if (now > bucket.mutedUntil && bucket.timestamps.every((t) => now - t > this.windowMs * 2)) {
        this.buckets.delete(key);
      }
    }
  }
}

/**
 * IP Shield & Auto-Ban Guard against WebSocket Floods / DDoS / Brute-force Bots
 */
export class IpAttackShield {
  private strikes = new Map<string, { count: number; lastAt: number }>();
  private bannedUntil = new Map<string, number>();
  private connectionRate = new Map<string, number[]>();

  public isBanned(ip: string): { banned: boolean; remainingSec: number } {
    const until = this.bannedUntil.get(ip);
    if (!until) return { banned: false, remainingSec: 0 };
    const now = Date.now();
    if (now >= until) {
      this.bannedUntil.delete(ip);
      return { banned: false, remainingSec: 0 };
    }
    return { banned: true, remainingSec: Math.ceil((until - now) / 1000) };
  }

  /**
   * Checks if an IP is opening sockets too rapidly (e.g., > 25 connections in 30s)
   */
  public recordConnectionAttempt(ip: string): boolean {
    const now = Date.now();
    const list = (this.connectionRate.get(ip) || []).filter((t) => now - t < 30_000);
    list.push(now);
    this.connectionRate.set(ip, list);

    if (list.length > 25) {
      this.ban(ip, 5 * 60 * 1000); // Auto-ban 5 minutes for connection flood
      return false;
    }
    return true;
  }

  /**
   * Adds a strike for malicious payloads or severe event flooding; auto-bans after 8 strikes
   */
  public addStrike(ip: string, weight = 1): boolean {
    const now = Date.now();
    const entry = this.strikes.get(ip) || { count: 0, lastAt: now };
    if (now - entry.lastAt > 60_000) {
      entry.count = 0;
    }
    entry.count += weight;
    entry.lastAt = now;
    this.strikes.set(ip, entry);

    if (entry.count >= 8) {
      this.ban(ip, 5 * 60 * 1000);
      this.strikes.delete(ip);
      return true;
    }
    return false;
  }

  public ban(ip: string, durationMs = 5 * 60 * 1000): void {
    this.bannedUntil.set(ip, Date.now() + durationMs);
  }

  public cleanup(): void {
    const now = Date.now();
    for (const [ip, until] of this.bannedUntil.entries()) {
      if (now >= until) this.bannedUntil.delete(ip);
    }
    for (const [ip, entry] of this.strikes.entries()) {
      if (now - entry.lastAt > 120_000) this.strikes.delete(ip);
    }
    for (const [ip, list] of this.connectionRate.entries()) {
      const fresh = list.filter((t) => now - t < 30_000);
      if (fresh.length === 0) this.connectionRate.delete(ip);
      else this.connectionRate.set(ip, fresh);
    }
  }
}

/**
 * Bounded LRU Map helper to prevent unbounded RAM exhaustion (OOM DoS)
 */
export function setBoundedMap<K, V>(map: Map<K, V>, key: K, value: V, maxEntries: number): void {
  if (map.has(key)) {
    map.delete(key);
  } else if (map.size >= maxEntries) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) {
      map.delete(oldestKey);
    }
  }
  map.set(key, value);
}
