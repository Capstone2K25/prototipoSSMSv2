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
  Users,
  Plus,
  Pencil,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
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

type Role = "admin" | "manager" | "viewer";

type Usuario = {
  id: string;
  username: string;
  password?: string | null;
  full_name: string | null;
  email: string | null;
  role: Role;
  created_at?: string | null;
};

type PwStrength = { score: 0 | 1 | 2 | 3 | 4; label: string; tips: string[] };

const HIDDEN_USERNAMES = ["root"];
const USERNAME_RX = /^[a-zA-Z0-9._-]{3,32}$/;

function nicePgError(err: any): string {
  const code = err?.code || err?.details?.code;
  if (code === "23505") {
    const msg = (err?.message || "").toLowerCase();
    if (msg.includes("username")) return "El nombre de usuario ya existe.";
    if (msg.includes("email")) return "Ese email ya está registrado.";
    return "Registro duplicado.";
  }
  return err?.message || "Ocurrió un error inesperado.";
}

function assessPassword(pw: string): PwStrength {
  const tips: string[] = [];
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasNumber = /\d/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  const length = pw.length;

  let score: PwStrength["score"] = 0;
  if (length >= 8) score++;
  if (length >= 12) score++;
  if (hasLower && hasUpper) score++;
  if (hasNumber) score++;
  if (hasSymbol) score++;

  score = Math.min(4, Math.max(0, score - 1)) as PwStrength["score"];

  if (length < 8) tips.push("Usa al menos 8 caracteres");
  if (!(hasLower && hasUpper)) tips.push("Mezcla mayúsculas y minúsculas");
  if (!hasNumber) tips.push("Agrega números");
  if (!hasSymbol) tips.push("Incluye símbolos (!, %, $, …)");
  if (length >= 8 && score < 4) tips.push("Más longitud mejora la seguridad");

  const label =
    score === 0
      ? "Muy débil"
      : score === 1
      ? "Débil"
      : score === 2
      ? "Aceptable"
      : score === 3
      ? "Fuerte"
      : "Excelente";

  return { score, label, tips };
}

function strengthColor(score: number) {
  return score <= 1
    ? "bg-red-500"
    : score === 2
    ? "bg-yellow-500"
    : score === 3
    ? "bg-green-500"
    : "bg-emerald-600";
}

