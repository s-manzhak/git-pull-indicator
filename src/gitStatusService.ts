import { exec } from 'child_process';
import { promisify } from 'util';
import { runPool } from './asyncPool';
import { tryStatusFromGitApi } from './gitApiStatus';
import { normalizeFsPath, pathsEqual, resolveFsPath } from './pathUtils';
import { ApplyStatusOptions, GitPullIndicatorConfig, RepoStatus } from './types';

const execPromise = promisify(exec);
const DEFAULT_STATUS_CONCURRENCY = 3;
const FETCH_CONCURRENCY = 3;

export class GitStatusService {
  private statusMap = new Map<string, RepoStatus>();
  private fetching = new Set<string>();
  private config: GitPullIndicatorConfig;

  constructor(config: GitPullIndicatorConfig) {
    this.config = config;
  }

  updateConfig(config: GitPullIndicatorConfig): void {
    this.config = config;
  }

  getStatuses(): Map<string, RepoStatus> {
    return this.statusMap;
  }

  private pruneRemoved(repoPaths: string[]): void {
    const newSet = new Set(repoPaths.map((p) => resolveFsPath(p)));
    for (const key of this.statusMap.keys()) {
      if (!newSet.has(resolveFsPath(key))) {
        this.statusMap.delete(key);
      }
    }
  }

  /**
   * Fast pass: status for each repo, refresh UI after each one.
   * Optional second pass: git fetch (limited concurrency) then re-check.
   */
  async updateReposIncremental(
    repoPaths: string[],
    options: { doFetch: boolean },
    onRepoUpdated: (repoPath: string) => void
  ): Promise<void> {
    this.pruneRemoved(repoPaths);
    const concurrency = this.statusConcurrency();

    await runPool(repoPaths, concurrency, async (repoPath) => {
      const status = await this.resolveRepoStatus(repoPath);
      this.applyStatus(repoPath, status);
      onRepoUpdated(repoPath);
    });

    if (options.doFetch || this.config.autoFetch) {
      await runPool(repoPaths, FETCH_CONCURRENCY, async (repoPath) => {
        await this.fetchRepo(repoPath);
        const status = await this.resolveRepoStatus(repoPath);
        this.applyStatus(repoPath, status);
        onRepoUpdated(repoPath);
      });
    }
  }

  async fetchAll(repoPaths?: string[]): Promise<void> {
    const paths = repoPaths ?? [...this.statusMap.keys()];
    await runPool(paths, FETCH_CONCURRENCY, (p) => this.fetchRepo(p));
  }

  applyStatus(
    repoPath: string,
    status: RepoStatus,
    options?: ApplyStatusOptions
  ): RepoStatus {
    const key = this.resolveKey(repoPath);
    const prev = this.statusMap.get(key);

    if (options?.dirtyOnly && prev) {
      status = { ...prev, isDirty: status.isDirty, repoPath: key };
    } else {
      status = this.mergeSyncCounts(prev, status);
      status.repoPath = key;
    }

    this.statusMap.set(key, status);
    return status;
  }

  /**
   * vscode.git often reports ahead/behind as 0 while the working tree is dirty.
   * Keep the last known sync counts until HEAD/upstream actually changes.
   */
  private mergeSyncCounts(
    prev: RepoStatus | undefined,
    next: RepoStatus
  ): RepoStatus {
    if (!prev) {
      return next;
    }

    const sameHead =
      next.headCommit !== undefined &&
      prev.headCommit !== undefined &&
      next.headCommit === prev.headCommit;
    const sameBranch =
      !next.headCommit &&
      !prev.headCommit &&
      next.branch === prev.branch &&
      next.upstream === prev.upstream;

    if (
      (sameHead || sameBranch) &&
      next.behind === 0 &&
      next.ahead === 0 &&
      (prev.behind > 0 || prev.ahead > 0)
    ) {
      return {
        ...next,
        ahead: prev.ahead,
        behind: prev.behind,
        hasUpstream: next.hasUpstream || prev.hasUpstream,
      };
    }

    return next;
  }

  async refreshSingleRepo(repoPath: string): Promise<RepoStatus> {
    const status = await this.resolveRepoStatus(repoPath);
    return this.applyStatus(repoPath, status);
  }

