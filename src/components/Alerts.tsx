import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  Info,
  RefreshCw,
  Check,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import type { AppAlertType, AppAlert } from '../state/alertsBus';
import { emitAlertsRefresh } from '../state/alertsBus';

type DBAlert = {
  id: string;
  type: AppAlertType;
  message: string;
  channel: string | null;
  read: boolean;
  created_at: string;
};

const typeStyle: Record<
  AppAlertType,
  { bg: string; border: string; text: string; iconBg: string; iconColor: string }
> = {
  'low-stock': {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-800',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-600'
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600'
  },
  sync: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-800',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600'
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600'
  }
};

const typeIcon: Record<AppAlertType, JSX.Element> = {
  'low-stock': <AlertTriangle size={20} />,
  error: <AlertCircle size={20} />,
  sync: <Check size={20} />,
  info: <Info size={20} />
};

export const Alerts = () => {
  const [alerts, setAlerts] = useState<DBAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | AppAlertType>('all');

  // paginación
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const showingFrom = alerts.length ? (page - 1) * pageSize + 1 : 0;
  const showingTo = alerts.length ? (page - 1) * pageSize + alerts.length : 0;

  const loadPage = async (nextPage = page, currentFilter = filter, currentPageSize = pageSize) => {
    setLoading(true);
    try {
      const from = (nextPage - 1) * currentPageSize;
      const to = from + currentPageSize - 1;

      let query = supabase
        .from('alerts')
        .select('id, type, message, channel, read, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (currentFilter === 'unread') {
        query = query.eq('read', false);
      } else if (currentFilter !== 'all') {
        query = query.eq('type', currentFilter);
      }

      const { data, count, error } = await query;
      if (error) throw error;

      setAlerts((data || []) as DBAlert[]);
      setTotalCount(count || 0);
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadPage(page, filter, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  useEffect(() => {
    setPage(1);
    void loadPage(1, filter, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<AppAlert>;
      const a = ce.detail;
      const dbAlert: DBAlert = {
        id: a.id,
        type: a.type,
        message: a.message,
        channel: a.channel ?? null,
        read: a.read,
        created_at: new Date().toISOString()
      };
      setAlerts(prev => [dbAlert, ...prev]);
      setTotalCount(prev => prev + 1);
    };
    window.addEventListener('app:alert', handler as EventListener);
    return () => window.removeEventListener('app:alert', handler as EventListener);
  }, []);

  const unreadCount = useMemo(() => alerts.filter(a => !a.read).length, [alerts]);

  const markAsRead = async (id: string) => {
    setAlerts(prev => prev.map(a => (a.id === id ? { ...a, read: true } : a)));
    await supabase.from('alerts').update({ read: true }).eq('id', id);
    emitAlertsRefresh();
  };

  const markAllAsRead = async () => {
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
    await supabase.from('alerts').update({ read: true }).eq('read', false);
    emitAlertsRefresh();
  };

  const reload = () => loadPage(page, filter, pageSize);

  return (
  <div className="space-y-6 transition-colors duration-300">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-center space-x-3">
        <div className="p-3 bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300 rounded-lg relative">
          <Bell size={24} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center font-bold">
              {unreadCount}
            </span>
          )}
        </div>
        <div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
            Alertas
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {unreadCount > 0
              ? `${unreadCount} alerta${unreadCount > 1 ? "s" : ""} sin leer`
              : "Todas las alertas leídas"}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={reload}
          className="flex items-center gap-2 px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          disabled={loading}
        >
          <RefreshCw size={16} />
          Refrescar
        </button>

        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors"
          >
            <Check size={18} />
            Marcar todas como leídas
          </button>
        )}
      </div>
    </div>

    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 p-6 transition-colors">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(["all", "unread", "low-stock", "error", "sync", "info"] as const).map(
          (k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === k
                  ? k === "error"
                    ? "bg-red-600 text-white"
                    : k === "sync"
                    ? "bg-green-600 text-white"
                    : k === "info"
                    ? "bg-blue-600 text-white"
                    : k === "low-stock"
                    ? "bg-orange-600 text-white"
                    : "bg-neutral-900 text-white"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              }`}
            >
              {k === "all"
                ? "Todas"
                : k === "unread"
                ? "Sin leer"
                : k === "low-stock"
                ? "Low Stock"
                : k}
            </button>
          )
        )}
      </div>

      {/* Lista */}
      <div className="space-y-4">
        {loading && (
          <div className="text-neutral-500 dark:text-neutral-400">
            Cargando…
          </div>
        )}

        {!loading && alerts.length === 0 && (
          <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
            No hay alertas.
          </div>
        )}

        {!loading &&
          alerts.map((a) => {
            const style = typeStyle[a.type] ?? {
              bg: "bg-green-50 dark:bg-green-900/20",
              border: "border-green-200 dark:border-green-800",
              text: "text-neutral-800 dark:text-neutral-100",
              iconBg: "bg-green-100 dark:bg-green-800/40",
              iconColor: "text-green-700 dark:text-green-300",
            };

            return (
              <div
                key={a.id}
                className={`${style.bg} border ${style.border} rounded-lg p-4 transition-all ${
                  !a.read ? "shadow-md" : ""
                }`}
              >
                <div className="flex items-start space-x-4">
                  <div
                    className={`${style.iconBg} ${style.iconColor} p-3 rounded-lg flex-shrink-0`}
                  >
                    {typeIcon[a.type] ?? <Info size={20} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className={`font-semibold ${style.text}`}>
                          {a.message}
                        </p>
                        {a.channel && (
                          <p
                            className={`text-sm ${style.text} opacity-75 mt-1`}
                          >
                            Canal: {a.channel}
                          </p>
                        )}
                        <p
                          className={`text-sm ${style.text} opacity-75 mt-2`}
                        >
                          {new Date(a.created_at).toLocaleString()}
                        </p>
                      </div>

                      <div className="flex items-center space-x-2 flex-shrink-0">
                        {!a.read ? (
                          <>
                            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                            <button
                              onClick={() => markAsRead(a.id)}
                              className={`px-3 py-1 rounded-lg text-sm font-medium ${style.iconBg} ${style.iconColor} hover:opacity-80 transition-opacity`}
                            >
                              Marcar leída
                            </button>
                          </>
                        ) : (
                          <span
                            className={`${style.text} opacity-50 text-sm flex items-center space-x-1`}
                          >
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

      {/* Paginación */}
      <div className="flex flex-wrap items-center gap-3 justify-between mt-6">
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          {showingFrom}-{showingTo} de {totalCount}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => page > 1 && setPage(page - 1)}
            disabled={page <= 1 || loading}
            className="inline-flex items-center gap-1 px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-xl disabled:opacity-50 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            <ChevronLeft size={16} /> Anterior
          </button>

          <span className="text-sm text-neutral-700 dark:text-neutral-300">
            Página {page} de {totalPages}
          </span>

          <button
            onClick={() => page < totalPages && setPage(page + 1)}
            disabled={page >= totalPages || loading}
            className="inline-flex items-center gap-1 px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-xl disabled:opacity-50 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            Siguiente <ChevronRight size={16} />
          </button>

          <select
            className="ml-2 border border-neutral-300 dark:border-neutral-700 rounded-xl py-2 px-2 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 transition-colors"
            value={pageSize}
            onChange={(e) => {
              const ps = Number(e.target.value);
              setPageSize(ps);
              setPage(1);
            }}
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
          </select>
        </div>
      </div>
    </div>
  </div>
);

};
