import { isTauri } from './platform'

// Text-to-speech and speech recognition from the browser itself: free, no server involved.
// Voice quality depends on the device. Recognition exists in Chrome, Edge and Safari; it is
// missing in Firefox and in the desktop app's WebView, where speaking modes are hidden.

export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window

let voice: SpeechSynthesisVoice | null = null

function pickVoice() {
  const voices = window.speechSynthesis.getVoices()
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'))
  voice =
    english.find((v) => /^en-us$/i.test(v.lang) && /natural|neural|google|samantha|aria|jenny/i.test(v.name)) ??
    english.find((v) => /^en-us$/i.test(v.lang)) ??
    english[0] ??
    null
}

if (canSpeak) {
  pickVoice()
  window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice)
}

export function speak(text: string, { rate = 0.95 }: { rate?: number } = {}): void {
  if (!canSpeak || !text.trim()) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'
  if (voice) utterance.voice = voice
  utterance.rate = rate
  window.speechSynthesis.speak(utterance)
}

// The Web Speech recognition API isn't in every TypeScript DOM lib yet, so it is typed here.
type RecognitionResult = { transcript: string }
type RecognitionEvent = { results: ArrayLike<ArrayLike<RecognitionResult>> }
type Recognition = {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  abort: () => void
}
type RecognitionCtor = new () => Recognition

const Recognizer: RecognitionCtor | undefined =
  typeof window === 'undefined'
    ? undefined
    : ((window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition)

export const canRecognize = Boolean(Recognizer) && !isTauri

export class SpeechError extends Error {
  constructor(public code: 'not-allowed' | 'no-speech' | 'unsupported' | 'other') {
    super(code)
  }
}

/** Listens once and resolves with what was heard (several guesses, best first). */
export function listen(timeoutMs = 8000): { result: Promise<string[]>; stop: () => void } {
  if (!Recognizer) return { result: Promise.reject(new SpeechError('unsupported')), stop: () => {} }
  const recognition = new Recognizer()
  recognition.lang = 'en-US'
  recognition.interimResults = false
  recognition.continuous = false
  recognition.maxAlternatives = 5

  let timer: ReturnType<typeof setTimeout> | undefined
  const result = new Promise<string[]>((resolve, reject) => {
    let settled = false
    const finish = (value: string[] | SpeechError) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (value instanceof SpeechError) reject(value)
      else resolve(value)
    }
    recognition.onresult = (event) => {
      const first = event.results[0]
      const guesses = first ? Array.from(first, (alternative) => alternative.transcript) : []
      finish(guesses)
    }
    recognition.onerror = (event) => {
      const code = event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'not-allowed' : event.error === 'no-speech' ? 'no-speech' : 'other'
      finish(new SpeechError(code))
    }
    recognition.onend = () => finish(new SpeechError('no-speech'))
    timer = setTimeout(() => {
      recognition.abort()
      finish(new SpeechError('no-speech'))
    }, timeoutMs)
    recognition.start()
  })
  return { result, stop: () => recognition.abort() }
}
