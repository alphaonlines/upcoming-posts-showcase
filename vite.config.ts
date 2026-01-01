import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: "/owner/",
  plugins: [react()],
  server: {
    // Bind to IPv6 any-address so both `localhost` (::1) and `127.0.0.1` work reliably.
    host: "::",
    port: 5173,
  },
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY)
  }
});
