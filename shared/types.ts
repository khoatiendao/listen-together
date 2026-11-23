export interface UserProfile {
  clientId: string;
  nickname: string;
  avatar: string;
  isMuted?: boolean;
  joinedAt?: number;
}

export interface TrackItem {
  id: string;
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
  duration: number; // in seconds
  durationText: string;
  requestedBy: string;
  requestedByClientId: string;
  requestedByAvatar: string;
  dedicationMessage?: string;
  createdAt: number;
  priorityVotes: string[]; // array of clientIds who voted to prioritize this track
}

export interface PendingHostApproval {
  id: string;
  type: 'skip' | 'priority';
  trackId: string;
  trackTitle: string;
  voteCount: number;
  requiredVotes: number;
  createdAt: number;
}

export interface HostControlState {
  hostClientId: string | null;
  hostNickname: string | null;
  hostAvatar: string | null;
  strictMode: boolean; // Chế độ Cầm Quyền: chỉ chủ phòng được Play/Pause/Tua/Skip/Xóa, thành viên chỉ được thêm nhạc và Vote
  aiMcEnabled: boolean; // Trạng thái MC AI của phòng (Khi bật Cầm Quyền + bật MC AI, thành viên không thể tắt)
  pendingApprovals: PendingHostApproval[];
}

export interface PlaybackState {
  currentTrack: TrackItem | null;
  isPlaying: boolean;
  position: number; // in seconds at lastUpdatedAt
  lastUpdatedAt: number; // server timestamp in ms
  skipVotes: string[]; // array of clientIds who voted to skip
}

export interface ChatReplyQuote {
  id: string;
  nickname: string;
  avatar: string;
  content: string;
}

export interface ChatSeenUser {
  clientId: string;
  nickname: string;
  avatar: string;
}

export interface ChatMessage {
  id: string;
  clientId: string;
  nickname: string;
  avatar: string;
  content: string;
  type: 'user' | 'system' | 'dedication';
  stickerUrl?: string;
  stickerLabel?: string;
  replyTo?: ChatReplyQuote;
  reactions?: Record<string, string[]>; // emoji -> array of nicknames who reacted
  seenBy?: ChatSeenUser[];
  createdAt: number;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  label: string;
  nickname: string;
  xOffset: number;
}

export interface DonateRequestAlert {
  id: string;
  clientId: string;
  nickname: string;
  avatar: string;
  message: string;
  createdAt: number;
}

export interface RoomStatePayload {
  roomName: string;
  playback: PlaybackState;
  hostControl: HostControlState;
  latestDonateRequest: DonateRequestAlert | null;
  queue: TrackItem[];
  history: TrackItem[];
  messages: ChatMessage[];
  onlineUsers: UserProfile[];
  serverTime: number;
}

export interface SearchResultItem {
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
  duration: number;
  durationText: string;
  views?: number;
  trendingBadge?: string;
}

export interface MoodCategory {
  id: string;
  label: string;
  emoji: string;
  description: string;
}
