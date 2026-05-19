import * as vscode from 'vscode';
import { resolveFsPath } from './pathUtils';

const DEBOUNCE_MS = 400;
const REATTACH_MS = 5000;

interface GitRepository {
  rootUri: vscode.Uri;
  state: {
    onDidChange: vscode.Event<void>;
  };
}

interface GitApi {
  repositories: GitRepository[];
  onDidOpenRepository: vscode.Event<GitRepository>;
}

interface GitExtensionExports {
  getAPI(version: 1): GitApi;
}

export function subscribeGitExtension(
  onRepoChanged: (repoPath: string) => void
): vscode.Disposable {
  const disposables: vscode.Disposable[] = [];
  const subscribed = new Set<string>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  let reattachTimer: ReturnType<typeof setInterval> | undefined;
  let api: GitApi | undefined;

  function schedule(repoPath: string): void {
    const key = resolveFsPath(repoPath);
    const t = pending.get(key);
    if (t) {
      clearTimeout(t);
    }
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        onRepoChanged(key);
      }, DEBOUNCE_MS)
    );
  }

  function attach(repo: GitRepository): void {
    const root = resolveFsPath(repo.rootUri.fsPath);
    if (subscribed.has(root)) {
      return;
    }
    subscribed.add(root);
    disposables.push(repo.state.onDidChange(() => schedule(root)));
  }

  function attachAll(): void {
    if (!api) {
      return;
    }
    for (const repo of api.repositories) {
      attach(repo);
    }
  }

  void (async () => {
    const ext = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
    if (!ext) {
      console.warn('[Git Pull Indicator] vscode.git extension not found');
      return;
    }
    const exports = ext.isActive ? ext.exports : await ext.activate();
    api = exports.getAPI(1);
    attachAll();
    disposables.push(api.onDidOpenRepository((repo) => attach(repo)));
    reattachTimer = setInterval(attachAll, REATTACH_MS);
    console.log(
      `[Git Pull Indicator] Git API: ${api.repositories.length} repositories`
    );
  })();

  return {
    dispose: () => {
      if (reattachTimer) {
        clearInterval(reattachTimer);
      }
      for (const d of disposables) {
        d.dispose();
      }
      for (const t of pending.values()) {
        clearTimeout(t);
      }
      pending.clear();
      subscribed.clear();
    },
  };
}
