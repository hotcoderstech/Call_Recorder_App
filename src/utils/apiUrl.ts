/** Normalizes a backend base URL so it always ends in exactly `/api/v1`. */
export function normalizeApiBaseUrl(url: string): string {
  const cleaned = url.trim().replace(/\/+$/, '');
  if (!cleaned) return cleaned;
  if (cleaned.endsWith('/api/v1')) return cleaned;
  if (cleaned.endsWith('/api')) return `${cleaned}/v1`;
  return `${cleaned}/api/v1`;
}
