export interface RepoStatus {
  repoPath: string;
  branch?: string;
  headCommit?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  hasUpstream: boolean;
  /** Uncommitted or staged changes in the working tree. */
  isDirty?: boolean;
  /** Epoch ms of the last `git fetch` (mtime of .git/FETCH_HEAD), if known. */
  lastFetchedAt?: number;
  error?: string;
}

export interface ApplyStatusOptions {
  /** Only refresh isDirty; keep ahead/behind from cache. */
  dirtyOnly?: boolean;
}

export interface GitPullIndicatorConfig {
  refreshIntervalMinutes: number;
  autoFetch: boolean;
  maxDepth: number;
  statusConcurrency: number;
  showCleanRepositories: boolean;
  useAsciiBadges: boolean;
  showExplorerFolderBadges: boolean;
  showExplorerFolderColors: boolean;
  refreshOnWindowFocus: boolean;
  /** Mark pull/push counts as possibly outdated if last fetch was older than this many minutes (0 disables the warning). */
  staleFetchMinutes: number;
}
