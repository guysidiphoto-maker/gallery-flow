/** Browser-compatible path.join that always uses forward slashes */
export function join(...parts: string[]): string {
  return parts
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
}
