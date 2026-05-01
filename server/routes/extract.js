const express = require('express');
const router = express.Router();
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const FormData = require('form-data');
const { createClient } = require('@supabase/supabase-js');

const AUDIO_DIR = path.join(os.tmpdir(), 'scriptextractor-audio');

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

function apiError(service, err) {
  const status = err.response?.status ?? 'network error';
  const body   = err.response?.data;
  const msg    = (typeof body === 'string' ? body
                  : body?.error?.message ?? body?.message ?? body?.detail)
                 || err.message;
  throw new Error(`${service} error (${status}): ${msg}`);
}

function execAsync(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 180000 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve({ stdout, stderr });
    });
  });
}

function safeUnlink(filePath) {
  try { fs.unlinkSync(filePath); } catch {}
}

// ── Concurrency limiter ───────────────────────────────────────────────────────

class Semaphore {
  constructor(max) { this.max = max; this.count = 0; this.queue = []; }
  async acquire() {
    if (this.count < this.max) { this.count++; return; }
    await new Promise(r => this.queue.push(r));
    this.count++;
  }
  release() { this.count--; if (this.queue.length) this.queue.shift()(); }
}

const downloadSemaphore = new Semaphore(8);

// ── Apify generic helper ──────────────────────────────────────────────────────

async function runApifyActor(actorId, input, limit = 6) {
  let runRes;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      runRes = await axios.post(
        `https://api.apify.com/v2/acts/${actorId}/runs?token=${process.env.APIFY_API_KEY}`,
        input,
        { headers: { 'Content-Type': 'application/json' } }
      );
      break;
    } catch (e) {
      const code = e.response?.status;
      const isTransient = !code || (code >= 500 && code < 600);
      if (isTransient && attempt < 3) {
        await new Promise(r => setTimeout(r, 4000 * (attempt + 1)));
        continue;
      }
      apiError('Apify', e);
    }
  }

  const runId = runRes.data.data.id;

  let status = 'RUNNING';
  let consecutiveErrors = 0;
  for (let i = 0; i < 60 && (status === 'RUNNING' || status === 'READY'); i++) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const s = await axios.get(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${process.env.APIFY_API_KEY}`
      );
      consecutiveErrors = 0;
      status = s.data.data.status;
    } catch (e) {
      const code = e.response?.status;
      const isTransient = !code || (code >= 500 && code < 600);
      if (isTransient && consecutiveErrors < 5) { consecutiveErrors++; continue; }
      apiError('Apify (poll)', e);
    }
  }

  if (status !== 'SUCCEEDED') throw new Error(`Apify actor run ended with status: ${status}`);

  let itemsRes;
  try {
    itemsRes = await axios.get(
      `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${process.env.APIFY_API_KEY}&limit=${limit}`
    );
  } catch (e) { apiError('Apify (results)', e); }

  return itemsRes.data;
}

// ── Input normalizers ────────────────────────────────────────────────────────

function normalizeYouTubeInput(input) {
  const s = input.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('UC') || s.startsWith('HC')) return `https://www.youtube.com/channel/${s}`;
  const handle = s.startsWith('@') ? s : `@${s}`;
  return `https://www.youtube.com/${handle}`;
}

function normalizeInstagramInput(input) {
  const s = input.trim();
  if (/^https?:\/\//i.test(s)) return s;
  return `https://www.instagram.com/${s.replace(/^@/, '')}`;
}

// ── YouTube helpers ───────────────────────────────────────────────────────────

function mapYouTubeItem(item, videoType) {
  const videoUrl = item.url || (item.id ? `https://www.youtube.com/watch?v=${item.id}` : null);
  if (!videoUrl) return null;
  return {
    videoUrl,
    title: item.title || 'Untitled',
    thumbnail: item.thumbnailUrl || item.thumbnail || '',
    videoType,
    platform: 'youtube',
    viewsCount:    item.viewCount    ?? item.views    ?? null,
    likesCount:    item.likeCount    ?? item.likes    ?? null,
    commentsCount: item.commentCount ?? item.commentsCount ?? item.numberOfComments ?? item.comments ?? null,
  };
}

async function fetchAllYouTubeVideos(channelUrl) {
  const base = channelUrl.replace(/\/+$/, '');
  const [longItems, shortItems] = await Promise.all([
    runApifyActor('streamers~youtube-scraper', { startUrls: [{ url: base + '/videos' }], maxResults: 3 }, 3),
    runApifyActor('streamers~youtube-scraper', { startUrls: [{ url: base + '/shorts' }], maxResultsShorts: 3 }, 3),
  ]);
  return [
    ...longItems.map(i => mapYouTubeItem(i, 'long')).filter(Boolean).slice(0, 3),
    ...shortItems.map(i => mapYouTubeItem(i, 'short')).filter(Boolean).slice(0, 3),
  ];
}

function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1);
    const shortsMatch = u.pathname.match(/\/shorts\/([^/]+)/);
    if (shortsMatch) return shortsMatch[1];
    return u.searchParams.get('v');
  } catch {
    const m = url.match(/[?&]v=([^&]+)/);
    return m ? m[1] : null;
  }
}