  /** Git CLI for ahead/behind; API for isDirty and HEAD metadata. */
  private async resolveRepoStatus(repoPath: string): Promise<RepoStatus> {
    const fromApi = tryStatusFromGitApi(repoPath);
    const subprocess = await this.getRepoStatus(repoPath);
    if (!fromApi) {
      return subprocess;
    }
    return {
      ...fromApi,
      ahead: subprocess.ahead,
      behind: subprocess.behind,
      hasUpstream: subprocess.hasUpstream,
      isDirty: subprocess.isDirty,
      headCommit: fromApi.headCommit ?? subprocess.headCommit,
      branch: fromApi.branch ?? subprocess.branch,
      upstream: fromApi.upstream ?? subprocess.upstream,
      error: fromApi.error ?? subprocess.error,
    };
  }

  private resolveKey(repoPath: string): string {
    const resolved = resolveFsPath(repoPath);
    for (const k of this.statusMap.keys()) {
      if (pathsEqual(k, repoPath)) {
        return resolveFsPath(k);
      }
    }
    return resolved;
  }

  async refreshAll(onRepoUpdated?: (repoPath: string) => void): Promise<void> {
    const paths = [...this.statusMap.keys()];
    if (this.config.autoFetch) {
      await this.fetchAll(paths);
    }
    await runPool(paths, this.statusConcurrency(), async (repoPath) => {
      const status = await this.resolveRepoStatus(repoPath);
      this.applyStatus(repoPath, status);
      onRepoUpdated?.(repoPath);
    });
  }

  private statusConcurrency(): number {
    return Math.max(
      1,
      Math.min(8, Math.floor(this.config.statusConcurrency || DEFAULT_STATUS_CONCURRENCY))
    );
  }

  private async fetchRepo(repoPath: string): Promise<void> {
    const key = resolveFsPath(repoPath);
    if (this.fetching.has(key)) {
      return;
    }
    this.fetching.add(key);
    try {
      await execPromise('git fetch --quiet', { cwd: repoPath, timeout: 120_000 });
    } catch {
      // Fetch errors may appear on status check
    } finally {
      this.fetching.delete(key);
    }
  }

  private async getRepoStatus(repoPath: string): Promise<RepoStatus> {
    const key = this.resolveKey(repoPath);
    const previous = this.statusMap.get(key);
    const status: RepoStatus = {
      repoPath,
      ahead: previous?.ahead ?? 0,
      behind: previous?.behind ?? 0,
      hasUpstream: previous?.hasUpstream ?? false,
      isDirty: previous?.isDirty,
    };

    try {
      const result = await execPromise(
        'git status --porcelain=v1 --branch --untracked-files=no',
        {
          cwd: repoPath,
          timeout: 15_000,
        }
      );
      this.applyPorcelainStatus(result.stdout, status);
    } catch (err) {
      status.error = err instanceof Error ? err.message : String(err);
      if (previous && !status.error.includes('not a git repository')) {
        status.ahead = previous.ahead;
        status.behind = previous.behind;
        status.hasUpstream = previous.hasUpstream;
        status.isDirty = previous.isDirty;
        status.branch = previous.branch;
        status.upstream = previous.upstream;
      }
    }

    return status;
  }

  private applyPorcelainStatus(stdout: string, status: RepoStatus): void {
    const lines = stdout.split(/\r?\n/).filter(Boolean);
    const branchLine = lines[0] ?? '';
    status.isDirty = lines.slice(1).some((line) => line.trim().length > 0);

    if (!branchLine.startsWith('## ')) {
      return;
    }

    const value = branchLine.slice(3);
    const syncStart = value.indexOf(' [');
    const branchSpec = syncStart >= 0 ? value.slice(0, syncStart) : value;
    const syncInfo =
      syncStart >= 0 && value.endsWith(']') ? value.slice(syncStart + 2, -1) : '';
    const upstreamSep = branchSpec.indexOf('...');

    status.branch =
      upstreamSep >= 0 ? branchSpec.slice(0, upstreamSep).trim() : branchSpec.trim();
    status.upstream =
      upstreamSep >= 0 ? branchSpec.slice(upstreamSep + 3).trim() : undefined;
    status.hasUpstream = Boolean(status.upstream);
    status.ahead = 0;
    status.behind = 0;

    const aheadMatch = syncInfo.match(/ahead (\d+)/);
    const behindMatch = syncInfo.match(/behind (\d+)/);
    if (aheadMatch) {
      status.ahead = parseInt(aheadMatch[1], 10) || 0;
    }
    if (behindMatch) {
      status.behind = parseInt(behindMatch[1], 10) || 0;
    }
  }
}
