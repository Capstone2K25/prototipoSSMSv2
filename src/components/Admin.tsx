// src/components/Admin.tsx
const CREDS_ID = "00000000-0000-0000-0000-000000000001"; // Fila única para credenciales ML

import { useEffect, useMemo, useState } from "react";
import {
  Settings,
  Users,
  Upload,
  Download,
  Database,
  X,
  Plus,
  Pencil,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  PlugZap,
  Unplug,
  KeyRound,
  RefreshCw,
  CalendarClock,
} from "lucide-react";
import { supabase } from "../supabaseClient";
import { emitAlert } from "../state/alertsBus";

const HIDDEN_USERNAMES = ["root"];
type Role = "admin" | "manager" | "viewer";

interface AdminProps {
  user: {
    id: string;
    username: string;
    role?: string | null;
    full_name?: string | null;
    email?: string | null;
  } | null;
}

type Usuario = {
  id: string;
  username: string;
  password?: string | null;
  full_name: string | null;
  email: string | null;
  role: Role;
  created_at?: string | null;
};

type MLCreds = {
  id?: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  updated_at?: string;
};

type Health = {
  connected: boolean;
  nickname?: string;
  expires_at_ms?: number;
  now_ms?: number;
  reason?: string;
};

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

type PwStrength = { score: 0 | 1 | 2 | 3 | 4; label: string; tips: string[] };

