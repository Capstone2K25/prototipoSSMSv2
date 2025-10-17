import { ReactNode, useEffect, useState } from 'react'
import {
  LayoutDashboard,
  Package,
  Globe,
  ShoppingCart,
  FileText,
  Bell,
  Settings,
  Menu,
  X,
  LogOut
} from 'lucide-react'
import { supabase } from '../supabaseClient'

interface LayoutProps {
  children: ReactNode
  onLogout: () => void
  user: any
}

export type TabType =
  | 'dashboard'
  | 'stock'
  | 'wordpress'
  | 'mercadolibre'
  | 'orders'
  | 'alerts'
  | 'admin'

interface Tab {
  id: TabType
  label: string
  icon: ReactNode
}

export const Layout = ({ children, onLogout, user }: LayoutProps) => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)

  // ---- Badge dinámico para alertas no leídas ----
  const [unreadAlerts, setUnreadAlerts] = useState(0)

  const loadUnreadAlerts = async () => {
    const { count, error } = await supabase
      .from('alerts')
      .select('id', { count: 'exact', head: true })
      .eq('read', false)

    if (!error) setUnreadAlerts(count || 0)
  }

  useEffect(() => {
    // carga inicial
    loadUnreadAlerts()

    // escucha eventos del bus para refrescar el badge
    const onNew = () => loadUnreadAlerts()      // cuando se crea una alerta
    const onRefresh = () => loadUnreadAlerts()  // cuando se marcan leídas/acciones

    window.addEventListener('app:alert', onNew)
    window.addEventListener('alerts:refresh', onRefresh)

    // polling suave por si cambian fuera de esta vista
    const interval = setInterval(loadUnreadAlerts, 30000)

    return () => {
      window.removeEventListener('app:alert', onNew)
      window.removeEventListener('alerts:refresh', onRefresh)
      clearInterval(interval)
    }
  }, [])

  const tabs: Tab[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'stock', label: 'Stock Madre', icon: <Package size={20} /> },
    { id: 'wordpress', label: 'Web', icon: <Globe size={20} /> },
    { id: 'mercadolibre', label: 'Mercado Libre', icon: <ShoppingCart size={20} /> },
    { id: 'orders', label: 'Órdenes', icon: <FileText size={20} /> },
    { id: 'alerts', label: 'Alertas', icon: <Bell size={20} /> },
    { id: 'admin', label: 'Admin', icon: <Settings size={20} /> }
  ]

  const handleTabChange = (tabId: TabType) => {
    setActiveTab(tabId)
    setMenuOpen(false)
    window.dispatchEvent(new CustomEvent('tabChange', { detail: tabId }))
  }

  const handleLogout = () => {
    onLogout()
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* NAVBAR */}
      <nav className="bg-neutral-900 text-white shadow-lg border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* LOGO */}
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-700 to-green-900 rounded-lg flex items-center justify-center font-bold text-lg shadow-lg">
                OT
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">OldTree</h1>
                <p className="text-xs text-neutral-400">Stock Manager</p>
              </div>
            </div>

            {/* MENÚ MÓVIL */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-neutral-800 transition-colors"
            >
              {menuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* MENÚ DESKTOP */}
            <div className="hidden lg:flex items-center space-x-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`relative flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
                    activeTab === tab.id
                      ? 'bg-green-700 text-white shadow-lg'
                      : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
                  }`}
                >
                  {tab.icon}
                  <span className="text-sm font-medium">{tab.label}</span>

                  {tab.id === 'alerts' && unreadAlerts > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                      {unreadAlerts}
                    </span>
                  )}
                </button>
              ))}

              {/* BOTÓN DE LOGOUT */}
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 px-4 py-2 rounded-lg text-neutral-300 hover:bg-red-700 hover:text-white transition-all"
              >
                <LogOut size={20} />
                <span className="text-sm font-medium">Salir</span>
              </button>
            </div>
          </div>

          {/* MENÚ MÓVIL (DESPLEGABLE) */}
          {menuOpen && (
            <div className="lg:hidden pb-4 space-y-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`relative w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                    activeTab === tab.id
                      ? 'bg-green-700 text-white'
                      : 'text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  {tab.icon}
                  <span className="font-medium">{tab.label}</span>

                  {tab.id === 'alerts' && unreadAlerts > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold">
                      {unreadAlerts}
                    </span>
                  )}
                </button>
              ))}

              {/* LOGOUT EN MENÚ MÓVIL */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-red-400 hover:bg-red-700 hover:text-white transition-all"
              >
                <LogOut size={20} />
                <span className="font-medium">Cerrar sesión</span>
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* CONTENIDO PRINCIPAL */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">{children}</main>
    </div>
  )
}
