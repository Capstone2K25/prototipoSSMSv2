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

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard')
  const [user, setUser] = useState<AppUser | null>(null)

  // escucha cambios de pestañas (tu patrón original)
  useEffect(() => {
    const handleTabChange = (event: Event) => {
      const customEvent = event as CustomEvent<TabType>
      setActiveTab(customEvent.detail)
    }
    window.addEventListener('tabChange', handleTabChange)
    return () => window.removeEventListener('tabChange', handleTabChange)
  }, [])

  const handleLogin = (u: AppUser) => setUser(u)
  const handleLogout = () => setUser(null)

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
