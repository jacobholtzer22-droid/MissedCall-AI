// ===========================================
// Ops HQ — who sits at each desk
// ===========================================
// One entry per HQ agent. The office in the HQ tab draws a desk card from each
// entry, in this order. Rename an agent, recolour it or change its idle line
// here and nowhere else. color is a hex value (the avatar circle and the
// accent on its desk).

import type { HqAgent } from '@/lib/ops/types'

export type Persona = {
  key: HqAgent
  name: string
  role: string
  color: string
  avatarLetter: string
  idleLine: string
}

export const PERSONAS: Persona[] = [
  { key: 'chief', name: 'Chief', role: 'Runs the board, hands out work', color: '#60a5fa', avatarLetter: 'C', idleLine: 'Waiting for your next message.' },
  { key: 'ads', name: 'Ads', role: 'Google Ads builds and fixes', color: '#34d399', avatarLetter: 'A', idleLine: 'No ads work in progress.' },
  { key: 'web', name: 'Web', role: 'Website changes and launches', color: '#c084fc', avatarLetter: 'W', idleLine: 'No site work in progress.' },
]

export const personaFor = (key: string | null | undefined): Persona | undefined => PERSONAS.find((p) => p.key === key)
