/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bgDark: "#03030d",
        bgGlass: "rgba(10, 10, 26, 0.6)",
        borderGlass: "rgba(255, 255, 255, 0.08)",
        neonCyan: "#00f0ff",
        neonPurple: "#bd00ff",
        neonPink: "#ff007f",
        cardGlass: "rgba(18, 18, 38, 0.45)",
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'cyan-glow': '0 0 15px rgba(0, 240, 255, 0.35)',
        'purple-glow': '0 0 15px rgba(189, 0, 255, 0.35)',
        'neon-border': '0 0 8px rgba(0, 240, 255, 0.2), 0 0 20px rgba(189, 0, 255, 0.15)',
        'neon-glow': '0 0 20px rgba(0, 240, 255, 0.5), 0 0 40px rgba(189, 0, 255, 0.3)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glowPulse: {
          '0%': { boxShadow: '0 0 5px rgba(0, 240, 255, 0.2), 0 0 10px rgba(189, 0, 255, 0.1)' },
          '100%': { boxShadow: '0 0 15px rgba(0, 240, 255, 0.5), 0 0 25px rgba(189, 0, 255, 0.3)' },
        }
      }
    },
  },
  plugins: [],
}
