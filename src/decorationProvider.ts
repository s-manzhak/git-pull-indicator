import * as vscode from 'vscode';
import { pathsEqual, resolveFsPath, toFileUri } from './pathUtils';
import { RepoStatus } from './types';

function badgeForStatus(
  status: RepoStatus,
  showClean: boolean,
  useAscii: boolean
): vscode.FileDecoration | undefined {
  if (status.error) {
    return {
      badge: '!',
      tooltip: `Git status check failed: ${status.error}`,
      color: new vscode.ThemeColor('gitDecoration.conflictingResourceForeground'),
    };
  }

  if (!status.hasUpstream) {
    return {
      badge: useAscii ? '?' : '?',
      tooltip: 'No upstream configured.',
      color: new vscode.ThemeColor('gitDecoration.ignoredResourceForeground'),
    };
  }

  const { ahead, behind } = status;

  if (ahead === 0 && behind === 0) {
    if (!showClean) {
      return undefined;
    }
    return {
      badge: useAscii ? 'OK' : '✓',
      tooltip: 'Repository is up to date.',
      color: new vscode.ThemeColor('gitDecoration.addedResourceForeground'),
    };
  }

  if (behind > 0 && ahead === 0) {
    return {
      badge: useAscii ? 'PL' : '↓',
      tooltip: `Remote has ${behind} commit${behind === 1 ? '' : 's'}. Pull required.`,
      color: new vscode.ThemeColor('gitDecoration.incomingResourceForeground'),
    };
  }

  if (ahead > 0 && behind === 0) {
    return {
      badge: useAscii ? 'PS' : '↑',
      tooltip: `Local branch has ${ahead} commit${ahead === 1 ? '' : 's'} to push.`,
      color: new vscode.ThemeColor('gitDecoration.outgoingResourceForeground'),
    };
  }

  return {
    badge: useAscii ? 'PM' : '↕',
    tooltip: `Branch has ${behind} incoming and ${ahead} outgoing commits.`,
    color: new vscode.ThemeColor('gitDecoration.conflictingResourceForeground'),
  };
}

export class GitPullDecorationProvider implements vscode.FileDecorationProvider {
  private readonly onDidChangeEmitter =
    new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();

  readonly onDidChangeFileDecorations = this.onDidChangeEmitter.event;

  constructor(
    private readonly getStatuses: () => Map<string, RepoStatus>,
    private readonly showCleanRepositories: () => boolean,
    private readonly useAsciiBadges: () => boolean
  ) {}

  refresh(): void {
    const uris = [...this.getStatuses().keys()].map((p) =>
      vscode.Uri.file(toFileUri(p))
    );
    this.onDidChangeEmitter.fire(uris.length > 0 ? uris : undefined);
  }

  refreshRepo(repoPath: string): void {
    this.onDidChangeEmitter.fire(vscode.Uri.file(toFileUri(repoPath)));
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const uriPath = resolveFsPath(uri.fsPath);
    for (const [repoPath, status] of this.getStatuses()) {
      if (pathsEqual(uriPath, repoPath)) {
        return badgeForStatus(
          status,
          this.showCleanRepositories(),
          this.useAsciiBadges()
        );
      }
    }
    return undefined;
  }

  /** For TreeView — same badge logic as Explorer. */
  decorationForStatus(status: RepoStatus): vscode.FileDecoration | undefined {
    return badgeForStatus(
      status,
      this.showCleanRepositories(),
      this.useAsciiBadges()
    );
  }
}
