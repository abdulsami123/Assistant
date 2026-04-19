type StreamHandlers = {
  onDelta: (text: string) => void
  onError: (message: string) => void
  onDone: () => void
}

/**
 * Incrementally parses OpenAI-compatible SSE streams, tolerant of chunk boundaries.
 */
export async function consumeOpenAiSseStream(reader: ReadableStreamDefaultReader<Uint8Array>, handlers: StreamHandlers) {
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let completed = false

  const finish = () => {
    if (completed) {
      return
    }
    completed = true
    handlers.onDone()
  }

  const processLine = (line: string) => {
    const trimmed = line.trimEnd()
    if (!trimmed.startsWith('data:')) {
      return
    }
    const payload = trimmed.slice('data:'.length).trim()
    if (!payload) {
      return
    }
    if (payload === '[DONE]') {
      finish()
      return
    }
    try {
      const json = JSON.parse(payload) as {
        choices?: { delta?: { content?: string | null } }[]
      }
      const delta = json.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta.length > 0) {
        handlers.onDelta(delta)
      }
    } catch {
      handlers.onError('Unable to parse a streamed model chunk.')
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      processLine(line)
    }
  }

  if (buffer.trim().length > 0) {
    for (const line of buffer.split('\n')) {
      processLine(line)
    }
  }

  finish()
}
