# 🍵 Tiệm Trà Acoustic — Web Nghe Nhạc Cùng Nhau Real-time

**Tiệm Trà Acoustic** là ứng dụng web nghe nhạc chung theo thời gian thực (**Listen Together Real-time**) được thiết kế riêng cho các nhóm bạn bè hoặc phòng ban nội bộ. Không cần đăng ký tài khoản rườm rà, mọi người chỉ cần chọn một biệt danh cùng biểu tượng tách trà yêu thích là có thể bước vào phòng, cùng thưởng thức âm nhạc đồng bộ từng giây, order bài hát kèm lời nhắn, bình chọn và trò chuyện trực tiếp.

---

## ✨ Tính Năng Nổi Bật

### 1. 🎶 Đồng Bộ Nhạc Thời Gian Thực (Zero-Drift Real-time Sync)
- **Thuật toán NTP Clock Offset & Dead-Reckoning:** Tự động đo độ trễ đồng hồ giữa Client và Server để mọi thành viên trong phòng luôn nghe cùng một khoảnh khắc bài hát.
- **Mượt mà như Spotify Web:** Tích hợp cơ chế giữ luồng âm thanh chạy nền (*Web Audio Keep-Alive*) và dung sai chống khựng (*Anti-Stutter Drift Tolerance*), giúp nhạc phát liên tục không bị trình duyệt ngắt tiếng khi chuyển sang tab khác làm việc.
- **Chống Skip Nhầm Khi Có Người Mới Vào:** Khóa bảo vệ kép ở cả Client và Server đảm bảo người mới vào giữa bài hát không bao giờ làm gián đoạn hay skip nhầm bài đang phát của phòng.
- **2 Chế Độ Sân Khấu & Loa Cục Bộ:**
  - Chuyển đổi linh hoạt giữa **Chế độ Đĩa Than Acoustic xoay tròn** và **Chế độ Xem MV Gốc**.
  - Nút **Tắt tiếng / Chỉnh âm lượng cục bộ** trên từng máy (dành cho trường hợp cả phòng cùng nghe qua 1 loa chính và dùng máy cá nhân để order bài, chat, thả cảm xúc).

### 2. 👑 Chủ Phòng & Chế Độ Cầm Quyền (Strict Governance Mode)
- **Tự động trao quyền & Nhường Chủ Phòng:** Người đầu tiên vào phòng giữ vương miện **Chủ Phòng (`👑`)** và có thể nhường quyền cho bất kỳ thành viên nào đang online chỉ với 1 cú click.
- **Chế độ Cầm Quyền (Strict Mode):**
  - Khi Chủ phòng **BẬT Cầm Quyền**: Các thành viên bị khóa quyền tự ý Tạm dừng (Pause), Tua nhạc (Seek), Qua bài trực tiếp hoặc Xóa bài. Thành viên vẫn được **tự do tìm & thêm bài hát mới vào hàng chờ**.
  - **Cơ chế Dân Chủ (Vote Qua Bài & Vote Ưu Tiên):** Nếu muốn qua bài hoặc đẩy một bài hát lên vị trí ưu tiên `#1`, các thành viên sẽ bấm **Vote**. Khi đạt đủ số phiếu theo tỷ lệ phòng, một thông báo có chuông rung sẽ hiện lên sân khấu của Chủ phòng với 2 nút **`[Đồng Ý]`** / **`[Từ Chối]`**.

### 3. 🔍 Tìm Nhạc Siêu Tốc & Gợi Ý Bài Hát Trending Theo Cảm Xúc
- **Thanh Tìm Nhạc Topbar (Live Search-as-you-type):** Gõ tới đâu hiện kết quả tới đó chỉ sau `150ms` nhờ kết nối trực tiếp **YouTube InnerTube JSON API** kết hợp **Cache 2 tầng** (Client RAM + Server LRU Cache). Hỗ trợ cả tìm theo tên bài hát, ca sĩ hoặc dán link YouTube.
- **Khám Phá Nhạc Trending Theo Tâm Trạng (7 Moods):**
  - `🔥 Đang Thịnh Hành`, `☕ Cafe & Acoustic`, `☀️ Vui Tươi & Yêu Đời`, `🌧️ Buồn & Tâm Trạng`, `💻 Tập Trung Code`, `🎞️ Hồi Ức Thanh Xuân`, `⚡ Sôi Động & Quẩy`.
  - Tự động nạp sẵn (*Pre-warm*) và sắp xếp ưu tiên các bản Hit **nhiều triệu view / Top Trending** kèm nút **`🔄 Đổi gợi ý khác`**.
- **Gửi Lời Nhắn Đính Kèm Bài Hát (Đặc sản Phòng Trà):** Khi order bài, người dùng có thể ghi kèm lời nhắn/lời chúc để hiển thị nổi bật trên sân khấu và trong khung chat khi bài hát được phát.

### 4. 💬 Bàn Trà Trò Chuyện, `@Tag` Tên & Reply Tin Nhắn
- **Trả lời tin nhắn (`Reply`):** Bấm trả lời từng tin nhắn cụ thể kèm hộp trích dẫn (*Quote box*). Bấm vào hộp trích dẫn sẽ tự động cuộn mượt và tô sáng tin nhắn gốc.
- **Tag tên thành viên (`@Mention`):** Gõ `@` để bật menu gợi ý thành viên đang online (hoặc `@all` để gọi cả phòng). Hỗ trợ chọn nhanh bằng phím mũi tên `↑↓` + `Enter`, tự động highlight thẻ `@Tên` và gắn nhãn **`Nhắc đến bạn`** cho người được gọi.
- **Ô nhập tin nhắn thông minh:** Tự động xuống dòng và tự động giãn chiều cao khi gõ tin nhắn dài (`Enter` để gửi, `Shift + Enter` để xuống dòng).
- **Thả Cảm Xúc Bay Lên Sân Khấu (Floating Reactions):** `🍵 Mời trà`, `🌸 Chill quá`, `❤️ Tuyệt vời`, `🔥 Nhạc cháy`, `👏 Vỗ tay`, `🎸 Acoustic`.
- **Thông báo vào phòng thông minh:** Thông báo tên & biểu tượng khi có thành viên mới bước vào phòng trà (kèm cơ chế *Reconnect Grace Window 10 phút* chống lặp thông báo khi rớt mạng tạm thời hoặc tải lại trang).