// ── Instagram helpers ─────────────────────────────────────────────────────────

function extractInstagramUsername(url) {
  const m = url.replace(/\/+$/, '').match(/instagram\.com\/([^/?]+)/);
  return m ? m[1] : null;
}

async function fetchInstagramReels(accountUrl) {
  const username = extractInstagramUsername(accountUrl);
  if (!username) throw new Error('Could not extract Instagram username from URL');

  const items = await runApifyActor(
    'apify~instagram-reel-scraper',
    { username: [username], resultsLimit: 10 },
    10
  );

  return items
    .filter(item => item.shortCode || item.id)
    .map(item => {
      const shortCode = item.shortCode || item.id;
      return {
        videoUrl: `https://www.instagram.com/reel/${shortCode}/`,
        downloadUrl: item.videoUrl || item.video_url || null,
        title: (item.caption || item.text || '').slice(0, 100) || 'Instagram Reel',
        thumbnail: item.thumbnailUrl || item.displayUrl || item.imageUrl || item.thumbnailSrc || '',
        videoType: 'reel',
        platform: 'instagram',
        viewsCount:    item.videoViewCount ?? item.videoPlayCount ?? item.playsCount ?? item.playCount ?? null,
        likesCount:    item.likesCount     ?? item.likes          ?? null,
        commentsCount: item.commentsCount  ?? item.numberOfComments ?? item.comments ?? null,
      };
    })
    .filter(Boolean)
    .slice(0, 10);
}

function extractInstagramId(url) {
  const m = url.match(/\/(reel|p)\/([^/?]+)/);
  return m ? m[2] : null;
}

// ── Audio / transcription helpers ─────────────────────────────────────────────

async function downloadDirectVideo(cdnUrl, videoId, workDir) {
  const videoPath = path.join(workDir, `${videoId}.mp4`);
  const mp3Path   = path.join(workDir, `${videoId}.mp3`);

  const response = await axios({ url: cdnUrl, method: 'GET', responseType: 'stream' });
  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(videoPath);
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  await execAsync(`ffmpeg -y -i "${videoPath}" -vn -acodec libmp3lame -q:a 4 "${mp3Path}"`);
  safeUnlink(videoPath);
  return mp3Path;
}

async function downloadAudio(videoUrl, videoId, platform = 'youtube', workDir) {
  const outputTemplate = path.join(workDir, `${videoId}.%(ext)s`);
  const extraArgs = platform === 'youtube'
    ? '--extractor-args "youtube:player_client=tv_embedded,web" --sleep-interval 2'
    : '';

  await execAsync(`yt-dlp -f "bestaudio/best" ${extraArgs} -o "${outputTemplate}" "${videoUrl}"`);

  const downloaded = fs.readdirSync(workDir)
    .filter(f => f.startsWith(`${videoId}.`));
  if (downloaded.length === 0) throw new Error(`No file downloaded for: ${videoUrl}`);

  const srcPath = path.join(workDir, downloaded[0]);
  const mp3Path = path.join(workDir, `${videoId}.mp3`);

  if (srcPath !== mp3Path) {
    await execAsync(`ffmpeg -y -i "${srcPath}" -vn -acodec libmp3lame -q:a 4 "${mp3Path}"`);
    safeUnlink(srcPath);
  }

  return mp3Path;
}

async function splitAudioIntoChunks(audioFilePath, workDir) {
  const chunksDir = path.join(workDir, 'chunks');
  if (!fs.existsSync(chunksDir)) fs.mkdirSync(chunksDir, { recursive: true });
  const chunkTemplate = path.join(chunksDir, 'chunk_%03d.mp3');
  await execAsync(`ffmpeg -y -i "${audioFilePath}" -f segment -segment_time 25 -c:a copy "${chunkTemplate}"`);
  const files = fs.readdirSync(chunksDir)
    .filter(f => f.endsWith('.mp3'))
    .sort()
    .map(f => path.join(chunksDir, f));
  return files;
}

async function transcribeChunk(chunkPath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(chunkPath));
  form.append('model', 'saaras:v3');
  form.append('mode', 'transcribe');
  form.append('language_code', 'unknown');

  let response;
  try {
    response = await axios.post('https://api.sarvam.ai/speech-to-text', form, {
      headers: { ...form.getHeaders(), 'api-subscription-key': process.env.SARVAM_API_KEY },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });
  } catch (e) { apiError('Sarvam AI', e); }

  return response.data.transcript || '';
}

