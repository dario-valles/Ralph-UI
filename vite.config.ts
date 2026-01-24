import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

// Fix __dirname in ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', {}]],
      },
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Prevent Vite from obscuring rust errors
  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    host: '0.0.0.0', // Bind to all interfaces for Tailscale access
    allowedHosts: ['localhost', 'mac', '.ts.net', '.local'], // Allow Tailscale and local access
    watch: {
      // Ignore backend and data directories
      ignored: [
        '**/server/**',
        '**/.ralph/**',
        '**/.ralph-ui/**',
        '**/.worktrees/**',
        '**/.git/**',
        '**/ralph-ui.db/**',
        '**/ralph-ui.db-journal/**',
        path.resolve(__dirname, 'server'),
        path.resolve(__dirname, '.ralph'),
        path.resolve(__dirname, '.ralph-ui'),
        path.resolve(__dirname, '.worktrees'),
      ],
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-terminal': [
            '@xterm/xterm',
            '@xterm/addon-fit',
            '@xterm/addon-webgl',
          ],
        },
      },
    },
  },
}))
