const raw = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** URL path prefix when deployed under a subpath (e.g. `/stonksos`). Empty in local dev. */
export const basePath = raw.replace(/\/$/, "");

export function withBasePath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!basePath) return normalized;
  return `${basePath}${normalized}`;
}
