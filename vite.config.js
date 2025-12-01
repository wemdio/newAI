import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  },
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Separate heavy libraries
            if (id.includes('@supabase')) {
              return 'supabase';
            }
            if (id.includes('framer-motion')) {
              return 'framer-motion';
            }
            
            // Core React vendor chunk
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor';
            }
            
            // Note: lucide-react is intentionally left out of manualChunks 
            // to allow proper tree-shaking per component usage.
          }
        }
      }
    }
  }
})
