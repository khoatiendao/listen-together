import React, { useEffect, useState } from 'react';
import {
  Plus,
  ListMusic,
  History,
  Play,
  Trash2,
  Music2,
  Sparkles,
  ArrowUpCircle,
  Flame,
  RefreshCw,
  Loader2,
  MessageSquareHeart,
} from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';
import { MoodCategory, SearchResultItem, TrackItem } from '../../shared/types.ts';

const DEFAULT_MOODS: MoodCategory[] = [
  {
    id: 'trending',
    label: 'Đang Thịnh Hành',
    emoji: '🔥',
    description: 'Những bản Hit V-Pop đang hoặc từng giữ Top Trending nhiều triệu view',
  },
  {
    id: 'cafe',
    label: 'Cafe & Acoustic',
    emoji: '☕',
    description: 'Nhạc Acoustic mộc mạc, Indie nhẹ nhàng nhâm nhi tách trà & cà phê',
  },
  {
    id: 'vui',
    label: 'Vui Tươi & Yêu Đời',
    emoji: '☀️',
    description: 'Giai điệu tích cực, ngọt ngào, tràn đầy năng lượng tươi sáng',
  },
  {
    id: 'buon',
    label: 'Buồn & Tâm Trạng',
    emoji: '🌧️',
    description: 'Những bản Ballad triệu view sâu lắng, da diết chạm tới cảm xúc',
  },
  {
    id: 'taptrung',
    label: 'Tập Trung Code',
    emoji: '💻',
    description: 'Lofi Chill, R&B & Indie êm ái giúp tập trung làm việc không xao nhãng',
  },
  {
    id: 'hoiniem',
    label: 'Hồi Ức Thanh Xuân',
    emoji: '🎞️',
    description: 'Những bản Hit huyền thoại một thời ai nghe cũng thuộc lòng',
  },
  {
    id: 'remix',
    label: 'Sôi Động & Quẩy',
    emoji: '⚡',
    description: 'Nhạc Vinahouse, EDM, Rap Hip-hop cực cháy đánh tan cơn buồn ngủ',
  },
];

