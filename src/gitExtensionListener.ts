import * as vscode from 'vscode';
import {
  activateGitApi,
  GitRepository,
  setGitApi,
  statusFromGitRepository,
} from './gitApiStatus';
import { resolveFsPath } from './pathUtils';
import { RepoStatus } from './types';

const DEBOUNCE_MS = 400;
const REATTACH_MS = 5000;

export function subscribeGitExtension(
  onRepoChanged: (
    repoPath: string,
    status?: RepoStatus,
    dirtyOnly?: boolean
  ) => void
): vscode.Disposable {
  const disposables: vscode.Disposable[] = [];
  const subscribed = new Set<string>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const lastSync = new Map<string, string>();
  let reattachTimer: ReturnType<typeof setInterval> | undefined;
  let api: Awaited<ReturnType<typeof activateGitApi>> | undefined;

  function schedule(
    repoPath: string,
    status?: RepoStatus,
    dirtyOnly?: boolean
  ): void {
    const key = resolveFsPath(repoPath);
    const t = pending.get(key);
    if (t) {
      clearTimeout(t);
    }
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        onRepoChanged(key, status, dirtyOnly);
      }, DEBOUNCE_MS)
    );
  }

  function onStateChange(repo: GitRepository): void {
    const root = resolveFsPath(repo.rootUri.fsPath);
    const head = repo.state.HEAD;
    const syncKey = `${head?.commit ?? ''}:${head?.ahead ?? ''}:${head?.behind ?? ''}:${head?.upstream?.remote ?? ''}/${head?.upstream?.name ?? ''}`;
    const syncChanged = lastSync.get(root) !== syncKey;
    lastSync.set(root, syncKey);

    const status = statusFromGitRepository(repo);
    if (syncChanged || head?.ahead === undefined || head?.behind === undefined) {
      schedule(root);
      return;
    }
    // Working tree changed only — do not overwrite behind/ahead from API (often 0).
    schedule(root, status, true);
  }

  function attach(repo: GitRepository): void {
    const root = resolveFsPath(repo.rootUri.fsPath);
    if (subscribed.has(root)) {
      return;
    }
    subscribed.add(root);
    const head = repo.state.HEAD;
    lastSync.set(
      root,
      `${head?.commit ?? ''}:${head?.ahead ?? ''}:${head?.behind ?? ''}:${head?.upstream?.remote ?? ''}/${head?.upstream?.name ?? ''}`
    );
    disposables.push(repo.state.onDidChange(() => onStateChange(repo)));
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
    api = await activateGitApi();
    if (!api) {
      console.warn('[Git Pull Indicator] vscode.git extension not found');
      return;
    }
    attachAll();
    disposables.push(api.onDidOpenRepository((repo) => attach(repo)));
    reattachTimer = setInterval(attachAll, REATTACH_MS);
    console.log(
      `[Git Pull Indicator] Git API: ${api.repositories.length} repositories`
    );
  })();

  return {
    dispose: () => {
      setGitApi(undefined);
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
      lastSync.clear();
    },
  };
}
