import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { motion } from "framer-motion";

type UserRecord = {
  id: string;
  username: string;
  role: string | null;
  full_name: string | null;
  email: string | null;
};

interface LoginProps {
  onLogin: (user: UserRecord) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // === TEMA IGUAL QUE EN EL LAYOUT ===
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

  // ===== LOGIN HANDLER =====
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error: qErr } = await supabase
        .from("usuarios")
        .select("id, username, role, full_name, email")
        .eq("username", username)
        .eq("password", password)
        .limit(1)
        .maybeSingle();

      if (qErr) throw qErr;
      if (!data) throw new Error("Usuario o contraseña incorrectos");

      onLogin(data as UserRecord);
    } catch (err: any) {
      setError(err.message ?? "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 
      bg-gradient-to-br from-neutral-100 via-neutral-200 to-neutral-300
      dark:from-neutral-900 dark:via-neutral-950 dark:to-black transition-colors"
    >
      {/* === Toggle modo claro/oscuro === */}
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2 rounded-xl 
        bg-white/70 dark:bg-neutral-800/70 
        border border-neutral-300 dark:border-neutral-700 
        backdrop-blur-md shadow-md 
        text-neutral-700 dark:text-neutral-200
        hover:bg-white/90 dark:hover:bg-neutral-800 transition"
      >
        {theme === "light" ? "☀️" : "🌙"}
      </button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm p-8 rounded-3xl shadow-2xl
        bg-white/40 dark:bg-neutral-900/40 backdrop-blur-md
        border border-white/30 dark:border-neutral-700/30"
      >
        {/* LOGO EN TARJETA BLANCA */}
        <div className="flex flex-col items-center mb-6">
          <div
            className="p-4 bg-white dark:bg-white-900 rounded-2xl shadow 
            border border-neutral-200 dark:border-neutral-700"
          >
            <img src="/img/oldtree-logo.png" className="w-20 h-auto" />
          </div>

          <h1 className="mt-4 text-xl font-bold text-neutral-800 dark:text-neutral-100">
            Bienvenido
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Inicia sesión para continuar
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Usuario */}
          <div className="relative">
            <span className="absolute left-3 top-3 text-neutral-400 dark:text-neutral-500">
              👤
            </span>
            <input
              className="w-full pl-10 border border-neutral-300 dark:border-neutral-700
              bg-white/60 dark:bg-neutral-800/40 
              text-neutral-900 dark:text-neutral-100
              rounded-xl p-3 placeholder-neutral-500 dark:placeholder-neutral-400"
              type="text"
              placeholder="Usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          {/* Contraseña */}
          <div className="relative">
            <span className="absolute left-3 top-3 text-neutral-400 dark:text-neutral-500">
              🔒
            </span>
            <input
              className="w-full pl-10 border border-neutral-300 dark:border-neutral-700
              bg-white/60 dark:bg-neutral-800/40 
              text-neutral-900 dark:text-neutral-100
              rounded-xl p-3 placeholder-neutral-500 dark:placeholder-neutral-400"
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-600 dark:text-red-400 text-sm text-center">
              {error}
            </p>
          )}

          {/* Botón */}
          <button
            disabled={loading}
            className="w-full p-3 rounded-xl font-semibold 
            bg-blue-600 hover:bg-blue-700 text-white
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all shadow-lg hover:shadow-xl"
            type="submit"
          >
            {loading ? "Verificando..." : "Entrar"}
          </button>
        </form>

        <p className="text-center mt-6 text-xs text-neutral-600 dark:text-neutral-500">
          OldTree Stock Manager © {new Date().getFullYear()}
        </p>
      </motion.div>
    </div>
  );
}
