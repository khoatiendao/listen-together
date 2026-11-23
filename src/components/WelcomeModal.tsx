import React, { useState } from 'react';
import { Coffee, Sparkles, Check } from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';

const TEA_AVATARS = [
  { emoji: '🍵', name: 'Trà Matcha' },
  { emoji: '🧋', name: 'Trà Sữa' },
  { emoji: '🫖', name: 'Ấm Trà Cổ' },
  { emoji: '🎸', name: 'Guitar Acoustic' },
  { emoji: '🐱', name: 'Mèo Nghe Nhạc' },
  { emoji: '🌿', name: 'Lá Bạc Hà' },
  { emoji: '🥐', name: 'Bánh Sừng Bò' },
  { emoji: '🌻', name: 'Hướng Dương' },
  { emoji: '🎧', name: 'Lo-fi Chill' },
  { emoji: '🦊', name: 'Cáo Nhỏ' },
  { emoji: '🍰', name: 'Bánh Ngọt' },
  { emoji: '💿', name: 'Đĩa Than' },
];

export const WelcomeModal: React.FC = () => {
  const isProfileModalOpen = useRoomStore((s) => s.isProfileModalOpen);
  const profile = useRoomStore((s) => s.profile);
  const saveProfile = useRoomStore((s) => s.saveProfile);
  const setProfileModalOpen = useRoomStore((s) => s.setProfileModalOpen);

  const [nickname, setNickname] = useState(profile?.nickname || '');
  const [selectedAvatar, setSelectedAvatar] = useState(profile?.avatar || '🍵');

  if (!isProfileModalOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) return;
    saveProfile(nickname.trim(), selectedAvatar);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-3xl bg-tea-50 dark:bg-zinc-900 border-2 border-tea-200 dark:border-zinc-700 shadow-2xl p-6 sm:p-8 overflow-hidden transition-colors">
        {/* Decorative ticket punch holes */}
        <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-tea-900/30 dark:bg-black/60 border border-tea-200 dark:border-zinc-700" />
        <div className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-tea-900/30 dark:bg-black/60 border border-tea-200 dark:border-zinc-700" />

        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-matcha-100 dark:bg-emerald-950 text-matcha-600 dark:text-emerald-400 flex items-center justify-center shadow-inner">
            <Coffee className="w-6 h-6" />
          </div>
          <div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-matcha-600 dark:text-emerald-400 bg-matcha-100 dark:bg-emerald-950 px-2.5 py-0.5 rounded-full">
              <Sparkles className="w-3 h-3" /> Vé Vào Cửa Tự Do
            </span>
            <h2 className="font-serif text-2xl font-bold text-tea-900 dark:text-white">
              Tiệm Trà Acoustic
            </h2>
          </div>
        </div>

        <p className="text-sm text-tea-700 dark:text-zinc-300 mb-6 leading-relaxed">
          Chọn một biệt danh thân thương và biểu tượng đại diện để cùng mọi người thưởng trà, yêu cầu bài hát và trò chuyện nhé!
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-tea-700 dark:text-zinc-400 mb-2">
              Biệt danh của bạn
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="VD: Minh Acoustic, Lan Trà Đào..."
              maxLength={26}
              autoFocus
              required
              className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-zinc-800 border border-tea-300 dark:border-zinc-700 text-tea-900 dark:text-white placeholder-tea-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-matcha-500 dark:focus:ring-emerald-500 focus:border-transparent transition shadow-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-tea-700 dark:text-zinc-400 mb-2">
              Chọn biểu tượng bàn trà
            </label>
            <div className="grid grid-cols-6 gap-2">
              {TEA_AVATARS.map((item) => {
                const active = selectedAvatar === item.emoji;
                return (
                  <button
                    key={item.emoji}
                    type="button"
                    onClick={() => setSelectedAvatar(item.emoji)}
                    title={item.name}
                    className={`relative flex flex-col items-center justify-center p-2.5 rounded-2xl border text-2xl transition-all ${
                      active
                        ? 'bg-matcha-100 dark:bg-emerald-950 border-matcha-500 dark:border-emerald-500 scale-105 shadow-sm'
                        : 'bg-white dark:bg-zinc-800 border-tea-200 dark:border-zinc-700 hover:bg-tea-100 dark:hover:bg-zinc-700'
                    }`}
                  >
                    <span>{item.emoji}</span>
                    {active && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-matcha-600 dark:bg-emerald-500 text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            {profile && (
              <button
                type="button"
                onClick={() => setProfileModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-tea-700 dark:text-zinc-300 hover:bg-tea-100 dark:hover:bg-zinc-800 transition"
              >
                Đóng
              </button>
            )}
            <button
              type="submit"
              disabled={!nickname.trim()}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-matcha-600 dark:bg-emerald-600 hover:bg-matcha-700 dark:hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm shadow-md hover:shadow-lg transition flex items-center justify-center gap-2"
            >
              <span>Bước Vào Phòng Trà</span>
              <span>🍵</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
