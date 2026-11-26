import React, { useEffect } from 'react';
import { Coffee, Wifi, WifiOff, UserCheck, ShieldAlert, X, Sun, Moon, Sparkles, RefreshCw } from 'lucide-react';
import { useRoomStore } from './store/useRoomStore.ts';
import { WelcomeModal } from './components/WelcomeModal.tsx';
import { TopSearchBar } from './components/TopSearchBar.tsx';
import { StagePlayer } from './components/StagePlayer.tsx';
import { OrderCounter } from './components/OrderCounter.tsx';
import { TeaTableChat } from './components/TeaTableChat.tsx';

export const App: React.FC = () => {
  const initSocket = useRoomStore((s) => s.initSocket);
  const isConnected = useRoomStore((s) => s.isConnected);
  const profile = useRoomStore((s) => s.profile);
  const onlineUsers = useRoomStore((s) => s.onlineUsers);
  const setProfileModalOpen = useRoomStore((s) => s.setProfileModalOpen);
  const warningBanner = useRoomStore((s) => s.warningBanner);
  const clearWarning = useRoomStore((s) => s.clearWarning);
  const theme = useRoomStore((s) => s.theme);
  const toggleTheme = useRoomStore((s) => s.toggleTheme);
  const hasNewVersionAvailable = useRoomStore((s) => s.hasNewVersionAvailable);
  const dismissUpdateBanner = useRoomStore((s) => s.dismissUpdateBanner);

  useEffect(() => {
    initSocket();
  }, [initSocket]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <div className="min-h-screen flex flex-col text-tea-900 dark:text-zinc-100 transition-colors duration-200">
      {/* Welcome / Profile Modal */}
      <WelcomeModal />

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-tea-50/90 dark:bg-zinc-950/90 backdrop-blur-md border-b border-tea-200/80 dark:border-zinc-800 px-4 sm:px-8 py-3 transition-colors duration-200">
        <div className="max-w-7xl mx-auto flex flex-wrap md:flex-nowrap items-center justify-between gap-3">
          {/* Brand Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-10 h-10 rounded-2xl bg-matcha-600 dark:bg-emerald-600 text-white flex items-center justify-center shadow-sm">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif text-lg sm:text-xl font-bold text-tea-900 dark:text-white">
                  Tiệm Trà Acoustic
                </span>
              </div>
              <p className="text-[11px] text-tea-600 dark:text-zinc-400 hidden xl:block">
                Thưởng trà & nghe nhạc cùng nhau
              </p>
            </div>
          </div>

          {/* Center Topbar Search Input */}
          <div className="order-3 md:order-2 w-full md:w-auto md:flex-1 md:mx-4">
            <TopSearchBar />
          </div>

          {/* Right Status, Theme Toggle & Profile Pill */}
          <div className="order-2 md:order-3 flex items-center gap-2 shrink-0">
            {/* Theme Toggle Button (Light / Dark Mode) */}
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white dark:bg-zinc-800 hover:bg-tea-100 dark:hover:bg-zinc-700 border border-tea-200 dark:border-zinc-700 shadow-sm text-xs font-semibold text-tea-900 dark:text-zinc-100 transition"
              title={theme === 'light' ? 'Bấm để chuyển sang Giao diện Tối (Dark Mode)' : 'Bấm để chuyển sang Giao diện Sáng (Light Mode)'}
            >
              {theme === 'light' ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-tea-700" />
                  <span className="hidden sm:inline">Chế độ Tối</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline text-amber-300">Chế độ Sáng</span>
                </>
              )}
            </button>

            {/* Connection status badge */}
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
                isConnected
                  ? 'bg-matcha-50 dark:bg-emerald-950/70 border-matcha-200 dark:border-emerald-800 text-matcha-700 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/70 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
              }`}
            >
              {isConnected ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-matcha-600 dark:text-emerald-400" />
                  <span className="hidden sm:inline">Online</span>
                  <span className="font-bold">({onlineUsers.length})</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-rose-500" />
                  <span>Đang nối...</span>
                </>
              )}
            </div>

            {/* User Profile Button */}
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white dark:bg-zinc-800 hover:bg-tea-100 dark:hover:bg-zinc-700 border border-tea-200 dark:border-zinc-700 shadow-sm text-xs font-semibold text-tea-900 dark:text-zinc-100 transition"
              title="Đổi biệt danh hoặc biểu tượng đại diện"
            >
              <span className="text-base">{profile?.avatar || '🍵'}</span>
              <span className="max-w-[100px] truncate">
                {profile?.nickname || 'Chọn tên'}
              </span>
              <UserCheck className="w-3.5 h-3.5 text-tea-500 dark:text-zinc-400" />
            </button>
          </div>
        </div>
      </header>

      {/* Non-intrusive New Version Available Toast (Never auto-reloads; user reloads whenever they want!) */}
      {hasNewVersionAvailable && (
        <div className="fixed bottom-5 left-5 z-50 max-w-sm rounded-2xl bg-matcha-50 dark:bg-zinc-900 border-2 border-matcha-400 dark:border-emerald-600 shadow-2xl p-3.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-matcha-600 dark:bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-tea-900 dark:text-white">
              Tiệm Trà vừa có bản cập nhật mới!
            </div>
            <p className="text-[11px] text-tea-600 dark:text-zinc-400 leading-snug mt-0.5">
              Bạn vẫn có thể nghe nhạc bình thường, hoặc bấm tải lại để dùng tính năng mới.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 rounded-xl bg-matcha-600 dark:bg-emerald-600 hover:bg-matcha-700 dark:hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 shadow-sm transition"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Tải lại</span>
            </button>
            <button
              type="button"
              onClick={dismissUpdateBanner}
              className="p-1 rounded-lg text-tea-500 dark:text-zinc-400 hover:text-tea-900 dark:hover:text-white transition"
              title="Để sau"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Anti-Spam / Security Toast Notification */}
      {warningBanner && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-2xl bg-amber-50 dark:bg-zinc-900 border-2 border-amber-400 dark:border-amber-500 shadow-xl p-3.5 flex items-start gap-2.5 animate-bounce">
          <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs font-medium text-amber-950 dark:text-zinc-100 flex-1">
            {warningBanner}
          </div>
          <button
            type="button"
            onClick={clearWarning}
            className="text-amber-600 hover:text-amber-900 dark:text-zinc-400 dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Content Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 7 Columns: Stage Vinyl Player & Queue Counter */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-6">
            <StagePlayer />
            <OrderCounter />
          </div>

          {/* Right 5 Columns: Tea Table Live Chat & Online Guests */}
          <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-20">
            <TeaTableChat />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
