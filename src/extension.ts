import * as vscode from 'vscode';
import { scanRepositories } from './gitScanner';
import { GitStatusService } from './gitStatusService';
import { pathsEqual, resolveFsPath } from './pathUtils';
import { subscribeGitExtension } from './gitExtensionListener';
import { GitRepoWatcher } from './gitRepoWatcher';
import { subscribeDocumentSave, subscribeWindowFocus } from './nodeGitWatcher';
import { RepoFolderDecorationProvider } from './repoFolderDecorationProvider';
import { StatusTreeViewProvider } from './statusTreeView';
import { GitPullIndicatorConfig, RepoStatus } from './types';

let statusService: GitStatusService;
let folderDecorationProvider: RepoFolderDecorationProvider;
let treeViewProvider: StatusTreeViewProvider;
let statusTreeView: vscode.TreeView<unknown> | undefined;
let repoWatcher: GitRepoWatcher;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let lastRepoPaths: string[] = [];
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let refreshInFlight = false;

function readConfig(): GitPullIndicatorConfig {
  const config = vscode.workspace.getConfiguration('gitPullIndicator');
  return {
    refreshIntervalMinutes: config.get<number>('refreshIntervalMinutes', 5),
    autoFetch: config.get<boolean>('autoFetch', false),
    maxDepth: config.get<number>('maxDepth', 4),
    statusConcurrency: config.get<number>('statusConcurrency', 3),
    showCleanRepositories: config.get<boolean>('showCleanRepositories', false),
    useAsciiBadges: config.get<boolean>('useAsciiBadges', false),
    showExplorerFolderBadges: config.get<boolean>(
      'showExplorerFolderBadges',
      true
    ),
    showExplorerFolderColors: config.get<boolean>(
      'showExplorerFolderColors',
      true
    ),
    refreshOnWindowFocus: config.get<boolean>('refreshOnWindowFocus', false),
  };
}

function explorerBadgesEnabled(): boolean {
  return readConfig().showExplorerFolderBadges;
}

/** Re-draw folder badges after built-in Git finishes its Explorer decorations. */
function scheduleFolderDecorationRefresh(repoPath?: string): void {
  if (!explorerBadgesEnabled()) {
    return;
  }
  setTimeout(() => {
    if (repoPath) {
      folderDecorationProvider.refreshRepo(repoPath);
    } else {
      folderDecorationProvider.refresh();
    }
  }, 300);
}

async function registerFolderBadgeProvider(
  context: vscode.ExtensionContext
): Promise<void> {
  const gitExt = vscode.extensions.getExtension('vscode.git');
  if (gitExt && !gitExt.isActive) {
    try {
      await gitExt.activate();
    } catch {
      // Git disabled — still register our badges
    }
  }

  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(folderDecorationProvider)
  );
  scheduleFolderDecorationRefresh();
  setTimeout(() => scheduleFolderDecorationRefresh(), 2000);
}

function resetRefreshTimer(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
  const cfg = readConfig();
  const intervalMs = cfg.refreshIntervalMinutes * 60 * 1000;
  refreshTimer = setInterval(() => {
    void refreshKnownRepositories(false);
  }, intervalMs);
}

function repoWord(count: number): string {
  return count === 1 ? 'repo' : 'repos';
}

function formatStatusBarTooltip(
  statuses: RepoStatus[],
  needPull: number,
  needPush: number,
  diverged: number
): string {
  const lines = ['Git sync status'];

  if (needPull > 0) {
    lines.push(`Pull: ${needPull} ${repoWord(needPull)} have incoming commits`);
  }
  if (needPush > 0) {
    lines.push(`Push: ${needPush} ${repoWord(needPush)} have outgoing commits`);
  }
  if (diverged > 0) {
    lines.push(
      `Diverged: ${diverged} ${repoWord(diverged)} have both pull and push pending`
    );
  }
  if (lines.length === 1) {
    lines.push(`All ${statuses.length} tracked ${repoWord(statuses.length)} are in sync`);
  }

  lines.push('', 'Click to refresh repositories.');
  return lines.join('\n');
}

