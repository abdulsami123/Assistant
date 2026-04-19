import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { DEFAULT_SETTINGS } from '../config/defaultSettings'

export function SettingsPage() {
  const { settings, updateSettings } = useSettings()
  const { pushToast } = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const nextPath = useMemo(() => {
    const raw = params.get('next')
    if (!raw) {
      return '/studio'
    }
    try {
      const decoded = decodeURIComponent(raw)
      return decoded.startsWith('/') ? decoded : '/studio'
    } catch {
      return '/'
    }
  }, [params])

  const [localKey, setLocalKey] = useState(settings.groqApiKey)

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    updateSettings({ groqApiKey: localKey.trim() })
    pushToast({ title: 'Settings saved', message: 'Your key and prompts apply to this browser tab session.' })
    if (localKey.trim()) {
      navigate(nextPath, { replace: true })
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold text-[var(--color-text)]">Settings</h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Keys stay in <code className="text-[var(--color-brand-strong)]">sessionStorage</code> for this tab only.
          They are sent to the TwinMind backend on each request, which forwards them to Groq. This is convenient for
          demos but is not as safe as a server-side secret: any XSS could read the key, so pair with strict CSP in
          production deployments.
        </p>
      </div>
      <form className="glass-panel rim-light rounded-2xl p-6" onSubmit={onSubmit}>
        <div className="space-y-6">
          <div>
            <label className="text-sm font-medium text-[var(--color-text)]" htmlFor="groq-key">
              Groq API key
            </label>
            <input
              id="groq-key"
              name="groq-key"
              type="password"
              autoComplete="off"
              className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-black/30 px-3 py-2 text-sm text-[var(--color-text)]"
              placeholder="gsk_..."
              value={localKey}
              onChange={(event) => setLocalKey(event.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--color-text)]" htmlFor="whisper-prompt">
              Whisper vocabulary primer (optional)
            </label>
            <textarea
              id="whisper-prompt"
              name="whisper-prompt"
              rows={3}
              className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-black/30 px-3 py-2 text-sm text-[var(--color-text)]"
              value={settings.whisperPrompt}
              onChange={(event) => updateSettings({ whisperPrompt: event.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-[var(--color-text)]" htmlFor="suggestions-context">
                Suggestions context (characters)
              </label>
              <input
                id="suggestions-context"
                name="suggestions-context"
                type="number"
                min={500}
                max={100_000}
                className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-black/30 px-3 py-2 text-sm"
                value={settings.suggestionsContextChars}
                onChange={(event) => updateSettings({ suggestionsContextChars: Number(event.target.value) })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--color-text)]" htmlFor="expansion-context">
                Expansion transcript window (characters)
              </label>
              <input
                id="expansion-context"
                name="expansion-context"
                type="number"
                min={2000}
                max={200_000}
                className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-black/30 px-3 py-2 text-sm"
                value={settings.expansionContextChars}
                onChange={(event) => updateSettings({ expansionContextChars: Number(event.target.value) })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--color-text)]" htmlFor="suggestion-interval">
                Suggestion refresh interval (ms)
              </label>
              <input
                id="suggestion-interval"
                name="suggestion-interval"
                type="number"
                min={5000}
                max={120_000}
                step={1000}
                className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-black/30 px-3 py-2 text-sm"
                value={settings.suggestionRefreshMs}
                onChange={(event) => updateSettings({ suggestionRefreshMs: Number(event.target.value) })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--color-text)]" htmlFor="chunk-interval">
                Transcript chunk interval (ms)
              </label>
              <input
                id="chunk-interval"
                name="chunk-interval"
                type="number"
                min={5000}
                max={120_000}
                step={1000}
                className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-black/30 px-3 py-2 text-sm"
                value={settings.transcriptChunkMs}
                onChange={(event) => updateSettings({ transcriptChunkMs: Number(event.target.value) })}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--color-text)]" htmlFor="suggestions-system">
              Live suggestions system prompt
            </label>
            <textarea
              id="suggestions-system"
              name="suggestions-system"
              rows={8}
              className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-black/30 px-3 py-2 text-sm leading-relaxed text-[var(--color-text)]"
              value={settings.suggestionsSystemPrompt}
              onChange={(event) => updateSettings({ suggestionsSystemPrompt: event.target.value })}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--color-text)]" htmlFor="suggestions-user">
              Live suggestions user template (use {'{{EXCERPT}}'} placeholder)
            </label>
            <textarea
              id="suggestions-user"
              name="suggestions-user"
              rows={5}
              className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-black/30 px-3 py-2 text-sm leading-relaxed text-[var(--color-text)]"
              value={settings.suggestionsUserPromptTemplate}
              onChange={(event) => updateSettings({ suggestionsUserPromptTemplate: event.target.value })}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--color-text)]" htmlFor="expansion-prompt">
              Detailed expansion prompt (supports {'{{TRANSCRIPT}}'}, {'{{TITLE}}'}, {'{{PREVIEW}}'})
            </label>
            <textarea
              id="expansion-prompt"
              name="expansion-prompt"
              rows={8}
              className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-black/30 px-3 py-2 text-sm leading-relaxed text-[var(--color-text)]"
              value={settings.expansionPromptTemplate}
              onChange={(event) => updateSettings({ expansionPromptTemplate: event.target.value })}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--color-text)]" htmlFor="chat-prompt">
              Chat system prompt (supports {'{{TRANSCRIPT}}'})
            </label>
            <textarea
              id="chat-prompt"
              name="chat-prompt"
              rows={8}
              className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-black/30 px-3 py-2 text-sm leading-relaxed text-[var(--color-text)]"
              value={settings.chatPromptTemplate}
              onChange={(event) => updateSettings({ chatPromptTemplate: event.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-[var(--color-text)]" htmlFor="chat-temp">
                Chat temperature
              </label>
              <input
                id="chat-temp"
                name="chat-temp"
                type="number"
                min={0}
                max={1.5}
                step={0.05}
                className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-black/30 px-3 py-2 text-sm"
                value={settings.chatTemperature}
                onChange={(event) => updateSettings({ chatTemperature: Number(event.target.value) })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--color-text)]" htmlFor="suggestions-temp">
                Suggestions temperature
              </label>
              <input
                id="suggestions-temp"
                name="suggestions-temp"
                type="number"
                min={0}
                max={1.5}
                step={0.05}
                className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-black/30 px-3 py-2 text-sm"
                value={settings.suggestionsTemperature}
                onChange={(event) => updateSettings({ suggestionsTemperature: Number(event.target.value) })}
              />
            </div>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="submit"
            className="rounded-xl bg-gradient-to-r from-[var(--color-brand-strong)] to-cyan-300 px-5 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!localKey.trim()}
          >
            Save & continue
          </button>
          <button
            type="button"
            className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-muted)]"
            onClick={() => {
              updateSettings({
                whisperPrompt: DEFAULT_SETTINGS.whisperPrompt,
                suggestionsContextChars: DEFAULT_SETTINGS.suggestionsContextChars,
                expansionContextChars: DEFAULT_SETTINGS.expansionContextChars,
                suggestionRefreshMs: DEFAULT_SETTINGS.suggestionRefreshMs,
                transcriptChunkMs: DEFAULT_SETTINGS.transcriptChunkMs,
                suggestionsSystemPrompt: DEFAULT_SETTINGS.suggestionsSystemPrompt,
                suggestionsUserPromptTemplate: DEFAULT_SETTINGS.suggestionsUserPromptTemplate,
                expansionPromptTemplate: DEFAULT_SETTINGS.expansionPromptTemplate,
                chatPromptTemplate: DEFAULT_SETTINGS.chatPromptTemplate,
                chatTemperature: DEFAULT_SETTINGS.chatTemperature,
                suggestionsTemperature: DEFAULT_SETTINGS.suggestionsTemperature,
              })
              pushToast({ title: 'Defaults restored', message: 'Prompts and tunables reset; API key unchanged.' })
            }}
          >
            Restore prompt defaults
          </button>
        </div>
      </form>
    </div>
  )
}
