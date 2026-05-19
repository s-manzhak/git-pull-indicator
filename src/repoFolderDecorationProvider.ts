import * as vscode from 'vscode';
import { pathsEqual, resolveFsPath, toFileUri } from './pathUtils';
import { syncBadgeForStatus } from './syncBadge';
import { RepoStatus } from './types';

function colorForStatus(status: RepoStatus): vscode.ThemeColor | undefined {
  if (status.error) {
    return new vscode.ThemeColor('errorForeground');
  }
  if (!status.hasUpstream) {
    return new vscode.ThemeColor('disabledForeground');
  }
  if (status.ahead > 0 && status.behind > 0) {
    return new vscode.ThemeColor('errorForeground');
  }
  if (status.behind > 0) {
    return new vscode.ThemeColor('charts.blue');
  }
  if (status.ahead > 0) {
    return new vscode.ThemeColor('charts.purple');
  }
  return undefined;
}

/**
 * Badge on the repo root folder only (right of the name in Explorer).
 * Does not decorate files inside the repo — built-in Git keeps those.
 */
export class RepoFolderDecorationProvider implements vscode.FileDecorationProvider {
  private readonly onDidChangeEmitter =
    new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();

  readonly onDidChangeFileDecorations = this.onDidChangeEmitter.event;

  constructor(
    private readonly getStatuses: () => Map<string, RepoStatus>,
    private readonly useAsciiBadges: () => boolean,
    private readonly showCleanRepositories: () => boolean,
    private readonly showExplorerFolderColors: () => boolean
  ) {}

  refresh(): void {
    this.onDidChangeEmitter.fire(undefined);
  }

  refreshRepo(repoPath: string): void {
    this.onDidChangeEmitter.fire(vscode.Uri.file(toFileUri(repoPath)));
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== 'file') {
      return undefined;
    }

    const uriPath = resolveFsPath(uri.fsPath);

    for (const [repoPath, status] of this.getStatuses()) {
      if (!pathsEqual(uriPath, repoPath)) {
        continue;
      }

      const badge = syncBadgeForStatus(status, this.useAsciiBadges());
      const color = this.showExplorerFolderColors()
        ? colorForStatus(status)
        : undefined;
      if (badge) {
        return {
          badge: badge.badge,
          tooltip: badge.tooltip,
          color,
          propagate: false,
        };
      }

      if (
        this.showCleanRepositories() &&
        status.hasUpstream &&
        !status.error &&
        status.ahead === 0 &&
        status.behind === 0
      ) {
        return {
          badge: this.useAsciiBadges() ? 'OK' : '✓',
          tooltip: 'Repository is up to date with remote.',
          color,
          propagate: false,
        };
      }

      return undefined;
    }

    return undefined;
  }
}
