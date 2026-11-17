// Thin fetch wrapper. In development Vite proxies /api to the Express server.
const TOKEN_KEY = 'fr_token';

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (t) => {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
};

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  } catch {
    throw new Error('Cannot reach the server. Is it running on port 5000?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Open a file from an authenticated endpoint in a new tab. */
export async function openProtectedFile(path) {
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Could not open the file');
  }
  const url = URL.createObjectURL(await res.blob());
  window.open(url, '_blank', 'noopener');
}