### 5. 🛡️ Bảo Mật & Chống Spam (Không Cần Đăng Nhập)
- **Sliding-Window Rate Limiter:** Giới hạn tần suất chat, thêm bài, điều khiển nhạc và thả cảm xúc theo `clientId`. Tự động cảnh báo và tạm khóa thao tác nếu phát hiện spam liên tục.
- **Validation & Sanitization:** Kiểm tra toàn bộ dữ liệu đầu vào qua **Zod**, lọc sạch mã độc HTML/XSS, bảo vệ HTTP Headers với **Helmet**, giới hạn kích thước gói tin WebSocket (`32KB`) và giới hạn số kết nối đồng thời trên mỗi IP.

---

## 🛠️ Tech Stack

| Tầng | Công nghệ sử dụng |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS (Hỗ trợ **Light Mode** & **Dark Mode**), Zustand, Socket.io-client, Lucide Icons |
| **Backend** | Node.js (`>= 22.5.0`), Express, Socket.io, TypeScript (`tsx`) |
| **Database** | SQLite tích hợp sẵn (`node:sqlite` ở chế độ WAL tốc độ cao) kết hợp In-Memory Room State (`< 1ms`) |
| **Search Engine** | YouTube InnerTube JSON API + `yt-search` fallback + In-Memory Cache |
| **Security** | Helmet, Express Rate Limit, Custom Socket Rate Limiter, Zod Schema Validation |

---

## 📂 Cấu Trúc Thư Mục

```text
listen-together/
├── public/
│   └── favicon.svg              # Favicon hình ly trà Matcha
├── server/
│   ├── index.ts                 # Express + Socket.io Server, InnerTube Search, Mood Engine, Room Logic
│   ├── db.ts                    # SQLite Database Service (Queue, History, Chat Messages, Room Meta)
│   └── security.ts              # Zod Schemas, XSS Sanitizer, Sliding-Window Socket Rate Limiter
├── shared/
│   └── types.ts                 # TypeScript Interfaces dùng chung giữa Frontend & Backend
├── src/
│   ├── components/
│   │   ├── TopSearchBar.tsx     # Thanh tìm kiếm nhạc Topbar (Live Search-as-you-type)
│   │   ├── StagePlayer.tsx      # Sân khấu Đĩa Than / MV, Đồng bộ nhạc, Duyệt Vote Chủ Phòng
│   │   ├── OrderCounter.tsx     # Hàng chờ bài hát, Gợi ý nhạc Trending theo Cảm xúc, Lịch sử phát
│   │   ├── TeaTableChat.tsx     # Bàn trà Chat Real-time, Reply trích dẫn, @Mention Tagging, Danh sách khách
│   │   └── WelcomeModal.tsx     # Vé vào phòng trà (Chọn biệt danh & Avatar)
│   ├── store/
│   │   └── useRoomStore.ts      # Zustand Store quản lý kết nối Socket, Clock Sync & State toàn cục
│   ├── App.tsx                  # Bố cục chính & chuyển đổi giao diện Sáng / Tối (Light / Dark Mode)
│   ├── index.css                # Tailwind CSS & Custom Scrollbar
│   └── main.tsx                 # React Entry Point
├── render.yaml                  # Cấu hình Blueprint tự động deploy lên Render.com
├── .node-version                # Phiên bản Node.js chuẩn (22.14.0)
└── package.json                 # Scripts & Dependencies
```

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Dự Án

### Yêu cầu môi trường
- **Node.js:** Phiên bản `>= 22.5.0` (khuyến nghị `22.14.0` trở lên hoặc `24.x` để hỗ trợ sẵn `node:sqlite`).

### 1. Cài đặt thư viện
```bash
npm install
```

### 2. Chạy ở chế độ Phát triển (Development)
Chạy đồng thời cả Backend (`http://localhost:3001`) và Frontend Vite (`http://localhost:5173`):
```bash
npm run dev
```
Sau đó mở trình duyệt tại: **http://localhost:5173**

### 3. Build & Chạy ở chế độ Production (Gộp 1 cổng duy nhất)
```bash
npm run build
npm start
```
Server Node.js sẽ phục vụ luôn cả giao diện React đã build và WebSocket tại: **http://localhost:3001**

---

## ☁️ Hướng Dẫn Deploy Lên Render.com

Dự án đã được cấu hình sẵn file `render.yaml` và `.node-version` để deploy chỉ với 1 Web Service duy nhất:
1. Đẩy source code lên **GitHub** (file `.gitignore` đã loại bỏ sẵn `node_modules`, `dist`, `data`).
2. Vào **[Render Dashboard](https://dashboard.render.com)** -> Chọn **New +** -> **Web Service** và kết nối tới GitHub repository.
3. Cấu hình thông số:
   - **Runtime:** `Node`
   - **Region:** `Singapore (Southeast Asia)`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Environment Variables:**
     - `NODE_ENV` = `production`
     - `NODE_VERSION` = `22.14.0`
4. Bấm **Deploy Web Service** và tận hưởng không gian âm nhạc cùng mọi người!