function updateStatusBar(): void {
  const statuses = [...statusService.getStatuses().values()];
  const needPull = statuses.filter((s) => s.behind > 0).length;
  const needPush = statuses.filter(
    (s) => s.ahead > 0 && s.behind === 0
  ).length;
  const diverged = statuses.filter(
    (s) => s.ahead > 0 && s.behind > 0
  ).length;

  const parts: string[] = [];
  if (needPull > 0) {
    parts.push(`$(arrow-down) ${needPull}`);
  }
  if (needPush > 0) {
    parts.push(`$(arrow-up) ${needPush}`);
  }
  if (diverged > 0) {
    parts.push(`$(arrow-both) ${diverged}`);
  }

  if (parts.length > 0) {
    statusBarItem.text = parts.join(' ');
    statusBarItem.tooltip = formatStatusBarTooltip(
      statuses,
      needPull,
      needPush,
      diverged
    );
  } else {
    statusBarItem.text = `$(git-branch) Git Pull: ${statuses.length} repos`;
    statusBarItem.tooltip = formatStatusBarTooltip(
      statuses,
      needPull,
      needPush,
      diverged
    );
  }
}

function updateStatusTreeView(): void {
  if (!statusTreeView) {
    return;
  }

  const statuses = [...statusService.getStatuses().values()];
  const needPull = statuses.filter((s) => s.behind > 0).length;
  const needPush = statuses.filter((s) => s.ahead > 0 && s.behind === 0).length;
  const diverged = statuses.filter((s) => s.ahead > 0 && s.behind > 0).length;
  const parts: string[] = [];

  if (needPull > 0) {
    parts.push(`↓ ${needPull}`);
  }
  if (needPush > 0) {
    parts.push(`↑ ${needPush}`);
  }
  if (diverged > 0) {
    parts.push(`↕ ${diverged}`);
  }

  statusTreeView.description = parts.join(' ') || undefined;
  statusTreeView.badge =
    needPull + needPush + diverged > 0
      ? {
          value: needPull + needPush + diverged,
          tooltip: 'Repositories with pull/push changes',
        }
      : undefined;
}

function logRepoSummary(): void {
  const statuses = statusService.getStatuses();
  const lines: string[] = [`Found ${statuses.size} repository(ies):`];

  for (const [repoPath, status] of statuses) {
    if (status.error) {
      lines.push(`  ! ${repoPath} — ${status.error}`);
    } else if (!status.hasUpstream) {
      lines.push(`  ? ${repoPath} — no upstream`);
    } else if (status.ahead === 0 && status.behind === 0) {
      lines.push(`  ✓ ${repoPath} — up to date`);
    } else {
      lines.push(
        `  ${repoPath} — ahead ${status.ahead}, behind ${status.behind}`
      );
    }
  }

  outputChannel.appendLine(lines.join('\n'));
}

async function refreshWorkspace(manualFetch: boolean): Promise<void> {
  if (refreshInFlight) {
    return;
  }
  refreshInFlight = true;
  try {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    lastRepoPaths = [];
    statusBarItem.text = '$(git-branch) Git Pull: open a folder';
    statusBarItem.tooltip = 'File → Open Folder… and choose a directory with git repos';
    scheduleFolderDecorationRefresh();
    treeViewProvider.refresh();
    updateStatusTreeView();
    console.warn('[Git Pull Indicator] No workspace folder open');
    return;
  }

  const cfg = readConfig();
  statusService.updateConfig(cfg);
  statusBarItem.text = '$(sync~spin) Git Pull: scanning…';

  const roots = folders.map((f) => f.uri.fsPath).join(', ');
  lastRepoPaths = await scanRepositories(folders, cfg.maxDepth);
  console.log(`[Git Pull Indicator] Workspace root(s): ${roots}`);
  console.log(
    `[Git Pull Indicator] Found ${lastRepoPaths.length} repos (maxDepth=${cfg.maxDepth})`
  );

  let done = 0;
  const total = lastRepoPaths.length;

  await statusService.updateReposIncremental(
    lastRepoPaths,
    { doFetch: manualFetch },
    () => {
      done += 1;
      statusBarItem.text = `$(sync~spin) Git Pull: ${done}/${total}`;
    }
  );

  scheduleFolderDecorationRefresh();
  treeViewProvider.refresh();
  updateStatusBar();
  updateStatusTreeView();
  outputChannel.clear();
  logRepoSummary();

  const wsFolders = vscode.workspace.workspaceFolders ?? [];
  repoWatcher.updateRepos(lastRepoPaths, wsFolders);
  } finally {
    refreshInFlight = false;
  }
}

