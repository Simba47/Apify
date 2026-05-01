-- ScriptExtractor: transcripts table
CREATE TABLE IF NOT EXISTS transcripts (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_url TEXT        NOT NULL,
  video_url   TEXT        NOT NULL,
  video_title TEXT,
  thumbnail_url TEXT,
  transcript  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transcripts_channel_url
  ON transcripts(channel_url);

CREATE INDEX IF NOT EXISTS idx_transcripts_created_at
  ON transcripts(created_at DESC);

-- v2: video_type column + Creator DNA table
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS video_type TEXT DEFAULT 'long'
  CHECK (video_type IN ('long', 'short'));

CREATE TABLE IF NOT EXISTS channel_dna (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_url     TEXT        NOT NULL,
  long_form_style TEXT,
  shorts_style    TEXT,
  tone            TEXT,
  topics          JSONB,
  cta_style       TEXT,
  raw_dna         JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_dna_url ON channel_dna(channel_url);

-- v3: platform column for YouTube vs Instagram
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'youtube'
  CHECK (platform IN ('youtube', 'instagram'));

ALTER TABLE transcripts DROP CONSTRAINT IF EXISTS transcripts_video_type_check;
ALTER TABLE transcripts ADD CONSTRAINT transcripts_video_type_check
  CHECK (video_type IN ('long', 'short', 'reel'));

-- v4: engagement metrics
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS views_count       INTEGER;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS likes_count       INTEGER;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS comments_count    INTEGER;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS subscribers_count INTEGER;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS followers_count   INTEGER;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS following_count   INTEGER;
