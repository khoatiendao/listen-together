import React, { useState } from 'react';
import {
  Plus,
  ListMusic,
  History,
  Play,
  Trash2,
  Music2,
  Sparkles,
  ArrowUpCircle,
} from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';
import { TrackItem } from '../../shared/types.ts';

export const OrderCounter: React.FC = () => {
  const queue = useRoomStore((s) => s.queue);
  const history = useRoomStore((s) => s.history);
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

  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');

  const strictRestricted = hostControl.strictMode && !isHost;

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

  return (
    <div className="rounded-3xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-tea-200 dark:border-zinc-800 shadow-lg p-5 sm:p-6 transition-colors duration-200">
      {/* Header & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-serif text-xl font-bold text-tea-900 dark:text-white flex items-center gap-2">
            <Music2 className="w-5 h-5 text-matcha-600 dark:text-emerald-400" />
            <span>Danh Sách Phát & Hàng Chờ</span>
          </h2>
          <p className="text-xs text-tea-600 dark:text-zinc-400">
            {strictRestricted
              ? 'Chế độ Cầm Quyền: Tìm bài mới ở thanh Tìm Nhạc trên đầu trang & bấm Vote Ưu Tiên bên dưới'
              : 'Tìm bài mới ở thanh Tìm Nhạc trên đầu trang hoặc quản lý hàng chờ tại đây'}
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 bg-tea-100/80 dark:bg-zinc-800 p-1 rounded-2xl self-start sm:self-auto border border-transparent dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
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
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
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

      {/* Tab Content */}
      {activeTab === 'queue' && (
        <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
          {queue.length === 0 ? (
            <div className="py-10 text-center rounded-2xl bg-tea-50/60 dark:bg-zinc-800/50 border border-dashed border-tea-200 dark:border-zinc-700">
              <p className="text-sm font-medium text-tea-700 dark:text-zinc-300">
                Hàng chờ đang trống
              </p>
              <p className="text-xs text-tea-500 dark:text-zinc-400 mt-1">
                Hãy gõ tên bài hát vào <strong className="text-tea-800 dark:text-zinc-200">Thanh Tìm Nhạc ở trên đầu trang (Topbar)</strong> để thêm bài vào hàng chờ nhé!
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
