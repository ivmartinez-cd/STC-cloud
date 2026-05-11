const BASE = '/api/v1';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: 'include',
      signal: controller.signal,
      headers: { ...headers, ...(init.headers as Record<string, string>) },
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error('La solicitud tardó demasiado. Verifica tu conexión.');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (res.status === 401) {
    window.location.replace('/login');
    throw new Error('Sesión expirada');
  }

  const text = await res.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (err) {
    console.warn('Error parsing JSON:', text, err);
  }

  if (!res.ok) {
    const errorMsg = (body as { error?: string })?.error || `HTTP ${res.status}`;
    throw new Error(errorMsg);
  }

  return body as T;
}

export const api = {
  get:    <T>(path: string)                 => request<T>(path),
  post:   <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST',   body: body !== undefined ? JSON.stringify(body) : undefined }),
  put:    <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT',    body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string)                 => request<T>(path, { method: 'DELETE' }),
};
