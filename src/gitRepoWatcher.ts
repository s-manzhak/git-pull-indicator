import * as vscode from 'vscode';
import { pathsEqual, resolveFsPath } from './pathUtils';

const DEBOUNCE_MS = 1500;

const WATCH_PATTERNS = [
  '**/.git/logs/HEAD',
  '**/.git/refs/remotes/**',
  '**/.git/FETCH_HEAD',
  '**/.git/packed-refs',
];

/**
 * Fallback: watch lightweight git metadata from workspace root.
 * HEAD changes catch commits; remote refs catch push/fetch updates.
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
      for (const watchPattern of WATCH_PATTERNS) {
        const pattern = new vscode.RelativePattern(root, watchPattern);
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        watcher.onDidChange((uri) => this.onGitMetadataChanged(uri, repoSet));
        watcher.onDidCreate((uri) => this.onGitMetadataChanged(uri, repoSet));
        watcher.onDidDelete((uri) => this.onGitMetadataChanged(uri, repoSet));
        this.watchers.push(watcher);
      }
    }
  }

  private onGitMetadataChanged(uri: vscode.Uri, repoSet: Set<string>): void {
    const match = uri.fsPath.match(/^(.+)\/\.git\/(?:logs\/HEAD|refs\/remotes\/|FETCH_HEAD|packed-refs)/);
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
