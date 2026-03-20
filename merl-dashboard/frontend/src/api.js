import axios from 'axios';

/**
 * Centralised Axios instance for the MERL Dashboard API.
 *
 * In Docker / production the VITE_API_URL env-var points to the backend
 * (e.g. "https://api.example.com/api").
 * For local dev the Vite proxy rewrites /api → backend:8000.
 * On GitHub Pages (no backend) requests will 404 — the interceptor below
 * converts these into empty responses so pages render gracefully.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15_000,
  headers: { Accept: 'application/json' },
});

// When there is no backend (e.g. static GitHub Pages deployment), GET
// requests return 404.  Convert those into empty successes so the UI
// shows "no data" instead of a scary error banner.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 404 && error.config?.method === 'get') {
      return { data: { items: [], total: 0 } };
    }
    return Promise.reject(error);
  },
);

export default api;