function assessPassword(pw: string): PwStrength {
  const tips: string[] = [];
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasNumber = /\d/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  const length = pw.length;

  let score = 0;
  if (length >= 8) score++;
  if (length >= 12) score++;
  if (hasLower && hasUpper) score++;
  if (hasNumber) score++;
  if (hasSymbol) score++;

  score = Math.min(4, Math.max(0, score - 1)) as 0 | 1 | 2 | 3 | 4;

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

export const Admin = ({ user }: AdminProps) => {
  const isAdmin = (user?.role ?? "").toLowerCase() === "admin";

  const [showNotification, setShowNotification] = useState<string | null>(null);

  // Modal de gestión de usuarios
  const [modalOpen, setModalOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Listado/paginación/búsqueda
  const [users, setUsers] = useState<Usuario[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [errorUsers, setErrorUsers] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const showingFrom = users.length ? (page - 1) * pageSize + 1 : 0;
  const showingTo = users.length ? (page - 1) * pageSize + users.length : 0;

  // Form (crear/editar)
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
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const toast = (msg: string) => {
    setShowNotification(msg);
    setTimeout(() => setShowNotification(null), 2500);
  };
  const toastAndLog = (
    msg: string,
    type: "info" | "error" | "sync" = "info"
  ) => {
    setShowNotification(msg);
    setTimeout(() => setShowNotification(null), 2500);
    emitAlert({ type, message: msg, channel: "usuarios" });
  };

  // ======= MERCADO LIBRE =======
  const [mlLoading, setMlLoading] = useState(false);
  const [mlCreds, setMlCreds] = useState<MLCreds | null>(null);
  const [mlModalOpen, setMlModalOpen] = useState(false);
  const [mlSaving, setMlSaving] = useState(false);
  const [mlForm, setMlForm] = useState<MLCreds>({
    access_token: "",
    refresh_token: "",
    expires_at: "",
  });

  // Health (estado real)
  const [health, setHealth] = useState<Health | null>(null);
  const connected = !!health?.connected;

  const expiresInMin = useMemo(() => {
    if (!health?.expires_at_ms || !health.now_ms) return null;
    return Math.floor((health.expires_at_ms - health.now_ms) / 60000);
  }, [health]);

  // ---- helpers ML
  const fetchHealth = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("meli-health", {
        body: {},
      });
      if (error) throw error;
      setHealth(data as Health);
    } catch (e) {
      console.error("meli-health error:", e);
      setHealth({ connected: false, reason: "fetch_error" });
    }
  };

  const loadMlCreds = async () => {
    setMlLoading(true);
    try {
      const { data } = await supabase
        .from("ml_credentials")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setMlCreds(data);

      if (data) {
        setMlForm({
          access_token: (data as any).access_token || "",
          refresh_token: (data as any).refresh_token || "",
          expires_at: (data as any).expires_at || "",
        });
      } else {
        setMlForm({ access_token: "", refresh_token: "", expires_at: "" });
      }
    } catch (e: any) {
      console.error("Error cargando ml_credentials:", e);
      setMlCreds(null);
    } finally {
      setMlLoading(false);
    }
  };

  // Guardar manual (modal)
  const saveMlCreds = async () => {
    if (!mlForm.access_token || !mlForm.refresh_token || !mlForm.expires_at) {
      toast("Completa access_token, refresh_token y expires_at");
      return;
    }
    setMlSaving(true);
    try {
      // normaliza expires_at a ISO
      let exp = mlForm.expires_at;
      const n = Number(exp);
      if (!Number.isNaN(n)) {
        exp = (n > 1e12 ? new Date(n) : new Date(n * 1000)).toISOString();
      } else {
        const parsed = Date.parse(exp);
        exp = Number.isFinite(parsed) ? new Date(parsed).toISOString() : exp;
      }

      const nowIso = new Date().toISOString();

      // 👇 si ya hay fila, actualiza por id; si no, inserta (UUID autogenerado)
      if (mlCreds?.id) {
        const { error } = await supabase
          .from("ml_credentials")
          .update({
            access_token: mlForm.access_token,
            refresh_token: mlForm.refresh_token,
            expires_at: exp,
            updated_at: nowIso,
          })
          .eq("id", mlCreds.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ml_credentials").insert({
          access_token: mlForm.access_token,
          refresh_token: mlForm.refresh_token,
          expires_at: exp,
          updated_at: nowIso,
        });
        if (error) throw error;
      }

      emitAlert({
        type: "sync",
        message: "Credenciales ML guardadas",
        channel: "ml",
      });
      await Promise.all([loadMlCreds(), fetchHealth()]);
      setMlModalOpen(false);
    } catch (e: any) {
      console.error(e);
      emitAlert({
        type: "error",
        message: `Error guardando credenciales ML: ${e.message || e}`,
        channel: "ml",
      });
    } finally {
      setMlSaving(false);
    }
  };

  const desconectar = async () => {
    if (!confirm("¿Desconectar Mercado Libre? Se eliminarán las credenciales."))
      return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "meli-disconnect",
        { method: "POST" }
      );
      if (error || data?.error)
        throw new Error(
          error?.message ?? data?.error ?? "Fallo al desconectar"
        );
      await fetchHealth();
      await loadMlCreds();
    } catch (e: any) {
      alert(e.message ?? "Error");
    } finally {
      setSaving(false);
    }
  };

  const startMeliOAuth = async () => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "meli-oauth-start"
      );
      if (error) throw new Error(error.message || "No se pudo iniciar OAuth");
      const authUrl = (data as any)?.auth_url;
      if (!authUrl) throw new Error("auth_url no recibido");
      window.location.href = authUrl;
    } catch (e: any) {
      emitAlert({
        type: "error",
        message: `Error iniciando OAuth: ${e.message || e}`,
        channel: "ml",
      });
    }
  };

  // Refrescar token (desde botón)
  const refreshMeliToken = async () => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "meli-refresh-token",
        {}
      );
      if (error) throw new Error(error.message || "No se pudo refrescar token");

      const { access_token, refresh_token, expires_in } = data as any;
      const expires_at = new Date(
        Date.now() + Number(expires_in) * 1000
      ).toISOString();

      if (!mlCreds?.id) {
        // si por alguna razón no hay fila cargada, inserta una nueva
        const { error: insErr } = await supabase.from("ml_credentials").insert({
          access_token,
          refresh_token: refresh_token || "",
          expires_at,
          updated_at: new Date().toISOString(),
        });
        if (insErr) throw insErr;
      } else {
        // actualiza por UUID existente
        const { error: upErr } = await supabase
          .from("ml_credentials")
          .update({
            access_token,
            refresh_token: refresh_token || mlCreds.refresh_token || "",
            expires_at,
            updated_at: new Date().toISOString(),
          })
          .eq("id", mlCreds.id);
        if (upErr) throw upErr;
      }

      emitAlert({
        type: "sync",
        message: "Token ML actualizado",
        channel: "ml",
      });
      await Promise.all([loadMlCreds(), fetchHealth()]);
    } catch (e: any) {
      emitAlert({
        type: "error",
        message: `No se pudo actualizar el token: ${e.message || e}`,
        channel: "ml",
      });
    }
  };

  // ------ DATA LOADER USUARIOS ------
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

  const openManager = () => {
    setModalOpen(true);
    setShowForm(false);
    setForm({ ...emptyForm });
    setEditingId(null);
    setPage(1);
    void loadUsers(1);
  };

  // ====== EFECTOS DE SINCRONIZACIÓN ======
  // Montaje inicial
  useEffect(() => {
    Promise.all([loadMlCreds(), fetchHealth()]).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cuando cambia la sesión (login/logout)
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      fetchHealth();
      loadMlCreds();
    });
    return () => subscription.unsubscribe();
  }, []);

  // Cuando vuelve del OAuth (?meli=ok)
  useEffect(() => {
    const qp = new URLSearchParams(window.location.search);
    if (qp.get("meli") === "ok") {
      fetchHealth();
      loadMlCreds();
    }
  }, []);

  // Al recuperar foco (evita estados viejos)
  useEffect(() => {
    const onFocus = () => {
      fetchHealth();
      loadMlCreds();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    void loadUsers(page, search, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  const onSearch = () => {
    setPage(1);
    void loadUsers(1, search, pageSize);
  };

  // ------ FORM LOGIC ------
  const startCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setFormError(null);
    setShowForm(true);
  };

  const startEdit = (u: Usuario) => {
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
    setShowForm(true);
  };

  const closeForm = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setFormError(null);
    setShowForm(false);
  };

  const handleSave = async () => {
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

    setSaving(true);
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

        toastAndLog(`Usuario actualizado: ${uname}`, "info");
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

        toastAndLog(`Usuario creado: ${uname}`, "sync");
      }

      const nextPage = page > totalPages ? totalPages : page;
      await loadUsers(nextPage);
      closeForm();
    } catch (e: any) {
      setFormError(nicePgError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u: Usuario) => {
    if (!confirm(`¿Eliminar al usuario "${u.username}"?`)) return;
    const { error } = await supabase.from("usuarios").delete().eq("id", u.id);
    if (error) {
      toast("No se pudo eliminar");
    } else {
      const afterCount = totalCount - 1;
      const newTotalPages = Math.max(1, Math.ceil(afterCount / pageSize));
      const nextPage = page > newTotalPages ? newTotalPages : page;
      await loadUsers(nextPage);
      toastAndLog(`Usuario eliminado: ${u.username}`, "error");

      if (editingId === u.id) closeForm();
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl">
          <p className="font-semibold">Acceso denegado</p>
          <p className="text-sm">
            Esta sección es exclusiva para administradores.
          </p>
        </div>
      </div>
    );
  }

  return (
  <div className="space-y-6 transition-colors duration-300">
    {showNotification && (
      <div className="fixed top-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50">
        {showNotification}
      </div>
    )}

    {/* Header */}
    <div className="flex items-center space-x-3">
      <div className="p-3 bg-neutral-900 text-white rounded-lg dark:bg-neutral-800">
        <Settings size={24} />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
          Administración
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Configuración y herramientas del sistema
        </p>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Gestión de usuarios */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 p-6 hover:shadow-lg transition-all">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-3 bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300 rounded-lg">
            <Users size={24} />
          </div>
          <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
            Gestión de Usuarios
          </h3>
        </div>
        <p className="text-neutral-600 dark:text-neutral-400 mb-6">
          Crear, editar o eliminar cuentas de usuario con diferentes niveles de acceso.
        </p>
        <button
          onClick={openManager}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          Gestionar usuarios
        </button>
      </div>

      {/* Credenciales Mercado Libre */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 p-6 hover:shadow-lg transition-all">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-3 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 rounded-lg">
            <PlugZap size={24} />
          </div>
          <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
            Credenciales Mercado Libre
          </h3>
        </div>

        {mlLoading ? (
          <p className="text-neutral-500 dark:text-neutral-400">Cargando estado…</p>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-1">
              {connected ? (
                <>
                  <CheckCircle className="text-green-600" size={18} />
                  <span className="text-green-600 font-semibold">Conectado</span>
                  {health?.nickname && (
                    <span className="text-neutral-500 dark:text-neutral-400 text-sm">
                      @{health.nickname}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <AlertCircle className="text-red-600" size={18} />
                  <span className="text-red-600 font-semibold">Desconectado</span>
                </>
              )}
            </div>

            <div className="text-xs text-neutral-600 dark:text-neutral-400 mb-4 flex items-center gap-2">
              <CalendarClock size={14} />
              {connected && typeof expiresInMin === "number" ? (
                <>Expira en ~{expiresInMin} min</>
              ) : mlCreds?.expires_at ? (
                <>Expira: {new Date(mlCreds.expires_at).toLocaleString("es-CL")}</>
              ) : (
                <>Sin expiración registrada</>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={startMeliOAuth}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-700 text-white"
              >
                <KeyRound size={16} />
                Conectar con Mercado Libre
              </button>

              <button
                onClick={() => setMlModalOpen(true)}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                <KeyRound size={16} />
                Editar manualmente
              </button>

              <button
                onClick={refreshMeliToken}
                disabled={!mlCreds?.refresh_token}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                <RefreshCw size={16} />
                Actualizar token
              </button>

              <button
                onClick={desconectar}
                disabled={!health?.connected || mlLoading || saving}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50"
              >
                <Unplug size={16} />
                Desconectar
              </button>
            </div>
          </>
        )}
      </div>

      {/* Otras tarjetas */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 p-6 hover:shadow-lg transition-all">
        <div className="p-3 bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-300 rounded-lg">
          <Upload size={24} />
        </div>
        <h3 className="text-lg font-bold text-neutral-900 dark:text-white mt-4 mb-2">
          Carga Masiva
        </h3>
        <p className="text-neutral-600 dark:text-neutral-400 mb-6">
          Importar productos desde archivos Excel o CSV…
        </p>
        <button className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors">
          Cargar Archivo Excel
        </button>
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 p-6 hover:shadow-lg transition-all">
        <div className="p-3 bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300 rounded-lg mb-4 inline-block">
          <Download size={24} />
        </div>
        <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-2">
          Exportar Reportes
        </h3>
        <p className="text-neutral-600 dark:text-neutral-400 mb-6">
          Descargar reportes en formato CSV…
        </p>
        <button className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors">
          Exportar Reporte CSV
        </button>
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 p-6 hover:shadow-lg transition-all">
        <div className="p-3 bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300 rounded-lg mb-4 inline-block">
          <Database size={24} />
        </div>
        <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-2">
          Backup de Datos
        </h3>
        <p className="text-neutral-600 dark:text-neutral-400 mb-6">
          Respaldo de base de datos…
        </p>
        <button className="w-full bg-orange-600 text-white py-3 rounded-lg font-semibold hover:bg-orange-700 transition-colors">
          Crear Backup
        </button>
      </div>
    </div>

    {/* MODALES */}
    {modalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
        <div className="w-full max-w-5xl bg-white dark:bg-neutral-900 rounded-2xl shadow-xl overflow-hidden transition-colors">
          {/* Header modal */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center gap-3">
              <Users />
              <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
                Gestión de usuarios
              </h3>
            </div>
            <button
              onClick={() => {
                setModalOpen(false);
                setShowForm(false);
              }}
              className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <X size={18} />
            </button>
          </div>

          {/* ... resto del modal igual, pero agregá:
                - dark:bg-neutral-800 en inputs
                - dark:text-neutral-300 en textos secundarios
                - dark:border-neutral-700 en bordes
          */}
        </div>
      </div>
    )}
  </div>
);

};
