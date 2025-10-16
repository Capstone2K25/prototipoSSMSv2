import { useEffect, useState } from 'react';
import { Layout, TabType } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { StockManager } from './components/StockManager';
import { ChannelView } from './components/ChannelView';
import { PurchaseOrders } from './components/PurchaseOrders';
import { Alerts } from './components/Alerts';
import { Admin } from './components/Admin';
import { supabase } from './supabaseClient'; // 👈 añadimos la conexión
import { Login } from './components/Login'; // 👈 nuevo componente de login

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);

  // 🔐 Verificar sesión al iniciar
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // 🧭 Cambiar tab por eventos personalizados
  useEffect(() => {
    const handleTabChange = (event: Event) => {
      const customEvent = event as CustomEvent<TabType>;
      setActiveTab(customEvent.detail);
    };

    window.addEventListener('tabChange', handleTabChange);
    return () => window.removeEventListener('tabChange', handleTabChange);
  }, []);

  // 📦 Render contenido según la pestaña
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'stock':
        return <StockManager />;
      case 'wordpress':
        return <ChannelView channel="wordpress" />;
      case 'mercadolibre':
        return <ChannelView channel="mercadolibre" />;
      case 'orders':
        return <PurchaseOrders />;
      case 'alerts':
        return <Alerts />;
      case 'admin':
        return <Admin />;
      default:
        return <Dashboard />;
    }
  };

  // ⏳ Mientras carga la sesión
  if (loading) return null; // o un spinner si prefieres

  // 🚪 Si no hay sesión, mostrar login
  if (!session) {
    return <Login />;
  }

  // ✅ Si está autenticado, mostrar la app
  return (
    <Layout>
      {renderContent()}
    </Layout>
  );
}

export default App;
