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

export const AddTrackSchema = z.object({
  videoId: z.string().regex(youtubeIdRegex, 'Video ID không hợp lệ'),
  title: z.string().min(1).max(160),
  author: z.string().min(1).max(100),
  thumbnail: z.string().url().max(350),
  duration: z.number().min(0).max(36000),
  durationText: z.string().min(1).max(20),
  dedicationMessage: z.string().max(140).optional(),
});

export const ChatMessageSchema = z.object({
  content: z.string().min(1).max(280),
  replyTo: z
    .object({
      id: z.string().min(1).max(64),
      nickname: z.string().min(1).max(36),
      avatar: z.string().min(1).max(16),
      content: z.string().min(1).max(280),
    })
    .optional(),
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
