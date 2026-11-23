import React, { useEffect, useRef, useState } from 'react';
import {
  Search,
  Plus,
  Loader2,
  MessageSquareHeart,
  X,
  Sparkles,
  Music,
} from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';
import { SearchResultItem } from '../../shared/types.ts';

const SUGGESTED_KEYWORDS = [
  'Acoustic Chill Việt Nam',
  'Lofi Hip Hop Chill',
  'Đen Vâu Chill',
  'Vũ Acoustic',
  'Nhạc Không Lời Quán Cà Phê',
];

export const TopSearchBar: React.FC = () => {
  const queue = useRoomStore((s) => s.queue);
  const playback = useRoomStore((s) => s.playback);
  const addTrackToQueue = useRoomStore((s) => s.addTrackToQueue);

  const [searchQuery, setSearchQuery] = useState('');
  const [dedicationNote, setDedicationNote] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const clientSearchCacheRef = useRef<Map<string, SearchResultItem[]>>(new Map());

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = async (queryText: string, signal?: AbortSignal) => {
    const trimmed = queryText.trim();
    if (!trimmed) {
      setSearchResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    const cacheKey = trimmed.toLowerCase();
    const cached = clientSearchCacheRef.current.get(cacheKey);
    if (cached) {
      setSearchResults(cached);
      setIsSearching(false);
      setSearchError(null);
      setIsOpen(true);
      return;
    }

    setIsOpen(true);
    setIsSearching(true);
    setSearchError(null);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal });
      const data = await res.json();
      if (signal?.aborted) return;

      if (!res.ok) {
        setSearchError(data.error || 'Lỗi khi tìm kiếm bài hát.');
        setSearchResults([]);
      } else {
        const list = data.results || [];
        clientSearchCacheRef.current.set(cacheKey, list);
        setSearchResults(list);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setSearchError('Không kết nối được tới máy chủ tìm kiếm.');
    } finally {
      if (!signal?.aborted) {
        setIsSearching(false);
      }
    }
  };

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      abortControllerRef.current?.abort();
      setSearchResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    const cacheKey = trimmed.toLowerCase();
    const cached = clientSearchCacheRef.current.get(cacheKey);
    if (cached) {
      setSearchResults(cached);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      performSearch(trimmed, controller.signal);
    }, 150);

    return () => {
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    performSearch(trimmed, controller.signal);
  };

  const handleOrderTrack = (item: SearchResultItem) => {
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

  return (
    <div ref={containerRef} className="relative flex-1 max-w-2xl mx-auto w-full">
      {/* Main Top Search Input Form */}
      <form
        onSubmit={handleSearchSubmit}
        className="relative flex items-center w-full"
      >
        <div className="relative flex items-center w-full rounded-2xl bg-white dark:bg-zinc-900 border-2 border-tea-300 dark:border-zinc-700 focus-within:border-matcha-600 dark:focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-matcha-100 dark:focus-within:ring-emerald-950/60 shadow-sm transition-colors">
          {isSearching ? (
            <Loader2 className="w-4 h-4 text-matcha-600 dark:text-emerald-400 ml-3.5 shrink-0 animate-spin" />
          ) : (
            <Search className="w-4 h-4 text-tea-500 dark:text-zinc-400 ml-3.5 shrink-0" />
          )}

          <input
            type="text"
            value={searchQuery}
            onFocus={() => setIsOpen(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsOpen(true);
            }}
            placeholder="Gõ tới đâu hiện nhạc tới đó (tên bài hát, ca sĩ hoặc link YouTube)..."
            maxLength={120}
            className="w-full px-3 py-2.5 bg-transparent text-xs sm:text-sm text-tea-900 dark:text-zinc-100 placeholder-tea-400 dark:placeholder-zinc-500 focus:outline-none"
          />

          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                abortControllerRef.current?.abort();
                setSearchQuery('');
                setSearchResults([]);
                setIsSearching(false);
              }}
              className="mr-2 p-1.5 rounded-xl text-tea-400 dark:text-zinc-400 hover:text-tea-700 dark:hover:text-white hover:bg-tea-100 dark:hover:bg-zinc-800 transition"
              title="Xóa từ khóa"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>

      {/* Dropdown Search Popover */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-3xl bg-white dark:bg-zinc-900 border-2 border-tea-200 dark:border-zinc-700 shadow-2xl p-4 sm:p-5 overflow-hidden transition-colors">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-bold text-tea-800 dark:text-zinc-100 flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5 text-matcha-600 dark:text-emerald-400" />
              <span>
                {searchQuery.trim()
                  ? `Kết quả tìm kiếm cho "${searchQuery.trim()}"`
                  : 'Quầy Tìm & Order Bài Hát Nhanh'}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-xs text-tea-500 dark:text-zinc-400 hover:text-tea-800 dark:hover:text-white px-2 py-0.5 rounded-lg hover:bg-tea-100 dark:hover:bg-zinc-800 transition"
            >
              Đóng ✕
            </button>
          </div>

          {/* Optional Dedication Message Input inside dropdown */}
          <div className="relative mb-3">
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

          {/* Suggested Keywords Chips */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3 pb-3 border-b border-tea-100 dark:border-zinc-800">
            <span className="text-[11px] text-tea-500 dark:text-zinc-400 font-semibold flex items-center gap-1 mr-1">
              <Sparkles className="w-3 h-3 text-amber-500" /> Gợi ý:
            </span>
            {SUGGESTED_KEYWORDS.map((kw) => (
              <button
                key={kw}
                type="button"
                onClick={() => {
                  setSearchQuery(kw);
                }}
                className="px-2.5 py-1 rounded-full bg-tea-100/80 dark:bg-zinc-800 hover:bg-matcha-100 dark:hover:bg-emerald-950 text-[11px] font-medium text-tea-800 dark:text-zinc-200 hover:text-matcha-800 dark:hover:text-emerald-300 border border-transparent dark:border-zinc-700 transition"
              >
                {kw}
              </button>
            ))}
          </div>

          {/* Results Area */}
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {searchError && (
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {searchError}
              </div>
            )}

            {isSearching && searchResults.length === 0 ? (
              <div className="py-10 text-center text-tea-600 dark:text-zinc-400 flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-matcha-600 dark:text-emerald-400" />
                <span className="text-xs font-medium">Đang tìm giai điệu cho bạn...</span>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="py-8 text-center rounded-2xl bg-tea-50/60 dark:bg-zinc-800/50 border border-dashed border-tea-200 dark:border-zinc-700">
                <p className="text-xs text-tea-600 dark:text-zinc-400">
                  {searchQuery.trim()
                    ? 'Không tìm thấy bài hát phù hợp, bạn thử từ khóa khác nhé!'
                    : 'Chỉ cần gõ vài chữ cái đầu của bài hát hoặc ca sĩ, kết quả sẽ tự động hiện ra ngay!'}
                </p>
              </div>
            ) : (
              searchResults.map((item) => {
                const isAdded =
                  justAddedId === item.videoId ||
                  queue.some((q) => q.videoId === item.videoId) ||
                  playback.currentTrack?.videoId === item.videoId;

                return (
                  <div
                    key={item.videoId}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-tea-50/70 dark:bg-zinc-800/70 hover:bg-tea-100/70 dark:hover:bg-zinc-800 border border-tea-200/80 dark:border-zinc-700 transition"
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
                        <div className="flex items-center gap-2 text-[11px] text-tea-600 dark:text-zinc-400 mt-0.5">
                          <span className="truncate">{item.author}</span>
                          <span>•</span>
                          <span className="px-1.5 py-0.2 rounded bg-white dark:bg-zinc-900 text-tea-800 dark:text-zinc-300 font-medium border border-tea-200/60 dark:border-zinc-700">
                            {item.durationText}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isAdded}
                      onClick={() => handleOrderTrack(item)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 transition ${
                        isAdded
                          ? 'bg-matcha-100 dark:bg-emerald-950 text-matcha-700 dark:text-emerald-300 cursor-default'
                          : 'bg-matcha-600 dark:bg-emerald-600 hover:bg-matcha-700 dark:hover:bg-emerald-500 text-white shadow-sm'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isAdded ? 'Đã trong danh sách' : 'Order bài'}</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
