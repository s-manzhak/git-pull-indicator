export interface RepoStatus {
  repoPath: string;
  branch?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  hasUpstream: boolean;
  error?: string;
}

export interface GitPullIndicatorConfig {
  refreshIntervalMinutes: number;
  autoFetch: boolean;
  maxDepth: number;
  showCleanRepositories: boolean;
  useAsciiBadges: boolean;
}
