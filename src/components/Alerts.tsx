import { useState } from 'react';
import { Bell, AlertTriangle, AlertCircle, Info, RefreshCw, Check } from 'lucide-react';
import { mockAlerts, Alert as AlertType } from '../data/mockData';

export const Alerts = () => {
  const [alerts, setAlerts] = useState<AlertType[]>(mockAlerts);
  const [filter, setFilter] = useState<string>('all');

  const filteredAlerts = filter === 'all'
    ? alerts
    : filter === 'unread'
    ? alerts.filter(a => !a.read)
    : alerts.filter(a => a.type === filter);

  const getAlertIcon = (type: AlertType['type']) => {
    const icons = {
      'low-stock': <AlertTriangle size={20} />,
      'error': <AlertCircle size={20} />,
      'sync': <RefreshCw size={20} />,
      'info': <Info size={20} />
    };
    return icons[type];
  };

  const getAlertStyle = (type: AlertType['type']) => {
    const styles = {
      'low-stock': {
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        text: 'text-orange-800',
        iconBg: 'bg-orange-100',
        iconColor: 'text-orange-600'
      },
      'error': {
        bg: 'bg-red-50',
        border: 'border-red-200',
        text: 'text-red-800',
        iconBg: 'bg-red-100',
        iconColor: 'text-red-600'
      },
      'sync': {
        bg: 'bg-green-50',
        border: 'border-green-200',
        text: 'text-green-800',
        iconBg: 'bg-green-100',
        iconColor: 'text-green-600'
      },
      'info': {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-800',
        iconBg: 'bg-blue-100',
        iconColor: 'text-blue-600'
      }
    };
    return styles[type];
  };

  const markAsRead = (id: string) => {
    setAlerts(alerts.map(alert =>
      alert.id === id ? { ...alert, read: true } : alert
    ));
  };

  const markAllAsRead = () => {
    setAlerts(alerts.map(alert => ({ ...alert, read: true })));
  };

  const unreadCount = alerts.filter(a => !a.read).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-red-100 text-red-600 rounded-lg relative">
            <Bell size={24} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                {unreadCount}
              </span>
            )}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">Alertas</h2>
            <p className="text-sm text-neutral-600">
              {unreadCount > 0 ? `${unreadCount} alerta${unreadCount > 1 ? 's' : ''} sin leer` : 'Todas las alertas leídas'}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="flex items-center space-x-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors"
          >
            <Check size={18} />
            <span>Marcar todas como leídas</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            Todas ({alerts.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'unread'
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            Sin leer ({unreadCount})
          </button>
          <button
            onClick={() => setFilter('low-stock')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'low-stock'
                ? 'bg-orange-600 text-white'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            Stock bajo
          </button>
          <button
            onClick={() => setFilter('error')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            Errores
          </button>
          <button
            onClick={() => setFilter('sync')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'sync'
                ? 'bg-green-600 text-white'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            Sincronización
          </button>
          <button
            onClick={() => setFilter('info')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'info'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            Info
          </button>
        </div>

        <div className="space-y-4">
          {filteredAlerts.map(alert => {
            const style = getAlertStyle(alert.type);
            return (
              <div
                key={alert.id}
                className={`${style.bg} border ${style.border} rounded-lg p-4 transition-all ${
                  !alert.read ? 'shadow-md' : ''
                }`}
              >
                <div className="flex items-start space-x-4">
                  <div className={`${style.iconBg} ${style.iconColor} p-3 rounded-lg flex-shrink-0`}>
                    {getAlertIcon(alert.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className={`font-semibold ${style.text}`}>{alert.message}</p>
                        {alert.channel && (
                          <p className={`text-sm ${style.text} opacity-75 mt-1`}>
                            Canal: {alert.channel}
                          </p>
                        )}
                        <p className={`text-sm ${style.text} opacity-75 mt-2`}>{alert.date}</p>
                      </div>
                      <div className="flex items-center space-x-2 flex-shrink-0">
                        {!alert.read && (
                          <>
                            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                            <button
                              onClick={() => markAsRead(alert.id)}
                              className={`${style.iconBg} ${style.iconColor} px-3 py-1 rounded-lg text-sm font-medium hover:opacity-80 transition-opacity`}
                            >
                              Marcar leída
                            </button>
                          </>
                        )}
                        {alert.read && (
                          <span className={`${style.text} opacity-50 text-sm flex items-center space-x-1`}>
                            <Check size={16} />
                            <span>Leída</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredAlerts.length === 0 && (
          <div className="text-center py-12 text-neutral-500">
            No hay alertas con el filtro seleccionado
          </div>
        )}
      </div>
    </div>
  );
};
