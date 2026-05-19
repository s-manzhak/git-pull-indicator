import * as vscode from 'vscode';
import { pathsEqual, resolveFsPath } from './pathUtils';
import { RepoStatus } from './types';

export interface GitRepository {
  rootUri: vscode.Uri;
  state: {
    HEAD?: {
      name?: string;
      commit?: string;
      upstream?: { remote: string; name: string };
      ahead?: number;
      behind?: number;
    };
    workingTreeChanges: unknown[];
    indexChanges: unknown[];
    untrackedChanges: unknown[];
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

let cachedApi: GitApi | undefined;

export function findGitRepository(repoPath: string): GitRepository | undefined {
  const api = cachedApi;
  if (!api) {
    return undefined;
  }
  const target = resolveFsPath(repoPath);
  return api.repositories.find((r) => pathsEqual(r.rootUri.fsPath, target));
}

export function setGitApi(api: GitApi | undefined): void {
  cachedApi = api;
}

export function statusFromGitRepository(repo: GitRepository): RepoStatus {
  const repoPath = resolveFsPath(repo.rootUri.fsPath);
  const head = repo.state.HEAD;
  const isDirty =
    repo.state.workingTreeChanges.length > 0 ||
    repo.state.indexChanges.length > 0 ||
    repo.state.untrackedChanges.length > 0;

  return {
    repoPath,
    branch: head?.name,
    headCommit: head?.commit,
    upstream: head?.upstream
      ? `${head.upstream.remote}/${head.upstream.name}`
      : undefined,
    ahead: head?.ahead ?? 0,
    behind: head?.behind ?? 0,
    hasUpstream: !!head?.upstream,
    isDirty,
  };
}

export function tryStatusFromGitApi(repoPath: string): RepoStatus | undefined {
  const repo = findGitRepository(repoPath);
  if (!repo) {
    return undefined;
  }
  return statusFromGitRepository(repo);
}

export async function activateGitApi(): Promise<GitApi | undefined> {
  const ext = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
  if (!ext) {
    return undefined;
  }
  const exports = ext.isActive ? ext.exports : await ext.activate();
  const api = exports.getAPI(1);
  cachedApi = api;
  return api;
}
