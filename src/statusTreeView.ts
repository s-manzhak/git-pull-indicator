import * as path from 'path';
import * as vscode from 'vscode';
import { syncBadgeForStatus, syncPriority } from './syncBadge';
import { RepoStatus } from './types';

function formatStatusDescription(status: RepoStatus): string {
  if (status.error) {
    return status.error;
  }
  if (!status.hasUpstream) {
    return 'no upstream';
  }

  const parts: string[] = [];
  if (status.behind > 0) {
    parts.push(`pull ${status.behind}`);
  }
  if (status.ahead > 0) {
    parts.push(`push ${status.ahead}`);
  }

  return parts.length > 0
    ? parts.join(' · ')
    : status.isDirty
      ? 'uncommitted changes'
      : 'up to date';
}

class RepoTreeItem extends vscode.TreeItem {
  constructor(
    public readonly repoPath: string,
    public readonly status: RepoStatus,
    useAscii: boolean
  ) {
    const name = path.basename(repoPath);
    const badge = syncBadgeForStatus(status, useAscii);
    const arrow = badge?.badge ?? '';
    const count =
      status.behind > 0 && status.ahead > 0
        ? ` ↓${status.behind} ↑${status.ahead}`
        : status.behind > 0
          ? ` ${status.behind}`
          : status.ahead > 0
            ? ` ${status.ahead}`
            : '';

    super(
      arrow ? `${name}  ${arrow}${count}` : name,
      vscode.TreeItemCollapsibleState.None
    );

    this.description = formatStatusDescription(status);
    this.tooltip = badge?.tooltip ? `${badge.tooltip}\n${repoPath}` : repoPath;
    this.resourceUri = vscode.Uri.file(repoPath);
    this.contextValue = 'gitPullIndicator.repo';
    this.iconPath = new vscode.ThemeIcon(
      status.behind > 0 && status.ahead > 0
        ? 'git-compare'
        : status.behind > 0
          ? 'arrow-down'
          : status.ahead > 0
            ? 'arrow-up'
            : 'git-branch'
    );
    this.command = {
      command: 'gitPullIndicator.revealRepository',
      title: 'Reveal in Explorer',
      arguments: [repoPath],
    };
  }
}

export class StatusTreeViewProvider implements vscode.TreeDataProvider<RepoTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    RepoTreeItem | undefined | void
  >();

  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(
    private readonly getStatuses: () => Map<string, RepoStatus>,
    private readonly useAsciiBadges: () => boolean
  ) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(element: RepoTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): RepoTreeItem[] {
    const useAscii = this.useAsciiBadges();
    const items: RepoTreeItem[] = [];

    for (const [repoPath, status] of this.getStatuses()) {
      const priority = syncPriority(status);
      if (priority < 0 && !status.error) {
        continue;
      }
      items.push(new RepoTreeItem(repoPath, status, useAscii));
    }

    items.sort((a, b) => {
      const priorityDiff = syncPriority(b.status) - syncPriority(a.status);
      return priorityDiff || a.repoPath.localeCompare(b.repoPath);
    });

    return items;
  }
}
