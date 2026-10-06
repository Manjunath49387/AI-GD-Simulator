/**
 * config.js — Environment-aware backend URL configuration
 *
 * LOCAL  → http://localhost:3000  (direct Node server)
 * PROD   → https://your-app.onrender.com  (Render persistent server)
 *
 * HOW TO UPDATE AFTER RENDER DEPLOY:
 *   Replace the RENDER_BACKEND_URL value below with your actual Render URL.
 */

(function () {
  // ─── SET YOUR RENDER BACKEND URL HERE AFTER DEPLOYING ──────────────────────
  const RENDER_BACKEND_URL = 'https://ai-gd-simulator.onrender.com';
  // ────────────────────────────────────────────────────────────────────────────

  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  /**
   * The base URL of the backend server.
   * - On localhost: same origin (Node server running on port 3000)
   * - On Vercel/production: points to Render backend
   */
  window.BACKEND_URL = isLocalhost
    ? window.location.origin
    : RENDER_BACKEND_URL;

  window.API_BASE_URL = window.BACKEND_URL + '/api';

  console.log(`[Config] Backend → ${window.BACKEND_URL} (${isLocalhost ? 'local' : 'production'})`);
})();
