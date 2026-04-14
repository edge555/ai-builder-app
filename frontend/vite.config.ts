import path from "path";

import react from "@vitejs/plugin-react";
import { componentTagger } from "lovable-tagger";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@/shared": path.resolve(__dirname, "../shared/src"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-webcontainer': ['@webcontainer/api'],
          'vendor-monaco': ['@monaco-editor/react'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-syntax': ['react-syntax-highlighter'],
        }
      }
    },
    sourcemap: false,
    chunkSizeWarningLimit: 500,
  },
}));
