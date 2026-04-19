export type TranscriptChunk = {
  id: string
  createdAt: string
  text: string
}

export type SuggestionCard = {
  id: string
  title: string
  preview: string
}

export type SuggestionBatch = {
  id: string
  createdAt: string
  suggestions: SuggestionCard[]
}

export type ChatRole = 'user' | 'assistant'

export type ChatMessage = {
  id: string
  createdAt: string
  role: ChatRole
  content: string
}

export type SessionExport = {
  exportedAt: string
  app: string
  transcript: TranscriptChunk[]
  suggestionBatches: SuggestionBatch[]
  chat: ChatMessage[]
}
