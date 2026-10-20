# 🛸 AI Quota Monitor Desktop Widget (Subscription Edition)

Compact, Always-on-top AI Quota Monitor Desktop Widget for Windows built with **Electron**, **TypeScript**, **React**, and **Tailwind CSS**.

Designed specifically for **Monthly Subscription users** (Claude Pro/Max, ChatGPT/Codex Plus/Team, Google Gemini/Antigravity). Instead of raw dollar costs, it tracks your actual **5-Hour Session Quota Remaining** and **Weekly Quota Remaining** with real-time reset countdowns.

---

## ✨ Features (v2.0 Redesign)

- **Subscription-First UI**:
  - 🟠 **Claude** (Anthropic Pro/Max)
  - 🟢 **Codex / GPT** (OpenAI Plus/Team)
  - 🔵 **Antigravity** (Google Advanced)
- **Dual Progress Bars per Provider**:
  1. **5-Hour / Session Limit Remaining**: Shows percentage remaining (`% left`) with a dynamic color bar (Emerald > 35%, Amber 15-35%, Rose < 15%) and reset countdown (e.g., `Resets in 3h 15m (Today 18:00)`).
  2. **Weekly Limit Remaining**: Shows percentage remaining (`% left`) and the weekly rollover reset time (e.g., `Resets Sun 4:00 AM (in 4d 13h)`).
- **Zero-Latency Local Execution**:
  - Uses direct local binary execution (`node_modules/.bin/ccusage.exe`) taking ~30ms, completely avoiding slow `npx --yes` network lookups.
- **Real-Time File Watcher (`chokidar`)**:
  - Automatically monitors local session and log files in Windows:
    - Claude: `~/.claude/history.jsonl`, `~/.claude/sessions`
    - Codex: `~/.codex/session_index.jsonl`, `~/.codex/logs_2.sqlite-wal`
    - Antigravity: `~/.gemini/antigravity/conversations`, `~/.gemini/antigravity/brain`
  - When you prompt an AI, the watcher detects the activity and instantly pushes an IPC event to refresh the UI in real-time.
- **Fast 20s Background Polling**:
  - Background polling runs every 20 seconds.
- **Immediate Manual Refresh**:
  - Clicking the **Refresh** button on the title bar forces a complete memory cache clear and fetches fresh data on the spot.
- **Frameless & Always-on-top**:
  - Compact `360px × 460px` frameless dark mode window.
  - Pin toggle button (📌) to enable or disable always-on-top.
  - Custom draggable title bar (`-webkit-app-region: drag`) with minimize and close buttons.
- **Live Sync Status Bar**:
  - Displays real-time live counter `Last Sync: X seconds ago` with live watcher indicator.

---

## 🚀 Quick Start

### Using Bun (Recommended)

```bash
cd desktop-widget
bun run dev
```

### Using npm

```bash
cd desktop-widget
npm run dev
```

---

## 🛠️ Project Structure

```text
desktop-widget/
├── electron/
│   ├── main.ts                    # Electron Main Process (Frameless Window, 20s Polling, Chokidar File Watcher)
│   ├── preload.ts                 # Secure ContextBridge API (Typed window.electronAPI)
│   └── services/
│       └── ccusageCli.ts          # Direct local ccusage execution + sliding window limit calculator
├── src/
│   ├── components/
│   │   ├── TitleBar.tsx           # Frameless draggable header, Pin, Refresh, Minimize, Close
│   │   ├── ProviderCard.tsx       # 2 Progress Bars (5h Session & Weekly) with reset countdowns
│   │   ├── SyncStatusBar.tsx      # Real-time ticking "Last Sync: X seconds ago" & Watcher status
│   │   └── ErrorMessage.tsx       # Graceful sync notice with retry
│   ├── types/
│   │   ├── ccusage.ts             # Strongly typed subscription quota interfaces
│   │   └── electron.d.ts          # Window.electronAPI Interface
│   ├── App.tsx                    # Main Widget Dashboard
│   ├── main.tsx                   # React Entry Point
│   └── index.css                  # Tailwind styles & Custom sleek scrollbar
├── index.html
├── package.json                   # Dependencies (ccusage, chokidar, lucide-react, react, electron)
├── vite.config.ts                 # Vite + vite-plugin-electron config
├── tailwind.config.js             # Dark mode theme
└── tsconfig.json
```
