import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { Server, Socket } from 'socket.io';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import yts from 'yt-search';
import { dbService } from './db.ts';
import {
  AddTrackSchema,
  ChatMessageSchema,
  extractYouTubeId,
  JoinProfileSchema,
  ReactionSchema,
  sanitizeText,
  SeekSchema,
  SocketRateLimiter,
} from './security.ts';
import {
  ChatMessage,
  FloatingReaction,
  HostControlState,
  MoodCategory,
  PendingHostApproval,
  PlaybackState,
  RoomStatePayload,
  SearchResultItem,
  TrackItem,
  UserProfile,
} from '../shared/types.ts';

const PORT = Number(process.env.PORT || 3001);
const app = express();
// Trust reverse proxy (Render / Cloudflare) so rate-limiter & IP protection identify real user IPs
app.set('trust proxy', 1);
const httpServer = createServer(app);

// 1. HTTP Security Middlewares
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(cors());
app.use(express.json({ limit: '32kb' }));

const searchApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Bạn tìm kiếm quá nhanh, vui lòng đợi vài giây nhé!' },
});

// 2. Socket.io Server
const io = new Server(httpServer, {
  maxHttpBufferSize: 32 * 1024,
  pingInterval: 10000,
  pingTimeout: 8000,
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// 3. Default Curated Acoustic / Lofi Tea Room Tracks
const DEFAULT_TEA_TRACKS: Omit<TrackItem, 'id' | 'createdAt' | 'priorityVotes'>[] = [
  {
    videoId: 'jfKfPfyJRdk',
    title: 'lofi hip hop radio - beats to relax/study to',
    author: 'Lofi Girl',
    thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
    duration: 0,
    durationText: 'LIVE Chill',
    requestedBy: 'Chủ Quán Trà',
    requestedByClientId: 'system',
    requestedByAvatar: '🍵',
    dedicationMessage: 'Chào mừng anh em đến với Tiệm Trà Acoustic! Chọn một tách trà và cùng chill nhé.',
  },
  {
    videoId: '5yx6BWlEVcY',
    title: 'Chillhop Radio - jazzy & lofi hip hop beats',
    author: 'Chillhop Music',
    thumbnail: 'https://i.ytimg.com/vi/5yx6BWlEVcY/hqdefault.jpg',
    duration: 0,
    durationText: 'Acoustic Chill',
    requestedBy: 'Chủ Quán Trà',
    requestedByClientId: 'system',
    requestedByAvatar: '🌿',
    dedicationMessage: 'Nhạc nhẹ nhàng cho buổi làm việc tập trung và thư giãn.',
  },
];

// 4. In-Memory Room State & Priority Votes Map
const priorityVotesMap = new Map<string, Set<string>>(); // trackId -> Set of clientIds

function getEnrichedQueue(): TrackItem[] {
  const rawQueue = dbService.getQueue();
  return rawQueue.map((item) => ({
    ...item,
    priorityVotes: Array.from(priorityVotesMap.get(item.id) || []),
  }));
}

let queue: TrackItem[] = getEnrichedQueue();
let history: TrackItem[] = dbService.getHistory();

let initialTrack: TrackItem | null = null;
const savedTrackJson = dbService.getMeta('currentTrack');
if (savedTrackJson) {
  try {
    initialTrack = JSON.parse(savedTrackJson);
  } catch {
    initialTrack = null;
  }
}

if (!initialTrack && queue.length === 0) {
  DEFAULT_TEA_TRACKS.forEach((t, idx) => {
    const item: TrackItem = {
      ...t,
      id: `seed-${Date.now()}-${idx}`,
      createdAt: Date.now() + idx,
      priorityVotes: [],
    };
    dbService.addTrackToQueue(item);
  });
  queue = getEnrichedQueue();
}

if (!initialTrack && queue.length > 0) {
  initialTrack = queue.shift()!;
  dbService.removeTrackFromQueue(initialTrack.id);
  dbService.setMeta('currentTrack', JSON.stringify(initialTrack));
}

const playback: PlaybackState = {
  currentTrack: initialTrack,
  isPlaying: true,
  position: 0,
  lastUpdatedAt: Date.now(),
  skipVotes: [],
};

// Host & Governance (Chế độ Cầm Quyền) State
const savedStrictMode = dbService.getMeta('strictMode') === 'true';
const hostControl: HostControlState = {
  hostClientId: null,
  hostNickname: null,
  hostAvatar: null,
  strictMode: savedStrictMode,
  pendingApprovals: [],
};

function getComputedPosition(): number {
  if (!playback.currentTrack) return 0;
  if (!playback.isPlaying) return playback.position;
  const elapsedSec = (Date.now() - playback.lastUpdatedAt) / 1000;
  const computed = playback.position + elapsedSec;
  return Math.max(0, computed);
}

function getEffectivePlaybackSnapshot(): PlaybackState {
  return {
    ...playback,
    position: getComputedPosition(),
    lastUpdatedAt: Date.now(),
  };
}

function broadcastQueueAndMetaUpdate(): void {
  io.emit('room:queueUpdate', {
    skipVotes: playback.skipVotes,
    hostControl,
    queue: getEnrichedQueue(),
    history: dbService.getHistory(),
    serverTime: Date.now(),
  });
}

function broadcastRoomUpdate(): void {
  io.emit('room:playback', {
    playback: getEffectivePlaybackSnapshot(),
    hostControl,
    queue: getEnrichedQueue(),
    history: dbService.getHistory(),
    serverTime: Date.now(),
  });
}

function addSystemChatMessage(content: string, type: ChatMessage['type'] = 'system'): ChatMessage {
  const msg: ChatMessage = {
    id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    clientId: 'system',
    nickname: 'Tiệm Trà',
    avatar: '🍵',
    content,
    type,
    createdAt: Date.now(),
  };
  dbService.addChatMessage(msg);
  io.emit('chat:new', msg);
  return msg;
}

function advanceToNextTrack(reason?: string): void {
  if (playback.currentTrack) {
    dbService.addTrackToHistory(playback.currentTrack);
    priorityVotesMap.delete(playback.currentTrack.id);
    history = dbService.getHistory();
  }

  hostControl.pendingApprovals = hostControl.pendingApprovals.filter((a) => a.type !== 'skip');

  queue = getEnrichedQueue();
  if (queue.length > 0) {
    const next = queue.shift()!;
    dbService.removeTrackFromQueue(next.id);
    priorityVotesMap.delete(next.id);
    hostControl.pendingApprovals = hostControl.pendingApprovals.filter((a) => a.trackId !== next.id);

    playback.currentTrack = next;
    playback.isPlaying = true;
    playback.position = 0;
    playback.lastUpdatedAt = Date.now();
    playback.skipVotes = [];
    dbService.setMeta('currentTrack', JSON.stringify(next));

    if (reason) {
      addSystemChatMessage(reason, 'system');
    }
    if (next.dedicationMessage) {
      addSystemChatMessage(
        `💌 Lời nhắn từ ${next.requestedBy} cho bài "${next.title}": "${next.dedicationMessage}"`,
        'dedication'
      );
    }
  } else {
    playback.currentTrack = null;
    playback.isPlaying = false;
    playback.position = 0;
    playback.lastUpdatedAt = Date.now();
    playback.skipVotes = [];
    dbService.setMeta('currentTrack', '');
    if (reason) {
      addSystemChatMessage(reason, 'system');
    }
  }

  broadcastRoomUpdate();
}

// Auto-advance timer check every 3 seconds (+8s safety buffer so tracks never get cut off prematurely)
setInterval(() => {
  if (
    playback.currentTrack &&
    playback.isPlaying &&
    playback.currentTrack.duration > 0
  ) {
    const pos = getComputedPosition();
    if (pos >= playback.currentTrack.duration + 8) {
      advanceToNextTrack(`🎵 Đã phát xong "${playback.currentTrack.title}". Chuyển sang giai điệu tiếp theo!`);
    }
  }
}, 3000);

// 5. Socket Rate Limiters & Online User Registry
const chatLimiter = new SocketRateLimiter(4, 6000, 20000);
const queueLimiter = new SocketRateLimiter(3, 10000, 15000);
const controlLimiter = new SocketRateLimiter(8, 5000, 10000);
const reactionLimiter = new SocketRateLimiter(6, 4000, 5000);

setInterval(() => {
  chatLimiter.cleanup();
  queueLimiter.cleanup();
  controlLimiter.cleanup();
  reactionLimiter.cleanup();
}, 60000);

const connectedUsers = new Map<string, UserProfile>();
const ipConnectionCount = new Map<string, number>();
const MAX_CONNECTIONS_PER_IP = 15;
const MAX_QUEUE_LENGTH = 50;

function getUniqueOnlineUsers(): UserProfile[] {
  const byClient = new Map<string, UserProfile>();
  for (const user of connectedUsers.values()) {
    byClient.set(user.clientId, user);
  }
  return Array.from(byClient.values());
}

function ensureHostAssigned(): void {
  const online = getUniqueOnlineUsers();
  if (online.length === 0) {
    return;
  }

  const currentHostOnline = online.find((u) => u.clientId === hostControl.hostClientId);
  if (currentHostOnline) {
    hostControl.hostNickname = currentHostOnline.nickname;
    hostControl.hostAvatar = currentHostOnline.avatar;
    return;
  }

  const realUser = online.find((u) => u.nickname !== 'Khách Mới') || online[0];
  hostControl.hostClientId = realUser.clientId;
  hostControl.hostNickname = realUser.nickname;
  hostControl.hostAvatar = realUser.avatar;
}

function getRequiredVoteThreshold(): number {
  const online = getUniqueOnlineUsers();
  if (hostControl.strictMode && hostControl.hostClientId) {
    const nonHostMembers = online.filter((u) => u.clientId !== hostControl.hostClientId);
    if (nonHostMembers.length <= 1) return 1;
    return Math.max(1, Math.ceil(nonHostMembers.length * 0.6));
  }
  return Math.max(1, Math.ceil(Math.max(1, online.length) / 2));
}

function isUserHost(user: UserProfile): boolean {
  return Boolean(hostControl.hostClientId && user.clientId === hostControl.hostClientId);
}

// 6. Fast YouTube InnerTube Search Engine + In-Memory LRU Cache + Fallback to yt-search
const searchQueryCache = new Map<string, { timestamp: number; results: SearchResultItem[] }>();
const SEARCH_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const inFlightSearches = new Map<string, Promise<SearchResultItem[]>>();

function parseDurationTextToSeconds(text: string): number {
  if (!text) return 0;
  const parts = text.split(':').map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function parseViewsTextToNumber(text: string): number {
  if (!text) return 0;
  const digits = text.replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
}

/**
 * Direct lightweight YouTube InnerTube JSON API search (~120-250ms, 5x faster than HTML scraping)
 */
async function fastInnerTubeSearch(query: string, limit = 8): Promise<SearchResultItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      body: JSON.stringify({
        context: {
          client: {
            hl: 'vi',
            gl: 'VN',
            clientName: 'WEB',
            clientVersion: '2.20241120.01.00',
          },
        },
        query,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`InnerTube HTTP ${response.status}`);
    }

    const data: any = await response.json();
    const sections =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];

    const results: SearchResultItem[] = [];
    for (const section of sections) {
      const items = section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const v = item?.videoRenderer;
        if (!v || !v.videoId) continue;

        const title =
          v.title?.runs?.map((r: any) => r.text).join('') ||
          v.title?.simpleText ||
          'YouTube Track';
        const author =
          v.ownerText?.runs?.[0]?.text ||
          v.longBylineText?.runs?.[0]?.text ||
          'YouTube Artist';
        const durationText =
          v.lengthText?.simpleText ||
          v.lengthText?.accessibility?.accessibilityData?.label ||
          'LIVE';
        const duration = parseDurationTextToSeconds(v.lengthText?.simpleText || '');
        const viewText = v.viewCountText?.simpleText || v.viewCountText?.runs?.[0]?.text || '';
        const views = parseViewsTextToNumber(viewText);

        results.push({
          videoId: String(v.videoId),
          title: sanitizeText(title, 150),
          author: sanitizeText(author, 80),
          thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
          duration,
          durationText: sanitizeText(durationText, 20),
          views,
        });

        if (results.length >= limit) break;
      }
      if (results.length >= limit) break;
    }

    if (results.length === 0) {
      throw new Error('Empty InnerTube results');
    }

    return results;
  } finally {
    clearTimeout(timeout);
  }
}