export const OrderCounter: React.FC = () => {
  const queue = useRoomStore((s) => s.queue);
  const history = useRoomStore((s) => s.history);
  const playback = useRoomStore((s) => s.playback);
  const profile = useRoomStore((s) => s.profile);
  const onlineUsers = useRoomStore((s) => s.onlineUsers);
  const hostControl = useRoomStore((s) => s.hostControl);

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

  const addTrackToQueue = useRoomStore((s) => s.addTrackToQueue);
  const voteTrackPriority = useRoomStore((s) => s.voteTrackPriority);
  const removeTrackFromQueue = useRoomStore((s) => s.removeTrackFromQueue);
  const playTrackNow = useRoomStore((s) => s.playTrackNow);

  const [activeTab, setActiveTab] = useState<'queue' | 'moods' | 'history'>('queue');
  const [moodCategories, setMoodCategories] = useState<MoodCategory[]>(DEFAULT_MOODS);
  const [selectedMoodId, setSelectedMoodId] = useState<string>('trending');
  const [moodTracks, setMoodTracks] = useState<SearchResultItem[]>([]);
  const [isLoadingMood, setIsLoadingMood] = useState<boolean>(false);
  const [moodError, setMoodError] = useState<string | null>(null);
  const [dedicationNote, setDedicationNote] = useState<string>('');
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const strictRestricted = hostControl.strictMode && !isHost;

  const fetchMoodRecommendations = async (moodId: string, forceRefresh = false) => {
    setIsLoadingMood(true);
    setMoodError(null);
    try {
      const url = `/api/recommendations?mood=${encodeURIComponent(moodId)}${
        forceRefresh ? '&refresh=1' : ''
      }`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        setMoodError(data.error || 'Không thể tải danh sách gợi ý.');
        setMoodTracks([]);
      } else {
        if (Array.isArray(data.categories) && data.categories.length > 0) {
          setMoodCategories(data.categories);
        }
        setMoodTracks(data.results || []);
      }
    } catch {
      setMoodError('Không kết nối được tới máy chủ gợi ý bài hát.');
    } finally {
      setIsLoadingMood(false);
    }
  };

  // Load initial mood recommendations when user switches to 'moods' tab or changes mood
  useEffect(() => {
    if (activeTab === 'moods') {
      fetchMoodRecommendations(selectedMoodId, false);
    }
  }, [activeTab, selectedMoodId]);

  const handleOrderRecommendedTrack = (item: SearchResultItem) => {
    addTrackToQueue({
      videoId: item.videoId,
      title: item.title,
      author: item.author,
      thumbnail: item.thumbnail,
      duration: item.duration,
      durationText: item.durationText,
      dedicationMessage: dedicationNote.trim() ? dedicationNote.trim() : undefined,
    });
    setJustAddedId(item.videoId);
    setDedicationNote('');
    setTimeout(() => {
      setJustAddedId((prev) => (prev === item.videoId ? null : prev));
    }, 2000);
  };

  const handleReorderFromHistory = (item: TrackItem) => {
    addTrackToQueue({
      videoId: item.videoId,
      title: item.title,
      author: item.author,
      thumbnail: item.thumbnail,
      duration: item.duration,
      durationText: item.durationText,
    });
    setActiveTab('queue');
  };

  const activeMoodObj =
    moodCategories.find((m) => m.id === selectedMoodId) || DEFAULT_MOODS[0];

  return (
    <div className="rounded-3xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-tea-200 dark:border-zinc-800 shadow-lg p-5 sm:p-6 transition-colors duration-200">
      {/* Header & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-serif text-xl font-bold text-tea-900 dark:text-white flex items-center gap-2">
            <Music2 className="w-5 h-5 text-matcha-600 dark:text-emerald-400" />
            <span>Quầy Nhạc & Gợi Ý Cảm Xúc</span>
          </h2>
          <p className="text-xs text-tea-600 dark:text-zinc-400">
            {strictRestricted
              ? 'Chế độ Cầm Quyền: Khám phá nhạc Trending theo tâm trạng hoặc Vote Ưu Tiên trong hàng chờ'
              : 'Khám phá các bài Hit Trending theo tâm trạng hoặc quản lý danh sách phát'}
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-tea-100/80 dark:bg-zinc-800 p-1 rounded-2xl self-start sm:self-auto border border-transparent dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              activeTab === 'queue'
                ? 'bg-white dark:bg-zinc-700 text-tea-900 dark:text-white shadow-sm'
                : 'text-tea-700 dark:text-zinc-400 hover:text-tea-900 dark:hover:text-white'
            }`}
          >
            <ListMusic className="w-3.5 h-3.5" />
            <span>Hàng Chờ ({queue.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('moods')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              activeTab === 'moods'
                ? 'bg-matcha-600 dark:bg-emerald-600 text-white shadow-sm'
                : 'text-tea-700 dark:text-zinc-400 hover:text-tea-900 dark:hover:text-white'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            <span>Gợi Ý Theo Cảm Xúc</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              activeTab === 'history'
                ? 'bg-white dark:bg-zinc-700 text-tea-900 dark:text-white shadow-sm'
                : 'text-tea-700 dark:text-zinc-400 hover:text-tea-900 dark:hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Đã Phát ({history.length})</span>
          </button>
        </div>
      </div>

      {/* Quick Mood Pills Bar (Visible even on Queue tab so users can jump into a mood with 1 click!) */}
      {activeTab === 'queue' && (
        <div className="mb-4 pb-3 border-b border-tea-100 dark:border-zinc-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[11px] font-semibold text-tea-600 dark:text-zinc-400 shrink-0 flex items-center gap-1 mr-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Chọn nhanh theo tâm trạng:
          </span>
          {moodCategories.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setSelectedMoodId(m.id);
                setActiveTab('moods');
              }}
              className="px-2.5 py-1 rounded-full bg-tea-50 dark:bg-zinc-800 hover:bg-matcha-100 dark:hover:bg-emerald-950/80 border border-tea-200 dark:border-zinc-700 text-[11px] font-semibold text-tea-800 dark:text-zinc-200 flex items-center gap-1 shrink-0 transition"
            >
              <span>{m.emoji}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* TAB 1: QUEUE */}
      {activeTab === 'queue' && (
        <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
          {queue.length === 0 ? (
            <div className="py-10 text-center rounded-2xl bg-tea-50/60 dark:bg-zinc-800/50 border border-dashed border-tea-200 dark:border-zinc-700">
              <p className="text-sm font-medium text-tea-700 dark:text-zinc-300">
                Hàng chờ đang trống
              </p>
              <p className="text-xs text-tea-500 dark:text-zinc-400 mt-1">
                Bấm vào các nút <strong className="text-tea-800 dark:text-zinc-200">Tâm trạng / Cảm xúc</strong> ở trên hoặc gõ tên bài hát trên thanh Topbar để chọn nhạc nhé!
              </p>
            </div>
          ) : (
            queue.map((item, idx) => {
              const priorityVotesCount = item.priorityVotes?.length || 0;
              const isPendingPriorityApproval = hostControl.pendingApprovals.some(
                (a) => a.type === 'priority' && a.trackId === item.id
              );

              return (
                <div
                  key={item.id}
                  className="group flex items-center justify-between gap-3 p-3 rounded-2xl bg-tea-50/80 dark:bg-zinc-800/70 hover:bg-white dark:hover:bg-zinc-800 border border-tea-200/80 dark:border-zinc-700 transition shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 text-center font-serif text-xs font-bold text-tea-500 dark:text-zinc-400">
                      #{idx + 1}
                    </span>
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      className="w-14 h-10 rounded-xl object-cover shrink-0 border border-tea-200 dark:border-zinc-700"
                    />
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-semibold text-tea-900 dark:text-zinc-100 truncate">
                        {item.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-tea-600 dark:text-zinc-400 mt-0.5">
                        <span>{item.author}</span>
                        <span>•</span>
                        <span className="px-1.5 py-0.2 rounded bg-tea-100 dark:bg-zinc-700 text-tea-800 dark:text-zinc-200 font-medium">
                          {item.durationText}
                        </span>
                        <span>•</span>
                        <span>
                          {item.requestedByAvatar} {item.requestedBy}
                        </span>
                      </div>
                      {item.dedicationMessage && (
                        <p className="text-[11px] text-matcha-700 dark:text-emerald-400 italic mt-1 truncate flex items-center gap-1">
                          <Sparkles className="w-3 h-3 shrink-0" /> "{item.dedicationMessage}"
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={() => voteTrackPriority(item.id)}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition ${
                          isPendingPriorityApproval
                            ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700'
                            : 'bg-tea-100 dark:bg-zinc-700 hover:bg-amber-100 dark:hover:bg-amber-950 text-tea-800 dark:text-zinc-200 hover:text-amber-900 dark:hover:text-amber-200'
                        }`}
                        title={
                          isHost
                            ? 'Đẩy bài hát này lên vị trí #1 ngay lập tức'
                            : 'Vote ưu tiên đẩy bài hát này lên đầu hàng chờ (Đủ phiếu Chủ phòng sẽ duyệt)'
                        }
                      >
                        <ArrowUpCircle className="w-3.5 h-3.5" />
                        <span>
                          {isHost
                            ? 'Ưu tiên'
                            : isPendingPriorityApproval
                            ? `Chờ duyệt (${priorityVotesCount}/${requiredVotes})`
                            : `Vote Ưu Tiên (${priorityVotesCount}/${requiredVotes})`}
                        </span>
                      </button>
                    )}

                    {!strictRestricted && (
                      <>
                        <button
                          type="button"
                          onClick={() => playTrackNow(item.id)}
                          className="p-2 rounded-xl bg-matcha-100 dark:bg-emerald-950/80 hover:bg-matcha-600 dark:hover:bg-emerald-600 text-matcha-700 dark:text-emerald-300 hover:text-white transition"
                          title="Phát bài này ngay lập tức"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeTrackFromQueue(item.id)}
                          className="p-2 rounded-xl bg-tea-100 dark:bg-zinc-700 hover:bg-rose-100 dark:hover:bg-rose-950 text-tea-700 dark:text-zinc-300 hover:text-rose-600 dark:hover:text-rose-300 transition"
                          title="Xóa khỏi hàng chờ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: MOOD & TRENDING RECOMMENDATIONS */}
      {activeTab === 'moods' && (
        <div className="space-y-4">
          {/* Mood Selector Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-2">
            {moodCategories.map((mood) => {
              const active = mood.id === selectedMoodId;
              return (
                <button
                  key={mood.id}
                  type="button"
                  onClick={() => setSelectedMoodId(mood.id)}
                  className={`flex items-center gap-2.5 p-2.5 rounded-2xl border text-left transition-all ${
                    active
                      ? 'bg-matcha-600 dark:bg-emerald-600 border-matcha-600 dark:border-emerald-500 text-white shadow-md scale-[1.02]'
                      : 'bg-tea-50/80 dark:bg-zinc-800/80 hover:bg-tea-100 dark:hover:bg-zinc-800 border-tea-200 dark:border-zinc-700 text-tea-900 dark:text-zinc-100'
                  }`}
                >
                  <span className="text-xl shrink-0">{mood.emoji}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">{mood.label}</div>
                    <div
                      className={`text-[10px] truncate ${
                        active ? 'text-emerald-100' : 'text-tea-500 dark:text-zinc-400'
                      }`}
                    >
                      Trending Hits
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Mood Banner + Refresh Button */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-tea-100/90 via-matcha-50/70 to-tea-100/90 dark:from-zinc-800 dark:via-emerald-950/40 dark:to-zinc-800 border border-tea-200 dark:border-zinc-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">{activeMoodObj.emoji}</span>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-tea-900 dark:text-white flex items-center gap-1.5">
                  <span>Tuyển Tập {activeMoodObj.label}</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-semibold">
                    🔥 Đang & Từng Trending
                  </span>
                </h3>
                <p className="text-[11px] text-tea-700 dark:text-zinc-300">
                  {activeMoodObj.description}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isLoadingMood}
              onClick={() => fetchMoodRecommendations(selectedMoodId, true)}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-900 hover:bg-tea-50 dark:hover:bg-zinc-700 border border-tea-200 dark:border-zinc-700 text-xs font-semibold text-tea-800 dark:text-zinc-200 flex items-center gap-1.5 self-start sm:self-auto shrink-0 shadow-sm transition"
              title="Đổi danh sách bài hát Trending khác cùng tâm trạng này"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMood ? 'animate-spin' : ''}`} />
              <span>Đổi gợi ý khác</span>
            </button>
          </div>

          {/* Optional Dedication Input for Mood Order */}
          <div className="relative">
            <MessageSquareHeart className="w-4 h-4 text-matcha-600 dark:text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={dedicationNote}
              onChange={(e) => setDedicationNote(e.target.value)}
              placeholder="💌 Nhập lời nhắn gửi kèm bài hát trước khi bấm Order (không bắt buộc)..."
              maxLength={140}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-tea-50 dark:bg-zinc-800 border border-tea-200 dark:border-zinc-700 text-xs text-tea-900 dark:text-zinc-100 placeholder-tea-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-matcha-500 dark:focus:ring-emerald-500 transition"
            />
          </div>

          {/* Recommended Trending Tracks List */}
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {moodError && (
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {moodError}
              </div>
            )}

            {isLoadingMood ? (
              <div className="py-12 text-center text-tea-600 dark:text-zinc-400 flex flex-col items-center gap-2">
                <Loader2 className="w-7 h-7 animate-spin text-matcha-600 dark:text-emerald-400" />
                <span className="text-xs font-medium">
                  Đang tuyển chọn các bản Hit Trending cho tâm trạng "{activeMoodObj.label}"...
                </span>
              </div>
            ) : moodTracks.length === 0 ? (
              <div className="py-10 text-center rounded-2xl bg-tea-50/60 dark:bg-zinc-800/50 border border-dashed border-tea-200 dark:border-zinc-700">
                <p className="text-xs text-tea-600 dark:text-zinc-400">
                  Chưa tải được bài hát gợi ý. Bấm "Đổi gợi ý khác" để thử lại nhé!
                </p>
              </div>
            ) : (
              moodTracks.map((item) => {
                const isAdded =
                  justAddedId === item.videoId ||
                  queue.some((q) => q.videoId === item.videoId) ||
                  playback.currentTrack?.videoId === item.videoId;

                return (
                  <div
                    key={item.videoId}
                    className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-tea-50/80 dark:bg-zinc-800/70 hover:bg-white dark:hover:bg-zinc-800 border border-tea-200/80 dark:border-zinc-700 transition shadow-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="w-16 h-11 rounded-xl object-cover shrink-0 border border-tea-200 dark:border-zinc-700"
                      />
                      <div className="min-w-0">
                        <h4 className="text-xs sm:text-sm font-semibold text-tea-900 dark:text-zinc-100 line-clamp-1">
                          {item.title}
                        </h4>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-tea-600 dark:text-zinc-400 mt-0.5">
                          <span className="truncate font-medium">{item.author}</span>
                          <span>•</span>
                          <span className="px-1.5 py-0.2 rounded bg-white dark:bg-zinc-900 text-tea-800 dark:text-zinc-300 font-medium border border-tea-200/60 dark:border-zinc-700">
                            {item.durationText}
                          </span>
                          {item.trendingBadge && (
                            <span className="px-2 py-0.2 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-semibold text-[10px] border border-amber-300/60 dark:border-amber-800">
                              {item.trendingBadge}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isAdded}
                      onClick={() => handleOrderRecommendedTrack(item)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 transition ${
                        isAdded
                          ? 'bg-matcha-100 dark:bg-emerald-950 text-matcha-700 dark:text-emerald-300 cursor-default'
                          : 'bg-matcha-600 dark:bg-emerald-600 hover:bg-matcha-700 dark:hover:bg-emerald-500 text-white shadow-sm'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isAdded ? 'Đã chọn' : 'Order bài'}</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 3: HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
          {history.length === 0 ? (
            <div className="py-10 text-center rounded-2xl bg-tea-50/60 dark:bg-zinc-800/50 border border-dashed border-tea-200 dark:border-zinc-700">
              <p className="text-xs text-tea-600 dark:text-zinc-400">Chưa có lịch sử bài hát đã phát.</p>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={`${item.id}-${item.createdAt}`}
                className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-tea-50/60 dark:bg-zinc-800/60 hover:bg-white dark:hover:bg-zinc-800 border border-tea-200/70 dark:border-zinc-700 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="w-14 h-10 rounded-xl object-cover shrink-0 border border-tea-200 dark:border-zinc-700"
                  />
                  <div className="min-w-0">
                    <h4 className="text-xs sm:text-sm font-semibold text-tea-900 dark:text-zinc-100 truncate">
                      {item.title}
                    </h4>
                    <p className="text-[11px] text-tea-600 dark:text-zinc-400 truncate">
                      {item.author} • từng được yêu cầu bởi {item.requestedByAvatar} {item.requestedBy}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleReorderFromHistory(item)}
                  className="px-3 py-1.5 rounded-xl bg-tea-100 dark:bg-zinc-700 hover:bg-matcha-600 dark:hover:bg-emerald-600 text-tea-800 dark:text-zinc-200 hover:text-white text-xs font-semibold flex items-center gap-1 shrink-0 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm vào chờ</span>
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
