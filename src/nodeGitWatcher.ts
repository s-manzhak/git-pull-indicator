import { FSWatcher, watch } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { pathsEqual, resolveFsPath } from './pathUtils';

const DEBOUNCE_MS = 400;

/**
 * One recursive fs.watch per workspace root (avoids EMFILE from 64+ per-repo watchers).
 */
export class NodeGitWatcher {
  private readonly watchers: FSWatcher[] = [];
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();
  private repoPaths: string[] = [];

  constructor(private readonly onRepoChanged: (repoPath: string) => void) {}

  updateRepos(
    repoPaths: string[],
    workspaceRoots: readonly vscode.WorkspaceFolder[]
  ): void {
    this.dispose();
    this.repoPaths = repoPaths.map(resolveFsPath);

    for (const root of workspaceRoots) {
      const rootPath = resolveFsPath(root.uri.fsPath);
      try {
        const w = watch(rootPath, { recursive: true }, (_event, filename) => {
          if (!filename) {
            return;
          }
          const normalized = filename.replace(/\\/g, '/');
          if (
            !normalized.includes('.git/logs/HEAD') &&
            !normalized.includes('.git/refs/heads/') &&
            !normalized.endsWith('.git/HEAD')
          ) {
            return;
          }
          const repo = this.repoFromGitPath(rootPath, normalized);
          if (repo) {
            this.schedule(repo);
          }
        });
        this.watchers.push(w);
        console.log(`[Git Pull Indicator] fs.watch: ${rootPath}`);
      } catch (err) {
        console.warn(`[Git Pull Indicator] fs.watch failed for ${rootPath}:`, err);
      }
    }
  }

  /** e.g. "ass/.git/logs/HEAD" -> /.../Git/ass */
  private repoFromGitPath(workspaceRoot: string, relativeGitPath: string): string | undefined {
    const match = relativeGitPath.match(/^(.+?)\/.git\//);
    if (!match) {
      return undefined;
    }
    const candidate = resolveFsPath(path.join(workspaceRoot, match[1]));
    return this.repoPaths.find((r) => pathsEqual(r, candidate));
  }

  private schedule(repoPath: string): void {
    const key = resolveFsPath(repoPath);
    const t = this.pending.get(key);
    if (t) {
      clearTimeout(t);
    }
    this.pending.set(
      key,
      setTimeout(() => {
        this.pending.delete(key);
        this.onRepoChanged(key);
      }, DEBOUNCE_MS)
    );
  }

  dispose(): void {
    for (const w of this.watchers) {
      w.close();
    }
    this.watchers.length = 0;
    for (const t of this.pending.values()) {
      clearTimeout(t);
    }
    this.pending.clear();
    this.repoPaths = [];
  }
}

export function subscribeDocumentSave(
  getRepoPaths: () => string[],
  onRepoChanged: (repoPath: string) => void
): vscode.Disposable {
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  return vscode.workspace.onDidSaveTextDocument((doc) => {
    if (doc.uri.scheme !== 'file') {
      return;
    }
    const filePath = resolveFsPath(doc.uri.fsPath);
    const repo = getRepoPaths().find(
      (r) => filePath === resolveFsPath(r) || filePath.startsWith(resolveFsPath(r) + '/')
    );
    if (!repo) {
      return;
    }
    const key = resolveFsPath(repo);
    const t = pending.get(key);
    if (t) {
      clearTimeout(t);
    }
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        onRepoChanged(key);
      }, 600)
    );
  });
}

/** Refresh when user returns to Cursor after commit in external terminal. */
export function subscribeWindowFocus(
  onFocus: () => void
): vscode.Disposable {
  let debounce: ReturnType<typeof setTimeout> | undefined;
  return vscode.window.onDidChangeWindowState((state) => {
    if (!state.focused) {
      return;
    }
    if (debounce) {
      clearTimeout(debounce);
    }
    debounce = setTimeout(() => {
      debounce = undefined;
      onFocus();
    }, 300);
  });
}
