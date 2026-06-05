import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Proxy API calls to the ASP.NET Core dev server so the frontend stays same-origin.
    proxy: { '/api': 'http://localhost:5099' },
  },
})