async function transcribeAudio(audioFilePath, workDir) {
  const files = await splitAudioIntoChunks(audioFilePath, workDir);
  const parts = [];
  for (const chunkPath of files) {
    const text = await transcribeChunk(chunkPath);
    parts.push(text);
    safeUnlink(chunkPath);
  }
  return parts.join(' ').trim();
}

// ── Shared pipeline helper ────────────────────────────────────────────────────

async function runExtractionPipeline(videos, channelUrl, platform, send) {
  const supabase = getSupabase();
  const sessionDir = path.join(AUDIO_DIR, `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(sessionDir, { recursive: true });

  const results = [];

  try {
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const mediaId = platform === 'instagram'
        ? extractInstagramId(video.videoUrl)
        : extractVideoId(video.videoUrl);

      if (!mediaId) {
        send({ step: 'downloading', message: `Skipping — could not parse ID from: ${video.videoUrl}` });
        continue;
      }

      send({
        step: 'downloading',
        message: `Downloading audio (${i + 1}/${videos.length}): ${video.title}`,
        current: i + 1, total: videos.length
      });

      await downloadSemaphore.acquire();
      let audioPath;
      try {
        audioPath = (platform === 'instagram' && video.downloadUrl)
          ? await downloadDirectVideo(video.downloadUrl, mediaId, sessionDir)
          : await downloadAudio(video.videoUrl, mediaId, platform, sessionDir);
      } finally {
        downloadSemaphore.release();
      }

      send({
        step: 'transcribing',
        message: `Transcribing (${i + 1}/${videos.length}): ${video.title}`,
        current: i + 1, total: videos.length
      });
      const transcript = await transcribeAudio(audioPath, sessionDir);
      safeUnlink(audioPath);

      results.push({ ...video, mediaId, transcript });
    }

    send({ step: 'saving', message: 'Saving to database...' });

    const { data: saved, error } = await supabase
      .from('transcripts')
      .insert(results.map(item => ({
        channel_url:    channelUrl,
        video_url:      item.videoUrl,
        video_title:    item.title,
        thumbnail_url:  item.thumbnail,
        transcript:     item.transcript,
        video_type:     item.videoType,
        platform,
        views_count:    item.viewsCount    ?? null,
        likes_count:    item.likesCount    ?? null,
        comments_count: item.commentsCount ?? null,
      })))
      .select();

    if (error) throw new Error(`Supabase insert failed: ${error.message}`);
    return saved;
  } finally {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
}

// ── YouTube SSE ───────────────────────────────────────────────────────────────

router.get('/extract/stream', async (req, res) => {
  const { channelUrl } = req.query;
  if (!channelUrl) return res.status(400).json({ error: 'channelUrl is required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const keepAlive = setInterval(() => res.write(': ping\n\n'), 20000);
  const send = (data) => res.write(`event: progress\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const normalizedUrl = normalizeYouTubeInput(channelUrl);
    send({ step: 'fetching', message: 'Fetching videos from Apify...' });
    const videos = await fetchAllYouTubeVideos(normalizedUrl);
    send({ step: 'fetching', message: `Found ${videos.filter(v => v.videoType === 'long').length} long-form + ${videos.filter(v => v.videoType === 'short').length} Shorts`, count: videos.length });

    const saved = await runExtractionPipeline(videos, normalizedUrl, 'youtube', send);

    send({ step: 'done', message: `Extracted ${saved.length} transcript${saved.length !== 1 ? 's' : ''}!`, data: saved });
    res.write('event: done\ndata: {}\n\n');
  } catch (err) {
    send({ step: 'error', message: err.message });
  } finally {
    clearInterval(keepAlive);
    res.end();
  }
});

// ── Instagram SSE ─────────────────────────────────────────────────────────────

router.get('/extract/instagram/stream', async (req, res) => {
  const { accountUrl } = req.query;
  if (!accountUrl) return res.status(400).json({ error: 'accountUrl is required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const keepAlive = setInterval(() => res.write(': ping\n\n'), 20000);
  const send = (data) => res.write(`event: progress\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    const normalizedUrl = normalizeInstagramInput(accountUrl);
    send({ step: 'fetching', message: 'Fetching reels from Instagram...' });
    const reels = await fetchInstagramReels(normalizedUrl);
    send({ step: 'fetching', message: `Found ${reels.length} reels`, count: reels.length });

    const saved = await runExtractionPipeline(reels, normalizedUrl, 'instagram', send);

    send({ step: 'done', message: `Extracted ${saved.length} reel script${saved.length !== 1 ? 's' : ''}!`, data: saved });
    res.write('event: done\ndata: {}\n\n');
  } catch (err) {
    send({ step: 'error', message: err.message });
  } finally {
    clearInterval(keepAlive);
    res.end();
  }
});

module.exports = router;
