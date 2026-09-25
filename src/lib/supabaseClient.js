import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isConfigured) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
}

// createClient throws outright when these are missing, which takes down the
// whole site — landing page included — leaving a blank white screen and no
// clue why. Handing it placeholders lets the app boot far enough to show the
// explanation in main.jsx. A build that reaches here without real values is
// broken either way; this only changes how it tells you.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
)