export const Layout = ({ children, onLogout, user }: LayoutProps) => {
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    return (localStorage.getItem("activeTab") as TabType) || "dashboard";
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  // Tema
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
    const i = setInterval(loadUnreadAlerts, 15000);
    return () => clearInterval(i);
  }, []);

  // ======= ESTADO GESTOR DE USUARIOS =======
  const [userManagerOpen, setUserManagerOpen] = useState(false);
  const [users, setUsers] = useState<Usuario[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [errorUsers, setErrorUsers] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [userToast, setUserToast] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const showingFrom = users.length ? (page - 1) * pageSize + 1 : 0;
  const showingTo = users.length ? (page - 1) * pageSize + users.length : 0;

  const emptyForm: Usuario = {
    id: "",
    username: "",
    password: "",
    full_name: "",
    email: "",
    role: "viewer",
  };
  const [form, setForm] = useState<Usuario>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const toastUser = (msg: string) => {
    setUserToast(msg);
    setTimeout(() => setUserToast(null), 2500);
  };

  const loadUsers = async (
    nextPage = page,
    currentSearch = search,
    currentPageSize = pageSize
  ) => {
    setLoadingUsers(true);
    setErrorUsers(null);
    try {
      const from = (nextPage - 1) * currentPageSize;
      const to = from + currentPageSize - 1;

      let query = supabase
        .from("usuarios")
        .select("id, username, full_name, email, role, created_at", {
          count: "exact",
        })
        .order("username", { ascending: true });

      for (const hidden of HIDDEN_USERNAMES) {
        query = query.neq("username", hidden);
      }

      const q = currentSearch.trim();
      if (q) {
        const term = `%${q}%`;
        query = query.or(
          `username.ilike.${term},full_name.ilike.${term},email.ilike.${term},role.ilike.${term}`
        );
      }

      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      setUsers((data || []) as Usuario[]);
      setTotalCount(count || 0);
      setPage(nextPage);
    } catch (e: any) {
      setErrorUsers(e?.message || "No se pudo cargar la lista");
    } finally {
      setLoadingUsers(false);
    }
  };

  const openUserManager = () => {
    setUserManagerOpen(true);
    setEditingId(null);
    setForm({ ...emptyForm });
    setFormError(null);
    setPage(1);
    void loadUsers(1);
  };

  const closeUserManager = () => {
    setUserManagerOpen(false);
    setEditingId(null);
    setForm({ ...emptyForm });
    setFormError(null);
  };

  const onSearchUsers = () => {
    setPage(1);
    void loadUsers(1, search, pageSize);
  };

  const startCreateUser = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setFormError(null);
  };

  const startEditUser = (u: Usuario) => {
    setEditingId(u.id);
    setForm({
      id: u.id,
      username: u.username,
      password: "",
      full_name: u.full_name || "",
      email: u.email || "",
      role: u.role,
    });
    setFormError(null);
  };

  const resetForm = () => {
    if (editingId) {
      const original = users.find((u) => u.id === editingId);
      if (original) {
        startEditUser(original);
        return;
      }
    }
    setForm({ ...emptyForm });
    setFormError(null);
  };

  const handleSaveUser = async () => {
    setFormError(null);

    const uname = form.username.trim();
    if (HIDDEN_USERNAMES.includes(uname)) {
      setFormError("Ese usuario está reservado por el sistema.");
      return;
    }

    if (!uname) {
      setFormError("El nombre de usuario es obligatorio");
      return;
    }
    if (!USERNAME_RX.test(uname)) {
      setFormError(
        'Usuario inválido: 3–32 caracteres, solo letras, números, ".", "_" o "-".'
      );
      return;
    }

    const email = form.email?.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError("Email inválido");
      return;
    }

    if (!editingId && !form.password?.trim()) {
      setFormError("La contraseña es obligatoria para crear un usuario");
      return;
    }

    setSavingUser(true);
    try {
      if (editingId) {
        const patch: Partial<Usuario> = {
          username: uname,
          full_name: form.full_name?.trim() || null,
          email: email || null,
          role: form.role,
        };
        if (form.password && form.password.length > 0) {
          patch.password = form.password;
        }

        const { error } = await supabase
          .from("usuarios")
          .update(patch)
          .eq("id", editingId);
        if (error) throw error;

        toastUser(`Usuario actualizado: ${uname}`);
      } else {
        const payload = {
          username: uname,
          password: form.password!,
          full_name: form.full_name?.trim() || null,
          email: email || null,
          role: form.role,
        };
        const { error } = await supabase.from("usuarios").insert(payload);
        if (error) throw error;

        toastUser(`Usuario creado: ${uname}`);
      }

      const nextPage = page > totalPages ? totalPages : page;
      await loadUsers(nextPage);
      setEditingId(null);
      setForm({ ...emptyForm });
    } catch (e: any) {
      setFormError(nicePgError(e));
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeleteUser = async (u: Usuario) => {
    if (!confirm(`¿Eliminar al usuario "${u.username}"?`)) return;
    const { error } = await supabase.from("usuarios").delete().eq("id", u.id);
    if (error) {
      toastUser("No se pudo eliminar");
    } else {
      const afterCount = totalCount - 1;
      const newTotalPages = Math.max(1, Math.ceil(afterCount / pageSize));
      const nextPage = page > newTotalPages ? newTotalPages : page;
      await loadUsers(nextPage);
      toastUser(`Usuario eliminado: ${u.username}`);

      if (editingId === u.id) {
        setEditingId(null);
        setForm({ ...emptyForm });
      }
    }
  };

  const tabs: Tab[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard size={20} />,
    },
    { id: "stock", label: "Stock Madre", icon: <Package size={20} /> },
    { id: "orders", label: "B2B", icon: <Building2 size={20} /> },
    { id: "wordpress", label: "Web", icon: <Globe size={20} /> },
    { id: "alerts", label: "Alertas", icon: <Bell size={20} /> },
  ];

  const tabColors: Partial<Record<TabType, string>> = {
    orders: "#6d28d9",
    wordpress: "#2563eb",
  };

  const handleTabChange = (tabId: TabType) => {
    setActiveTab(tabId);
    localStorage.setItem("activeTab", tabId);
    setMenuOpen(false);
    window.dispatchEvent(new CustomEvent("tabChange", { detail: tabId }));
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 dark:text-white transition-colors duration-300">
      {/* Mini toast gestor usuarios */}
      <AnimatePresence>
        {userToast && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            className="fixed top-4 right-4 z-50 rounded-xl bg-neutral-900 text-white px-4 py-2 text-sm shadow-lg border border-neutral-700"
          >
            {userToast}
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="bg-neutral-900 dark:bg-neutral-950 text-white shadow-lg border-b border-neutral-800 dark:border-neutral-700">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* ====== NAV BAR ====== */}
          <div className="h-16 flex items-center justify-between">
            {/* IZQUIERDA */}
            <div className="flex items-center space-x-3">
              <div className="w-30 h-10 rounded-lg bg-white flex items-center justify-center overflow-hidden ring-1 ring-black/10 dark:ring-white/10 shadow-lg">
                <img
                  src="/img/oldtree-logo.png"
                  alt="OldTree"
                  className="w-[90%] h-[90%] object-contain"
                />
              </div>
              <h1 className="font-bold text-white text-lg">Stock Manager</h1>
            </div>

            {/* CENTRO (DESKTOP) */}
            <div className="hidden lg:flex items-center justify-center flex-1">
              <div className="flex items-center space-x-1">
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  const color = tabColors[tab.id];
                  const hasColor = !!color;

                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleTabChange(tab.id)}
                      className={`relative whitespace-nowrap px-4 py-2 rounded-lg transition font-medium ${
                        isActive
                          ? hasColor
                            ? "text-white"
                            : "text-black"
                          : "text-neutral-300 hover:text-white hover:bg-neutral-800"
                      }`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="activeTabIndicator"
                          className="absolute inset-0 rounded-lg"
                          style={{ backgroundColor: hasColor ? color : "#fff" }}
                        />
                      )}
                      <span className="relative z-10 flex items-center gap-2">
                        {tab.icon}
                        {tab.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* DERECHA (DESKTOP) */}
            <div className="hidden lg:flex items-center justify-end space-x-4 relative">
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-neutral-800 hover:bg-neutral-700 transition"
              >
                <motion.div animate={{ rotate: settingsOpen ? 180 : 0 }}>
                  <Settings size={20} />
                </motion.div>
              </button>
            </div>

            {/* ===== HAMBURGUESA (MOBILE) ===== */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="lg:hidden absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-neutral-800"
            >
              {menuOpen ? <X size={26} /> : <Menu size={26} />}
            </button>
          </div>
        </div>
      </nav>
      {/* ===== MENÚ MOBILE ===== */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-2 bg-neutral-900 text-white rounded-xl shadow-xl p-4 border border-neutral-800 lg:hidden"
          >
            {/* Tabs */}
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const color = tabColors[tab.id];
              const hasColor = !!color;

              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    handleTabChange(tab.id);
                    setMenuOpen(false);
                  }}
                  className={`
        w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition
        ${
          isActive
            ? hasColor
              ? "text-white"
              : "bg-white text-black ring-1 ring-black/10 dark:bg-neutral-800 dark:text-white"
            : "text-neutral-300 hover:bg-neutral-800"
        }
      `}
                  style={isActive && hasColor ? { backgroundColor: color } : {}}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}

            {/* Aquí podrías volver a poner los tabs si quieres */}

            {/* Ajustes */}
            <button
              onClick={() => {
                setMenuOpen(false);
                setSettingsOpen(true);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-neutral-300 hover:bg-neutral-800 mt-1"
            >
              <Settings size={20} />
              Ajustes
            </button>

            {/* Logout */}
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-400 hover:bg-red-700 hover:text-white mt-1"
            >
              <LogOut />
              Cerrar sesión
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {/* PANEL AJUSTES GLOBAL (MOBILE + DESKTOP) */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex justify-center items-start bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className="mt-6 w-[90%] max-w-md bg-neutral-900 dark:bg-neutral-950 text-white 
                   rounded-xl shadow-2xl border border-neutral-700 relative p-5"
            >
              {/* BOTÓN DE CERRAR */}
              <button
                onClick={() => setSettingsOpen(false)}
                className="absolute right-4 top-4 p-2 rounded-full bg-neutral-800 
                     hover:bg-neutral-700 transition"
              >
                <X size={20} />
              </button>

              <h3 className="text-xl font-semibold mb-6">Ajustes</h3>

              {/* Tema */}
              <button
                onClick={toggleTheme}
                className="w-full flex justify-between items-center px-3 py-3 
                     rounded-lg bg-neutral-800 hover:bg-neutral-700"
              >
                Tema
                {theme === "light" ? <Sun /> : <Moon />}
              </button>

              {/* Gestor de usuarios */}
              <button
                onClick={() => {
                  if (user?.role !== "admin") {
                    alert("No tienes permisos.");
                    return;
                  }
                  setSettingsOpen(false);
                  openUserManager();
                }}
                className="w-full flex justify-between items-center px-3 py-3 rounded-lg 
                     hover:bg-neutral-800 mt-3"
              >
                <span className="flex items-center gap-2">
                  <Users size={16} /> Gestor de usuarios
                </span>
                <span className="text-[10px] uppercase text-neutral-400">
                  Admin
                </span>
              </button>

              {/* Logout */}
              <button
                onClick={onLogout}
                className="w-full mt-6 px-3 py-3 rounded-xl bg-red-700 hover:bg-red-800"
              >
                Cerrar sesión
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONTENIDO */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 transition">
        {children}
      </main>

      {/* ======= SIDE-SHEET GESTOR DE USUARIOS ======= */}
      <AnimatePresence>
        {userManagerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm"
          >
            {/* Cerrar al click en fondo */}
            <div className="flex-1" onClick={closeUserManager} />

            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.25 }}
              className="w-full max-w-4xl h-full bg-white dark:bg-neutral-900 border-l border-neutral-200 dark:border-neutral-800 shadow-2xl flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
                    <Users size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                      Gestión de usuarios
                    </h2>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      Crea, edita y administra los accesos al sistema.
                    </p>
                  </div>
                </div>

                <button
                  onClick={closeUserManager}
                  className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-300"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Contenido */}
              <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                {/* Lista de usuarios */}
                <div className="lg:w-2/3 border-b lg:border-b-0 lg:border-r border-neutral-200 dark:border-neutral-800 flex flex-col">
                  {/* Search / actions */}
                  <div className="px-6 py-4 flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[220px]">
                      <span className="absolute left-3 top-2.5 text-neutral-400 dark:text-neutral-500">
                        <Search size={18} />
                      </span>
                      <input
                        className="w-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-200 rounded-xl pl-9 pr-3 py-2 text-sm placeholder-neutral-500 dark:placeholder-neutral-400"
                        placeholder="Buscar por usuario, nombre, email o rol…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && onSearchUsers()}
                      />
                    </div>

                    <button
                      onClick={onSearchUsers}
                      className="px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-sm text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      Buscar
                    </button>

                    <button
                      onClick={() => loadUsers(page)}
                      className="px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-sm text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      Refrescar
                    </button>

                    <button
                      onClick={startCreateUser}
                      className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium inline-flex items-center gap-1 hover:bg-blue-700"
                    >
                      <Plus size={16} />
                      Nuevo
                    </button>
                  </div>

                  {/* Tabla */}
                  <div className="flex-1 overflow-hidden px-6 pb-4">
                    <div className="h-full overflow-auto border border-neutral-200 dark:border-neutral-700 rounded-xl">
                      <table className="w-full text-xs sm:text-sm">
                        <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-neutral-700 dark:text-neutral-300 sticky top-0 z-10">
                          <tr className="text-left">
                            <th className="px-3 py-2">Usuario</th>
                            <th className="px-3 py-2 hidden md:table-cell">
                              Nombre
                            </th>
                            <th className="px-3 py-2 hidden md:table-cell">
                              Email
                            </th>
                            <th className="px-3 py-2">Rol</th>
                            <th className="px-3 py-2 text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loadingUsers && (
                            <tr>
                              <td
                                className="px-3 py-3 text-neutral-500 dark:text-neutral-400"
                                colSpan={5}
                              >
                                Cargando…
                              </td>
                            </tr>
                          )}

                          {errorUsers && !loadingUsers && (
                            <tr>
                              <td
                                className="px-3 py-3 text-red-600 dark:text-red-400"
                                colSpan={5}
                              >
                                {errorUsers}
                              </td>
                            </tr>
                          )}

                          {!loadingUsers &&
                            !errorUsers &&
                            users.length === 0 && (
                              <tr>
                                <td
                                  className="px-3 py-3 text-neutral-500 dark:text-neutral-400"
                                  colSpan={5}
                                >
                                  Sin resultados.
                                </td>
                              </tr>
                            )}

                          {users.map((u) => (
                            <tr
                              key={u.id}
                              className="border-t border-neutral-100 dark:border-neutral-800"
                            >
                              <td className="px-3 py-2 text-neutral-900 dark:text-neutral-100 font-medium">
                                {u.username}
                              </td>
                              <td className="px-3 py-2 text-neutral-700 dark:text-neutral-300 hidden md:table-cell">
                                {u.full_name || "-"}
                              </td>
                              <td className="px-3 py-2 text-neutral-700 dark:text-neutral-300 hidden md:table-cell">
                                {u.email || "-"}
                              </td>
                              <td className="px-3 py-2">
                                <span className="inline-flex items-center rounded-full border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 px-2 py-0.5 text-[11px] capitalize">
                                  {u.role}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2 justify-end">
                                  <button
                                    onClick={() => startEditUser(u)}
                                    className="px-2 py-1 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 inline-flex items-center gap-1 text-xs"
                                  >
                                    <Pencil size={14} />
                                    Editar
                                  </button>
                                  <button
                                    onClick={() => handleDeleteUser(u)}
                                    className="px-2 py-1 rounded-lg border border-neutral-300 dark:border-neutral-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 inline-flex items-center gap-1 text-xs"
                                  >
                                    <Trash2 size={14} />
                                    Eliminar
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Paginación */}
                    <div className="flex flex-wrap items-center gap-3 justify-between mt-3 text-xs sm:text-sm">
                      <div className="text-neutral-600 dark:text-neutral-400">
                        {showingFrom}-{showingTo} de {totalCount}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => page > 1 && loadUsers(page - 1)}
                          disabled={page <= 1 || loadingUsers}
                          className="inline-flex items-center gap-1 px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-xl disabled:opacity-50 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        >
                          <ChevronLeft size={14} /> Anterior
                        </button>

                        <span className="text-neutral-700 dark:text-neutral-300">
                          Página {page} de {totalPages}
                        </span>

                        <button
                          onClick={() =>
                            page < totalPages && loadUsers(page + 1)
                          }
                          disabled={page >= totalPages || loadingUsers}
                          className="inline-flex items-center gap-1 px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-xl disabled:opacity-50 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        >
                          Siguiente <ChevronRight size={14} />
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-neutral-600 dark:text-neutral-400 text-xs">
                          Por página
                        </span>
                        <select
                          className="border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 rounded-xl py-1.5 px-2 text-xs text-neutral-900 dark:text-neutral-200"
                          value={pageSize}
                          onChange={(e) => {
                            const ps = Number(e.target.value);
                            setPageSize(ps);
                            setPage(1);
                            void loadUsers(1, search, ps);
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

                {/* Formulario */}
                <div className="lg:w-1/3 px-6 py-4 flex flex-col gap-3 bg-neutral-50 dark:bg-neutral-950/60 border-t lg:border-t-0 border-neutral-200 dark:border-neutral-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      {editingId ? "Editar usuario" : "Nuevo usuario"}
                    </h3>
                    <button
                      onClick={resetForm}
                      className="text-xs px-3 py-1 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      Limpiar
                    </button>
                  </div>

                  <div className="space-y-3">
                    <input
                      className="w-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-200 rounded-xl p-2.5 text-sm"
                      placeholder="Usuario"
                      value={form.username}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, username: e.target.value }))
                      }
                    />

                    <input
                      className="w-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-200 rounded-xl p-2.5 text-sm"
                      type="password"
                      placeholder={
                        editingId ? "Nueva contraseña (opcional)" : "Contraseña"
                      }
                      value={form.password || ""}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, password: e.target.value }))
                      }
                    />

                    {(form.password ?? "").length > 0 &&
                      (() => {
                        const s = assessPassword(form.password || "");
                        return (
                          <div className="space-y-1">
                            <div className="flex gap-1">
                              {[0, 1, 2, 3].map((i) => (
                                <div
                                  key={i}
                                  className={`h-1.5 flex-1 rounded ${
                                    i <= s.score - 1
                                      ? strengthColor(s.score)
                                      : "bg-neutral-200 dark:bg-neutral-700"
                                  }`}
                                />
                              ))}
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-neutral-600 dark:text-neutral-400">
                                Seguridad: <strong>{s.label}</strong>
                              </span>
                              <span className="text-neutral-400 dark:text-neutral-500">
                                {(form.password || "").length} caracteres
                              </span>
                            </div>

                            {s.score < 3 && (
                              <ul className="text-[11px] text-neutral-500 dark:text-neutral-400 list-disc pl-4 space-y-0.5">
                                {s.tips.slice(0, 2).map((t, idx) => (
                                  <li key={idx}>{t}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })()}

                    <input
                      className="w-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-200 rounded-xl p-2.5 text-sm"
                      placeholder="Nombre completo (opcional)"
                      value={form.full_name || ""}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, full_name: e.target.value }))
                      }
                    />

                    <input
                      className="w-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-200 rounded-xl p-2.5 text-sm"
                      type="email"
                      placeholder="Email (opcional)"
                      value={form.email || ""}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, email: e.target.value }))
                      }
                    />

                    <select
                      className="w-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-200 rounded-xl p-2.5 text-sm"
                      value={form.role}
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          role: e.target.value as Role,
                        }))
                      }
                    >
                      <option value="viewer">Viewer</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>

                    {formError && (
                      <div className="flex items-start gap-2 text-xs text-red-500">
                        <AlertCircle size={14} />
                        <span>{formError}</span>
                      </div>
                    )}

                    {(() => {
                      const s = assessPassword(form.password || "");

                      // Reglas:
                      // - Crear: contraseña obligatoria y score >= 2
                      // - Editar: contraseña opcional, pero si la escribe debe tener score >= 2
                      const passwordIsWeak =
                        (!editingId && s.score < 2) ||
                        (editingId &&
                          form.password &&
                          form.password.length > 0 &&
                          s.score < 2);

                      const savingDisabled = savingUser || passwordIsWeak;

                      return (
                        <button
                          onClick={handleSaveUser}
                          disabled={savingDisabled}
                          className={`w-full mt-2 py-2.5 rounded-lg text-sm font-semibold transition-colors
        ${
          savingDisabled
            ? "bg-neutral-400 dark:bg-neutral-700 text-white cursor-not-allowed"
            : "bg-blue-600 hover:bg-blue-700 text-white"
        }`}
                        >
                          {savingUser
                            ? "Guardando…"
                            : passwordIsWeak
                            ? "Contraseña débil"
                            : editingId
                            ? "Guardar cambios"
                            : "Crear usuario"}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
