import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError, fetchSuggestions, streamChatCompletion, transcribeChunk, type ChatMessagePayload } from '../api/client'
import { consumeOpenAiSseStream } from '../api/sse'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { buildChatPayload, buildExpansionPayload } from '../lib/chatPayload'
import type { ChatMessage, SessionExport, SuggestionBatch, TranscriptChunk } from '../types/session'

/** Groq/Whisper rejects very small or header-only WebM blobs (often HTTP 400). */
const MIN_TRANSCRIBE_BYTES = 1024

function pickRecorderMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm']
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  return 'audio/webm'
}

export function StudioPage() {
  const { settings } = useSettings()
  const { pushToast } = useToast()
  const [searchParams] = useSearchParams()

  const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunk[]>([])
  const [suggestionBatches, setSuggestionBatches] = useState<SuggestionBatch[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])

  const [isRecording, setIsRecording] = useState(false)
  const [isRefreshingSuggestions, setIsRefreshingSuggestions] = useState(false)
  const [isFlushing, setIsFlushing] = useState(false)
  const [isChatting, setIsChatting] = useState(false)
  const [chatInput, setChatInput] = useState('')

  const transcriptEndRef = useRef<HTMLDivElement | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const settingsRef = useRef(settings)
  const transcriptRef = useRef('')
  const chatRef = useRef<ChatMessage[]>([])

  const fullTranscript = useMemo(() => transcriptChunks.map((chunk) => chunk.text).join('\n'), [transcriptChunks])

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    transcriptRef.current = fullTranscript
  }, [fullTranscript])

  useEffect(() => {
    chatRef.current = chatMessages
  }, [chatMessages])

  useEffect(() => {
    const panel = searchParams.get('panel')
    if (!panel) {
      return
    }
    const target = document.getElementById(`panel-${panel}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [searchParams])

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [transcriptChunks])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chatMessages])

  const appendTranscript = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) {
      return
    }
    const chunk: TranscriptChunk = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      text: trimmed,
    }
    setTranscriptChunks((prev) => [...prev, chunk])
  }, [])

  const transcribeMutation = useMutation({
    mutationFn: async (blob: Blob) =>
      transcribeChunk({
        apiKey: settingsRef.current.groqApiKey,
        blob,
        whisperPrompt: settingsRef.current.whisperPrompt || undefined,
      }),
  })

  const processBlob = useCallback(
    async (blob: Blob) => {
      if (!blob.size) {
        return
      }
      if (blob.size < MIN_TRANSCRIBE_BYTES) {
        return
      }
      try {
        const result = await transcribeMutation.mutateAsync(blob)
        appendTranscript(result.text)
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'Transcription failed.'
        pushToast({ tone: 'error', title: 'Transcription error', message })
      }
    },
    [appendTranscript, pushToast, transcribeMutation],
  )

  const refreshSuggestions = useCallback(async () => {
    const apiKey = settingsRef.current.groqApiKey.trim()
    if (!apiKey) {
      pushToast({ tone: 'error', title: 'Missing API key', message: 'Add your Groq key in Settings.' })
      return
    }
    const transcript = transcriptRef.current
    const excerpt = transcript.slice(-settingsRef.current.suggestionsContextChars)
    if (!excerpt.trim()) {
      pushToast({ title: 'Nothing to suggest yet', message: 'Start talking or wait for transcript text.' })
      return
    }
    setIsRefreshingSuggestions(true)
    try {
      const response = await fetchSuggestions({
        apiKey,
        transcriptExcerpt: excerpt,
        settings: settingsRef.current,
      })
      const batch: SuggestionBatch = {
        id: response.batch_id,
        createdAt: new Date().toISOString(),
        suggestions: response.suggestions.map((item) => ({
          id: item.id,
          title: item.title,
          preview: item.preview,
        })),
      }
      setSuggestionBatches((prev) => [batch, ...prev])
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Suggestions failed.'
      pushToast({ tone: 'error', title: 'Suggestions error', message })
    } finally {
      setIsRefreshingSuggestions(false)
    }
  }, [pushToast])

  const flushRecorderChunk = useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'recording') {
      return
    }
    setIsFlushing(true)
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          recorder.removeEventListener('dataavailable', onData)
          reject(new Error('Timed out waiting for audio chunk.'))
        }, 5000)

        const onData = (event: BlobEvent) => {
          window.clearTimeout(timeout)
          recorder.removeEventListener('dataavailable', onData)
          void processBlob(event.data).then(resolve).catch(reject)
        }

        recorder.addEventListener('dataavailable', onData)
        recorder.requestData()
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to flush microphone audio.'
      pushToast({ tone: 'error', title: 'Audio flush failed', message })
    } finally {
      setIsFlushing(false)
    }
  }, [processBlob, pushToast])

  const handleManualRefresh = useCallback(async () => {
    if (isRecording) {
      await flushRecorderChunk()
    }
    await refreshSuggestions()
  }, [flushRecorderChunk, isRecording, refreshSuggestions])

  useEffect(() => {
    if (!isRecording) {
      return
    }
    const interval = window.setInterval(() => {
      void refreshSuggestions()
    }, settings.suggestionRefreshMs)
    return () => window.clearInterval(interval)
  }, [isRecording, refreshSuggestions, settings.suggestionRefreshMs])

  /** Hard stop for unmount / tab close — does not wait for final chunks. */
  const emergencyStopStreams = useCallback(() => {
    try {
      recorderRef.current?.stop()
    } catch {
      // ignore
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    recorderRef.current = null
    streamRef.current = null
  }, [])

  /**
   * Lets `MediaRecorder` emit its final `dataavailable` blob before stopping tracks.
   * Stopping the mic track immediately after `stop()` can truncate WebM and cause Groq 400s.
   */
  const finalizeRecorderSession = useCallback(async () => {
    const recorder = recorderRef.current
    const stream = streamRef.current
    if (!recorder) {
      stream?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      return
    }
    if (recorder.state === 'inactive') {
      stream?.getTracks().forEach((track) => track.stop())
      recorderRef.current = null
      streamRef.current = null
      return
    }
    await new Promise<void>((resolve) => {
      const done = () => {
        window.clearTimeout(timeout)
        recorder.removeEventListener('stop', onStop)
        resolve()
      }
      const timeout = window.setTimeout(done, 3000)
      const onStop = () => {
        done()
      }
      recorder.addEventListener('stop', onStop, { once: true })
      recorder.stop()
    })
    stream?.getTracks().forEach((track) => track.stop())
    recorderRef.current = null
    streamRef.current = null
  }, [])

  const startRecording = useCallback(async () => {
    if (!settings.groqApiKey.trim()) {
      pushToast({ tone: 'error', title: 'Missing API key', message: 'Paste your Groq key in Settings first.' })
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickRecorderMimeType()
      const recorder = new MediaRecorder(stream, { mimeType })
      recorderRef.current = recorder
      recorder.addEventListener('dataavailable', (event) => {
        void processBlob(event.data)
      })
      recorder.start(settingsRef.current.transcriptChunkMs)
      setIsRecording(true)
    } catch {
      pushToast({
        tone: 'error',
        title: 'Microphone blocked',
        message: 'Allow microphone access in the browser to capture the meeting.',
      })
    }
  }, [processBlob, pushToast, settings.groqApiKey])

  const stopRecording = useCallback(async () => {
    await finalizeRecorderSession()
    setIsRecording(false)
    await refreshSuggestions()
  }, [finalizeRecorderSession, refreshSuggestions])

  useEffect(() => {
    return () => {
      emergencyStopStreams()
    }
  }, [emergencyStopStreams])

  const streamAssistantReply = useCallback(
    async (baseHistory: ChatMessage[], apiMessages: ChatMessagePayload[]) => {
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
      }
      const seeded = [...baseHistory, assistantMessage]
      setChatMessages(seeded)
      chatRef.current = seeded
      setIsChatting(true)
      try {
        const response = await streamChatCompletion({
          apiKey: settingsRef.current.groqApiKey,
          messages: apiMessages,
          temperature: settingsRef.current.chatTemperature,
        })
        const reader = response.body!.getReader()
        await consumeOpenAiSseStream(reader, {
          onDelta: (delta) => {
            setChatMessages((prev) => {
              const mapped = prev.map((message) =>
                message.id === assistantMessage.id ? { ...message, content: message.content + delta } : message,
              )
              chatRef.current = mapped
              return mapped
            })
          },
          onError: (message) => {
            pushToast({ tone: 'error', title: 'Streaming parse issue', message })
          },
          onDone: () => {},
        })
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'Chat request failed.'
        pushToast({ tone: 'error', title: 'Chat error', message })
        const rolledBack = baseHistory
        setChatMessages(rolledBack)
        chatRef.current = rolledBack
      } finally {
        setIsChatting(false)
      }
    },
    [pushToast],
  )

  const handleSuggestionActivate = useCallback(
    (suggestion: { title: string; preview: string }) => {
      if (!settingsRef.current.groqApiKey.trim()) {
        pushToast({ tone: 'error', title: 'Missing API key', message: 'Paste your Groq key in Settings first.' })
        return
      }
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: `Selected suggestion:\n${suggestion.title}\n${suggestion.preview}`,
        createdAt: new Date().toISOString(),
      }
      const next = [...chatRef.current, userMessage]
      setChatMessages(next)
      chatRef.current = next
      const slice = transcriptRef.current.slice(-settingsRef.current.expansionContextChars)
      const payload = buildExpansionPayload(
        slice,
        next,
        settingsRef.current,
        suggestion.title,
        suggestion.preview,
      )
      void streamAssistantReply(next, payload)
    },
    [pushToast, streamAssistantReply],
  )

  const handleSendChat = useCallback(() => {
    const trimmed = chatInput.trim()
    if (!trimmed || isChatting) {
      return
    }
    if (!settingsRef.current.groqApiKey.trim()) {
      pushToast({ tone: 'error', title: 'Missing API key', message: 'Paste your Groq key in Settings first.' })
      return
    }
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    }
    setChatInput('')
    const next = [...chatRef.current, userMessage]
    setChatMessages(next)
    chatRef.current = next
    const payload = buildChatPayload(transcriptRef.current, next, settingsRef.current)
    void streamAssistantReply(next, payload)
  }, [chatInput, isChatting, pushToast, streamAssistantReply])

  const exportSession = useCallback(() => {
    const payload: SessionExport = {
      exportedAt: new Date().toISOString(),
      app: 'TwinMind',
      transcript: transcriptChunks,
      suggestionBatches,
      chat: chatMessages,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `twinmind-session-${new Date().toISOString().replaceAll(':', '-')}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }, [chatMessages, suggestionBatches, transcriptChunks])

  const suggestionEmpty = suggestionBatches.length === 0 && !isRefreshingSuggestions
  const transcriptEmpty = transcriptChunks.length === 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-[var(--color-text)]">Studio</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-muted)]">
            Three synchronized columns: live transcript, batched AI suggestions every ~30 seconds while recording, and
            a streaming copilot chat grounded in the meeting.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text)]"
            onClick={() => exportSession()}
          >
            Export session JSON
          </button>
        </div>
      </div>

      <div className="grid min-h-[640px] flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
        <section
          id="panel-transcript"
          aria-label="Transcript"
          className="glass-panel rim-light flex min-h-[320px] flex-col rounded-2xl border border-[var(--color-border)] p-4 lg:min-h-0"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Transcript</h2>
            <div className="flex gap-2">
              {!isRecording ? (
                <button
                  type="button"
                  className="rounded-xl bg-gradient-to-r from-[var(--color-brand-strong)] to-cyan-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-950"
                  onClick={() => void startRecording()}
                >
                  Start mic
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded-xl border border-red-400/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red-100"
                  onClick={() => void stopRecording()}
                >
                  Stop mic
                </button>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            Audio chunks upload every {Math.round(settings.transcriptChunkMs / 1000)}s while recording. Text appends as
            it returns from Whisper.
          </p>
          <div className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-black/30 p-3 text-sm leading-relaxed text-[var(--color-text)]">
            {transcriptEmpty ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[var(--color-text-muted)]">
                <div className="h-24 w-full max-w-xs animate-pulse rounded-xl bg-white/5" />
                <p>No transcript yet. Start the microphone to begin capturing this session.</p>
              </div>
            ) : (
              transcriptChunks.map((chunk) => (
                <article key={chunk.id} className="rounded-lg border border-white/5 bg-white/5 p-3">
                  <p className="text-xs text-[var(--color-text-muted)]">{new Date(chunk.createdAt).toLocaleTimeString()}</p>
                  <p className="mt-2 whitespace-pre-wrap">{chunk.text}</p>
                </article>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
          {transcribeMutation.isPending ? (
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">Transcribing latest chunk…</p>
          ) : null}
        </section>

        <section
          id="panel-suggestions"
          aria-label="Suggestions"
          className="glass-panel rim-light flex min-h-[320px] flex-col rounded-2xl border border-[var(--color-border)] p-4 lg:min-h-0"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Live suggestions</h2>
            <button
              type="button"
              className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void handleManualRefresh()}
              disabled={isRefreshingSuggestions || isFlushing}
            >
              Refresh
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            Each refresh asks the model for three new cards. Latest batches stay at the top. Stopping the mic runs one
            final refresh from the transcript you already have.
          </p>
          <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1">
            {isRefreshingSuggestions && suggestionBatches.length === 0 ? (
              <div className="space-y-3">
                <div className="h-20 w-full animate-pulse rounded-xl bg-white/5" />
                <div className="h-20 w-full animate-pulse rounded-xl bg-white/5" />
                <div className="h-20 w-full animate-pulse rounded-xl bg-white/5" />
              </div>
            ) : null}
            {suggestionEmpty ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                Suggestions appear after there is transcript context. Auto-refresh runs while the mic is live.
              </p>
            ) : null}
            {suggestionBatches.map((batch) => (
              <div key={batch.id} className="space-y-3">
                <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                  Batch · {new Date(batch.createdAt).toLocaleTimeString()}
                </p>
                <div className="space-y-3">
                  {batch.suggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      className="w-full rounded-2xl border border-[var(--color-border-strong)] bg-gradient-to-br from-white/10 to-white/5 p-4 text-left text-sm text-[var(--color-text)] transition hover:border-[var(--color-brand)] disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => handleSuggestionActivate(suggestion)}
                      disabled={isChatting}
                    >
                      <p className="font-semibold text-[var(--color-text)]">{suggestion.title}</p>
                      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{suggestion.preview}</p>
                      <p className="mt-3 text-xs text-[var(--color-brand-strong)]">Tap to expand into the copilot chat →</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section
          id="panel-chat"
          aria-label="Copilot chat"
          className="glass-panel rim-light flex min-h-[320px] flex-col rounded-2xl border border-[var(--color-border)] p-4 lg:min-h-0"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Copilot chat</h2>
          </div>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            Ask follow-ups or tap a suggestion card. Answers stream in with the full transcript as grounding context.
          </p>
          <div className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-black/30 p-3">
            {chatMessages.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">The conversation will appear here.</p>
            ) : (
              chatMessages.map((message) => (
                <article
                  key={message.id}
                  className={`rounded-xl border px-3 py-2 text-sm leading-relaxed ${
                    message.role === 'user'
                      ? 'border-[var(--color-border)] bg-white/5 text-[var(--color-text)]'
                      : 'border-[var(--color-brand)]/40 bg-cyan-500/5 text-[var(--color-text)]'
                  }`}
                >
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {message.role === 'user' ? 'You' : 'TwinMind'} · {new Date(message.createdAt).toLocaleTimeString()}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap">{message.content || (isChatting ? '…' : '')}</p>
                </article>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <label className="text-xs font-medium text-[var(--color-text-muted)]" htmlFor="chat-input">
              Message
            </label>
            <textarea
              id="chat-input"
              rows={3}
              className="w-full rounded-xl border border-[var(--color-border)] bg-black/40 px-3 py-2 text-sm text-[var(--color-text)]"
              placeholder="Ask a question about the meeting..."
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
            />
            <button
              type="button"
              className="self-end rounded-xl bg-gradient-to-r from-[var(--color-brand-strong)] to-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => handleSendChat()}
              disabled={!chatInput.trim() || isChatting}
            >
              Send
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
