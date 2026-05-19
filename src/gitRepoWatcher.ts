import * as vscode from 'vscode';
import { pathsEqual, resolveFsPath } from './pathUtils';

const DEBOUNCE_MS = 1500;

/**
 * Fallback: watch .git/logs/HEAD from workspace root (works when vscode.git events are unavailable).
 */
export class GitRepoWatcher {
  private readonly watchers: vscode.Disposable[] = [];
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly onRepoChanged: (repoPath: string) => void) {}

  updateRepos(repoPaths: string[], workspaceRoots: readonly vscode.WorkspaceFolder[]): void {
    this.dispose();
    if (workspaceRoots.length === 0) {
      return;
    }

    const repoSet = new Set(repoPaths.map(resolveFsPath));

    for (const root of workspaceRoots) {
      const pattern = new vscode.RelativePattern(root, '**/.git/logs/HEAD');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      watcher.onDidChange((uri) => this.onGitLogChanged(uri, repoSet));
      watcher.onDidCreate((uri) => this.onGitLogChanged(uri, repoSet));
      this.watchers.push(watcher);
    }
  }

  private onGitLogChanged(uri: vscode.Uri, repoSet: Set<string>): void {
    const match = uri.fsPath.match(/^(.+)\/\.git\/logs\/HEAD$/);
    if (!match) {
      return;
    }
    const repoPath = resolveFsPath(match[1]);
    const known = [...repoSet].find((r) => pathsEqual(r, repoPath));
    if (!known) {
      return;
    }
    this.schedule(known);
  }

  private schedule(repoPath: string): void {
    const existing = this.pending.get(repoPath);
    if (existing) {
      clearTimeout(existing);
    }
    this.pending.set(
      repoPath,
      setTimeout(() => {
        this.pending.delete(repoPath);
        this.onRepoChanged(repoPath);
      }, DEBOUNCE_MS)
    );
  }

  dispose(): void {
    for (const w of this.watchers) {
      w.dispose();
    }
    this.watchers.length = 0;
    for (const t of this.pending.values()) {
      clearTimeout(t);
    }
    this.pending.clear();
  }
}
