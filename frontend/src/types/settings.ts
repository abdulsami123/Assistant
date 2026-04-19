export type TwinMindSettings = {
  groqApiKey: string
  whisperPrompt: string
  suggestionsContextChars: number
  expansionContextChars: number
  suggestionRefreshMs: number
  transcriptChunkMs: number
  suggestionsSystemPrompt: string
  suggestionsUserPromptTemplate: string
  expansionPromptTemplate: string
  chatPromptTemplate: string
  chatTemperature: number
  suggestionsTemperature: number
}
