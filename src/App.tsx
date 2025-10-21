// App.tsx
import { useEffect, useState } from 'react'
import { Layout, TabType } from './components/Layout'
import { Dashboard } from './components/Dashboard'
import { StockManager } from './components/StockManager'
import { ChannelView } from './components/ChannelView'
import { PurchaseOrders } from './components/PurchaseOrders'
import { Alerts } from './components/Alerts'
import { Admin } from './components/Admin'
import Login from './components/Login'
import Web from './components/Web'

type AppUser = {
  id: string
  username: string
  role?: string | null
  full_name?: string | null
  email?: string | null
}

const SESSION_KEY = 'ssms_user';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard')

  // 1) Hidratar sesión desde localStorage (con expiración)
  const [user, setUser] = useState<AppUser | null>(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { user: AppUser; exp?: number }
      if (parsed?.exp && Date.now() > parsed.exp) {
        localStorage.removeItem(SESSION_KEY)
        return null
      }
      return parsed.user || null
    } catch {
      return null
    }
  })

  // 2) Mantener pestañas como antes
  useEffect(() => {
    const handleTabChange = (event: Event) => {
      const customEvent = event as CustomEvent<TabType>
      setActiveTab(customEvent.detail)
    }
    window.addEventListener('tabChange', handleTabChange)
    return () => window.removeEventListener('tabChange', handleTabChange)
  }, [])

  // 3) Guardar sesión al hacer login (duración 7 días)
  const handleLogin = (u: AppUser) => {
    const exp = Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 días
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user: u, exp }))
    setUser(u)
  }

  // 4) Logout: limpiar almacenamiento
  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }

  // 5) Sincronizar logout/login entre pestañas
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_KEY) {
        if (!e.newValue) setUser(null)
        else {
          try {
            const parsed = JSON.parse(e.newValue)
            setUser(parsed.user || null)
          } catch {
            setUser(null)
          }
        }
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />
      case 'stock':
        return <StockManager />
      case 'wordpress':
        return <Web />
      case 'mercadolibre':
        return <ChannelView channel="mercadolibre" />
      case 'orders':
        return <PurchaseOrders />
      case 'alerts':
        return <Alerts />
      case 'admin':
        return <Admin user={user} />
      default:
        return <Dashboard />
    }
  }

  if (!user) return <Login onLogin={handleLogin} />

  return (
    <Layout onLogout={handleLogout} user={user}>
      {renderContent()}
    </Layout>
  )
}

export default App
