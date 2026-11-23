import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  Volume2,
  VolumeX,
  Heart,
  Eye,
  EyeOff,
  Radio,
  Sparkles,
  ThumbsUp,
  Crown,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  BellRing,
} from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const QUICK_REACTIONS = [
  { emoji: '🍵', label: 'Mời trà' },
  { emoji: '🌸', label: 'Chill quá' },
  { emoji: '❤️', label: 'Tuyệt vời' },
  { emoji: '🔥', label: 'Nhạc cháy' },
  { emoji: '👏', label: 'Vỗ tay' },
  { emoji: '🎸', label: 'Acoustic' },
];

export const StagePlayer: React.FC = () => {
  const playback = useRoomStore((s) => s.playback);
  const profile = useRoomStore((s) => s.profile);
  const hostControl = useRoomStore((s) => s.hostControl);
  const onlineUsers = useRoomStore((s) => s.onlineUsers);
  const reactions = useRoomStore((s) => s.reactions);
  const localVolume = useRoomStore((s) => s.localVolume);
  const isLocalMuted = useRoomStore((s) => s.isLocalMuted);

  const isHost = Boolean(
    hostControl.hostClientId &&
      (profile?.clientId || localStorage.getItem('tearoom_client_id')) === hostControl.hostClientId
  );
  const requiredVotes = (() => {
    if (hostControl.strictMode && hostControl.hostClientId) {
      const nonHostMembers = onlineUsers.filter((u) => u.clientId !== hostControl.hostClientId);
      if (nonHostMembers.length <= 1) return 1;
      return Math.max(1, Math.ceil(nonHostMembers.length * 0.6));
    }
    return Math.max(1, Math.ceil(Math.max(1, onlineUsers.length) / 2));
  })();

  const toggleStrictMode = useRoomStore((s) => s.toggleStrictMode);
  const resolveHostApproval = useRoomStore((s) => s.resolveHostApproval);
  const togglePlayPause = useRoomStore((s) => s.togglePlayPause);
  const seekTo = useRoomStore((s) => s.seekTo);
  const voteSkip = useRoomStore((s) => s.voteSkip);
  const forceNext = useRoomStore((s) => s.forceNext);
  const notifyTrackEnded = useRoomStore((s) => s.notifyTrackEnded);
  const setLocalVolume = useRoomStore((s) => s.setLocalVolume);
  const toggleLocalMute = useRoomStore((s) => s.toggleLocalMute);
  const sendReaction = useRoomStore((s) => s.sendReaction);
  const getSyncedPlaybackPosition = useRoomStore((s) => s.getSyncedPlaybackPosition);

  const [displayPos, setDisplayPos] = useState(0);
  const [playerReady, setPlayerReady] = useState(false);
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  const [showMvMode, setShowMvMode] = useState(false);
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);

  const playerRef = useRef<any>(null);
  const currentVideoIdRef = useRef<string | null>(null);
  const currentTrackIdRef = useRef<string | null>(null);
  const lastSeekWallTimeRef = useRef<number>(0);
  const webAudioUnlockDoneRef = useRef<boolean>(false);

  const strictRestricted = hostControl.strictMode && !isHost;

  useEffect(() => {
    const unlockOnFirstGesture = () => {
      try {
        if (!webAudioUnlockDoneRef.current) {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            if (ctx.state === 'suspended') {
              ctx.resume();
            }
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            gain.gain.value = 0.00001;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
          }
          webAudioUnlockDoneRef.current = true;
        }

        if (playerRef.current) {
          const state = useRoomStore.getState();
          const pState = playerRef.current.getPlayerState?.();
          if (!state.isLocalMuted && state.localVolume > 0) {
            playerRef.current.unMute?.();
            playerRef.current.setVolume?.(state.localVolume);
          }
          if (state.playback.isPlaying && pState !== 1 && pState !== 3) {
            const targetPos = state.getSyncedPlaybackPosition();
            lastSeekWallTimeRef.current = Date.now();
            // Only seek if player already has metadata loaded (duration > 0), otherwise just playVideo
            // becauseloadVideoById already passed startSeconds!
            const loadedDur = Number(playerRef.current.getDuration?.() || 0);
            if (loadedDur > 0) {
              playerRef.current.seekTo?.(targetPos, true);
            }
            playerRef.current.playVideo?.();
          }
          setNeedsAudioUnlock(false);
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener('pointerdown', unlockOnFirstGesture, { passive: true });
    window.addEventListener('keydown', unlockOnFirstGesture, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlockOnFirstGesture);
      window.removeEventListener('keydown', unlockOnFirstGesture);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initPlayer = () => {
      if (!isMounted || playerRef.current) return;
      const initialState = useRoomStore.getState();
      playerRef.current = new window.YT.Player('yt-hidden-player', {
        height: '100%',
        width: '100%',
        videoId: initialState.playback.currentTrack?.videoId || 'jfKfPfyJRdk',
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: any) => {
            if (!isMounted) return;
            setPlayerReady(true);
            const state = useRoomStore.getState();
            event.target.setVolume(state.localVolume);
            if (state.isLocalMuted) {
              event.target.mute();
            } else {
              event.target.unMute();
            }
            if (state.playback.currentTrack) {
              currentVideoIdRef.current = state.playback.currentTrack.videoId;
              currentTrackIdRef.current = state.playback.currentTrack.id;
              const targetSec = state.getSyncedPlaybackPosition();
              lastSeekWallTimeRef.current = Date.now();
              event.target.loadVideoById({
                videoId: state.playback.currentTrack.videoId,
                startSeconds: Math.max(0, targetSec),
              });
              if (!state.playback.isPlaying) {
                event.target.pauseVideo();
              }
            }
          },
          onStateChange: (event: any) => {
            const state = useRoomStore.getState();
            // YT.PlayerState.ENDED === 0
            // Only report natural track end if we didn't just load/seek in the last 3 seconds
            // and if actual player time is genuinely near the end of the track
            if (event.data === 0 && currentTrackIdRef.current) {
              const sinceLastSeek = Date.now() - lastSeekWallTimeRef.current;
              const trackDur = state.playback.currentTrack?.duration || 0;
              const actualTime = Number(playerRef.current?.getCurrentTime?.() || 0);
              if (
                sinceLastSeek > 3000 &&
                (trackDur === 0 || actualTime >= Math.max(5, trackDur - 10))
              ) {
                notifyTrackEnded(currentTrackIdRef.current);
              }
              return;
            }
            if (event.data === 1) {
              setNeedsAudioUnlock(false);
              return;
            }
            if (event.data === 2 && state.playback.isPlaying) {
              setTimeout(() => {
                const latest = useRoomStore.getState();
                if (latest.playback.isPlaying && playerRef.current) {
                  try {
                    playerRef.current.playVideo();
                  } catch {
                    // ignore
                  }
                }
              }, 150);
              return;
            }
            if ((event.data === -1 || event.data === 5) && state.playback.isPlaying) {
              setTimeout(() => {
                try {
                  const pState = playerRef.current?.getPlayerState?.();
                  if ((pState === -1 || pState === 5) && useRoomStore.getState().playback.isPlaying) {
                    setNeedsAudioUnlock(true);
                  }
                } catch {
                  // ignore
                }
              }, 1200);
            }
          },
          onError: () => {
            // Do not allow an individual client's transient player error to skip the room's song
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(tag);
      }
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevCallback) prevCallback();
        initPlayer();
      };
    }

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!playerReady || !playerRef.current) return;
    const player = playerRef.current;
    const track = playback.currentTrack;

    if (!track) {
      try {
        player.stopVideo();
      } catch {
        // ignore
      }
      currentVideoIdRef.current = null;
      currentTrackIdRef.current = null;
      setDisplayPos(0);
      return;
    }

    const targetPos = getSyncedPlaybackPosition();

    if (currentVideoIdRef.current !== track.videoId || currentTrackIdRef.current !== track.id) {
      currentVideoIdRef.current = track.videoId;
      currentTrackIdRef.current = track.id;
      lastSeekWallTimeRef.current = Date.now();
      try {
        player.loadVideoById({
          videoId: track.videoId,
          startSeconds: Math.max(0, targetPos),
        });
        if (!playback.isPlaying) {
          setTimeout(() => player.pauseVideo(), 300);
        }
      } catch {
        // ignore
      }
      setDisplayPos(targetPos);
      return;
    }

    try {
      const playerState = player.getPlayerState?.();
      if (playback.isPlaying && playerState !== 1 && playerState !== 3) {
        player.playVideo();
      } else if (!playback.isPlaying && playerState === 1) {
        player.pauseVideo();
      }

      if (playerState !== 3) {
        const actualTime = Number(player.getCurrentTime?.() || 0);
        if (actualTime > 0 && Math.abs(actualTime - targetPos) > 2.2) {
          lastSeekWallTimeRef.current = Date.now();
          player.seekTo(targetPos, true);
        }
      }
    } catch {
      // ignore
    }
  }, [playback.currentTrack?.id, playback.isPlaying, playback.position, playback.lastUpdatedAt, playerReady]);

  useEffect(() => {
    if (!playerReady || !playerRef.current) return;
    try {
      playerRef.current.setVolume(localVolume);
      if (isLocalMuted || localVolume === 0) {
        playerRef.current.mute();
      } else {
        playerRef.current.unMute();
      }
    } catch {
      // ignore
    }
  }, [localVolume, isLocalMuted, playerReady]);

  useEffect(() => {
    const timer = setInterval(() => {
      const state = useRoomStore.getState();
      if (!state.playback.currentTrack) {
        setDisplayPos(0);
        return;
      }

      const syncedPos = state.getSyncedPlaybackPosition();

      if (playerReady && playerRef.current) {
        try {
          const pState = playerRef.current.getPlayerState?.();
          const actual = Number(playerRef.current.getCurrentTime?.() || 0);

          if (!isDraggingSeek) {
            if (pState === 1 && actual > 0 && Math.abs(actual - syncedPos) <= 3.0) {
              setDisplayPos(actual);
            } else {
              setDisplayPos(syncedPos);
            }
          }

          if (state.playback.isPlaying) {
            const sinceLastSeek = Date.now() - lastSeekWallTimeRef.current;
            if (
              pState === 1 &&
              sinceLastSeek > 4000 &&
              actual > 0 &&
              Math.abs(actual - syncedPos) > 3.0 &&
              state.playback.currentTrack.duration > 0
            ) {
              lastSeekWallTimeRef.current = Date.now();
              playerRef.current.seekTo(syncedPos, true);
            }

            if (pState === 2 && sinceLastSeek > 1500) {
              playerRef.current.playVideo();
            }
          }
        } catch {
          if (!isDraggingSeek) setDisplayPos(syncedPos);
        }
      } else if (!isDraggingSeek) {
        setDisplayPos(syncedPos);
      }
    }, 500);

    return () => clearInterval(timer);
  }, [playerReady, isDraggingSeek]);

  const handleUnlockAudio = () => {
    if (!playerRef.current) return;
    try {
      const syncedPos = getSyncedPlaybackPosition();
      playerRef.current.unMute();
      playerRef.current.setVolume(localVolume || 80);
      lastSeekWallTimeRef.current = Date.now();
      playerRef.current.seekTo(syncedPos, true);
      playerRef.current.playVideo();
      setNeedsAudioUnlock(false);
    } catch {
      // ignore
    }
  };

  const track = playback.currentTrack;
  const duration = track?.duration || 0;
  const pendingSkipApproval = hostControl.pendingApprovals.find((a) => a.type === 'skip');

  return (
    <div className="relative rounded-3xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-tea-200 dark:border-zinc-800 shadow-lg p-5 sm:p-7 overflow-hidden transition-colors duration-200">
      {/* Warm ambient glow */}
      <div className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full bg-tea-200/50 dark:bg-emerald-950/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-matcha-100/60 dark:bg-amber-950/20 blur-3xl" />

      {/* Floating Reactions Overlay */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-20">
        {reactions.map((r) => (
          <div
            key={r.id}
            style={{ left: `${r.xOffset}%` }}
            className="absolute bottom-8 animate-float-up flex flex-col items-center"
          >
            <span className="text-3xl drop-shadow-sm">{r.emoji}</span>
            <span className="mt-0.5 px-2 py-0.5 rounded-full bg-white/90 dark:bg-zinc-800/95 border border-tea-200 dark:border-zinc-700 text-[10px] font-semibold text-tea-800 dark:text-zinc-200 shadow-sm whitespace-nowrap">
              {r.nickname}: {r.label}
            </span>
          </div>
        ))}
      </div>

      {/* Stage Header & Host Governance Controls */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-matcha-100 dark:bg-emerald-950/80 border border-transparent dark:border-emerald-800/60 text-matcha-700 dark:text-emerald-300 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-matcha-500 dark:bg-emerald-400 animate-ping" />
            Sân Khấu Phòng Trà
          </span>

          {/* Host Crown Badge */}
          {hostControl.hostNickname && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100/90 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700/70 text-amber-900 dark:text-amber-200 text-xs font-semibold">
              <Crown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>
                Chủ phòng: <strong>{hostControl.hostAvatar} {hostControl.hostNickname}</strong>
                {isHost && ' (Bạn)'}
              </span>
            </span>
          )}

          {/* Active Strict Mode Status Pill for Members */}
          {!isHost && (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                hostControl.strictMode
                  ? 'bg-rose-50 dark:bg-rose-950/70 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                  : 'bg-tea-100 dark:bg-zinc-800 border-tea-200 dark:border-zinc-700 text-tea-700 dark:text-zinc-300'
              }`}
            >
              {hostControl.strictMode ? (
                <>
                  <Lock className="w-3 h-3" /> Chế độ Cầm Quyền (Chỉ Vote & Thêm bài)
                </>
              ) : (
                <>
                  <Unlock className="w-3 h-3" /> Chế độ Tự Do
                </>
              )}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Host Switch for Strict Mode */}
          {isHost && (
            <button
              type="button"
              onClick={toggleStrictMode}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border shadow-sm transition ${
                hostControl.strictMode
                  ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-500'
                  : 'bg-white dark:bg-zinc-800 hover:bg-tea-100 dark:hover:bg-zinc-700 text-tea-800 dark:text-zinc-200 border-tea-300 dark:border-zinc-700'
              }`}
              title="Bật chế độ này sẽ khóa nút Pause/Tua/Qua bài của thành viên. Thành viên chỉ được thêm nhạc và phải Vote đủ phiếu để bạn duyệt!"
            >
              {hostControl.strictMode ? (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>Đang Bật: Cầm Quyền</span>
                </>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Bật Chế Độ Cầm Quyền</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowMvMode((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-tea-100 dark:bg-zinc-800 hover:bg-tea-200 dark:hover:bg-zinc-700 text-tea-800 dark:text-zinc-200 border border-transparent dark:border-zinc-700 text-xs font-medium transition"
            title="Chuyển đổi giữa Đĩa Than Acoustic và Xem Video MV"
          >
            {showMvMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{showMvMode ? 'Đĩa Than' : 'Xem MV'}</span>
          </button>
        </div>
      </div>

      {/* Host Approval Request Banner */}
      {hostControl.pendingApprovals.length > 0 && (
        <div className="relative z-30 mb-5 space-y-2">
          {hostControl.pendingApprovals.map((req) => (
            <div
              key={req.id}
              className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-300 dark:border-amber-700 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start sm:items-center gap-2.5 text-xs sm:text-sm text-amber-950 dark:text-amber-100">
                <BellRing className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 animate-bounce mt-0.5 sm:mt-0" />
                <div>
                  <span className="font-bold">
                    {req.type === 'skip' ? '🗳️ Yêu cầu Qua Bài Hát' : '⬆️ Yêu cầu Ưu Tiên Bài Hát'}
                  </span>
                  <span className="mx-1.5">•</span>
                  <span>
                    Các thành viên đã vote đủ{' '}
                    <strong>
                      ({req.voteCount}/{req.requiredVotes} phiếu)
                    </strong>{' '}
                    cho bài <strong>"{req.trackTitle}"</strong>.
                  </span>
                </div>
              </div>

              {isHost ? (
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => resolveHostApproval(req.id, true)}
                    className="px-3.5 py-1.5 rounded-xl bg-matcha-600 dark:bg-emerald-600 hover:bg-matcha-700 dark:hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 shadow-sm transition"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Đồng Ý</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => resolveHostApproval(req.id, false)}
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-semibold flex items-center gap-1 transition"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Từ Chối</span>
                  </button>
                </div>
              ) : (
                <span className="px-3 py-1 rounded-full bg-amber-200/70 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 text-xs font-semibold shrink-0 self-start sm:self-auto">
                  ⏳ Đang chờ Chủ phòng duyệt...
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Autoplay unlock prompt */}
      {needsAudioUnlock && (
        <div className="relative z-30 mb-4 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm text-amber-900 dark:text-amber-200 font-medium">
            <Radio className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 animate-pulse" />
            <span>Trình duyệt đang tạm tắt tiếng tự động. Bấm bất kỳ đâu hoặc nút bên cạnh để hòa nhịp âm thanh!</span>
          </div>
          <button
            type="button"
            onClick={handleUnlockAudio}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shrink-0 shadow transition"
          >
            Bật Âm Thanh Ngay 🔊
          </button>
        </div>
      )}

      {/* YouTube Player Container */}
      <div
        className={
          showMvMode
            ? 'relative z-10 w-full aspect-video rounded-2xl overflow-hidden bg-black mb-5 shadow-md border border-tea-200 dark:border-zinc-700'
            : 'fixed bottom-1 right-1 w-[2px] h-[2px] opacity-[0.01] pointer-events-none overflow-hidden z-0'
        }
      >
        <div id="yt-hidden-player" className="w-full h-full" />
      </div>

      {/* Vinyl Record & Track Showcase */}
      {track ? (
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
          {!showMvMode && (
            <div className="relative shrink-0 group">
              <div
                className={`w-44 h-44 sm:w-52 sm:h-52 rounded-full bg-gradient-to-tr from-stone-950 via-stone-800 to-stone-950 p-3 shadow-xl border-4 border-tea-200 dark:border-zinc-700 flex items-center justify-center ${
                  playback.isPlaying ? 'animate-spin-slow' : ''
                }`}
              >
                <div className="w-full h-full rounded-full border border-stone-700/60 p-3 flex items-center justify-center">
                  <div className="w-full h-full rounded-full border border-stone-700/40 p-2 flex items-center justify-center">
                    <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden border-2 border-tea-300 dark:border-zinc-600 shadow-inner">
                      <img
                        src={track.thumbnail}
                        alt={track.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 m-auto w-5 h-5 rounded-full bg-tea-50 dark:bg-zinc-900 border-2 border-stone-700 shadow" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-2 right-2 px-2.5 py-1 rounded-full bg-white dark:bg-zinc-800 border border-tea-200 dark:border-zinc-700 shadow text-[11px] font-semibold text-tea-800 dark:text-zinc-200 flex items-center gap-1">
                <span>{playback.isPlaying ? '🎶 Đang quay' : '⏸️ Tạm dừng'}</span>
              </div>
            </div>
          )}

          {/* Track Metadata & Dedication */}
          <div className="flex-1 min-w-0 text-center md:text-left w-full">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-tea-100 dark:bg-zinc-800 border border-transparent dark:border-zinc-700 text-tea-800 dark:text-zinc-300 text-xs font-medium mb-2">
              <span>{track.requestedByAvatar}</span>
              <span>
                Yêu cầu bởi <strong className="font-semibold text-tea-900 dark:text-white">{track.requestedBy}</strong>
              </span>
            </div>

            <h1 className="font-serif text-xl sm:text-2xl font-bold text-tea-900 dark:text-white line-clamp-2 leading-snug">
              {track.title}
            </h1>
            <p className="text-sm text-tea-600 dark:text-zinc-400 font-medium mt-1">{track.author}</p>

            {track.dedicationMessage && (
              <div className="mt-3 p-3 rounded-2xl bg-gradient-to-r from-tea-100/90 to-matcha-50/80 dark:from-zinc-800 dark:to-emerald-950/40 border border-tea-200 dark:border-zinc-700 text-left flex items-start gap-2.5 shadow-sm">
                <Sparkles className="w-4 h-4 text-tea-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-tea-800 dark:text-zinc-200 italic">
                  "{track.dedicationMessage}"
                </div>
              </div>
            )}

            {/* Progress Bar & Time */}
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs font-semibold text-tea-700 dark:text-zinc-300 mb-1.5">
                <span>{formatSeconds(displayPos)}</span>
                <span>{duration > 0 ? formatSeconds(duration) : track.durationText || 'LIVE'}</span>
              </div>
              {duration > 0 ? (
                <input
                  type="range"
                  min={0}
                  max={duration}
                  disabled={strictRestricted}
                  value={Math.min(displayPos, duration)}
                  onPointerDown={() => !strictRestricted && setIsDraggingSeek(true)}
                  onPointerUp={() => setIsDraggingSeek(false)}
                  onChange={(e) => {
                    if (strictRestricted) return;
                    const nextSec = Number(e.target.value);
                    setDisplayPos(nextSec);
                    lastSeekWallTimeRef.current = Date.now();
                    seekTo(nextSec);
                  }}
                  title={
                    strictRestricted
                      ? 'Đang ở Chế Độ Cầm Quyền: Chỉ Chủ Phòng mới được tua nhạc'
                      : 'Tua thời gian bài hát'
                  }
                  className={`w-full h-2 bg-tea-200 dark:bg-zinc-700 rounded-lg appearance-none accent-matcha-600 dark:accent-emerald-500 ${
                    strictRestricted ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                  }`}
                />
              ) : (
                <div className="w-full h-2 bg-matcha-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div className="w-full h-full bg-matcha-500 dark:bg-emerald-500 animate-pulse" />
                </div>
              )}
            </div>

            {/* Playback & Local Speaker Controls */}
            <div className="mt-5 flex flex-wrap items-center justify-center md:justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={togglePlayPause}
                  disabled={strictRestricted}
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-md transition ${
                    strictRestricted
                      ? 'bg-tea-200 dark:bg-zinc-800 text-tea-500 dark:text-zinc-500 cursor-not-allowed'
                      : 'bg-matcha-600 dark:bg-emerald-600 hover:bg-matcha-700 dark:hover:bg-emerald-500 text-white hover:shadow-lg'
                  }`}
                  title={
                    strictRestricted
                      ? '🔒 Chế độ Cầm Quyền: Chỉ Chủ Phòng mới có thể Tạm dừng / Phát'
                      : playback.isPlaying
                      ? 'Tạm dừng cho cả phòng'
                      : 'Phát tiếp cho cả phòng'
                  }
                >
                  {playback.isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </button>

                <button
                  type="button"
                  onClick={voteSkip}
                  className={`px-3.5 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-1.5 transition ${
                    pendingSkipApproval
                      ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700'
                      : 'bg-tea-100 dark:bg-zinc-800 hover:bg-tea-200 dark:hover:bg-zinc-700 text-tea-900 dark:text-zinc-100 border border-transparent dark:border-zinc-700'
                  }`}
                  title={
                    isHost
                      ? 'Chuyển qua bài hát tiếp theo'
                      : 'Bỏ phiếu yêu cầu qua bài (Đủ phiếu Chủ phòng sẽ duyệt)'
                  }
                >
                  <ThumbsUp className="w-3.5 h-3.5 text-tea-700 dark:text-zinc-300" />
                  <span>
                    {pendingSkipApproval
                      ? `Chờ Chủ Phòng Duyệt (${playback.skipVotes.length}/${requiredVotes})`
                      : `Vote Qua Bài (${playback.skipVotes.length}/${requiredVotes})`}
                  </span>
                </button>

                {!strictRestricted && (
                  <button
                    type="button"
                    onClick={forceNext}
                    className="p-2.5 rounded-2xl bg-tea-100 dark:bg-zinc-800 hover:bg-tea-200 dark:hover:bg-zinc-700 text-tea-800 dark:text-zinc-200 border border-transparent dark:border-zinc-700 transition"
                    title="Chuyển bài ngay lập tức"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Local Machine Audio Control */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-tea-50 dark:bg-zinc-800/90 border border-tea-200 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={toggleLocalMute}
                  className={`p-1.5 rounded-xl transition ${
                    isLocalMuted
                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                      : 'text-tea-700 dark:text-zinc-300 hover:bg-tea-100 dark:hover:bg-zinc-700'
                  }`}
                  title={
                    isLocalMuted
                      ? 'Máy bạn đang Tắt Tiếng (Chế độ chỉ điều khiển)'
                      : 'Tắt tiếng trên máy này (không ảnh hưởng máy phát loa chính)'
                  }
                >
                  {isLocalMuted || localVolume === 0 ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={isLocalMuted ? 0 : localVolume}
                  onChange={(e) => setLocalVolume(Number(e.target.value))}
                  className="w-20 h-1.5 bg-tea-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-tea-600 dark:accent-emerald-500"
                  title="Âm lượng tại máy của bạn"
                />
                <span className="text-[11px] font-medium text-tea-600 dark:text-zinc-300 w-14 text-right">
                  {isLocalMuted ? 'Chỉ ĐK' : `Loa ${localVolume}%`}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative z-10 py-12 text-center">
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-tea-100 dark:bg-zinc-800 text-tea-600 dark:text-zinc-300 flex items-center justify-center text-2xl">
            🍵
          </div>
          <h3 className="font-serif text-lg font-bold text-tea-900 dark:text-white">
            Sân khấu đang chờ giai điệu mới
          </h3>
          <p className="text-xs sm:text-sm text-tea-600 dark:text-zinc-400 mt-1">
            Hãy tìm kiếm một bài hát trên thanh Topbar để mở màn cho phòng trà nhé!
          </p>
        </div>
      )}

      {/* Quick Floating Reaction Bar */}
      <div className="relative z-10 mt-6 pt-4 border-t border-tea-200/70 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-tea-700 dark:text-zinc-300 flex items-center gap-1">
          <Heart className="w-3.5 h-3.5 text-rose-500" /> Thả cảm xúc lên sân khấu:
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK_REACTIONS.map((item) => (
            <button
              key={item.emoji}
              type="button"
              onClick={() => sendReaction(item.emoji, item.label)}
              className="px-2.5 py-1.5 rounded-xl bg-tea-50 dark:bg-zinc-800 hover:bg-matcha-100 dark:hover:bg-zinc-700 border border-tea-200 dark:border-zinc-700 hover:border-matcha-300 dark:hover:border-emerald-600 text-xs font-medium text-tea-800 dark:text-zinc-200 flex items-center gap-1 transition active:scale-95 shadow-sm"
            >
              <span>{item.emoji}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