async function cachedFastSearch(query: string, limit = 8): Promise<SearchResultItem[]> {
  const normalizedKey = `${query.toLowerCase().trim()}:${limit}`;
  const cached = searchQueryCache.get(normalizedKey);
  if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
    return cached.results;
  }

  // Deduplicate concurrent identical requests
  const existingPromise = inFlightSearches.get(normalizedKey);
  if (existingPromise) {
    return existingPromise;
  }

  const searchPromise = (async () => {
    try {
      const fastResults = await fastInnerTubeSearch(query, limit);
      searchQueryCache.set(normalizedKey, { timestamp: Date.now(), results: fastResults });
      return fastResults;
    } catch {
      // Fallback to yt-search if InnerTube ever fails
      const searchRes = await yts({ query, pages: 1 });
      const videos = (searchRes.videos || []).slice(0, limit).map((v): SearchResultItem => ({
        videoId: v.videoId,
        title: sanitizeText(v.title, 150),
        author: sanitizeText(v.author?.name || 'Unknown Artist', 80),
        thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        duration: Number(v.seconds || 0),
        durationText: v.timestamp || '0:00',
        views: Number(v.views || 0),
      }));
      searchQueryCache.set(normalizedKey, { timestamp: Date.now(), results: videos });
      return videos;
    } finally {
      inFlightSearches.delete(normalizedKey);
    }
  })();

  inFlightSearches.set(normalizedKey, searchPromise);
  return searchPromise;
}