async function refreshKnownRepositories(manualFetch: boolean): Promise<void> {
  if (lastRepoPaths.length === 0) {
    await refreshWorkspace(manualFetch);
    return;
  }
  if (refreshInFlight) {
    return;
  }

  refreshInFlight = true;
  try {
    statusService.updateConfig(readConfig());
    let done = 0;
    const total = lastRepoPaths.length;
    statusBarItem.text = `$(sync~spin) Git Pull: ${done}/${total}`;

    await statusService.updateReposIncremental(
      lastRepoPaths,
      { doFetch: manualFetch },
      () => {
        done += 1;
        statusBarItem.text = `$(sync~spin) Git Pull: ${done}/${total}`;
      }
    );

    scheduleFolderDecorationRefresh();
    treeViewProvider.refresh();
    updateStatusBar();
    updateStatusTreeView();
    outputChannel.clear();
    logRepoSummary();
  } finally {
    refreshInFlight = false;
  }
}

async function refreshSingleRepository(repoPath: string): Promise<void> {
  const status = await statusService.refreshSingleRepo(repoPath);
  console.log(
    `[Git Pull Indicator] Updated ${repoPath.split('/').pop()}: ↑${status.ahead} ↓${status.behind}`
  );
  scheduleFolderDecorationRefresh(repoPath);
  treeViewProvider.refresh();
  updateStatusBar();
  updateStatusTreeView();
}

