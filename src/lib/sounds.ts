// Short interface sounds, synthesised with Web Audio: no audio files to download or license.
// Each pack is a set of note sequences; the shop sells the non-default ones (kind "sound").

export type Cue = 'correct' | 'wrong' | 'coin' | 'level'
export type Pack = 'classic' | 'soft' | 'arcade' | 'xylophone'

/** [frequency in Hz, start offset in seconds, length in seconds] */
type Note = [number, number, number]

type Voice = { wave: OscillatorType; gain: number; decay: number; overtone?: number }

const VOICES: Record<Pack, Voice> = {
  classic: { wave: 'sine', gain: 0.16, decay: 0.9 },
  soft: { wave: 'triangle', gain: 0.1, decay: 1 },
  arcade: { wave: 'square', gain: 0.05, decay: 0.6 },
  xylophone: { wave: 'sine', gain: 0.18, decay: 0.35, overtone: 3.98 },
}

const C5 = 523.25
const E5 = 659.25
const G5 = 783.99
const C6 = 1046.5

const MELODIES: Record<Pack, Record<Cue, Note[]>> = {
  classic: {
    correct: [[E5, 0, 0.12], [G5, 0.09, 0.18]],
    wrong: [[311.13, 0, 0.16], [261.63, 0.12, 0.24]],
    coin: [[987.77, 0, 0.08], [1318.5, 0.07, 0.22]],
    level: [[C5, 0, 0.14], [E5, 0.12, 0.14], [G5, 0.24, 0.14], [C6, 0.36, 0.4]],
  },
  soft: {
    correct: [[G5, 0, 0.25]],
    wrong: [[220, 0, 0.3]],
    coin: [[C6, 0, 0.2]],
    level: [[C5, 0, 0.3], [G5, 0.2, 0.5]],
  },
  arcade: {
    correct: [[C6, 0, 0.06], [1567.98, 0.06, 0.1]],
    wrong: [[196, 0, 0.1], [146.83, 0.1, 0.2]],
    coin: [[1318.5, 0, 0.05], [1975.5, 0.05, 0.16]],
    level: [[C5, 0, 0.08], [E5, 0.08, 0.08], [G5, 0.16, 0.08], [C6, 0.24, 0.08], [G5, 0.32, 0.08], [C6, 0.4, 0.3]],
  },
  xylophone: {
    correct: [[C6, 0, 0.3], [1318.5, 0.1, 0.4]],
    wrong: [[392, 0, 0.35], [329.63, 0.14, 0.45]],
    coin: [[1567.98, 0, 0.35]],
    level: [[C5, 0, 0.3], [E5, 0.1, 0.3], [G5, 0.2, 0.3], [C6, 0.3, 0.6]],
  },
}

export const SOUND_PACKS = Object.keys(MELODIES) as Pack[]

let context: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  context ??= new AudioContext()
  if (context.state === 'suspended') void context.resume()
  return context
}

export function play(cue: Cue, pack: Pack = 'classic') {
  const ctx = audio()
  if (!ctx) return
  const voice = VOICES[pack]
  const start = ctx.currentTime + 0.01
  for (const [frequency, offset, length] of MELODIES[pack][cue]) {
    const partials = voice.overtone ? [1, voice.overtone] : [1]
    for (const [index, ratio] of partials.entries()) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = voice.wave
      osc.frequency.value = frequency * ratio
      const peak = voice.gain * (index === 0 ? 1 : 0.25)
      const at = start + offset
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length * voice.decay + 0.05)
      osc.connect(gain).connect(ctx.destination)
      osc.start(at)
      osc.stop(at + length + 0.1)
    }
  }
}