// 6. REST API Endpoints
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    onlineCount: getUniqueOnlineUsers().length,
    serverTime: Date.now(),
  });
});

app.get('/api/search', searchApiLimiter, async (req, res) => {
  try {
    const rawQuery = String(req.query.q || '').trim();
    const query = sanitizeText(rawQuery, 120);
    if (!query) {
      res.status(400).json({ error: 'Vui lòng nhập tên bài hát hoặc link YouTube' });
      return;
    }

    const directVideoId = extractYouTubeId(query);
    if (directVideoId) {
      try {
        const fastItems = await cachedFastSearch(directVideoId, 1);
        const matched = fastItems.find((i) => i.videoId === directVideoId) || fastItems[0];
        if (matched) {
          res.json({ results: [matched] });
          return;
        }
      } catch {
        // fallback below
      }
      const fallbackItem: SearchResultItem = {
        videoId: directVideoId,
        title: `YouTube Track (${directVideoId})`,
        author: 'YouTube',
        thumbnail: `https://i.ytimg.com/vi/${directVideoId}/hqdefault.jpg`,
        duration: 0,
        durationText: 'YouTube Link',
      };
      res.json({ results: [fallbackItem] });
      return;
    }

    const videos = await cachedFastSearch(query, 8);
    res.json({ results: videos });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Không thể tìm kiếm bài hát lúc này, vui lòng thử lại!' });
  }
});

// Curated Mood & Emotion Categories for Trending Track Recommendations
interface MoodConfig extends MoodCategory {
  queries: string[];
  badgeText: string;
}

const MOOD_CONFIGS: MoodConfig[] = [
  {
    id: 'trending',
    label: 'Đang Thịnh Hành',
    emoji: '🔥',
    description: 'Những bản Hit V-Pop đang hoặc từng giữ Top Trending nhiều triệu view',
    badgeText: 'Top Trending',
    queries: [
      'Sơn Tùng M-TP HIEUTHUHAI SOOBIN Hoàng Dũng Official Music Video',
      'Bích Phương Hòa Minzy MONO Wren Evans تling Official MV',
      'Anh Trai Say Hi Official MV Top Trending',
      'Đen Vâu Vũ Karik Andree Right Hand Official MV',
    ],
  },
  {
    id: 'cafe',
    label: 'Cafe & Acoustic',
    emoji: '☕',
    description: 'Nhạc Acoustic mộc mạc, Indie nhẹ nhàng nhâm nhi tách trà & cà phê',
    badgeText: 'Acoustic Hot',
    queries: [
      'Vũ Hoàng Dũng Chillies Da LAB Cá Hồi Hoang Official MV',
      'Acoustic Việt Nam triệu view Lê Cát Trọng Lý Nguyên Hà',
      'Làn Sóng Xanh Acoustic Live Session triệu view',
      'Ngọt Thịnh Suy T.R.I Phương Ly Acoustic Official',
    ],
  },
  {
    id: 'vui',
    label: 'Vui Tươi & Yêu Đời',
    emoji: '☀️',
    description: 'Giai điệu tích cực, ngọt ngào, tràn đầy năng lượng tươi sáng',
    badgeText: 'Triệu View Vui Tươi',
    queries: [
      'AMEE Phương Ly Hoàng Thùy Linh MIN Official MV',
      'Trúc Nhân Rhymastic Low G Tóc Tiên Official MV',
      'Mặt Trời Của Em Đen Vâu JustaTee BigDaddy Official MV',
      'Sơn Tùng M-TP Có Chắc Yêu Là Đây Nơi Này Có Anh Official MV',
    ],
  },
  {
    id: 'buon',
    label: 'Buồn & Tâm Trạng',
    emoji: '🌧️',
    description: 'Những bản Ballad triệu view sâu lắng, da diết chạm tới cảm xúc',
    badgeText: 'Ballad Triệu View',
    queries: [
      'Noo Phước Thịnh Bùi Anh Tuấn Hương Tràm Mr Siro Official MV',
      'Bằng Kiều Quốc Thiên Trung Quân Idol Erik Đức Phúc Official MV',
      'Phan Mạnh Quỳnh Hà Anh Tuấn Lê Bảo Bình Quân A.P Official MV',
      'Hoàng Dũng Vũ सुन्न Nàng Thơ Bước Qua Nhau Official MV',
    ],
  },
  {
    id: 'taptrung',
    label: 'Tập Trung Code',
    emoji: '💻',
    description: 'Lofi Chill, R&B & Indie êm ái giúp tập trung làm việc không xao nhãng',
    badgeText: 'Chill & Focus',
    queries: [
      'Lofi Girl Chillhop beats to relax study to popular',
      'Đen Vâu Lối Nhỏ Bài Này Chill Phết Mười Năm Official',
      'Wren Evans tlinh MCK Obito R&B Chill Official MV',
      'Ghibli Piano Jazz Cafe BGM million views',
    ],
  },
  {
    id: 'hoiniem',
    label: 'Hồi Ức Thanh Xuân',
    emoji: '🎞️',
    description: 'Những bản Hit huyền thoại một thời ai nghe cũng thuộc lòng',
    badgeText: 'Hit Huyền Thoại',
    queries: [
      'Mỹ Tâm Tuấn Hưng Ưng Hoàng Phúc Quang Vinh Hit Official',
      'Sơn Tùng M-TP Cơn Mưa Ngang Qua Em Của Ngày Hôm Qua Official',
      'Soobin Hoàng Sơn Phía Sau Một Cô Gái Bích Phương Bao Giờ Lấy Chồng',
      'JustaTee LK Yanbi Tiên Tiên Hoàng Tôn Hit Huyền Thoại',
    ],
  },
  {
    id: 'remix',
    label: 'Sôi Động & Quẩy',
    emoji: '⚡',
    description: 'Nhạc Vinahouse, EDM, Rap Hip-hop cực cháy đánh tan cơn buồn ngủ',
    badgeText: 'Trending Sôi Động',
    queries: [
      'HIEUTHUHAI HURRYKNG GERDNANG Rap Việt Hit Triệu View',
      'SOOBIN Binz SpaceSpeakers Touliver Official MV',
      'Hoàng Thùy Linh See Tình Để Mị Nói Cho Mà Nghe Official MV',
      'Tóc Tiên Trọng Hiếu MONO Waiting For You Official MV',
    ],
  },
];

