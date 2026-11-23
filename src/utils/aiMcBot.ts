/**
 * AI MC Voice Bot for Tiệm Trà Acoustic
 * Speaks Vietnamese announcements when a new track starts playing,
 * automatically ducking background music volume while speaking.
 */

let currentAudio: HTMLAudioElement | null = null;
let cancelToken = 0;

function splitTextForTts(text: string, maxLen = 170): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];

  const chunks: string[] = [];
  let remaining = cleaned;
  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf('.', maxLen);
    if (splitAt < 40) splitAt = remaining.lastIndexOf(',', maxLen);
    if (splitAt < 40) splitAt = remaining.lastIndexOf(' ', maxLen);
    if (splitAt < 20) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt + 1).trim());
    remaining = remaining.slice(splitAt + 1).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function stopAiMcSpeech(): void {
  cancelToken += 1;
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.src = '';
    } catch {
      // ignore
    }
    currentAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

function cleanTrackTitleForSpeech(title: string): string {
  return title
    .replace(/\[.*?\]/g, ' ') // Remove [Official MV], [Lyrics], etc.
    .replace(/\((?:official|mv|music video|audio|lyrics|lyric video|hd|4k|prod\.?[^)]*)\)/gi, ' ')
    .replace(/\|.*$/g, ' ') // Remove trailing "| Official Music Video" after pipe
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildDonateRequestScript(
  nickname: string,
  message: string
): string {
  const cleanUser = (nickname || 'một vị khách').trim();
  const cleanMsg = (message || '').trim();
  return `Cảm ơn ${cleanUser} vừa gửi lời nhắn phát thanh: ${cleanMsg}`;
}

export function buildTrackAnnouncementScript(
  requestedBy: string,
  title: string,
  author: string,
  dedicationMessage?: string
): string {
  const cleanUser = (requestedBy || 'một vị khách').trim();
  const cleanTitle = cleanTrackTitleForSpeech(title || '') || title || 'một giai điệu mới';
  const cleanAuthor = (author || '').replace(/-\s*Topic$/i, '').replace(/Official$/i, '').trim();
  const cleanNote = (dedicationMessage || '').trim();

  // Avoid repeating author if the YouTube title already includes the artist's name
  const titleAlreadyHasAuthor =
    cleanAuthor && cleanTitle.toLowerCase().includes(cleanAuthor.toLowerCase());
  const songPhrase =
    cleanAuthor && !titleAlreadyHasAuthor
      ? `${cleanTitle}, thể hiện bởi ${cleanAuthor}`
      : cleanTitle;

  if (cleanNote) {
    return `Bài tiếp theo là bài ${songPhrase}, của ${cleanUser} đã order, kèm lời nhắn: ${cleanNote}`;
  }
  return `Bài tiếp theo là bài ${songPhrase}, của ${cleanUser} đã order.`;
}

async function playAudioChunk(text: string, volume: number, token: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (token !== cancelToken) {
      resolve(false);
      return;
    }

    const audio = new Audio(`/api/tts?text=${encodeURIComponent(text)}`);
    audio.volume = Math.max(0.2, Math.min(1, volume));
    currentAudio = audio;

    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null;
      resolve(true);
    };
    audio.onerror = () => {
      if (currentAudio === audio) currentAudio = null;
      resolve(false);
    };

    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        if (currentAudio === audio) currentAudio = null;
        resolve(false);
      });
    }
  });
}

function speakWithBrowserFallback(text: string, volume: number, token: number): Promise<void> {
  return new Promise((resolve) => {
    if (token !== cancelToken || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'vi-VN';
      utter.rate = 0.96;
      utter.pitch = 1.02;
      utter.volume = Math.max(0.2, Math.min(1, volume));

      const voices = window.speechSynthesis.getVoices();
      const viVoice = voices.find((v) => v.lang.toLowerCase().startsWith('vi'));
      if (viVoice) {
        utter.voice = viVoice;
      }

      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      window.speechSynthesis.speak(utter);
    } catch {
      resolve();
    }
  });
}

export async function speakAiMcAnnouncement(options: {
  script: string;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
}): Promise<void> {
  stopAiMcSpeech();
  const myToken = cancelToken;
  const vol = options.volume ?? 0.9;
  const chunks = splitTextForTts(options.script, 170);
  if (chunks.length === 0) return;

  options.onStart?.();

  try {
    let allSucceeded = true;
    for (const chunk of chunks) {
      if (myToken !== cancelToken) break;
      const ok = await playAudioChunk(chunk, vol, myToken);
      if (!ok) {
        allSucceeded = false;
        break;
      }
    }

    // Fallback to browser Web Speech API if proxy TTS failed
    if (!allSucceeded && myToken === cancelToken) {
      await speakWithBrowserFallback(options.script, vol, myToken);
    }
  } finally {
    if (myToken === cancelToken) {
      options.onEnd?.();
    }
  }
}
