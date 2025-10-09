import { useEffect, useState } from 'react';
import { Layout, TabType } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { StockManager } from './components/StockManager';
import { ChannelView } from './components/ChannelView';
import { PurchaseOrders } from './components/PurchaseOrders';
import { Alerts } from './components/Alerts';
import { Admin } from './components/Admin';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  useEffect(() => {
    const handleTabChange = (event: Event) => {
      const customEvent = event as CustomEvent<TabType>;
      setActiveTab(customEvent.detail);
    };

    window.addEventListener('tabChange', handleTabChange);
    return () => window.removeEventListener('tabChange', handleTabChange);
  }, []);

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

  return (
    <Layout>
      {renderContent()}
    </Layout>
  );
}

export default App;
