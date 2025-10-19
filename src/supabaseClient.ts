import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://vloofwzvvoyvrvaqbitm.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZsb29md3p2dm95dnJ2YXFiaXRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5NzE5MDEsImV4cCI6MjA3NTU0NzkwMX0._1jr19tBFXVr3gCGBVRWoKfvG32CI1R8wJsT8GtKPsw'


export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
