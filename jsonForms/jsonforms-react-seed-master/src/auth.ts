// src/auth.ts
export const getToken = () => localStorage.getItem('mgr_token') || '';
export const setToken = (t: string) => localStorage.setItem('mgr_token', t);
export const clearToken = () => localStorage.removeItem('mgr_token');

export const authHeaders = () => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};
