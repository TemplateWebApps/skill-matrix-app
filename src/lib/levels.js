// The 5-state rating scale used for both Current and Target levels.
// null = "Not Required" — the skill doesn't apply to this member.
export const LEVELS = [
  { value: null, label: 'Not Required', short: '×' },
  { value: 1, label: 'No Experience', short: '1' },
  { value: 2, label: 'Beginner', short: '2' },
  { value: 3, label: 'Capable', short: '3' },
  { value: 4, label: 'Expert / Can Train', short: '4' },
]

export function levelLabel(value) {
  return LEVELS.find((l) => l.value === value)?.label ?? 'Not Required'
}

export function levelClass(value) {
  return value === null || value === undefined ? 'lvl-none' : `lvl-${value}`
}
