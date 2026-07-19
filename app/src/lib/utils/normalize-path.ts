export function normalizePath(filepath: string) {
  return filepath.replaceAll("[", "%5B").replaceAll("]", "%5D");
}
