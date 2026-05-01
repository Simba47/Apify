# ScriptExtractor

Extract and transcribe YouTube channel videos using Apify + Sarvam AI, stored in Supabase.

## Stack

- **Frontend** — React + Vite + TailwindCSS (port 5173)
- **Backend** — Node.js + Express (port 3001)
- **Database** — Supabase (PostgreSQL)
- **Video scraping** — Apify YouTube Scraper actor
- **Audio download** — yt-dlp (system binary)
- **Transcription** — Sarvam AI `saarika:v2`

---

## Prerequisites

### 1. Install yt-dlp

**Windows (winget)**
```
winget install yt-dlp
```

**Windows (manual)** — download `yt-dlp.exe` from https://github.com/yt-dlp/yt-dlp/releases and add it to your PATH.

**macOS**
```
brew install yt-dlp
```

**Linux**
```
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

Verify:
```
yt-dlp --version
```

### 2. ffmpeg (required by yt-dlp for audio conversion)

**Windows** — https://ffmpeg.org/download.html (add `bin/` folder to PATH)  
**macOS** — `brew install ffmpeg`  
**Linux** — `sudo apt install ffmpeg`

---

## Setup

### 1. Clone and configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

```
APIFY_API_KEY=your_apify_api_key
SARVAM_API_KEY=your_sarvam_api_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
PORT=3001
```

- **APIFY_API_KEY** — get from https://console.apify.com/account/integrations
- **SARVAM_API_KEY** — get from https://app.sarvam.ai
- **SUPABASE_URL / SUPABASE_SERVICE_KEY** — get from your Supabase project → Settings → API

### 2. Create the Supabase table

In your Supabase dashboard, go to **SQL Editor** and run the contents of:

```
supabase/migration.sql
```

### 3. Install dependencies

```bash
# Backend
cd server
npm install

# Frontend
cd ../client
npm install
```

### 4. Run the app

**Terminal 1 — backend:**
```bash
cd server
npm run dev
```

**Terminal 2 — frontend:**
```bash
cd client
npm run dev
```

Open http://localhost:5173

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/extract/stream?channelUrl=` | SSE stream — runs the full pipeline and emits progress events |
| `POST` | `/api/extract` | Non-streaming version — body `{ channelUrl }` |
| `GET`  | `/api/transcripts` | Returns all saved transcripts, newest first |

### SSE Event format

```
event: progress
data: { "step": "fetching"|"downloading"|"transcribing"|"saving"|"done"|"error", "message": "...", ... }
```

When `step === "done"`, the `data` field contains the array of saved transcript rows.

---

## Project Structure

```
/
├── client/                   React + Vite frontend
│   ├── src/
│   │   ├── App.jsx
│   │   ├── index.css         Tailwind entry
│   │   └── components/
│   │       └── Dashboard.jsx Main page
│   ├── vite.config.js        Proxy /api → :3001
│   └── package.json
├── server/                   Express backend
│   ├── index.js
│   ├── routes/
│   │   ├── extract.js        /api/extract + /api/extract/stream
│   │   └── transcripts.js    /api/transcripts
│   └── package.json
├── supabase/
│   └── migration.sql
├── .env.example
└── README.md
```
