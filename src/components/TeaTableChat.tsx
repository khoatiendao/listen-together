import React, { useMemo, useRef, useState } from 'react';
import {
  Send,
  Users,
  MessageCircle,
  VolumeX,
  Sparkles,
  Crown,
  Reply,
  X,
  CornerDownRight,
  AtSign,
} from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';
import { ChatMessage, ChatReplyQuote, UserProfile } from '../../shared/types.ts';

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

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  const [replyingTo, setReplyingTo] = useState<ChatReplyQuote | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [showGuests, setShowGuests] = useState(false);

  // @Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState<number>(-1);
  const [selectedMentionIdx, setSelectedMentionIdx] = useState<number>(0);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastSubmittedAtRef = useRef<number>(0);

  const adjustTextareaHeight = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    if (!el.value) {
      el.style.height = '40px';
      el.style.overflowY = 'hidden';
      return;
    }
    el.style.height = '40px';
    const nextHeight = Math.min(Math.max(el.scrollHeight, 40), 116);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > 116 ? 'auto' : 'hidden';
  };

  // Build list of known nicknames (from online users + recent messages) for @mention highlighting & autocomplete
  const mentionableUsers = useMemo<UserProfile[]>(() => {
    const map = new Map<string, UserProfile>();
    // Add special @all option
    map.set('all', {
      clientId: 'all',
      nickname: 'all',
      avatar: '📢',
    });
    for (const u of onlineUsers) {
      if (u.nickname && u.nickname !== 'Khách Mới') {
        map.set(u.clientId, u);
      }
    }
    return Array.from(map.values());
  }, [onlineUsers]);

  const filteredMentions = useMemo<UserProfile[]>(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase().trim();
    return mentionableUsers.filter((u) => {
      if (!q) return true;
      return u.nickname.toLowerCase().includes(q);
    });
  }, [mentionQuery, mentionableUsers]);

  const knownNicknamesForHighlight = useMemo<string[]>(() => {
    const names = new Set<string>(['all', 'mọi người']);
    for (const u of onlineUsers) {
      if (u.nickname) names.add(u.nickname);
    }
    for (const m of messages) {
      if (m.nickname && m.type === 'user') names.add(m.nickname);
    }
    // Sort longest first so multi-word names match before shorter prefixes
    return Array.from(names).sort((a, b) => b.length - a.length);
  }, [onlineUsers, messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Swallow trailing macOS Vietnamese IME composition commit that fires within 80ms after hitting Enter
    if (Date.now() - lastSubmittedAtRef.current < 80) {
      e.target.value = '';
      setText('');
      adjustTextareaHeight(e.target);
      return;
    }

    const val = e.target.value;
    setText(val);
    adjustTextareaHeight(e.target);

    const cursorPos = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtPos = textBeforeCursor.lastIndexOf('@');

    if (lastAtPos !== -1) {
      const charBeforeAt = lastAtPos > 0 ? textBeforeCursor[lastAtPos - 1] : ' ';
      // Only trigger @mention if '@' is at start of message or preceded by whitespace
      if (/\s/.test(charBeforeAt)) {
        const queryAfterAt = textBeforeCursor.slice(lastAtPos + 1);
        // Stop autocomplete if user typed a newline or more than 25 chars after @
        if (queryAfterAt.length <= 25 && !queryAfterAt.includes('  ') && !queryAfterAt.includes('\n')) {
          setMentionStartIndex(lastAtPos);
          setMentionQuery(queryAfterAt);
          setSelectedMentionIdx(0);
          return;
        }
      }
    }

    setMentionQuery(null);
    setMentionStartIndex(-1);
  };

  const insertMention = (user: UserProfile) => {
    if (mentionStartIndex === -1) return;
    const cursorPos = inputRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, mentionStartIndex);
    const after = text.slice(cursorPos);
    const inserted = `@${user.nickname} `;
    const nextText = `${before}${inserted}${after}`;

    setText(nextText);
    setMentionQuery(null);
    setMentionStartIndex(-1);

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        adjustTextareaHeight(inputRef.current);
        const newCursor = before.length + inserted.length;
        inputRef.current.setSelectionRange(newCursor, newCursor);
      }
    }, 10);
  };

  const handleSelectReply = (msg: ChatMessage) => {
    setReplyingTo({
      id: msg.id,
      nickname: msg.nickname,
      avatar: msg.avatar,
      content: msg.content,
    });
    setTimeout(() => {
      inputRef.current?.focus();
    }, 30);
  };

  const handleJumpToQuotedMessage = (targetId: string) => {
    const el = document.getElementById(`chat-msg-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(targetId);
      setTimeout(() => {
        setHighlightedMsgId((prev) => (prev === targetId ? null : prev));
      }, 1800);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    // Prevent duplicate submit within 120ms (e.g. macOS IME firing two Enter keydowns)
    if (Date.now() - lastSubmittedAtRef.current < 120) {
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      setText('');
      return;
    }

    const currentVal = (inputRef.current ? inputRef.current.value : text).trim();
    if (!currentVal) return;

    lastSubmittedAtRef.current = Date.now();
    sendChatMessage(currentVal, replyingTo || undefined);

    setText('');
    setReplyingTo(null);
    setMentionQuery(null);

    if (inputRef.current) {
      // Blur & refocus immediately to flush macOS Vietnamese IME underline buffer ("đi", "rồi", etc.)
      inputRef.current.value = '';
      inputRef.current.blur();
      inputRef.current.focus();
      inputRef.current.style.height = '40px';
      inputRef.current.style.overflowY = 'hidden';
    }
  };

  /**
   * Renders message content with highlighted @Nickname tags (Facebook/Zalo style)
   */
  const renderFormattedContent = (content: string, isBubbleMine: boolean) => {
    if (!content.includes('@') || knownNicknamesForHighlight.length === 0) {
      return <span>{content}</span>;
    }

    const pattern = new RegExp(
      `(@(?:${knownNicknamesForHighlight.map(escapeRegExp).join('|')}))(?![\\p{L}\\p{N}_])`,
      'giu'
    );

    const parts = content.split(pattern);
    return (
      <>
        {parts.map((part, i) => {
          if (part.startsWith('@')) {
            const rawTagName = part.slice(1).toLowerCase();
            const isTaggingMe =
              (profile?.nickname && rawTagName === profile.nickname.toLowerCase()) ||
              rawTagName === 'all' ||
              rawTagName === 'mọi người';

            return (
              <span
                key={i}
                className={`inline-flex items-center px-1.5 py-0.2 mx-0.5 rounded-md font-bold ${
                  isBubbleMine
                    ? 'bg-white/25 text-white underline decoration-white/60'
                    : isTaggingMe
                    ? 'bg-amber-200 dark:bg-amber-500/30 text-amber-950 dark:text-amber-200 ring-1 ring-amber-400/60'
                    : 'bg-matcha-100 dark:bg-emerald-950/90 text-matcha-700 dark:text-emerald-300'
                }`}
              >
                {part}
              </span>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </>
    );
  };

  /**
   * Check if a message mentions the current user (@MyNickname or @all)
   */
  const isMessageTaggingMe = (msg: ChatMessage): boolean => {
    if (!msg.content.includes('@')) return false;
    const lower = msg.content.toLowerCase();
    if (lower.includes('@all') || lower.includes('@mọi người')) return true;
    if (profile?.nickname && lower.includes(`@${profile.nickname.toLowerCase()}`)) {
      return true;
    }
    return false;
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
              {onlineUsers.length} khách đang thưởng trà • Gõ <strong>@</strong> để tag tên
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
              Danh sách khách (Bấm vào tên để @Tag nhanh)
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
                  <button
                    type="button"
                    onClick={() => {
                      setText((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}@${u.nickname} `);
                      inputRef.current?.focus();
                    }}
                    className="inline-flex items-center gap-1 hover:underline"
                    title={`Bấm để tag @${u.nickname}`}
                  >
                    <span>{u.avatar}</span>
                    <span>{u.nickname}</span>
                  </button>
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
              Bàn trà đã sẵn sàng. Gửi lời chào đầu tiên hoặc gõ <strong>@</strong> để gọi bạn bè nhé!
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
            const isHighlighted = highlightedMsgId === msg.id;
            const taggedMe = !isMe && isMessageTaggingMe(msg);

            return (
              <div
                id={`chat-msg-${msg.id}`}
                key={msg.id}
                className={`group flex items-start gap-2.5 rounded-2xl transition-colors duration-300 ${
                  isMe ? 'flex-row-reverse' : ''
                } ${
                  isHighlighted
                    ? 'bg-amber-100/70 dark:bg-amber-950/50 p-1.5 -mx-1.5'
                    : taggedMe
                    ? 'bg-amber-50/70 dark:bg-amber-950/25 p-1.5 -mx-1.5 border border-amber-200/70 dark:border-amber-800/50'
                    : ''
                }`}
              >
                <div
                  className="w-8 h-8 rounded-2xl bg-tea-100 dark:bg-zinc-800 border border-tea-200 dark:border-zinc-700 flex items-center justify-center text-base shrink-0 shadow-sm"
                  title={msg.nickname}
                >
                  {msg.avatar}
                </div>

                <div className={`max-w-[80%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-1.5 mb-0.5 px-1">
                    {isSenderHost && <Crown className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
                    <span className="text-[11px] font-semibold text-tea-700 dark:text-zinc-300">
                      {msg.nickname}
                    </span>
                    {taggedMe && (
                      <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[9px] font-bold">
                        Nhắc đến bạn
                      </span>
                    )}
                    <span className="text-[10px] text-tea-400 dark:text-zinc-500">
                      {formatTime(msg.createdAt)}
                    </span>
                  </div>

                  <div className={`flex items-center gap-1.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                    {/* Message Bubble */}
                    <div
                      className={`px-3.5 py-2 rounded-2xl text-xs sm:text-sm leading-relaxed break-words shadow-sm ${
                        isMe
                          ? 'bg-matcha-600 dark:bg-emerald-600 text-white rounded-tr-none'
                          : 'bg-tea-50 dark:bg-zinc-800 border border-tea-200 dark:border-zinc-700 text-tea-900 dark:text-zinc-100 rounded-tl-none'
                      }`}
                    >
                      {msg.replyTo && (
                        <button
                          type="button"
                          onClick={() => handleJumpToQuotedMessage(msg.replyTo!.id)}
                          className={`mb-1.5 w-full text-left px-2.5 py-1.5 rounded-xl border-l-2 text-[11px] flex flex-col gap-0.5 transition ${
                            isMe
                              ? 'bg-black/15 hover:bg-black/25 border-white/80 text-white/95'
                              : 'bg-tea-100/80 dark:bg-zinc-900/80 hover:bg-tea-200/70 dark:hover:bg-zinc-900 border-matcha-600 dark:border-emerald-400 text-tea-800 dark:text-zinc-200'
                          }`}
                          title="Bấm để xem tin nhắn gốc"
                        >
                          <span className="font-bold flex items-center gap-1">
                            <CornerDownRight className="w-3 h-3 shrink-0 opacity-75" />
                            <span>{msg.replyTo.avatar}</span>
                            <span className="truncate">{msg.replyTo.nickname}</span>
                          </span>
                          <span className="line-clamp-1 opacity-85 italic">
                            {msg.replyTo.content}
                          </span>
                        </button>
                      )}
                      <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                        {renderFormattedContent(msg.content, isMe)}
                      </div>
                    </div>

                    {/* Reply Action Button */}
                    <button
                      type="button"
                      onClick={() => handleSelectReply(msg)}
                      className="opacity-70 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 rounded-xl bg-tea-100/80 dark:bg-zinc-800 hover:bg-tea-200 dark:hover:bg-zinc-700 text-tea-700 dark:text-zinc-300 transition shrink-0"
                      title={`Trả lời tin nhắn của ${msg.nickname}`}
                    >
                      <Reply className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* @Mention Autocomplete Popup Menu (Facebook / Zalo Group Style) */}
      {mentionQuery !== null && filteredMentions.length > 0 && (
        <div className="mx-3 mb-1 rounded-2xl bg-white dark:bg-zinc-800 border-2 border-tea-200 dark:border-zinc-700 shadow-xl overflow-hidden z-30">
          <div className="px-3 py-1.5 bg-tea-50 dark:bg-zinc-900 border-b border-tea-100 dark:border-zinc-700 flex items-center justify-between text-[11px] font-semibold text-tea-600 dark:text-zinc-400">
            <span className="flex items-center gap-1">
              <AtSign className="w-3 h-3 text-matcha-600 dark:text-emerald-400" />
              <span>Chọn thành viên để Tag tên (↑↓ hoặc Enter)</span>
            </span>
            <button
              type="button"
              onClick={() => setMentionQuery(null)}
              className="hover:text-tea-900 dark:hover:text-white"
            >
              Đóng ✕
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto divide-y divide-tea-100/60 dark:divide-zinc-700/50">
            {filteredMentions.map((u, idx) => {
              const isSelected = idx === selectedMentionIdx;
              const isAll = u.clientId === 'all';
              const isUserHost = u.clientId === hostControl.hostClientId;
              return (
                <button
                  key={u.clientId}
                  type="button"
                  onClick={() => insertMention(u)}
                  onMouseEnter={() => setSelectedMentionIdx(idx)}
                  className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between transition ${
                    isSelected
                      ? 'bg-matcha-100/90 dark:bg-emerald-950/90 text-matcha-900 dark:text-emerald-200 font-semibold'
                      : 'hover:bg-tea-50 dark:hover:bg-zinc-700/60 text-tea-900 dark:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base shrink-0">{u.avatar}</span>
                    <span className="truncate">
                      {isAll ? '@all (Nhắc tất cả mọi người)' : `@${u.nickname}`}
                    </span>
                  </div>
                  {isUserHost && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[10px] font-semibold">
                      <Crown className="w-3 h-3" /> Chủ phòng
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Reply Preview Banner above Input */}
      {replyingTo && (
        <div className="px-3.5 py-2 bg-tea-100/90 dark:bg-zinc-800/95 border-t border-tea-200 dark:border-zinc-700 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 text-xs">
            <Reply className="w-3.5 h-3.5 text-matcha-600 dark:text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-tea-900 dark:text-zinc-100 flex items-center gap-1">
                <span>Đang trả lời</span>
                <span>{replyingTo.avatar}</span>
                <span className="truncate">{replyingTo.nickname}</span>
              </div>
              <p className="text-[11px] text-tea-600 dark:text-zinc-400 truncate italic">
                "{replyingTo.content}"
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className="p-1 rounded-lg text-tea-500 dark:text-zinc-400 hover:text-tea-900 dark:hover:text-white hover:bg-tea-200/60 dark:hover:bg-zinc-700 transition shrink-0"
            title="Hủy trả lời"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Chat Input (Auto-wrapping & auto-expanding multi-line textarea) */}
      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-tea-200/80 dark:border-zinc-800 bg-tea-50/70 dark:bg-zinc-900 flex items-end gap-2"
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={handleInputChange}
          onKeyDown={(e) => {
            if (mentionQuery !== null && filteredMentions.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedMentionIdx((prev) => (prev + 1) % filteredMentions.length);
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedMentionIdx((prev) =>
                  prev - 1 < 0 ? filteredMentions.length - 1 : prev - 1
                );
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                insertMention(filteredMentions[selectedMentionIdx] || filteredMentions[0]);
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setMentionQuery(null);
                return;
              }
            } else {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
                return;
              }
              if (e.key === 'Escape' && replyingTo) {
                setReplyingTo(null);
              }
            }
          }}
          placeholder={
            replyingTo
              ? `Trả lời ${replyingTo.nickname}...`
              : 'Nhâm nhi tách trà, nhắn đôi lời...'
          }
          maxLength={260}
          style={{ height: '40px', overflowY: 'hidden' }}
          className="flex-1 px-4 py-2 rounded-2xl bg-white dark:bg-zinc-800 border border-tea-200 dark:border-zinc-700 text-xs sm:text-sm text-tea-900 dark:text-zinc-100 placeholder-tea-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-matcha-500 dark:focus:ring-emerald-500 transition-[border,box-shadow] resize-none leading-5 min-h-[40px] max-h-[116px]"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="h-10 w-10 rounded-2xl bg-matcha-600 dark:bg-emerald-600 hover:bg-matcha-700 dark:hover:bg-emerald-500 disabled:opacity-40 text-white shadow-sm transition flex items-center justify-center shrink-0"
          title="Gửi tin nhắn (Enter)"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
