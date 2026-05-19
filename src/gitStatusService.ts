import { exec } from 'child_process';
import { promisify } from 'util';
import { runPool } from './asyncPool';
import { normalizeFsPath, pathsEqual } from './pathUtils';
import { GitPullIndicatorConfig, RepoStatus } from './types';

const execPromise = promisify(exec);
const STATUS_CONCURRENCY = 8;
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
    const newSet = new Set(repoPaths.map(normalizeFsPath));
    for (const key of this.statusMap.keys()) {
      if (!newSet.has(key)) {
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

    await runPool(repoPaths, STATUS_CONCURRENCY, async (repoPath) => {
      const status = await this.getRepoStatus(repoPath);
      const key = normalizeFsPath(repoPath);
      this.statusMap.set(key, status);
      onRepoUpdated(repoPath);
    });

    if (options.doFetch || this.config.autoFetch) {
      await runPool(repoPaths, FETCH_CONCURRENCY, async (repoPath) => {
        await this.fetchRepo(repoPath);
        const status = await this.getRepoStatus(repoPath);
        this.statusMap.set(normalizeFsPath(repoPath), status);
        onRepoUpdated(repoPath);
      });
    }
  }

  async fetchAll(repoPaths?: string[]): Promise<void> {
    const paths = repoPaths ?? [...this.statusMap.keys()];
    await runPool(paths, FETCH_CONCURRENCY, (p) => this.fetchRepo(p));
  }

  async refreshSingleRepo(repoPath: string): Promise<RepoStatus> {
    const status = await this.getRepoStatus(repoPath);
    let key = normalizeFsPath(repoPath);
    for (const k of this.statusMap.keys()) {
      if (pathsEqual(k, repoPath)) {
        key = k;
        break;
      }
    }
    status.repoPath = key;
    this.statusMap.set(key, status);
    return status;
  }

  async refreshAll(onRepoUpdated?: (repoPath: string) => void): Promise<void> {
    const paths = [...this.statusMap.keys()];
    if (this.config.autoFetch) {
      await this.fetchAll(paths);
    }
    await runPool(paths, STATUS_CONCURRENCY, async (repoPath) => {
      const status = await this.getRepoStatus(repoPath);
      this.statusMap.set(normalizeFsPath(repoPath), status);
      onRepoUpdated?.(repoPath);
    });
  }

  private async fetchRepo(repoPath: string): Promise<void> {
    const key = normalizeFsPath(repoPath);
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
    const status: RepoStatus = {
      repoPath,
      ahead: 0,
      behind: 0,
      hasUpstream: false,
    };

    try {
      const branchResult = await execPromise('git rev-parse --abbrev-ref HEAD', {
        cwd: repoPath,
        timeout: 10_000,
      });
      status.branch = branchResult.stdout.trim();

      try {
        const upstreamResult = await execPromise(
          'git rev-parse --abbrev-ref --symbolic-full-name @{upstream}',
          { cwd: repoPath, timeout: 10_000 }
        );
        status.upstream = upstreamResult.stdout.trim();
        status.hasUpstream = true;

        const behindResult = await execPromise('git rev-list --count HEAD..@{upstream}', {
          cwd: repoPath,
          timeout: 30_000,
        });
        const aheadResult = await execPromise('git rev-list --count @{upstream}..HEAD', {
          cwd: repoPath,
          timeout: 30_000,
        });
        status.behind = parseInt(behindResult.stdout.trim(), 10) || 0;
        status.ahead = parseInt(aheadResult.stdout.trim(), 10) || 0;
      } catch {
        status.hasUpstream = false;
      }
    } catch (err) {
      status.error = err instanceof Error ? err.message : String(err);
    }

    return status;
  }
}
