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
}
