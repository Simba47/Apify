import { useState, useEffect, useRef } from 'react'

const STEPS = [
  { key: 'fetching',     label: 'Fetching videos' },
  { key: 'downloading',  label: 'Downloading audio' },
  { key: 'transcribing', label: 'Transcribing with Sarvam AI' },
  { key: 'saving',       label: 'Saving to database' },
]
const STEP_INDEX = { fetching: 0, downloading: 1, transcribing: 2, saving: 3, done: 4, error: 4 }

function Spinner({ className = '' }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function ProgressPanel({ progress }) {
  const currentIndex = STEP_INDEX[progress.step] ?? 0
  const isDone  = progress.step === 'done'
  const isError = progress.step === 'error'

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
      <h2 className="text-lg font-semibold text-white mb-5">Extraction Progress</h2>
      <div className="space-y-4">
        {STEPS.map((step, i) => {
          const done    = i < currentIndex || isDone
          const active  = i === currentIndex && !isDone && !isError
          const pending = i > currentIndex && !isDone
          return (
            <div key={step.key} className="flex items-start gap-3">
              <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                done    ? 'bg-green-500' :
                active  ? 'bg-blue-500'  :
                isError && i === currentIndex ? 'bg-red-500' : 'bg-gray-700'
              }`}>
                {done   ? <CheckIcon /> :
                 active ? <Spinner className="w-4 h-4 text-white" /> :
                 <span className="text-xs text-gray-400 font-medium">{i + 1}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-medium leading-tight ${
                  done ? 'text-green-400' : active ? 'text-white' : pending ? 'text-gray-500' : 'text-gray-400'
                }`}>{step.label}</p>
                {active && progress.message && (
                  <p className="text-sm text-gray-400 mt-1 truncate">{progress.message}</p>
                )}
                {active && progress.total != null && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{progress.current}/{progress.total}</span>
                      <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {isDone && (
        <div className="mt-5 p-3 bg-green-950 border border-green-800 rounded-lg">
          <p className="text-green-400 font-medium text-sm">{progress.message}</p>
        </div>
      )}
      {isError && (
        <div className="mt-5 p-3 bg-red-950 border border-red-800 rounded-lg">
          <p className="text-red-400 font-medium text-sm">Error: {progress.message}</p>
        </div>
      )}
    </div>
  )
}

function formatCount(n) {
  if (n == null) return null
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}

function EngagementBar({ views, likes, comments }) {
  const stats = [
    { icon: '▶',  value: formatCount(views),    label: 'views'    },
    { icon: '♥',  value: formatCount(likes),    label: 'likes'    },
    { icon: '💬', value: formatCount(comments), label: 'comments' },
  ].filter(s => s.value !== null)
  if (stats.length === 0) return null
  return (
    <div className="flex items-center gap-3 mb-3">
      {stats.map(s => (
        <span key={s.label} className="flex items-center gap-1 text-xs text-gray-400">
          <span className="text-gray-500 text-[10px]">{s.icon}</span>{s.value}
          <span className="text-gray-600">{s.label}</span>
        </span>
      ))}
    </div>
  )
}

function TranscriptCard({ transcript }) {
  const date = new Date(transcript.created_at).toLocaleString()
  const isInstagram = transcript.platform === 'instagram'
  const isShort     = transcript.video_type === 'short'

  const badge = isInstagram
    ? { label: 'Reel', color: 'bg-pink-900 text-pink-300' }
    : isShort
      ? { label: 'Short', color: 'bg-purple-900 text-purple-300' }
      : { label: 'Long-form', color: 'bg-blue-900 text-blue-300' }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden hover:border-gray-600 transition-colors flex flex-col">
      {transcript.thumbnail_url ? (
        <img
          src={transcript.thumbnail_url}
          alt={transcript.video_title}
          className="w-full h-44 object-cover"
          onError={e => { e.target.style.display = 'none' }}
        />
      ) : (
        <div className="w-full h-44 bg-gray-800 flex items-center justify-center text-gray-600 text-4xl">
          {isInstagram ? '📱' : isShort ? '⚡' : '▶'}
        </div>
      )}

      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>
            {badge.label}
          </span>
          {isInstagram && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
              Instagram
            </span>
          )}
        </div>

        <h3 className="font-semibold text-white leading-snug mb-1 line-clamp-2">
          {transcript.video_title || 'Untitled'}
        </h3>

        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-gray-500">{date}</span>
          <span className="text-gray-700">·</span>
          <a
            href={transcript.video_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 truncate max-w-[160px]"
          >
            {isInstagram ? 'View on Instagram ↗' : 'Watch on YouTube ↗'}
          </a>
        </div>

        <EngagementBar
          views={transcript.views_count}
          likes={transcript.likes_count}
          comments={transcript.comments_count}
        />

        <div
          className="flex-1 bg-gray-800 rounded-lg p-3 text-sm text-gray-300 leading-relaxed overflow-y-auto"
          style={{ maxHeight: '200px' }}
        >
          {transcript.transcript
            ? transcript.transcript
            : <span className="text-gray-500 italic">No transcript available</span>
          }
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [platform, setPlatform]               = useState('youtube')
  const [inputUrl, setInputUrl]               = useState('')
  const [isExtracting, setIsExtracting]       = useState(false)
  const [progress, setProgress]               = useState(null)
  const [transcripts, setTranscripts]         = useState([])
  const [loadingInitial, setLoadingInitial]   = useState(true)
  const [inputError, setInputError]           = useState('')
  const eventSourceRef                        = useRef(null)

  useEffect(() => {
    fetchTranscripts()
    return () => eventSourceRef.current?.close()
  }, [])

  async function fetchTranscripts() {
    try {
      const res = await fetch('/api/transcripts')
      const data = await res.json()
      setTranscripts(Array.isArray(data) ? data : [])
    } catch {
      // non-fatal
    } finally {
      setLoadingInitial(false)
    }
  }

  function validate(url) {
    if (!url) return 'Please enter a URL.'
    return ''
  }

  function startExtraction() {
    const url = inputUrl.trim()
    const err = validate(url)
    if (err) { setInputError(err); return }

    setInputError('')
    setIsExtracting(true)
    setProgress({ step: 'fetching', message: 'Connecting...' })

    const endpoint = platform === 'instagram'
      ? `/api/extract/instagram/stream?accountUrl=${encodeURIComponent(url)}`
      : `/api/extract/stream?channelUrl=${encodeURIComponent(url)}`

    const es = new EventSource(endpoint)
    eventSourceRef.current = es

    es.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data)
      setProgress(data)
      if (data.step === 'done') {
        if (Array.isArray(data.data)) setTranscripts(prev => [...data.data, ...prev])
        es.close()
        setIsExtracting(false)
      }
      if (data.step === 'error') {
        es.close()
        setIsExtracting(false)
      }
    })

    es.onerror = () => {
      setProgress(prev =>
        prev?.step !== 'done' && prev?.step !== 'error'
          ? { step: 'error', message: 'Connection lost. Please try again.' }
          : prev
      )
      es.close()
      setIsExtracting(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !isExtracting) startExtraction()
  }

  const showProgress  = progress !== null && (isExtracting || progress.step === 'done' || progress.step === 'error')
  const ytTranscripts = transcripts.filter(t => t.platform === 'youtube' || !t.platform)
  const igTranscripts = transcripts.filter(t => t.platform === 'instagram')

  const placeholders = {
    youtube:   'URL, @handle, or channel name',
    instagram: 'URL or username',
  }
  const subtitles = {
    youtube:   'Accepts URL, @handle, or channel name · Fetches 3 long-form + 3 Shorts',
    instagram: 'Accepts URL or username · Fetches up to 10 reels',
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">

      {/* Header */}
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-white tracking-tight mb-1">
          Script<span className="text-blue-500">Extractor</span>
        </h1>
        <p className="text-gray-400 text-base">
          Extract transcripts from YouTube channels and Instagram accounts.
        </p>
      </div>

      {/* Input card */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">

        {/* Platform tabs */}
        <div className="flex gap-1 mb-5 bg-gray-800 rounded-lg p-1 w-fit">
          {[
            { key: 'youtube',   label: '▶ YouTube' },
            { key: 'instagram', label: '📱 Instagram' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => { setPlatform(tab.key); setInputUrl(''); setInputError('') }}
              disabled={isExtracting}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                platform === tab.key
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <input
            type="url"
            value={inputUrl}
            onChange={e => { setInputUrl(e.target.value); setInputError('') }}
            onKeyDown={handleKeyDown}
            placeholder={placeholders[platform]}
            disabled={isExtracting}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500
                       focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          />
          <button
            onClick={startExtraction}
            disabled={isExtracting}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                       disabled:bg-gray-700 disabled:cursor-not-allowed
                       text-white font-semibold rounded-lg transition-colors whitespace-nowrap text-sm"
          >
            {isExtracting
              ? <span className="flex items-center gap-2"><Spinner className="w-4 h-4" /> Extracting…</span>
              : 'Extract Scripts'
            }
          </button>
        </div>

        {inputError && <p className="mt-2 text-sm text-red-400">{inputError}</p>}
        <p className="mt-2 text-xs text-gray-600">{subtitles[platform]}</p>
      </div>

      {/* Progress */}
      {showProgress && <div className="mb-8"><ProgressPanel progress={progress} /></div>}

      {/* Results */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">
            Extracted Scripts
            {transcripts.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500">({transcripts.length})</span>
            )}
          </h2>
          <button onClick={fetchTranscripts} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            Refresh
          </button>
        </div>

        {loadingInitial ? (
          <div className="flex items-center justify-center py-20 text-gray-600 gap-2">
            <Spinner className="w-5 h-5" /><span className="text-sm">Loading transcripts…</span>
          </div>
        ) : transcripts.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-gray-800 rounded-xl">
            <div className="text-5xl mb-4">📝</div>
            <p className="text-gray-400 font-medium">No transcripts yet</p>
            <p className="text-sm text-gray-600 mt-1">Enter a YouTube or Instagram URL above to get started</p>
          </div>
        ) : (
          <>
            {ytTranscripts.length > 0 && (
              <div className="mb-10">
                <h3 className="text-lg font-semibold text-gray-300 mb-4 flex items-center gap-2">
                  ▶ YouTube
                  <span className="text-sm font-normal text-gray-600">({ytTranscripts.length})</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                  {ytTranscripts.filter(t => t.video_type !== 'short').map(t => <TranscriptCard key={t.id} transcript={t} />)}
                </div>
                {ytTranscripts.filter(t => t.video_type === 'short').length > 0 && (
                  <>
                    <h4 className="text-base font-semibold text-gray-400 mb-3 flex items-center gap-2">
                      ⚡ Shorts <span className="text-sm font-normal text-gray-600">({ytTranscripts.filter(t => t.video_type === 'short').length})</span>
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {ytTranscripts.filter(t => t.video_type === 'short').map(t => <TranscriptCard key={t.id} transcript={t} />)}
                    </div>
                  </>
                )}
              </div>
            )}

            {igTranscripts.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-300 mb-4 flex items-center gap-2">
                  📱 Instagram Reels
                  <span className="text-sm font-normal text-gray-600">({igTranscripts.length})</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {igTranscripts.map(t => <TranscriptCard key={t.id} transcript={t} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
