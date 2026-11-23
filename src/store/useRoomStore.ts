import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import {
  ChatMessage,
  FloatingReaction,
  HostControlState,
  PlaybackState,
  RoomStatePayload,
  TrackItem,
  UserProfile,
} from '../../shared/types.ts';

const PROFILE_STORAGE_KEY = 'tearoom_user_profile_v1';
const THEME_STORAGE_KEY = 'tearoom_theme_mode_v1';

function loadInitialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') {
      document.documentElement.classList.toggle('dark', saved === 'dark');
      return saved;
    }
  } catch {
    // ignore
  }
  return 'light';
}

function getOrCreateClientId(): string {
  const existing = localStorage.getItem('tearoom_client_id');
  if (existing && existing.length >= 8) return existing;
  const generated = `tea-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  localStorage.setItem('tearoom_client_id', generated);
  return generated;
}

function loadSavedProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.nickname && parsed.avatar) {
      return {
        clientId: getOrCreateClientId(),
        nickname: parsed.nickname,
        avatar: parsed.avatar,
        isMuted: false,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

interface RoomStoreState {
  socket: Socket | null;
  isConnected: boolean;
  clockOffsetMs: number;
  profile: UserProfile | null;
  isProfileModalOpen: boolean;

  roomName: string;
  playback: PlaybackState;
  hostControl: HostControlState;
  queue: TrackItem[];
  history: TrackItem[];
  messages: ChatMessage[];
  onlineUsers: UserProfile[];
  reactions: FloatingReaction[];
  warningBanner: string | null;

  localVolume: number;
  isLocalMuted: boolean;
  theme: 'light' | 'dark';

  // Helpers
  isHost: () => boolean;
  getRequiredVotes: () => number;

  // Actions
  initSocket: () => void;
  toggleTheme: () => void;
  saveProfile: (nickname: string, avatar: string) => void;
  setProfileModalOpen: (open: boolean) => void;
  setLocalVolume: (val: number) => void;
  toggleLocalMute: () => void;
  clearWarning: () => void;

  // Socket Emitters
  toggleStrictMode: () => void;
  transferHost: (targetClientId: string) => void;
  claimHost: () => void;
  resolveHostApproval: (approvalId: string, approved: boolean) => void;
  addTrackToQueue: (track: {
    videoId: string;
    title: string;
    author: string;
    thumbnail: string;
    duration: number;
    durationText: string;
    dedicationMessage?: string;
  }) => void;
  voteTrackPriority: (trackId: string) => void;
  removeTrackFromQueue: (trackId: string) => void;
  playTrackNow: (trackId: string) => void;
  togglePlayPause: () => void;
  seekTo: (position: number) => void;
  voteSkip: () => void;
  forceNext: () => void;
  notifyTrackEnded: (trackId: string) => void;
  sendChatMessage: (content: string) => void;
  sendReaction: (emoji: string, label: string) => void;
  getSyncedPlaybackPosition: () => number;
}

export const useRoomStore = create<RoomStoreState>((set, get) => ({
  socket: null,
  isConnected: false,
  clockOffsetMs: 0,
  profile: loadSavedProfile(),
  isProfileModalOpen: !loadSavedProfile(),

  roomName: 'Tiệm Trà Acoustic & Chill',
  playback: {
    currentTrack: null,
    isPlaying: false,
    position: 0,
    lastUpdatedAt: Date.now(),
    skipVotes: [],
  },
  hostControl: {
    hostClientId: null,
    hostNickname: null,
    hostAvatar: null,
    strictMode: false,
    pendingApprovals: [],
  },
  queue: [],
  history: [],
  messages: [],
  onlineUsers: [],
  reactions: [],
  warningBanner: null,

  localVolume: 80,
  isLocalMuted: false,
  theme: loadInitialTheme(),

  toggleTheme: () => {
    const nextTheme = get().theme === 'light' ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // ignore
    }
    set({ theme: nextTheme });
  },

  isHost: () => {
    const { profile, hostControl } = get();
    const myClientId = profile?.clientId || getOrCreateClientId();
    return Boolean(hostControl.hostClientId && hostControl.hostClientId === myClientId);
  },

  getRequiredVotes: () => {
    const { onlineUsers, hostControl } = get();
    if (hostControl.strictMode && hostControl.hostClientId) {
      const nonHostMembers = onlineUsers.filter((u) => u.clientId !== hostControl.hostClientId);
      if (nonHostMembers.length <= 1) return 1;
      return Math.max(1, Math.ceil(nonHostMembers.length * 0.6));
    }
    return Math.max(1, Math.ceil(Math.max(1, onlineUsers.length) / 2));
  },

  initSocket: () => {
    if (get().socket) return;

    const socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    const syncClock = () => {
      const t0 = Date.now();
      socket.emit('clock:ping', t0, (data: { clientSentAt: number; serverTime: number }) => {
        const t1 = Date.now();
        const rtt = t1 - data.clientSentAt;
        const estimatedServerNow = data.serverTime + rtt / 2;
        const offset = estimatedServerNow - t1;
        set({ clockOffsetMs: offset });
      });
    };

    socket.on('connect', () => {
      set({ isConnected: true });
      syncClock();
      const currentProfile = get().profile;
      if (currentProfile) {
        socket.emit('room:join', currentProfile);
      } else {
        socket.emit('room:join', {
          clientId: getOrCreateClientId(),
          nickname: 'Khách Mới',
          avatar: '🍵',
        });
      }
    });

    socket.on('disconnect', () => {
      set({ isConnected: false });
    });

    socket.on('room:state', (payload: RoomStatePayload) => {
      const offset = payload.serverTime - Date.now();
      set({
        roomName: payload.roomName,
        playback: payload.playback,
        hostControl: payload.hostControl,
        queue: payload.queue,
        history: payload.history,
        messages: payload.messages,
        onlineUsers: payload.onlineUsers,
        clockOffsetMs: offset,
      });
    });

    socket.on(
      'room:playback',
      (data: {
        playback: PlaybackState;
        hostControl?: HostControlState;
        queue: TrackItem[];
        history: TrackItem[];
        serverTime: number;
      }) => {
        set((state) => ({
          playback: data.playback,
          hostControl: data.hostControl ?? state.hostControl,
          queue: data.queue,
          history: data.history,
        }));
      }
    );

    socket.on(
      'room:queueUpdate',
      (data: {
        skipVotes?: string[];
        hostControl?: HostControlState;
        queue: TrackItem[];
        history: TrackItem[];
        serverTime: number;
      }) => {
        set((state) => ({
          playback: data.skipVotes
            ? { ...state.playback, skipVotes: data.skipVotes }
            : state.playback,
          hostControl: data.hostControl ?? state.hostControl,
          queue: data.queue,
          history: data.history,
        }));
      }
    );

    socket.on('room:users', (users: UserProfile[]) => {
      set({ onlineUsers: users });
    });

    socket.on('chat:new', (msg: ChatMessage) => {
      set((state) => ({
        messages: [...state.messages.slice(-99), msg],
      }));
    });

    socket.on('reaction:new', (reaction: FloatingReaction) => {
      set((state) => ({
        reactions: [...state.reactions.slice(-20), reaction],
      }));
      setTimeout(() => {
        set((state) => ({
          reactions: state.reactions.filter((r) => r.id !== reaction.id),
        }));
      }, 3300);
    });

    socket.on('security:warning', (data: { message: string }) => {
      set({ warningBanner: data.message });
      setTimeout(() => {
        set((state) => (state.warningBanner === data.message ? { warningBanner: null } : {}));
      }, 4500);
    });

    setInterval(() => {
      if (socket.connected) syncClock();
    }, 30000);

    set({ socket });
  },

  saveProfile: (nickname: string, avatar: string) => {
    const cleanName = nickname.trim().slice(0, 26) || 'Khách Thưởng Trà';
    const newProfile: UserProfile = {
      clientId: getOrCreateClientId(),
      nickname: cleanName,
      avatar,
      isMuted: get().isLocalMuted,
    };
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(newProfile));
    set({ profile: newProfile, isProfileModalOpen: false });
    get().socket?.emit('room:join', newProfile);
  },

  setProfileModalOpen: (open: boolean) => set({ isProfileModalOpen: open }),

  setLocalVolume: (val: number) => {
    const clamped = Math.max(0, Math.min(100, val));
    set({ localVolume: clamped, isLocalMuted: clamped === 0 });
  },

  toggleLocalMute: () => {
    const nextMuted = !get().isLocalMuted;
    set({ isLocalMuted: nextMuted });
    get().socket?.emit('user:toggleMute', nextMuted);
  },

  clearWarning: () => set({ warningBanner: null }),

  toggleStrictMode: () => {
    get().socket?.emit('host:toggleStrictMode');
  },

  transferHost: (targetClientId) => {
    get().socket?.emit('host:transfer', targetClientId);
  },

  claimHost: () => {
    get().socket?.emit('host:claim');
  },

  resolveHostApproval: (approvalId, approved) => {
    get().socket?.emit('host:resolveApproval', { approvalId, approved });
  },

  addTrackToQueue: (track) => {
    get().socket?.emit('queue:add', track);
  },

  voteTrackPriority: (trackId) => {
    get().socket?.emit('queue:votePriority', trackId);
  },

  removeTrackFromQueue: (trackId) => {
    get().socket?.emit('queue:remove', trackId);
  },

  playTrackNow: (trackId) => {
    get().socket?.emit('queue:playNow', trackId);
  },

  togglePlayPause: () => {
    get().socket?.emit('playback:toggle');
  },

  seekTo: (position) => {
    get().socket?.emit('playback:seek', { position });
  },

  voteSkip: () => {
    get().socket?.emit('playback:voteSkip');
  },

  forceNext: () => {
    get().socket?.emit('playback:forceNext');
  },

  notifyTrackEnded: (trackId) => {
    get().socket?.emit('playback:ended', trackId);
  },

  sendChatMessage: (content) => {
    get().socket?.emit('chat:send', { content });
  },

  sendReaction: (emoji, label) => {
    get().socket?.emit('reaction:send', { emoji, label });
  },

  getSyncedPlaybackPosition: () => {
    const { playback, clockOffsetMs } = get();
    if (!playback.currentTrack) return 0;
    if (!playback.isPlaying) return playback.position;
    const estimatedServerNow = Date.now() + clockOffsetMs;
    const elapsedSec = Math.max(0, (estimatedServerNow - playback.lastUpdatedAt) / 1000);
    return playback.position + elapsedSec;
  },
}));