export function activate(context: vscode.ExtensionContext): void {
  console.log('[Git Pull Indicator] Extension activated');
  outputChannel = vscode.window.createOutputChannel('Git Pull Indicator');
  const cfg = readConfig();
  statusService = new GitStatusService(cfg);
  console.log(
    `[Git Pull Indicator] Explorer decorations: badges=${vscode.workspace
      .getConfiguration('explorer.decorations')
      .get<boolean>('badges', true)}, colors=${vscode.workspace
      .getConfiguration('explorer.decorations')
      .get<boolean>('colors', true)}`
  );
  folderDecorationProvider = new RepoFolderDecorationProvider(
    () => statusService.getStatuses(),
    () => readConfig().useAsciiBadges,
    () => readConfig().showCleanRepositories,
    () => readConfig().showExplorerFolderColors
  );
  treeViewProvider = new StatusTreeViewProvider(
    () => statusService.getStatuses(),
    () => readConfig().useAsciiBadges
  );

  const onRepoGitChange = (
    repoPath: string,
    statusFromApi?: RepoStatus,
    dirtyOnly?: boolean
  ): void => {
    if (statusFromApi) {
      const hasPrev = [...statusService.getStatuses().keys()].some((k) =>
        pathsEqual(k, repoPath)
      );
      if (dirtyOnly && !hasPrev) {
        void refreshSingleRepository(repoPath);
        return;
      }
      statusService.applyStatus(repoPath, statusFromApi, { dirtyOnly });
      scheduleFolderDecorationRefresh(repoPath);
      treeViewProvider.refresh();
      updateStatusBar();
      updateStatusTreeView();
      return;
    }
    void refreshSingleRepository(repoPath);
  };

  repoWatcher = new GitRepoWatcher(onRepoGitChange);

  context.subscriptions.push(
    subscribeGitExtension(onRepoGitChange),
    subscribeDocumentSave(() => lastRepoPaths, onRepoGitChange),
    subscribeWindowFocus(() => {
      if (readConfig().refreshOnWindowFocus) {
        void refreshKnownRepositories(false);
      }
    }),
  );

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = 'gitPullIndicator.refresh';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem, outputChannel, {
    dispose: () => {
      repoWatcher.dispose();
    },
  });

  void registerFolderBadgeProvider(context);

  statusTreeView = vscode.window.createTreeView('gitPullIndicator.statusView', {
    treeDataProvider: treeViewProvider,
    showCollapseAll: false,
  });
  updateStatusTreeView();
  context.subscriptions.push(statusTreeView);

  context.subscriptions.push(
    vscode.commands.registerCommand('gitPullIndicator.showLog', () => {
      outputChannel.show(true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitPullIndicator.refresh', () =>
      refreshWorkspace(true)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitPullIndicator.fetchAll', async () => {
      statusBarItem.text = '$(sync~spin) Git Pull: fetching…';
      await statusService.fetchAll(lastRepoPaths);
      let done = 0;
      await statusService.refreshAll(() => {
        done += 1;
        statusBarItem.text = `$(sync~spin) Git Pull: ${done}/${lastRepoPaths.length}`;
      });
      scheduleFolderDecorationRefresh();
      treeViewProvider.refresh();
      updateStatusBar();
      updateStatusTreeView();
      outputChannel.clear();
      logRepoSummary();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitPullIndicator.focusView', () => {
      void vscode.commands.executeCommand('workbench.view.explorer');
      void vscode.commands.executeCommand('gitPullIndicator.statusView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'gitPullIndicator.revealRepository',
      async (repoPath: string) => {
        const uri = vscode.Uri.file(resolveFsPath(repoPath));
        await vscode.commands.executeCommand('revealInExplorer', uri);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'gitPullIndicator.openRepositoryTerminal',
      async (uri?: vscode.Uri) => {
        let repoPath: string | undefined;

        if (uri) {
          repoPath = findRepoForUri(uri.fsPath);
        } else if (lastRepoPaths.length === 1) {
          repoPath = lastRepoPaths[0];
        } else if (lastRepoPaths.length > 1) {
          const pick = await vscode.window.showQuickPick(
            lastRepoPaths.map((p) => ({ label: p, path: p })),
            { placeHolder: 'Select repository' }
          );
          repoPath = pick?.path;
        }

        if (!repoPath) {
          void vscode.window.showWarningMessage(
            'Git Pull Indicator: no repository selected.'
          );
          return;
        }

        const terminal = vscode.window.createTerminal({
          name: `Git: ${repoPath.split('/').pop() ?? repoPath}`,
          cwd: repoPath,
        });
        terminal.show();
      }
    )
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void refreshWorkspace(false);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('gitPullIndicator')) {
        statusService.updateConfig(readConfig());
        resetRefreshTimer();
        void refreshWorkspace(false);
      }
    })
  );

  resetRefreshTimer();
  void refreshWorkspace(false).then(() => {
    if (lastRepoPaths.length === 0 && vscode.workspace.workspaceFolders?.length) {
      void vscode.window
        .showInformationMessage(
          'Git Pull Indicator: no git repos found. Open a parent folder that contains repos, or increase gitPullIndicator.maxDepth.',
          'Open Output'
        )
        .then((choice) => {
          if (choice === 'Open Output') {
            outputChannel.show(true);
          }
        });
    }
  });
}

function findRepoForUri(fsPath: string): string | undefined {
  const normalized = resolveFsPath(fsPath);
  let best: string | undefined;
  for (const repoPath of lastRepoPaths) {
    const repoNorm = resolveFsPath(repoPath);
    if (
      pathsEqual(normalized, repoNorm) ||
      normalized.startsWith(repoNorm + '/')
    ) {
      if (!best || repoNorm.length > best.length) {
        best = repoPath;
      }
    }
  }
  return best;
}

export function deactivate(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
  repoWatcher?.dispose();
}
