/** One `url 640w` srcset entry. Spaces and commas split srcset, so file names like "0-6 (1).jpg" get escaped. */
export function srcsetEntry(url: string, width: number): string {
  return `${url.replace(/ /g, '%20').replace(/,/g, '%2C')} ${width}w`
}
