import * as vscode from 'vscode';
import * as path from 'path';
import { GitPullDecorationProvider } from './decorationProvider';
import { RepoStatus } from './types';

function formatStatusDescription(status: RepoStatus): string {
  if (status.error) {
    return status.error;
  }
  if (!status.hasUpstream) {
    return 'no upstream';
  }
  const parts: string[] = [];
  if (status.ahead > 0) {
    parts.push(`push ${status.ahead}`);
  }
  if (status.behind > 0) {
    parts.push(`pull ${status.behind}`);
  }
  if (parts.length === 0) {
    return 'up to date';
  }
  return parts.join(' · ');
}

class RepoTreeItem extends vscode.TreeItem {
  constructor(
    public readonly repoPath: string,
    public readonly status: RepoStatus,
    decoration: vscode.FileDecoration | undefined
  ) {
    const name = path.basename(repoPath);
    const badge = decoration?.badge ?? '';
    super(`${name}  ${badge}`, vscode.TreeItemCollapsibleState.None);
    this.description = formatStatusDescription(status);
    this.tooltip = decoration?.tooltip ?? repoPath;
    this.resourceUri = vscode.Uri.file(repoPath);
    this.contextValue = 'gitPullIndicator.repo';
    if (decoration?.color) {
      this.iconPath = new vscode.ThemeIcon('git-branch', decoration.color);
    } else {
      this.iconPath = new vscode.ThemeIcon('git-branch');
    }
  }
}

export class StatusTreeViewProvider implements vscode.TreeDataProvider<RepoTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<RepoTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly getStatuses: () => Map<string, RepoStatus>,
    private readonly decorationProvider: GitPullDecorationProvider
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: RepoTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): RepoTreeItem[] {
    const items: RepoTreeItem[] = [];
    for (const [repoPath, status] of this.getStatuses()) {
      const decoration = this.decorationProvider.decorationForStatus(status);
      if (!decoration && !status.error && status.hasUpstream) {
        continue;
      }
      items.push(new RepoTreeItem(repoPath, status, decoration));
    }
    items.sort((a, b) => a.repoPath.localeCompare(b.repoPath));
    return items;
  }
}
