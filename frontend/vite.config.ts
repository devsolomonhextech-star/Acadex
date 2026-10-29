import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000', changeOrigin: true, ws: true } },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'ui-icons': ['@ant-design/icons'],
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'redux-vendor': ['@reduxjs/toolkit', 'react-redux', 'redux', 'redux-thunk', 'reselect'],
          'query-vendor': ['@tanstack/react-query'],
        },
      },
    },
  },
})