function formatViewsLabel(views: number, fallbackBadge: string): string {
  if (!views || views <= 0) return fallbackBadge;
  if (views >= 1_000_000) {
    const m = (views / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `🔥 ${m}M lượt xem`;
  }
  if (views >= 1_000) {
    const k = Math.round(views / 1_000);
    return `🔥 ${k}K lượt xem`;
  }
  return fallbackBadge;
}

const recommendationCache = new Map<string, { timestamp: number; results: SearchResultItem[] }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

app.get('/api/recommendations', searchApiLimiter, async (req, res) => {
  try {
    const moodId = sanitizeText(String(req.query.mood || 'trending'), 30);
    const refresh = req.query.refresh === '1';
    const mood = MOOD_CONFIGS.find((m) => m.id === moodId) || MOOD_CONFIGS[0];

    // Pick a query (if refresh=1, pick a random query from the mood's query pool for variety)
    const queryIndex = refresh
      ? Math.floor(Math.random() * mood.queries.length)
      : 0;
    const chosenQuery = mood.queries[queryIndex];
    const cacheKey = `${mood.id}:${queryIndex}`;

    const cached = recommendationCache.get(cacheKey);
    if (!refresh && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      res.json({
        mood: {
          id: mood.id,
          label: mood.label,
          emoji: mood.emoji,
          description: mood.description,
        },
        categories: MOOD_CONFIGS.map(({ id, label, emoji, description }) => ({
          id,
          label,
          emoji,
          description,
        })),
        results: cached.results,
      });
      return;
    }

    const rawVideos = await cachedFastSearch(chosenQuery, 14);

    // Filter & sort by view count descending so trending/popular hits always surface at the top
    const sortedPopular = rawVideos
      .filter((v) => v.videoId && (v.duration === 0 || (v.duration >= 90 && v.duration <= 7200)))
      .sort((a, b) => Number(b.views || 0) - Number(a.views || 0))
      .slice(0, 8)
      .map((v): SearchResultItem => {
        const views = Number(v.views || 0);
        return {
          ...v,
          trendingBadge: formatViewsLabel(views, mood.badgeText),
        };
      });

    recommendationCache.set(cacheKey, {
      timestamp: Date.now(),
      results: sortedPopular,
    });

    res.json({
      mood: {
        id: mood.id,
        label: mood.label,
        emoji: mood.emoji,
        description: mood.description,
      },
      categories: MOOD_CONFIGS.map(({ id, label, emoji, description }) => ({
        id,
        label,
        emoji,
        description,
      })),
      results: sortedPopular,
    });
  } catch (err) {
    console.error('Recommendation error:', err);
    res.status(500).json({ error: 'Không thể tải danh sách gợi ý lúc này, vui lòng thử lại!' });
  }
});

// 7. Real-time Socket.io Event Handlers
io.on('connection', (socket: Socket) => {
  const clientIp =
    (socket.handshake.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    socket.handshake.address ||
    'unknown';

  const currentIpCount = ipConnectionCount.get(clientIp) || 0;
  if (currentIpCount >= MAX_CONNECTIONS_PER_IP) {
    socket.emit('security:warning', { message: 'Quá nhiều kết nối từ cùng một địa chỉ mạng.' });
    socket.disconnect(true);
    return;
  }
  ipConnectionCount.set(clientIp, currentIpCount + 1);

  socket.on('clock:ping', (clientSentAt: number, callback?: (data: { clientSentAt: number; serverTime: number }) => void) => {
    if (typeof callback === 'function') {
      callback({ clientSentAt, serverTime: Date.now() });
    }
  });

  socket.on('room:join', (rawProfile: unknown) => {
    const parsed = JoinProfileSchema.safeParse(rawProfile);
    if (!parsed.success) {
      socket.emit('security:warning', { message: 'Thông tin hồ sơ không hợp lệ.' });
      return;
    }

    const cleanNickname = sanitizeText(parsed.data.nickname, 26) || 'Khách Thưởng Trà';
    const cleanAvatar = sanitizeText(parsed.data.avatar, 8) || '🍵';
    const cleanClientId = sanitizeText(parsed.data.clientId, 64);
    const existing = connectedUsers.get(socket.id);

    // Check if this client already had an active tab with a real nickname before updating
    const alreadyInRoomWithRealName = Array.from(connectedUsers.values()).some(
      (u) => u.clientId === cleanClientId && u.nickname !== 'Khách Mới'
    );
    const previousRealProfile = Array.from(connectedUsers.values()).find(
      (u) => u.clientId === cleanClientId && u.nickname !== 'Khách Mới'
    );

    const profile: UserProfile = {
      clientId: cleanClientId,
      nickname: cleanNickname,
      avatar: cleanAvatar,
      isMuted: existing?.isMuted ?? false,
      joinedAt: existing?.joinedAt ?? Date.now(),
    };

    connectedUsers.set(socket.id, profile);

    if (
      !hostControl.hostClientId ||
      hostControl.hostClientId === profile.clientId ||
      (hostControl.hostNickname === 'Khách Mới' && cleanNickname !== 'Khách Mới')
    ) {
      hostControl.hostClientId = profile.clientId;
      hostControl.hostNickname = profile.nickname;
      hostControl.hostAvatar = profile.avatar;
    } else {
      ensureHostAssigned();
    }

    // Announce in chat when a user enters the room with their chosen nickname & avatar
    if (cleanNickname !== 'Khách Mới') {
      if (!alreadyInRoomWithRealName) {
        addSystemChatMessage(`👋 ${cleanAvatar} ${cleanNickname} vừa bước vào phòng trà!`);
      } else if (
        previousRealProfile &&
        (previousRealProfile.nickname !== cleanNickname || previousRealProfile.avatar !== cleanAvatar)
      ) {
        addSystemChatMessage(
          `✨ ${previousRealProfile.nickname} đã đổi danh tính thành ${cleanAvatar} ${cleanNickname}!`
        );
      }
    }

    const statePayload: RoomStatePayload = {
      roomName: 'Tiệm Trà Acoustic & Chill',
      playback: getEffectivePlaybackSnapshot(),
      hostControl,
      queue: getEnrichedQueue(),
      history: dbService.getHistory(),
      messages: dbService.getRecentMessages(),
      onlineUsers: getUniqueOnlineUsers(),
      serverTime: Date.now(),
    };

    socket.emit('room:state', statePayload);
    io.emit('room:users', getUniqueOnlineUsers());
    broadcastQueueAndMetaUpdate();
  });

  socket.on('host:toggleStrictMode', () => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    if (!isUserHost(user)) {
      socket.emit('security:warning', { message: 'Chỉ Chủ Phòng mới có quyền bật/tắt Chế độ Cầm Quyền!' });
      return;
    }

    hostControl.strictMode = !hostControl.strictMode;
    dbService.setMeta('strictMode', String(hostControl.strictMode));

    if (hostControl.strictMode) {
      addSystemChatMessage(
        `👑 Chủ phòng ${user.nickname} đã BẬT "Chế Độ Cầm Quyền": Các thành viên vẫn tự do thêm bài hát mới, nhưng muốn Qua Bài hoặc Ưu Tiên Bài cần Vote đủ phiếu để Chủ phòng duyệt!`
      );
    } else {
      hostControl.pendingApprovals = [];
      addSystemChatMessage(
        `🌿 Chủ phòng ${user.nickname} đã TẮT "Chế Độ Cầm Quyền": Mọi người đều có thể tự do điều khiển nhạc.`
      );
    }

    broadcastQueueAndMetaUpdate();
  });

  socket.on('host:transfer', (targetClientId: string) => {
    const user = connectedUsers.get(socket.id);
    if (!user || !isUserHost(user)) {
      socket.emit('security:warning', { message: 'Chỉ Chủ Phòng hiện tại mới có thể nhường quyền Chủ Phòng!' });
      return;
    }

    const targetUser = getUniqueOnlineUsers().find((u) => u.clientId === targetClientId);
    if (!targetUser) return;

    hostControl.hostClientId = targetUser.clientId;
    hostControl.hostNickname = targetUser.nickname;
    hostControl.hostAvatar = targetUser.avatar;

    addSystemChatMessage(`👑 ${user.nickname} đã trao quyền Chủ Phòng Trà cho ${targetUser.avatar} ${targetUser.nickname}!`);
    broadcastQueueAndMetaUpdate();
  });

  socket.on('host:claim', () => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;
    const online = getUniqueOnlineUsers();
    const activeHost = online.find((u) => u.clientId === hostControl.hostClientId);

    if (!activeHost || activeHost.nickname === 'Khách Mới') {
      hostControl.hostClientId = user.clientId;
      hostControl.hostNickname = user.nickname;
      hostControl.hostAvatar = user.avatar;
      addSystemChatMessage(`👑 ${user.avatar} ${user.nickname} đã nhận vị trí Chủ Phòng Trà!`);
      broadcastQueueAndMetaUpdate();
    } else {
      socket.emit('security:warning', {
        message: `Hiện tại ${activeHost.nickname} đang là Chủ Phòng. Hãy nhờ chủ phòng nhường quyền nhé!`,
      });
    }
  });

  socket.on('host:resolveApproval', (payload: { approvalId: string; approved: boolean }) => {
    const user = connectedUsers.get(socket.id);
    if (!user || !isUserHost(user)) {
      socket.emit('security:warning', { message: 'Chỉ Chủ Phòng mới có quyền phê duyệt yêu cầu này!' });
      return;
    }

    if (!payload || typeof payload.approvalId !== 'string') return;
    const approvalIdx = hostControl.pendingApprovals.findIndex((a) => a.id === payload.approvalId);
    if (approvalIdx === -1) return;

    const approval = hostControl.pendingApprovals[approvalIdx];
    hostControl.pendingApprovals.splice(approvalIdx, 1);

    if (approval.type === 'skip') {
      if (payload.approved) {
        advanceToNextTrack(
          `✅ Chủ phòng ${user.nickname} đã ĐỒNG Ý yêu cầu Vote Qua Bài của phòng trà!`
        );
        return;
      } else {
        playback.skipVotes = [];
        addSystemChatMessage(
          `❌ Chủ phòng ${user.nickname} đã TỪ CHỐI yêu cầu qua bài "${approval.trackTitle}". Tiếp tục thưởng thức nhé!`
        );
      }
    } else if (approval.type === 'priority') {
      if (payload.approved) {
        dbService.moveTrackToTopOfQueue(approval.trackId);
        priorityVotesMap.delete(approval.trackId);
        addSystemChatMessage(
          `✅ Chủ phòng ${user.nickname} đã ĐỒNG Ý đẩy bài "${approval.trackTitle}" lên đầu hàng chờ ưu tiên!`
        );
      } else {
        priorityVotesMap.delete(approval.trackId);
        addSystemChatMessage(
          `❌ Chủ phòng ${user.nickname} đã TỪ CHỐI ưu tiên bài "${approval.trackTitle}".`
        );
      }
    }

    broadcastQueueAndMetaUpdate();
  });

  socket.on('user:toggleMute', (isMuted: boolean) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;
    user.isMuted = Boolean(isMuted);
    connectedUsers.set(socket.id, user);
    io.emit('room:users', getUniqueOnlineUsers());
  });

  socket.on('queue:add', (rawTrack: unknown) => {
    const user = connectedUsers.get(socket.id);
    if (!user) {
      socket.emit('security:warning', { message: 'Vui lòng nhập tên trước khi chọn nhạc!' });
      return;
    }

    const rate = queueLimiter.check(user.clientId);
    if (!rate.allowed) {
      socket.emit('security:warning', { message: rate.warning });
      return;
    }

    const currentQueue = dbService.getQueue();
    if (currentQueue.length >= MAX_QUEUE_LENGTH) {
      socket.emit('security:warning', { message: `Hàng chờ đã đầy (${MAX_QUEUE_LENGTH} bài). Đợi phát bớt nhé!` });
      return;
    }

    const parsed = AddTrackSchema.safeParse(rawTrack);
    if (!parsed.success) {
      socket.emit('security:warning', { message: 'Dữ liệu bài hát không hợp lệ.' });
      return;
    }

    const data = parsed.data;
    if (
      currentQueue.some((t) => t.videoId === data.videoId) ||
      playback.currentTrack?.videoId === data.videoId
    ) {
      socket.emit('security:warning', { message: 'Bài hát này đang phát hoặc đã có trong hàng chờ rồi!' });
      return;
    }

    const newTrack: TrackItem = {
      id: `trk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      videoId: data.videoId,
      title: sanitizeText(data.title, 150),
      author: sanitizeText(data.author, 80),
      thumbnail: data.thumbnail,
      duration: data.duration,
      durationText: sanitizeText(data.durationText, 20),
      requestedBy: user.nickname,
      requestedByClientId: user.clientId,
      requestedByAvatar: user.avatar,
      dedicationMessage: data.dedicationMessage ? sanitizeText(data.dedicationMessage, 140) : undefined,
      createdAt: Date.now(),
      priorityVotes: [],
    };

    if (!playback.currentTrack) {
      playback.currentTrack = newTrack;
      playback.isPlaying = true;
      playback.position = 0;
      playback.lastUpdatedAt = Date.now();
      playback.skipVotes = [];
      dbService.setMeta('currentTrack', JSON.stringify(newTrack));

      addSystemChatMessage(`🎶 ${user.nickname} vừa mở màn với bài "${newTrack.title}"`);
      if (newTrack.dedicationMessage) {
        addSystemChatMessage(
          `💌 Lời nhắn từ ${user.nickname}: "${newTrack.dedicationMessage}"`,
          'dedication'
        );
      }
      broadcastRoomUpdate();
    } else {
      dbService.addTrackToQueue(newTrack);
      addSystemChatMessage(`✨ ${user.nickname} đã thêm "${newTrack.title}" vào hàng chờ.`);
      broadcastQueueAndMetaUpdate();
    }
  });

  socket.on('queue:votePriority', (trackId: string) => {
    const user = connectedUsers.get(socket.id);
    if (!user || typeof trackId !== 'string') return;

    const rate = controlLimiter.check(user.clientId);
    if (!rate.allowed) {
      socket.emit('security:warning', { message: rate.warning });
      return;
    }

    const currentQueue = dbService.getQueue();
    const targetIdx = currentQueue.findIndex((t) => t.id === trackId);
    if (targetIdx === -1) return;
    if (targetIdx === 0) {
      socket.emit('security:warning', { message: 'Bài hát này đang ở vị trí ưu tiên số #1 trong hàng chờ rồi!' });
      return;
    }

    const target = currentQueue[targetIdx];

    if (isUserHost(user)) {
      dbService.moveTrackToTopOfQueue(trackId);
      priorityVotesMap.delete(trackId);
      hostControl.pendingApprovals = hostControl.pendingApprovals.filter(
        (a) => !(a.type === 'priority' && a.trackId === trackId)
      );
      addSystemChatMessage(`👑 Chủ phòng ${user.nickname} đã ưu tiên đẩy bài "${target.title}" lên đầu hàng chờ!`);
      broadcastQueueAndMetaUpdate();
      return;
    }

    let voters = priorityVotesMap.get(trackId);
    if (!voters) {
      voters = new Set<string>();
      priorityVotesMap.set(trackId, voters);
    }

    if (voters.has(user.clientId)) {
      socket.emit('security:warning', { message: 'Bạn đã bỏ phiếu ưu tiên cho bài hát này rồi!' });
      return;
    }

    voters.add(user.clientId);
    const voteCount = voters.size;
    const requiredVotes = getRequiredVoteThreshold();

    if (voteCount >= requiredVotes) {
      if (hostControl.strictMode && hostControl.hostClientId) {
        const alreadyPending = hostControl.pendingApprovals.some(
          (a) => a.type === 'priority' && a.trackId === trackId
        );
        if (!alreadyPending) {
          const approval: PendingHostApproval = {
            id: `apr-prio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'priority',
            trackId: target.id,
            trackTitle: target.title,
            voteCount,
            requiredVotes,
            createdAt: Date.now(),
          };
          hostControl.pendingApprovals.push(approval);
          addSystemChatMessage(
            `🔔 Đã đủ ${voteCount}/${requiredVotes} phiếu Vote Ưu Tiên bài "${target.title}"! Đang chờ Chủ phòng ${hostControl.hostNickname} phê duyệt.`
          );
        }
      } else {
        dbService.moveTrackToTopOfQueue(trackId);
        priorityVotesMap.delete(trackId);
        addSystemChatMessage(
          `⬆️ Bài "${target.title}" đã đủ ${voteCount}/${requiredVotes} phiếu vote và được đẩy lên đầu hàng chờ!`
        );
      }
    } else {
      addSystemChatMessage(
        `🗳️ ${user.nickname} đã vote ưu tiên bài "${target.title}" (${voteCount}/${requiredVotes} phiếu).`
      );
    }

    broadcastQueueAndMetaUpdate();
  });

  socket.on('queue:remove', (trackId: string) => {
    const user = connectedUsers.get(socket.id);
    if (!user || typeof trackId !== 'string') return;

    if (hostControl.strictMode && !isUserHost(user)) {
      socket.emit('security:warning', {
        message: '🔒 Đang ở Chế Độ Cầm Quyền: Chỉ Chủ Phòng mới có quyền xóa bài khỏi hàng chờ!',
      });
      return;
    }

    const currentQueue = dbService.getQueue();
    const target = currentQueue.find((t) => t.id === trackId);
    if (!target) return;

    dbService.removeTrackFromQueue(trackId);
    priorityVotesMap.delete(trackId);
    hostControl.pendingApprovals = hostControl.pendingApprovals.filter((a) => a.trackId !== trackId);

    broadcastQueueAndMetaUpdate();
  });

  socket.on('queue:playNow', (trackId: string) => {
    const user = connectedUsers.get(socket.id);
    if (!user || typeof trackId !== 'string') return;

    if (hostControl.strictMode && !isUserHost(user)) {
      socket.emit('security:warning', {
        message: '🔒 Đang ở Chế Độ Cầm Quyền: Các thành viên không thể tự ý phát đè bài. Hãy bấm "Vote Ưu Tiên" nhé!',
      });
      return;
    }

    const rate = controlLimiter.check(user.clientId);
    if (!rate.allowed) {
      socket.emit('security:warning', { message: rate.warning });
      return;
    }

    const currentQueue = dbService.getQueue();
    const target = currentQueue.find((t) => t.id === trackId);
    if (!target) return;

    if (playback.currentTrack) {
      dbService.addTrackToHistory(playback.currentTrack);
      priorityVotesMap.delete(playback.currentTrack.id);
    }

    dbService.removeTrackFromQueue(trackId);
    priorityVotesMap.delete(trackId);
    hostControl.pendingApprovals = hostControl.pendingApprovals.filter(
      (a) => a.trackId !== trackId && a.type !== 'skip'
    );

    playback.currentTrack = target;
    playback.isPlaying = true;
    playback.position = 0;
    playback.lastUpdatedAt = Date.now();
    playback.skipVotes = [];
    dbService.setMeta('currentTrack', JSON.stringify(target));

    addSystemChatMessage(`▶️ ${user.nickname} đã chọn phát ngay bài "${target.title}"`);
    if (target.dedicationMessage) {
      addSystemChatMessage(
        `💌 Lời nhắn từ ${target.requestedBy}: "${target.dedicationMessage}"`,
        'dedication'
      );
    }

    broadcastRoomUpdate();
  });

  socket.on('playback:toggle', () => {
    const user = connectedUsers.get(socket.id);
    if (!user || !playback.currentTrack) return;

    if (hostControl.strictMode && !isUserHost(user)) {
      socket.emit('security:warning', {
        message: '🔒 Đang ở Chế Độ Cầm Quyền: Chỉ Chủ Phòng mới có quyền Tạm dừng / Phát nhạc!',
      });
      return;
    }

    const rate = controlLimiter.check(user.clientId);
    if (!rate.allowed) {
      socket.emit('security:warning', { message: rate.warning });
      return;
    }

    const currentPos = getComputedPosition();
    playback.isPlaying = !playback.isPlaying;
    playback.position = currentPos;
    playback.lastUpdatedAt = Date.now();

    broadcastRoomUpdate();
  });

  socket.on('playback:seek', (rawPayload: unknown) => {
    const user = connectedUsers.get(socket.id);
    if (!user || !playback.currentTrack) return;

    if (hostControl.strictMode && !isUserHost(user)) {
      socket.emit('security:warning', {
        message: '🔒 Đang ở Chế Độ Cầm Quyền: Chỉ Chủ Phòng mới có quyền tua thời gian bài hát!',
      });
      return;
    }

    const rate = controlLimiter.check(user.clientId);
    if (!rate.allowed) {
      socket.emit('security:warning', { message: rate.warning });
      return;
    }

    const parsed = SeekSchema.safeParse(rawPayload);
    if (!parsed.success) return;

    playback.position = parsed.data.position;
    playback.lastUpdatedAt = Date.now();

    broadcastRoomUpdate();
  });

  socket.on('playback:voteSkip', () => {
    const user = connectedUsers.get(socket.id);
    if (!user || !playback.currentTrack) return;

    const rate = controlLimiter.check(user.clientId);
    if (!rate.allowed) {
      socket.emit('security:warning', { message: rate.warning });
      return;
    }

    if (isUserHost(user)) {
      advanceToNextTrack(`⏭️ Chủ phòng ${user.nickname} đã chuyển sang bài hát tiếp theo.`);
      return;
    }

    if (playback.skipVotes.includes(user.clientId)) {
      socket.emit('security:warning', { message: 'Bạn đã bỏ phiếu qua bài này rồi!' });
      return;
    }

    playback.skipVotes.push(user.clientId);
    const requiredVotes = getRequiredVoteThreshold();
    const voteCount = playback.skipVotes.length;

    if (voteCount >= requiredVotes) {
      if (hostControl.strictMode && hostControl.hostClientId) {
        const alreadyPending = hostControl.pendingApprovals.some((a) => a.type === 'skip');
        if (!alreadyPending) {
          const approval: PendingHostApproval = {
            id: `apr-skip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'skip',
            trackId: playback.currentTrack.id,
            trackTitle: playback.currentTrack.title,
            voteCount,
            requiredVotes,
            createdAt: Date.now(),
          };
          hostControl.pendingApprovals.push(approval);
          addSystemChatMessage(
            `🔔 Đã đủ ${voteCount}/${requiredVotes} phiếu Vote Qua Bài "${playback.currentTrack.title}"! Đang chờ Chủ phòng ${hostControl.hostNickname} đồng ý.`
          );
        }
        broadcastQueueAndMetaUpdate();
      } else {
        advanceToNextTrack(`⏭️ Đã đủ ${voteCount}/${requiredVotes} phiếu vote qua bài!`);
      }
    } else {
      addSystemChatMessage(
        `🗳️ ${user.nickname} đã vote qua bài (${voteCount}/${requiredVotes} phiếu).`
      );
      broadcastQueueAndMetaUpdate();
    }
  });

  socket.on('playback:forceNext', () => {
    const user = connectedUsers.get(socket.id);
    if (!user || !playback.currentTrack) return;

    if (hostControl.strictMode && !isUserHost(user)) {
      socket.emit('security:warning', {
        message: '🔒 Đang ở Chế Độ Cầm Quyền: Thành viên không thể qua bài trực tiếp, hãy bấm "Vote Qua Bài" nhé!',
      });
      return;
    }

    const rate = controlLimiter.check(user.clientId);
    if (!rate.allowed) {
      socket.emit('security:warning', { message: rate.warning });
      return;
    }

    advanceToNextTrack(`⏭️ ${user.nickname} đã chuyển sang bài hát tiếp theo.`);
  });

  socket.on('playback:ended', (endedTrackId: string) => {
    if (!playback.currentTrack || playback.currentTrack.id !== endedTrackId) return;

    // Guard against premature/spurious 'ended' events from newly joined clients or YouTube seek glitches:
    // If the track has a known duration (> 0), only allow natural ending if we are within 10 seconds of the end!
    const currentPos = getComputedPosition();
    if (
      playback.currentTrack.duration > 0 &&
      currentPos < Math.max(5, playback.currentTrack.duration - 10)
    ) {
      return;
    }

    advanceToNextTrack();
  });

  socket.on('chat:send', (rawPayload: unknown) => {
    const user = connectedUsers.get(socket.id);
    if (!user) {
      socket.emit('security:warning', { message: 'Vui lòng chọn tên trước khi trò chuyện!' });
      return;
    }

    const rate = chatLimiter.check(user.clientId);
    if (!rate.allowed) {
      socket.emit('security:warning', { message: rate.warning });
      return;
    }

    const parsed = ChatMessageSchema.safeParse(rawPayload);
    if (!parsed.success) return;

    const cleanContent = sanitizeText(parsed.data.content, 260);
    if (!cleanContent) return;

    const msg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      clientId: user.clientId,
      nickname: user.nickname,
      avatar: user.avatar,
      content: cleanContent,
      type: 'user',
      createdAt: Date.now(),
    };

    dbService.addChatMessage(msg);
    io.emit('chat:new', msg);
  });

  socket.on('reaction:send', (rawPayload: unknown) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    const rate = reactionLimiter.check(user.clientId);
    if (!rate.allowed) {
      socket.emit('security:warning', { message: rate.warning });
      return;
    }

    const parsed = ReactionSchema.safeParse(rawPayload);
    if (!parsed.success) return;

    const reaction: FloatingReaction = {
      id: `react-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      emoji: sanitizeText(parsed.data.emoji, 8),
      label: sanitizeText(parsed.data.label, 20),
      nickname: user.nickname,
      xOffset: Math.floor(Math.random() * 75) + 12,
    };

    io.emit('reaction:new', reaction);
  });

  socket.on('disconnect', () => {
    const disconnectedUser = connectedUsers.get(socket.id);
    connectedUsers.delete(socket.id);
    const count = ipConnectionCount.get(clientIp) || 1;
    if (count <= 1) {
      ipConnectionCount.delete(clientIp);
    } else {
      ipConnectionCount.set(clientIp, count - 1);
    }

    const remainingOnline = getUniqueOnlineUsers();
    if (remainingOnline.length === 0) {
      hostControl.hostClientId = null;
      hostControl.hostNickname = null;
      hostControl.hostAvatar = null;
      hostControl.pendingApprovals = [];
    } else if (
      disconnectedUser &&
      disconnectedUser.clientId === hostControl.hostClientId &&
      !remainingOnline.some((u) => u.clientId === hostControl.hostClientId)
    ) {
      ensureHostAssigned();
      if (hostControl.hostClientId) {
        addSystemChatMessage(
          `👑 Chủ phòng cũ đã rời đi. Quyền Chủ Phòng được chuyển cho ${hostControl.hostAvatar} ${hostControl.hostNickname}.`
        );
      }
      broadcastQueueAndMetaUpdate();
    }

    io.emit('room:users', remainingOnline);
  });
});

// Serve static build in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Pre-warm popular mood recommendations in the background right after server boot
async function prewarmMoodRecommendations(): Promise<void> {
  try {
    await Promise.allSettled(
      MOOD_CONFIGS.map(async (mood) => {
        const chosenQuery = mood.queries[0];
        const rawVideos = await cachedFastSearch(chosenQuery, 14);
        const sortedPopular = rawVideos
          .filter((v) => v.videoId && (v.duration === 0 || (v.duration >= 90 && v.duration <= 7200)))
          .sort((a, b) => Number(b.views || 0) - Number(a.views || 0))
          .slice(0, 8)
          .map((v): SearchResultItem => ({
            ...v,
            trendingBadge: formatViewsLabel(Number(v.views || 0), mood.badgeText),
          }));
        recommendationCache.set(`${mood.id}:0`, {
          timestamp: Date.now(),
          results: sortedPopular,
        });
      })
    );
  } catch {
    // ignore prewarm errors
  }
}

httpServer.listen(PORT, () => {
  console.log(`🍵 Tiệm Trà Acoustic Server đang chạy tại http://localhost:${PORT}`);
  setTimeout(prewarmMoodRecommendations, 500);
});
