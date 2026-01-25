import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
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
    VitePWA({
      registerType: 'prompt',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Ralph UI',
        short_name: 'Ralph',
        description: 'AI-powered coding agent orchestration',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        // Only precache critical app shell (hashed assets are cached at runtime)
        globPatterns: [
          'index.html',
          'assets/index-*.js',
          'assets/index-*.css',
          'assets/vendor-react-*.js',
        ],
        // Exclude lazy-loaded chunks (cached at runtime with CacheFirst)
        globIgnores: ['assets/vendor-terminal-*.js', 'assets/SettingsPage-*.js'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Prevent Vite from obscuring rust errors
  clearScreen: false,

  server: {
    port: 5173, // Use 5173 locally, Tailscale Serve proxies 1420 → 5173
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
