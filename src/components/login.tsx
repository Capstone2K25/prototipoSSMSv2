import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password
        })
        if (error) throw error

        // Crea/actualiza perfil al registrarse (si la sesión ya está disponible)
        if (data.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            email: data.user.email
          })
        }

        // Si en Auth Settings tienes "Confirm email" activado,
        // el usuario deberá confirmar su correo antes de poder loguear.
        navigate('/dashboard')
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        })
        if (error) throw error

        // Opcional: asegurar que exista el perfil
        if (data.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            email: data.user.email
          })
        }

        navigate('/dashboard') // ← redirección tras login
      }
    } catch (err: any) {
      setError(err.message ?? 'Error de autenticación')
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async () => {
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/login'
    })
    if (error) setError(error.message)
    else alert('Te enviamos un correo para restaurar tu contraseña (si existe).')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">
          {mode === 'signin' ? 'Iniciar sesión' : 'Crear cuenta'}
        </h1>

        <input
          className="w-full border rounded-xl p-3"
          type="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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

        <button
          disabled={loading}
          className="w-full rounded-xl p-3 border"
          type="submit"
        >
          {loading ? 'Cargando…' : mode === 'signin' ? 'Entrar' : 'Registrarme'}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="w-full text-sm underline"
        >
          {mode === 'signin'
            ? '¿No tienes cuenta? Crea una'
            : '¿Ya tienes cuenta? Inicia sesión'}
        </button>

        <button
          type="button"
          onClick={resetPassword}
          className="w-full text-sm underline"
        >
          Olvidé mi contraseña
        </button>
      </form>
    </div>
  )
}
