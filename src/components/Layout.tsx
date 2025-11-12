import { ReactNode, useEffect, useState } from "react";
import {
  LayoutDashboard,
  Package,
  Building2,
  Globe,
  ShoppingCart,
  FileText,
  Bell,
  Settings,
  Menu,
  X,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { motion, AnimatePresence } from "framer-motion";

interface LayoutProps {
  children: ReactNode;
  onLogout: () => void;
  user: any;
}

export type TabType =
  | "dashboard"
  | "stock"
  | "wordpress"
  | "mercadolibre"
  | "orders"
  | "alerts"
  | "admin";

interface Tab {
  id: TabType;
  label: string;
  icon: ReactNode;
}

export const Layout = ({ children, onLogout }: LayoutProps) => {
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    return (localStorage.getItem("activeTab") as TabType) || "dashboard";
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  // Tema claro / oscuro
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("theme") as "light" | "dark") || "light"
  );

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () =>
    setTheme((prev) => (prev === "light" ? "dark" : "light"));

  // Alertas no leídas
  const loadUnreadAlerts = async () => {
    const { count, error } = await supabase
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .eq("read", false);
    if (!error) setUnreadAlerts(count || 0);
  };

  useEffect(() => {
    loadUnreadAlerts();
    const onNew = () => loadUnreadAlerts();
    const onRefresh = () => loadUnreadAlerts();
    window.addEventListener("app:alert", onNew);
    window.addEventListener("alerts:refresh", onRefresh);
    const interval = setInterval(loadUnreadAlerts, 30000);

    return () => {
      window.removeEventListener("app:alert", onNew);
      window.removeEventListener("alerts:refresh", onRefresh);
      clearInterval(interval);
    };
  }, []);

  const tabs: Tab[] = [
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
    { id: "stock", label: "Stock Madre", icon: <Package size={20} /> },
    { id: "orders", label: "B2B", icon: <Building2 size={20} /> },
    { id: "wordpress", label: "Web", icon: <Globe size={20} /> },
    {
      id: "mercadolibre",
      label: "Mercado Libre",
      icon: <ShoppingCart size={20} />,
    },
    { id: "alerts", label: "Alertas", icon: <Bell size={20} /> },
    { id: "admin", label: "Admin", icon: <Settings size={20} /> },
  ];

  // Colores especiales SOLO para B2B, Web, ML
  const tabColors: Partial<Record<TabType, string>> = {
    orders: "#6d28d9", // violeta
    wordpress: "#2563eb", // azul
    mercadolibre: "#d97706", // dorado
  };

  const handleTabChange = (tabId: TabType) => {
    setActiveTab(tabId);
    localStorage.setItem("activeTab", tabId);
    setMenuOpen(false);
    window.dispatchEvent(new CustomEvent("tabChange", { detail: tabId }));
  };

  const handleLogout = () => onLogout();

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 dark:text-white overflow-hidden transition-colors duration-300">
      {/* NAVBAR */}
      <nav className="bg-neutral-900 dark:bg-neutral-950 text-white shadow-lg border-b border-neutral-800 dark:border-neutral-700 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
         <div className="flex items-center justify-between h-16">
  {/* LOGO */}
  <div className="flex items-center space-x-3">
    <div className="w-30 h-10 rounded-lg bg-white flex items-center justify-center overflow-hidden ring-1 ring-black/10 dark:ring-white/10 shadow-lg">
      <img
        src="/img/oldtree-logo.png"
        alt="OldTree"
        className="w-[85%] h-[85%] object-contain"
      />
    </div>
    <h1 className="font-bold tracking-tight text-white">Stock Manager</h1>
  </div>

  {/* ACCIONES DERECHA SIEMPRE VISIBLES (modo claro/oscuro + menú móvil) */}
  <div className="flex items-center gap-3">
    {/* BOTÓN MODO OSCURO / CLARO (visible en todos los tamaños) */}
    <button
      onClick={toggleTheme}
      className="flex items-center justify-center w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 text-yellow-400 dark:text-sky-300 transition-all duration-300 shadow-inner border border-neutral-700"
      title={theme === "light" ? "Modo oscuro" : "Modo claro"}
    >
      <AnimatePresence mode="wait" initial={false}>
        {theme === "light" ? (
          <motion.div
            key="sun"
            initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.3 }}
          >
            <Sun size={18} />
          </motion.div>
        ) : (
          <motion.div
            key="moon"
            initial={{ rotate: 90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: -90, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.3 }}
          >
            <Moon size={18} />
          </motion.div>
        )}
      </AnimatePresence>
    </button>

    {/* BOTÓN MENÚ MÓVIL */}
    <button
      onClick={() => setMenuOpen(!menuOpen)}
      className="lg:hidden p-2 rounded-lg hover:bg-neutral-800 transition-colors"
    >
      {menuOpen ? <X size={24} /> : <Menu size={24} />}
    </button>
  </div>

  {/* MENÚ DESKTOP */}
  <div className="hidden lg:flex flex-1 items-center justify-end">
    <div className="flex items-center space-x-1">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const color = tabColors[tab.id];
        const hasCustomColor = !!color;

        return (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`relative flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors font-medium whitespace-nowrap ${
              isActive
                ? hasCustomColor
                  ? "text-white"
                  : "text-black"
                : "text-neutral-300 hover:bg-neutral-800 hover:text-white"
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="activeTabIndicator"
                className="absolute inset-0 rounded-lg shadow-md"
                style={{
                  backgroundColor: hasCustomColor ? color : "#ffffff",
                }}
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 35,
                }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              {tab.icon}
              {tab.label}
              {tab.id === "alerts" && unreadAlerts > 0 && (
                <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                  {unreadAlerts}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>

    {/* BOTÓN LOGOUT */}
    <button
      onClick={handleLogout}
      className="flex items-center space-x-2 px-4 py-2 rounded-lg text-neutral-300 hover:bg-red-700 hover:text-white transition-all ml-3"
    >
      <LogOut size={20} />
      <span className="text-sm font-medium">Salir</span>
    </button>
  </div>
</div>

          {/* MENÚ MÓVIL */}
          {menuOpen && (
            <div className="lg:hidden pb-4 space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`relative w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                    activeTab === tab.id
                      ? "bg-white text-black ring-1 ring-black/10 dark:bg-neutral-800 dark:text-white"
                      : "text-neutral-300 hover:bg-neutral-800"
                  }`}
                >
                  {tab.icon}
                  <span className="font-medium">{tab.label}</span>
                  {tab.id === "alerts" && unreadAlerts > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold">
                      {unreadAlerts}
                    </span>
                  )}
                </button>
              ))}
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 overflow-hidden transition-colors duration-300">
        {children}
      </main>
    </div>
  );
};
