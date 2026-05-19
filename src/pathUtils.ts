import { realpathSync } from 'fs';
import * as path from 'path';

const realpathCache = new Map<string, string>();

/** Normalize paths for reliable comparison between Explorer URIs and scan results. */
export function normalizeFsPath(p: string): string {
  return path.normalize(p).replace(/\\/g, '/').replace(/\/+$/, '');
}

/** Resolve symlinks (Desktop, etc.) so Explorer URI matches scanned path. */
export function resolveFsPath(p: string): string {
  const norm = normalizeFsPath(p);
  const cached = realpathCache.get(norm);
  if (cached) {
    return cached;
  }
  try {
    const resolved = normalizeFsPath(realpathSync(norm));
    realpathCache.set(norm, resolved);
    return resolved;
  } catch {
    realpathCache.set(norm, norm);
    return norm;
  }
}

export function pathsEqual(a: string, b: string): boolean {
  return resolveFsPath(a) === resolveFsPath(b);
}

export function toFileUri(fsPath: string): string {
  return resolveFsPath(fsPath);
}
