/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class", // 👈 esta línea activa el modo oscuro controlado por clase
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        green: {
          700: "#3f5f3a",
          800: "#2f4a2a",
          900: "#1f351d",
        },
      },
    },
  },
  plugins: [],
};
