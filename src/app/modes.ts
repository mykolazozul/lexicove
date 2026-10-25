import {
  BookMarked,
  Headphones,
  Keyboard,
  Layers,
  ListChecks,
  Mic,
  PenLine,
  Puzzle,
  Shapes,
  Sparkles,
  TextCursorInput,
  type LucideIcon,
} from 'lucide-react'
import type { ChipTone } from '../components/ui'
import type { Mode } from '../lib/study'

/** Every learning mode, in the order shown on the Learn page. */
export const MODES: Array<{ mode: Mode; icon: LucideIcon; tone: ChipTone }> = [
  { mode: 'mix', icon: Sparkles, tone: 'accent' },
  { mode: 'cards', icon: Layers, tone: 'accent' },
  { mode: 'choice', icon: ListChecks, tone: 'success' },
  { mode: 'typing', icon: Keyboard, tone: 'accent-2' },
  { mode: 'cloze', icon: TextCursorInput, tone: 'xp' },
  { mode: 'builder', icon: Puzzle, tone: 'coin' },
  { mode: 'listening', icon: Headphones, tone: 'fire' },
  { mode: 'dictation', icon: PenLine, tone: 'accent-2' },
  { mode: 'speaking', icon: Mic, tone: 'success' },
  { mode: 'sorting', icon: Shapes, tone: 'xp' },
  { mode: 'rules', icon: BookMarked, tone: 'coin' },
]

export const SESSION_SIZE = 15
/** New words introduced per mixed lesson. */
export const NEW_PER_LESSON = 5
