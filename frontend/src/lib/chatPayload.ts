import type { ChatMessagePayload } from '../api/client'
import type { TwinMindSettings } from '../types/settings'
import type { ChatMessage } from '../types/session'

export function buildChatPayload(fullTranscript: string, history: ChatMessage[], settings: TwinMindSettings) {
  const system = settings.chatPromptTemplate.replace('{{TRANSCRIPT}}', fullTranscript)
  const messages: ChatMessagePayload[] = [{ role: 'system', content: system }]
  for (const message of history) {
    messages.push({ role: message.role, content: message.content })
  }
  return messages
}

export function buildExpansionPayload(
  transcriptSlice: string,
  history: ChatMessage[],
  settings: TwinMindSettings,
  title: string,
  preview: string,
) {
  const system = settings.expansionPromptTemplate
    .replace('{{TRANSCRIPT}}', transcriptSlice)
    .replace('{{TITLE}}', title)
    .replace('{{PREVIEW}}', preview)
  const messages: ChatMessagePayload[] = [{ role: 'system', content: system }]
  for (const message of history) {
    messages.push({ role: message.role, content: message.content })
  }
  return messages
}
