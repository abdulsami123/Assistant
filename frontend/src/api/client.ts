import type { TwinMindSettings } from '../types/settings'

export type ApiDetail = string | Record<string, unknown>[]

export class ApiError extends Error {
  readonly status: number
  readonly detail: ApiDetail

  constructor(message: string, status: number, detail: ApiDetail) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL as string | undefined
  return (raw ?? '').replace(/\/+$/, '')
}

export function buildUrl(path: string): string {
  const base = getApiBaseUrl()
  if (!path.startsWith('/')) {
    return `${base}/${path}`
  }
  return `${base}${path}`
}

export async function parseApiError(response: Response): Promise<ApiError> {
  let detail: ApiDetail = 'Request failed'
  try {
    const data: unknown = await response.json()
    if (typeof data === 'object' && data && 'detail' in data) {
      const rawDetail = (data as { detail: unknown }).detail
      if (typeof rawDetail === 'string' || Array.isArray(rawDetail)) {
        detail = rawDetail as ApiDetail
      } else {
        detail = 'Request failed'
      }
    }
  } catch {
    detail = 'Request failed'
  }
  const message =
    typeof detail === 'string'
      ? detail
      : detail.map((row) => (typeof row === 'object' && row && 'msg' in row ? String(row.msg) : JSON.stringify(row))).join(
          '; ',
        )
  return new ApiError(message || 'Request failed', response.status, detail)
}

export type TranscribeResponse = {
  text: string
}

export type SuggestionsResponse = {
  batch_id: string
  suggestions: { id: string; title: string; preview: string }[]
  total: number
  has_more: boolean
}

export type ChatMessagePayload = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function transcribeChunk(params: {
  apiKey: string
  blob: Blob
  whisperPrompt?: string
}): Promise<TranscribeResponse> {
  const form = new FormData()
  form.append('audio', params.blob, 'chunk.webm')
  if (params.whisperPrompt?.trim()) {
    form.append('whisper_prompt', params.whisperPrompt.trim())
  }
  const response = await fetch(buildUrl('/api/v1/transcribe'), {
    method: 'POST',
    headers: {
      'X-Groq-API-Key': params.apiKey,
    },
    body: form,
  })
  if (!response.ok) {
    throw await parseApiError(response)
  }
  return (await response.json()) as TranscribeResponse
}

export async function fetchSuggestions(params: {
  apiKey: string
  transcriptExcerpt: string
  settings: TwinMindSettings
}): Promise<SuggestionsResponse> {
  const { settings } = params
  const body = {
    transcript_excerpt: params.transcriptExcerpt,
    system_prompt: settings.suggestionsSystemPrompt,
    user_prompt: settings.suggestionsUserPromptTemplate.replace('{{EXCERPT}}', params.transcriptExcerpt),
    model: 'openai/gpt-oss-120b',
    temperature: settings.suggestionsTemperature,
  }
  const response = await fetch(buildUrl('/api/v1/suggestions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Groq-API-Key': params.apiKey,
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw await parseApiError(response)
  }
  return (await response.json()) as SuggestionsResponse
}

export async function streamChatCompletion(params: {
  apiKey: string
  messages: ChatMessagePayload[]
  temperature: number
}): Promise<Response> {
  const response = await fetch(buildUrl('/api/v1/chat'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'X-Groq-API-Key': params.apiKey,
    },
    body: JSON.stringify({
      messages: params.messages,
      model: 'openai/gpt-oss-120b',
      temperature: params.temperature,
    }),
  })
  if (!response.ok) {
    throw await parseApiError(response)
  }
  if (!response.body) {
    throw new ApiError('Missing response body', response.status, 'Missing response body')
  }
  return response
}
