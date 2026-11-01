// Backend base url comes from .env.development / .env.production.
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? 'http://localhost:8003';

export async function checkHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal });
    return res.ok;
  } catch {
    return false;
  }
}
