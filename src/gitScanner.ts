import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import { resolveFsPath } from './pathUtils';

const DEFAULT_IGNORE_FOLDERS = [
  'node_modules',
  '.cache',
  '.idea',
  '.vscode',
  'vendor',
  'dist',
  'build',
  'data',
  'docker',
];

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const gitPath = path.join(dir, '.git');
    const stat = await fs.stat(gitPath);
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

export async function scanRepositories(
  workspaceFolders: readonly vscode.WorkspaceFolder[],
  maxDepth: number
): Promise<string[]> {
  const repos: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) {
      return;
    }

    if (await isGitRepo(dir)) {
      repos.push(resolveFsPath(dir));
      return;
    }

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (DEFAULT_IGNORE_FOLDERS.includes(entry.name)) {
        continue;
      }
      await walk(path.join(dir, entry.name), depth + 1);
    }
  }

  for (const folder of workspaceFolders) {
    await walk(folder.uri.fsPath, 0);
  }

  return repos;
}
