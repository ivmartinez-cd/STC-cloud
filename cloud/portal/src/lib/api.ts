const BASE = '/api/v1';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('stc_token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (init.body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string>) },
  });

  if (res.status === 401) {
    localStorage.removeItem('stc_token');
    localStorage.removeItem('stc_email');
    window.location.replace('/login');
    throw new Error('Sesión expirada');
  }

  const text = await res.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    console.warn('Error parsing JSON:', text);
  }

  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return body as T;
}

export const api = {
  get:  <T>(path: string)                  => request<T>(path),
  post: <T>(path: string, body?: unknown)  => request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  put:  <T>(path: string, body?: unknown)  => request<T>(path, { method: 'PUT',  body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string)                => request<T>(path, { method: 'DELETE' }),
};
