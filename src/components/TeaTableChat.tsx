import React, { useEffect, useRef, useState } from 'react';
import { Send, Users, MessageCircle, VolumeX, Sparkles, Crown } from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export const TeaTableChat: React.FC = () => {
  const messages = useRoomStore((s) => s.messages);
  const onlineUsers = useRoomStore((s) => s.onlineUsers);
  const profile = useRoomStore((s) => s.profile);
  const hostControl = useRoomStore((s) => s.hostControl);
  const isHost = Boolean(
    hostControl.hostClientId &&
      (profile?.clientId || localStorage.getItem('tearoom_client_id')) === hostControl.hostClientId
  );
  const transferHost = useRoomStore((s) => s.transferHost);
  const sendChatMessage = useRoomStore((s) => s.sendChatMessage);

  const [text, setText] = useState('');
  const [showGuests, setShowGuests] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    sendChatMessage(text.trim());
    setText('');
  };

  return (
    <div className="flex flex-col h-[560px] lg:h-[calc(100vh-140px)] min-h-[520px] rounded-3xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-tea-200 dark:border-zinc-800 shadow-lg overflow-hidden transition-colors duration-200">
      {/* Header */}
      <div className="p-4 border-b border-tea-200/80 dark:border-zinc-800 bg-tea-50/70 dark:bg-zinc-900 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-2xl bg-matcha-100 dark:bg-emerald-950 text-matcha-700 dark:text-emerald-400 flex items-center justify-center">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-serif text-base font-bold text-tea-900 dark:text-white leading-tight">
              Bàn Trà Trò Chuyện
            </h3>
            <p className="text-[11px] text-tea-600 dark:text-zinc-400">
              {onlineUsers.length} khách đang thưởng trà
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowGuests((v) => !v)}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition ${
            showGuests
              ? 'bg-matcha-600 dark:bg-emerald-600 text-white border-matcha-600 dark:border-emerald-500'
              : 'bg-white dark:bg-zinc-800 text-tea-800 dark:text-zinc-200 border-tea-200 dark:border-zinc-700 hover:bg-tea-100 dark:hover:bg-zinc-700'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Khách ({onlineUsers.length})</span>
        </button>
      </div>

      {/* Collapsible Online Guests List */}
      {showGuests && (
        <div className="p-3 bg-tea-100/60 dark:bg-zinc-800/80 border-b border-tea-200 dark:border-zinc-800 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-tea-600 dark:text-zinc-400">
              Danh sách khách trong phòng trà
            </span>
            {isHost && onlineUsers.length > 1 && (
              <span className="text-[10px] text-amber-800 dark:text-amber-300 font-medium">
                Bấm 👑 cạnh tên để nhường Chủ Phòng
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {onlineUsers.map((u) => {
              const isMe = u.clientId === profile?.clientId;
              const isUserHost = u.clientId === hostControl.hostClientId;
              return (
                <div
                  key={u.clientId}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${
                    isUserHost
                      ? 'bg-amber-100 dark:bg-amber-950/80 border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-200 font-semibold'
                      : isMe
                      ? 'bg-matcha-100 dark:bg-emerald-950/80 border-matcha-300 dark:border-emerald-700 text-matcha-800 dark:text-emerald-200 font-semibold'
                      : 'bg-white dark:bg-zinc-900 border-tea-200 dark:border-zinc-700 text-tea-800 dark:text-zinc-200'
                  }`}
                >
                  {isUserHost && <Crown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />}
                  <span>{u.avatar}</span>
                  <span>{u.nickname}</span>
                  {isMe && <span className="text-[10px] opacity-75">(Bạn)</span>}
                  {u.isMuted && (
                    <span title="Đang tắt tiếng trên máy cá nhân">
                      <VolumeX className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    </span>
                  )}
                  {isHost && !isMe && (
                    <button
                      type="button"
                      onClick={() => transferHost(u.clientId)}
                      className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-200/80 dark:bg-amber-900 hover:bg-amber-500 text-amber-900 dark:text-amber-100 hover:text-white text-[10px] font-semibold transition"
                      title={`Nhường quyền Chủ Phòng cho ${u.nickname}`}
                    >
                      👑 Nhường
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Messages Stream */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-tea-500 dark:text-zinc-400 px-4">
            <span className="text-3xl mb-2">🫖</span>
            <p className="text-xs font-medium">
              Bàn trà đã sẵn sàng. Gửi lời chào đầu tiên tới mọi người nhé!
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.type === 'system') {
              return (
                <div key={msg.id} className="flex justify-center">
                  <span className="px-3 py-1 rounded-full bg-tea-100/80 dark:bg-zinc-800 border border-tea-200/70 dark:border-zinc-700 text-[11px] text-tea-700 dark:text-zinc-300 text-center">
                    {msg.content}
                  </span>
                </div>
              );
            }

            if (msg.type === 'dedication') {
              return (
                <div
                  key={msg.id}
                  className="p-3 rounded-2xl bg-gradient-to-r from-amber-50 to-matcha-50 dark:from-amber-950/40 dark:to-emerald-950/40 border border-amber-200/80 dark:border-amber-800/60 text-xs text-tea-900 dark:text-zinc-100 shadow-sm flex items-start gap-2"
                >
                  <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed">{msg.content}</span>
                </div>
              );
            }

            const isMe = msg.clientId === profile?.clientId;
            const isSenderHost = msg.clientId === hostControl.hostClientId;
            return (
              <div
                key={msg.id}
                className={`flex items-start gap-2.5 ${isMe ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className="w-8 h-8 rounded-2xl bg-tea-100 dark:bg-zinc-800 border border-tea-200 dark:border-zinc-700 flex items-center justify-center text-base shrink-0 shadow-sm"
                  title={msg.nickname}
                >
                  {msg.avatar}
                </div>

                <div className={`max-w-[78%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-1.5 mb-0.5 px-1">
                    {isSenderHost && <Crown className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
                    <span className="text-[11px] font-semibold text-tea-700 dark:text-zinc-300">
                      {msg.nickname}
                    </span>
                    <span className="text-[10px] text-tea-400 dark:text-zinc-500">
                      {formatTime(msg.createdAt)}
                    </span>
                  </div>

                  <div
                    className={`px-3.5 py-2 rounded-2xl text-xs sm:text-sm leading-relaxed break-words shadow-sm ${
                      isMe
                        ? 'bg-matcha-600 dark:bg-emerald-600 text-white rounded-tr-none'
                        : 'bg-tea-50 dark:bg-zinc-800 border border-tea-200 dark:border-zinc-700 text-tea-900 dark:text-zinc-100 rounded-tl-none'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Chat Input */}
      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-tea-200/80 dark:border-zinc-800 bg-tea-50/70 dark:bg-zinc-900 flex items-center gap-2"
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nhâm nhi tách trà và nhắn đôi lời..."
          maxLength={260}
          className="flex-1 px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-800 border border-tea-200 dark:border-zinc-700 text-xs sm:text-sm text-tea-900 dark:text-zinc-100 placeholder-tea-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-matcha-500 dark:focus:ring-emerald-500 transition"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="p-2.5 rounded-2xl bg-matcha-600 dark:bg-emerald-600 hover:bg-matcha-700 dark:hover:bg-emerald-500 disabled:opacity-40 text-white shadow-sm transition shrink-0"
          title="Gửi tin nhắn"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
