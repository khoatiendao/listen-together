import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  Volume2,
  VolumeX,
  Heart,
  Eye,
  Radio,
  Sparkles,
  ThumbsUp,
  Crown,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  BellRing,
  Bot,
  Disc3,
  AlignLeft,
  Loader2,
} from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';
import { LyricsResponse } from '../../shared/types.ts';
import {
  buildDonateRequestScript,
  buildTrackAnnouncementScript,
  speakAiMcAnnouncement,
  stopAiMcSpeech,
} from '../utils/aiMcBot.ts';

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
  const aiMcEnabled = useRoomStore((s) => s.aiMcEnabled);
  const activeDonateEvent = useRoomStore((s) => s.activeDonateEvent);
  const toggleAiMc = useRoomStore((s) => s.toggleAiMc);
  const toggleRoomAiMc = useRoomStore((s) => s.toggleRoomAiMc);

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
  const [stageMode, setStageMode] = useState<'vinyl' | 'mv' | 'lyrics'>('vinyl');
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);
  const [aiMcSpeakingText, setAiMcSpeakingText] = useState<string | null>(null);

  // Synced Lyrics state
  const [lyricsData, setLyricsData] = useState<LyricsResponse | null>(null);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);
  const [lyricOffsetSec, setLyricOffsetSec] = useState(0); // User-adjustable timing offset (seconds) for YouTube MVs with intros
  const [liveAudioTime, setLiveAudioTime] = useState(0); // High-frequency (120ms) actual YT audio time for zero-lag lyrics
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const lastFetchedLyricsTrackIdRef = useRef<string | null>(null);

  const playerRef = useRef<any>(null);
  const currentVideoIdRef = useRef<string | null>(null);
  const currentTrackIdRef = useRef<string | null>(null);
  const lastAnnouncedTrackIdRef = useRef<string | null>(null);
  const lastSpokenDonateIdRef = useRef<string | null>(null);
  const lastSeekWallTimeRef = useRef<number>(0);
  const webAudioUnlockDoneRef = useRef<boolean>(false);

  const strictRestricted = hostControl.strictMode && !isHost;
  // When Strict Mode is ON and Host enabled MC AI, members are locked into MC AI ON and cannot disable it
  const aiMcLockedOnForMember = hostControl.strictMode && hostControl.aiMcEnabled && !isHost;
  const effectiveAiMcEnabled = hostControl.strictMode ? hostControl.aiMcEnabled : aiMcEnabled;

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
        videoId: initialState.playback.currentTrack?.videoId || '',
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
              const trackDur =
                state.playback.currentTrack?.duration ||
                Number(playerRef.current?.getDuration?.() || 0);
              const actualTime = Number(playerRef.current?.getCurrentTime?.() || 0);
              if (
                sinceLastSeek > 3000 &&
                actualTime >= 15 &&
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

      // Trigger AI MC Bot announcement when a newly started track begins (position < 12s)
      const latestState = useRoomStore.getState();
      const shouldSpeakAiMc = latestState.hostControl.strictMode
        ? latestState.hostControl.aiMcEnabled
        : latestState.aiMcEnabled;

      if (
        shouldSpeakAiMc &&
        !latestState.isLocalMuted &&
        latestState.localVolume > 0 &&
        targetPos < 12 &&
        lastAnnouncedTrackIdRef.current !== track.id
      ) {
        lastAnnouncedTrackIdRef.current = track.id;
        const script = buildTrackAnnouncementScript(
          track.requestedBy,
          track.title,
          track.author,
          track.dedicationMessage
        );
        speakAiMcAnnouncement({
          script,
          volume: Math.min(1, (latestState.localVolume / 100) * 1.15),
          onStart: () => {
            setAiMcSpeakingText(script);
            // Smoothly duck background music to 18% while AI MC is speaking
            try {
              const curVol = useRoomStore.getState().localVolume;
              playerRef.current?.setVolume?.(Math.max(8, Math.round(curVol * 0.18)));
            } catch {
              // ignore
            }
          },
          onEnd: () => {
            setAiMcSpeakingText(null);
            // Restore full music volume smoothly
            try {
              const s = useRoomStore.getState();
              if (!s.isLocalMuted) {
                playerRef.current?.setVolume?.(s.localVolume);
              }
            } catch {
              // ignore
            }
          },
        });
      } else {
        lastAnnouncedTrackIdRef.current = track.id;
      }

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

  // Speak live "/request [lời nhắn]" Streamer Donate Shoutout via MC AI Voice Bot
  useEffect(() => {
    if (!activeDonateEvent) return;
    if (lastSpokenDonateIdRef.current === activeDonateEvent.id) return;
    lastSpokenDonateIdRef.current = activeDonateEvent.id;

    const state = useRoomStore.getState();
    const shouldSpeakAiMc = state.hostControl.strictMode
      ? state.hostControl.aiMcEnabled
      : state.aiMcEnabled;

    if (!shouldSpeakAiMc || state.isLocalMuted || state.localVolume === 0) return;

    const script = buildDonateRequestScript(activeDonateEvent.nickname, activeDonateEvent.message);
    speakAiMcAnnouncement({
      script,
      volume: Math.min(1, (state.localVolume / 100) * 1.2),
      onStart: () => {
        setAiMcSpeakingText(script);
        try {
          const curVol = useRoomStore.getState().localVolume;
          playerRef.current?.setVolume?.(Math.max(8, Math.round(curVol * 0.16)));
        } catch {
          // ignore
        }
      },
      onEnd: () => {
        setAiMcSpeakingText(null);
        try {
          const s = useRoomStore.getState();
          if (!s.isLocalMuted) {
            playerRef.current?.setVolume?.(s.localVolume);
          }
        } catch {
          // ignore
        }
      },
    });
  }, [activeDonateEvent]);

  // Fetch synced lyrics whenever current track changes (or when user opens Lyrics mode)
  useEffect(() => {
    const currentTrack = playback.currentTrack;
    if (!currentTrack) {
      setLyricsData(null);
      lastFetchedLyricsTrackIdRef.current = null;
      return;
    }

    if (lastFetchedLyricsTrackIdRef.current === currentTrack.id) return;
    lastFetchedLyricsTrackIdRef.current = currentTrack.id;

    let cancelled = false;
    setIsLoadingLyrics(true);
    setLyricsData(null);
    setLyricOffsetSec(0);

    const params = new URLSearchParams({
      title: currentTrack.title,
      author: currentTrack.author,
      duration: String(currentTrack.duration || 0),
    });

    fetch(`/api/lyrics?${params.toString()}`)
      .then((r) => r.json())
      .then((data: LyricsResponse) => {
        if (!cancelled) {
          setLyricsData(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLyricsData({ found: false, isSynced: false, lines: [] });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingLyrics(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [playback.currentTrack?.id]);

  // High-frequency (120ms) audio position poller ONLY while in Lyrics mode so lyrics highlight instantaneously with zero lag
  useEffect(() => {
    if (stageMode !== 'lyrics' || !playerReady) return;
    const fastTimer = setInterval(() => {
      try {
        const pState = playerRef.current?.getPlayerState?.();
        if (pState === 1 || pState === 2) {
          const actual = Number(playerRef.current?.getCurrentTime?.() || 0);
          if (actual > 0) {
            setLiveAudioTime(actual);
            return;
          }
        }
      } catch {
        // ignore
      }
      setLiveAudioTime(useRoomStore.getState().getSyncedPlaybackPosition());
    }, 120);
    return () => clearInterval(fastTimer);
  }, [stageMode, playerReady]);

  // Compute current active lyric line index using real-time YT audio position + user offset + 0.55s natural lead-in
  const activeLyricIndex = (() => {
    if (!lyricsData?.found || !lyricsData.isSynced || lyricsData.lines.length === 0) return -1;
    const effectiveTime = (stageMode === 'lyrics' && liveAudioTime > 0 ? liveAudioTime : displayPos) + lyricOffsetSec + 0.55;
    let idx = -1;
    for (let i = 0; i < lyricsData.lines.length; i++) {
      if (effectiveTime >= lyricsData.lines[i].time) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  })();

  // Auto-center active lyric line smoothly inside the lyrics panel (without scrolling the page)
  useEffect(() => {
    if (stageMode !== 'lyrics' || activeLyricIndex < 0) return;
    const container = lyricsContainerRef.current;
    const activeEl = document.getElementById(`lyric-line-${activeLyricIndex}`);
    if (container && activeEl) {
      const targetScrollTop =
        activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2;
      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth',
      });
    }
  }, [activeLyricIndex, stageMode]);

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

          {/* AI MC Bot Toggle Button (Locked for members when Strict Mode + Host MC AI is ON) */}
          <button
            type="button"
            disabled={aiMcLockedOnForMember}
            onClick={() => {
              if (aiMcLockedOnForMember) return;
              if (hostControl.strictMode && isHost) {
                if (hostControl.aiMcEnabled) {
                  stopAiMcSpeech();
                  setAiMcSpeakingText(null);
                  try {
                    if (!isLocalMuted) playerRef.current?.setVolume?.(localVolume);
                  } catch {
                    // ignore
                  }
                }
                toggleRoomAiMc();
                return;
              }
              if (aiMcEnabled) {
                stopAiMcSpeech();
                setAiMcSpeakingText(null);
                try {
                  if (!isLocalMuted) playerRef.current?.setVolume?.(localVolume);
                } catch {
                  // ignore
                }
              }
              toggleAiMc();
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
              aiMcLockedOnForMember
                ? 'bg-matcha-100/80 dark:bg-emerald-950/70 text-matcha-800 dark:text-emerald-300 border-matcha-300 dark:border-emerald-700 cursor-not-allowed opacity-85'
                : effectiveAiMcEnabled
                ? 'bg-matcha-100 dark:bg-emerald-950/80 text-matcha-800 dark:text-emerald-300 border-matcha-300 dark:border-emerald-700'
                : 'bg-tea-100 dark:bg-zinc-800 text-tea-600 dark:text-zinc-400 border-transparent dark:border-zinc-700'
            }`}
            title={
              aiMcLockedOnForMember
                ? '🔒 Chế độ Cầm Quyền: Chủ phòng đang BẬT MC AI cho cả phòng, thành viên không thể tắt'
                : hostControl.strictMode && isHost
                ? effectiveAiMcEnabled
                  ? 'Bạn (Chủ phòng) đang BẬT MC AI cho cả phòng (Bấm để tắt)'
                  : 'Bạn (Chủ phòng) đang TẮT MC AI của phòng (Bấm để bật)'
                : effectiveAiMcEnabled
                ? 'Bot MC AI đang BẬT: Tự động đọc tên người order & lời nhắn khi chuyển bài (Bấm để tắt)'
                : 'Bot MC AI đang TẮT (Bấm để bật giọng đọc lời nhắn)'
            }
          >
            {aiMcLockedOnForMember ? (
              <Lock className="w-3.5 h-3.5" />
            ) : (
              <Bot className="w-3.5 h-3.5" />
            )}
            <span>
              {aiMcLockedOnForMember
                ? 'MC AI: Bật (Khóa)'
                : effectiveAiMcEnabled
                ? 'MC AI: Bật'
                : 'MC AI: Tắt'}
            </span>
          </button>

          {/* 3-Way Stage View Switcher: Đĩa Than | Lyric | Xem MV */}
          <div className="inline-flex items-center p-0.5 rounded-xl bg-tea-100 dark:bg-zinc-800 border border-tea-200/80 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => setStageMode('vinyl')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                stageMode === 'vinyl'
                  ? 'bg-white dark:bg-zinc-700 text-tea-900 dark:text-white shadow-sm'
                  : 'text-tea-700 dark:text-zinc-400 hover:text-tea-900 dark:hover:text-white'
              }`}
              title="Chế độ Đĩa Than Acoustic"
            >
              <Disc3 className="w-3.5 h-3.5" />
              <span>Đĩa Than</span>
            </button>
            <button
              type="button"
              onClick={() => setStageMode('lyrics')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                stageMode === 'lyrics'
                  ? 'bg-matcha-600 dark:bg-emerald-600 text-white shadow-sm'
                  : 'text-tea-700 dark:text-zinc-400 hover:text-tea-900 dark:hover:text-white'
              }`}
              title="Chế độ Chạy Lời Bài Hát (Lyric Sync)"
            >
              <AlignLeft className="w-3.5 h-3.5" />
              <span>Lyric</span>
            </button>
            <button
              type="button"
              onClick={() => setStageMode('mv')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                stageMode === 'mv'
                  ? 'bg-white dark:bg-zinc-700 text-tea-900 dark:text-white shadow-sm'
                  : 'text-tea-700 dark:text-zinc-400 hover:text-tea-900 dark:hover:text-white'
              }`}
              title="Xem Video MV Gốc"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Xem MV</span>
            </button>
          </div>
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

      {/* AI MC Speaking Live Indicator Banner */}
      {aiMcSpeakingText && (
        <div className="relative z-30 mb-4 p-3 rounded-2xl bg-gradient-to-r from-matcha-100 via-tea-100 to-matcha-100 dark:from-emerald-950/80 dark:via-zinc-800 dark:to-emerald-950/80 border border-matcha-300 dark:border-emerald-700 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm text-matcha-900 dark:text-emerald-200 font-medium">
            <div className="w-8 h-8 rounded-xl bg-matcha-600 dark:bg-emerald-600 text-white flex items-center justify-center shrink-0 animate-pulse">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-matcha-700 dark:text-emerald-400 block">
                🎙️ MC AI Phòng Trà đang phát thanh...
              </span>
              <span className="italic">"{aiMcSpeakingText}"</span>
            </div>
          </div>
          {!aiMcLockedOnForMember && (
            <button
              type="button"
              onClick={() => {
                stopAiMcSpeech();
                setAiMcSpeakingText(null);
                try {
                  if (!isLocalMuted) playerRef.current?.setVolume?.(localVolume);
                } catch {
                  // ignore
                }
              }}
              className="px-2.5 py-1 rounded-lg bg-white/80 dark:bg-zinc-900 text-xs font-semibold text-tea-700 dark:text-zinc-300 hover:text-rose-600 transition shrink-0"
            >
              Dừng đọc
            </button>
          )}
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
          stageMode === 'mv'
            ? 'relative z-10 w-full aspect-video rounded-2xl overflow-hidden bg-black mb-5 shadow-md border border-tea-200 dark:border-zinc-700'
            : 'fixed bottom-1 right-1 w-[2px] h-[2px] opacity-[0.01] pointer-events-none overflow-hidden z-0'
        }
      >
        <div id="yt-hidden-player" className="w-full h-full" />
      </div>

      {/* Synced Karaoke-Style Lyrics Stage Panel */}
      {stageMode === 'lyrics' && track && (
        <div className="relative z-10 mb-5 rounded-2xl bg-gradient-to-b from-tea-100/90 via-tea-50/90 to-matcha-50/80 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/30 border border-tea-200 dark:border-zinc-800 shadow-inner overflow-hidden">
          <div className="px-4 py-2.5 border-b border-tea-200/70 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <AlignLeft className="w-3.5 h-3.5 text-matcha-600 dark:text-emerald-400 shrink-0" />
              <span className="font-semibold text-tea-800 dark:text-zinc-200 truncate">
                {lyricsData?.found && lyricsData.source
                  ? `Lyric: ${lyricsData.source}`
                  : 'Lời Bài Hát (Lyric)'}
              </span>
            </div>

            {lyricsData?.found && (
              <div className="flex items-center gap-1.5 shrink-0">
                {lyricsData.isSynced && (
                  <div
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-white/80 dark:bg-zinc-800 border border-tea-200 dark:border-zinc-700 text-[10px] font-semibold text-tea-700 dark:text-zinc-300"
                    title="Chỉnh lệch giây nếu MV YouTube có đoạn Intro mở đầu dài hơn bản Audio"
                  >
                    <button
                      type="button"
                      onClick={() => setLyricOffsetSec((o) => Number((o - 0.5).toFixed(1)))}
                      className="px-1.5 hover:text-matcha-600 dark:hover:text-emerald-400 transition"
                      title="Lùi lời chậm lại 0.5 giây"
                    >
                      -0.5s
                    </button>
                    <span className="min-w-[34px] text-center text-matcha-700 dark:text-emerald-400">
                      {lyricOffsetSec === 0
                        ? 'Khớp'
                        : `${lyricOffsetSec > 0 ? '+' : ''}${lyricOffsetSec}s`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setLyricOffsetSec((o) => Number((o + 0.5).toFixed(1)))}
                      className="px-1.5 hover:text-matcha-600 dark:hover:text-emerald-400 transition"
                      title="Đẩy lời chạy nhanh hơn 0.5 giây"
                    >
                      +0.5s
                    </button>
                  </div>
                )}
                <span className="px-2 py-0.5 rounded-full bg-matcha-100 dark:bg-emerald-950 text-matcha-700 dark:text-emerald-300 text-[10px] font-semibold">
                  {lyricsData.isSynced ? '✨ Sync' : '📜 Lyric'}
                </span>
              </div>
            )}
          </div>

          <div
            ref={lyricsContainerRef}
            className="relative h-64 sm:h-72 overflow-y-auto px-5 py-10 space-y-3.5 text-center scroll-smooth"
          >
            {isLoadingLyrics ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-tea-600 dark:text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin text-matcha-600 dark:text-emerald-400" />
                <span className="text-xs font-medium">Đang tìm lời bài hát khớp theo nhạc...</span>
              </div>
            ) : !lyricsData?.found || lyricsData.lines.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-tea-600 dark:text-zinc-400 px-4">
                <span className="text-3xl">🎼</span>
                <p className="text-xs sm:text-sm font-semibold text-tea-800 dark:text-zinc-200">
                  Chưa tìm thấy lời cho bản nhạc này
                </p>
                <p className="text-[11px] opacity-80 max-w-sm">
                  Có thể đây là bản nhạc không lời, Remix hoặc Live Radio. Bạn có thể thưởng thức ở chế độ Đĩa Than hoặc Xem MV nhé!
                </p>
              </div>
            ) : (
              lyricsData.lines.map((line, idx) => {
                const isActive = lyricsData.isSynced && idx === activeLyricIndex;
                const isPast = lyricsData.isSynced && activeLyricIndex >= 0 && idx < activeLyricIndex;
                const canClickToSeek = lyricsData.isSynced && !strictRestricted && line.time >= 0;

                return (
                  <p
                    id={`lyric-line-${idx}`}
                    key={`${idx}-${line.time}`}
                    onClick={() => {
                      if (canClickToSeek) {
                        setDisplayPos(line.time);
                        lastSeekWallTimeRef.current = Date.now();
                        seekTo(line.time);
                      }
                    }}
                    title={canClickToSeek ? 'Bấm để nhảy tới câu hát này' : undefined}
                    className={`transition-all duration-300 leading-relaxed ${
                      canClickToSeek ? 'cursor-pointer hover:opacity-100' : ''
                    } ${
                      isActive
                        ? 'text-base sm:text-xl font-bold text-matcha-700 dark:text-emerald-300 scale-[1.03]'
                        : isPast
                        ? 'text-xs sm:text-sm font-medium text-tea-500/70 dark:text-zinc-500'
                        : lyricsData.isSynced
                        ? 'text-xs sm:text-sm font-medium text-tea-700/80 dark:text-zinc-400'
                        : 'text-sm sm:text-base font-medium text-tea-800 dark:text-zinc-200'
                    }`}
                  >
                    {line.text}
                  </p>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Vinyl Record & Track Showcase */}
      {track ? (
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
          {stageMode === 'vinyl' && (
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
        <div className="relative z-10 py-6 sm:py-8 px-4 flex flex-col items-center justify-center text-center">
          {/* Speech Bubble pointing to mascot */}
          <div className="relative mb-3 px-4 py-2 rounded-2xl bg-matcha-100 dark:bg-emerald-950/90 border border-matcha-300 dark:border-emerald-700 text-xs sm:text-sm font-semibold text-matcha-800 dark:text-emerald-200 shadow-sm">
            <span>Meow~ Phòng trà đang yên ắng quá, bạn thêm một bản nhạc đi! 🎶</span>
            <div className="absolute left-1/2 -bottom-2 -translate-x-1/2 w-3.5 h-3.5 bg-matcha-100 dark:bg-emerald-950 border-r border-b border-matcha-300 dark:border-emerald-700 rotate-45" />
          </div>

          {/* Animated Cute Cat Mascot wearing Headphones & Holding a Tea Cup */}
          <div className="relative w-40 h-36 flex items-center justify-center">
            <svg
              viewBox="0 0 160 140"
              className="w-40 h-36 drop-shadow-md overflow-visible"
              aria-label="Mèo Phòng Trà đang chờ thêm nhạc"
            >
              {/* Floating Music Notes */}
              <text x="16" y="34" fontSize="16" className="animate-note-1 fill-matcha-600 dark:fill-emerald-400">
                🎵
              </text>
              <text x="128" y="28" fontSize="15" className="animate-note-2 fill-amber-500">
                🎶
              </text>

              {/* Soft Ground Shadow */}
              <ellipse cx="80" cy="126" rx="44" ry="8" className="fill-tea-200/80 dark:fill-zinc-800" />

              {/* Wagging Tail */}
              <path
                d="M108 98 C132 95, 138 72, 126 64"
                fill="none"
                stroke="#D1B37B"
                strokeWidth="9"
                strokeLinecap="round"
                className="animate-cat-tail"
              />

              {/* Bobbing Cat Body & Head Group */}
              <g className="animate-cat-bob">
                {/* Cat Body */}
                <ellipse cx="80" cy="100" rx="34" ry="26" fill="#F3DFC1" stroke="#A67C46" strokeWidth="2.5" />
                {/* Cream Belly */}
                <ellipse cx="80" cy="105" rx="20" ry="16" fill="#FDFBF7" />

                {/* Cat Ears */}
                <polygon points="52,55 46,28 70,44" fill="#F3DFC1" stroke="#A67C46" strokeWidth="2.5" strokeLinejoin="round" />
                <polygon points="54,50 51,35 65,45" fill="#F5B7B1" />
                <polygon points="108,55 114,28 90,44" fill="#F3DFC1" stroke="#A67C46" strokeWidth="2.5" strokeLinejoin="round" />
                <polygon points="106,50 109,35 95,45" fill="#F5B7B1" />

                {/* Headphone Band */}
                <path
                  d="M44 66 C44 30, 116 30, 116 66"
                  fill="none"
                  stroke="#437134"
                  strokeWidth="6"
                  strokeLinecap="round"
                />

                {/* Cat Head */}
                <ellipse cx="80" cy="68" rx="34" ry="27" fill="#F3DFC1" stroke="#A67C46" strokeWidth="2.5" />

                {/* Forehead Stripes */}
                <path d="M74 44 L74 51 M80 42 L80 51 M86 44 L86 51" stroke="#C19A5B" strokeWidth="2.5" strokeLinecap="round" />

                {/* Headphone Ear Cups */}
                <rect x="37" y="56" width="12" height="24" rx="6" fill="#578E45" stroke="#365A2B" strokeWidth="2" />
                <rect x="111" y="56" width="12" height="24" rx="6" fill="#578E45" stroke="#365A2B" strokeWidth="2" />

                {/* Blinking Eyes */}
                <g className="animate-cat-blink">
                  <circle cx="66" cy="68" r="4.2" fill="#3D2B1F" />
                  <circle cx="67.5" cy="66.5" r="1.4" fill="#FFFFFF" />
                  <circle cx="94" cy="68" r="4.2" fill="#3D2B1F" />
                  <circle cx="95.5" cy="66.5" r="1.4" fill="#FFFFFF" />
                </g>

                {/* Cute Rosy Cheeks */}
                <ellipse cx="56" cy="75" rx="5.5" ry="3" fill="#F5B7B1" opacity="0.8" />
                <ellipse cx="104" cy="75" rx="5.5" ry="3" fill="#F5B7B1" opacity="0.8" />

                {/* Nose & Smile */}
                <polygon points="77,74 83,74 80,77" fill="#E07A5F" />
                <path d="M74 79 Q77 83 80 78 Q83 83 86 79" fill="none" stroke="#6D4F32" strokeWidth="2" strokeLinecap="round" />

                {/* Little Matcha Tea Cup held by paws */}
                <rect x="69" y="96" width="22" height="17" rx="5" fill="#FFFFFF" stroke="#578E45" strokeWidth="2" />
                <path d="M91 100 C96 100, 96 108, 91 108" fill="none" stroke="#578E45" strokeWidth="2" />
                <rect x="72" y="99" width="16" height="4" rx="2" fill="#78AB66" />

                {/* Paws */}
                <ellipse cx="66" cy="105" rx="6.5" ry="5" fill="#F3DFC1" stroke="#A67C46" strokeWidth="2" />
                <ellipse cx="94" cy="105" rx="6.5" ry="5" fill="#F3DFC1" stroke="#A67C46" strokeWidth="2" />
              </g>
            </svg>
          </div>

          <h3 className="font-serif text-lg sm:text-xl font-bold text-tea-900 dark:text-white mt-1">
            Sân khấu đang trống, chờ bạn mở màn!
          </h3>
          <p className="text-xs sm:text-sm text-tea-600 dark:text-zinc-400 mt-1 max-w-md">
            Hãy gõ tên bài hát lên <strong>Thanh Tìm Nhạc trên đầu trang</strong> hoặc chọn một tâm trạng ở <strong>Gợi Ý Theo Cảm Xúc</strong> bên dưới nhé!
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
