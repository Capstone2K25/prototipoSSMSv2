import { FormEvent, useState } from 'react'
import { supabase } from '../supabaseClient'

type UserRecord = {
  id: string
  username: string
  role: string | null
  full_name: string | null
  email: string | null
}

interface LoginProps {
  onLogin: (user: UserRecord) => void
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // autenticación simple contra la tabla `usuarios`
      const { data, error: qErr } = await supabase
        .from('usuarios')
        .select('id, username, role, full_name, email')
        .eq('username', username)
        .eq('password', password) // ⚠️ texto plano por ahora; luego cambiaremos a hash
        .limit(1)
        .maybeSingle()

      if (qErr) throw qErr
      if (!data) throw new Error('Usuario o contraseña incorrectos')

      onLogin(data as UserRecord) // sesión en memoria
    } catch (err: any) {
      setError(err.message ?? 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Iniciar sesión</h1>

        <input
          className="w-full border rounded-xl p-3"
          type="text"
          placeholder="Usuario"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />

        <input
          className="w-full border rounded-xl p-3"
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button disabled={loading} className="w-full rounded-xl p-3 border" type="submit">
          {loading ? 'Verificando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
