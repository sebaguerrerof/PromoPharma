/// <reference types="vitest" />

import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import path from 'path'
import { browserslistToTargets } from 'lightningcss'
import browserslist from 'browserslist'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  css: {
    transformer: 'lightningcss',
    lightningcss: {
      targets: browserslistToTargets(browserslist('safari >= 14, ios_saf >= 14, chrome >= 87, firefox >= 78')),
    },
  },
  build: {
    target: ['es2020', 'safari14'],
    cssMinify: 'lightningcss',
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
          vendor: ['react', 'react-dom', 'react-router-dom'],
          export: ['pptxgenjs', 'jspdf', 'html2canvas'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
  }
})
