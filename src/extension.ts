import * as vscode from 'vscode';
import { GitPullDecorationProvider } from './decorationProvider';
import { scanRepositories } from './gitScanner';
import { GitStatusService } from './gitStatusService';
import { pathsEqual, resolveFsPath } from './pathUtils';
import { subscribeGitExtension } from './gitExtensionListener';
import { GitRepoWatcher } from './gitRepoWatcher';
import {
  NodeGitWatcher,
  subscribeDocumentSave,
  subscribeWindowFocus,
} from './nodeGitWatcher';
import { StatusTreeViewProvider } from './statusTreeView';
import { GitPullIndicatorConfig } from './types';

let statusService: GitStatusService;
let decorationProvider: GitPullDecorationProvider;
let treeViewProvider: StatusTreeViewProvider;
let repoWatcher: GitRepoWatcher;
let nodeGitWatcher: NodeGitWatcher;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let lastRepoPaths: string[] = [];
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;

function readConfig(): GitPullIndicatorConfig {
  const config = vscode.workspace.getConfiguration('gitPullIndicator');
  return {
    refreshIntervalMinutes: config.get<number>('refreshIntervalMinutes', 1),
    autoFetch: config.get<boolean>('autoFetch', false),
    maxDepth: config.get<number>('maxDepth', 4),
    showCleanRepositories: config.get<boolean>('showCleanRepositories', false),
    useAsciiBadges: config.get<boolean>('useAsciiBadges', false),
  };
}

function resetRefreshTimer(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
  const cfg = readConfig();
  const intervalMs = cfg.refreshIntervalMinutes * 60 * 1000;
  refreshTimer = setInterval(() => {
    void refreshWorkspace(false);
  }, intervalMs);
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
      lines.push(`  ✓ ${repoPath} — up to date (no badge unless showCleanRepositories)`);
    } else {
      lines.push(
        `  ${repoPath} — ahead ${status.ahead}, behind ${status.behind}`
      );
    }
  }

  outputChannel.appendLine(lines.join('\n'));
}

async function refreshWorkspace(manualFetch: boolean): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    lastRepoPaths = [];
    statusBarItem.text = '$(git-branch) Git Pull: open a folder';
    statusBarItem.tooltip = 'File → Open Folder… and choose a directory with git repos';
    decorationProvider.refresh();
    console.warn('[Git Pull Indicator] No workspace folder open');
    return;
  }

  const cfg = readConfig();
  statusService.updateConfig(cfg);
  statusBarItem.text = '$(sync~spin) Git Pull: scanning…';

  const roots = folders.map((f) => f.uri.fsPath).join(', ');
  lastRepoPaths = await scanRepositories(folders, cfg.maxDepth);
  console.log(
    `[Git Pull Indicator] Workspace root(s): ${roots}`
  );
  console.log(
    `[Git Pull Indicator] Found ${lastRepoPaths.length} repos (maxDepth=${cfg.maxDepth})`
  );

  let done = 0;
  const total = lastRepoPaths.length;

  await statusService.updateReposIncremental(
    lastRepoPaths,
    { doFetch: manualFetch },
    (repoPath) => {
      done += 1;
      decorationProvider.refreshRepo(repoPath);
      statusBarItem.text = `$(sync~spin) Git Pull: ${done}/${total}`;
    }
  );

  decorationProvider.refresh();
  treeViewProvider.refresh();

  // Cursor иногда не перерисовывает Explorer сразу
  setTimeout(() => {
    decorationProvider.refresh();
  }, 1500);

  const withBadge = [...statusService.getStatuses().values()].filter((s) => {
    if (s.error || !s.hasUpstream) {
      return true;
    }
    if (s.ahead > 0 || s.behind > 0) {
      return true;
    }
    return cfg.showCleanRepositories;
  }).length;

  statusBarItem.text = `$(git-branch) Git Pull: ${lastRepoPaths.length} repos`;
  statusBarItem.tooltip =
    `${withBadge} with badge · ${lastRepoPaths.length - withBadge} up to date (hidden)\n` +
    'Click: Refresh · Clean repos hidden unless gitPullIndicator.showCleanRepositories';
  outputChannel.clear();
  logRepoSummary();

  const wsFolders = vscode.workspace.workspaceFolders ?? [];
  repoWatcher.updateRepos(lastRepoPaths, wsFolders);
  nodeGitWatcher.updateRepos(lastRepoPaths, wsFolders);
}

async function refreshSingleRepository(repoPath: string): Promise<void> {
  const status = await statusService.refreshSingleRepo(repoPath);
  console.log(
    `[Git Pull Indicator] Updated ${repoPath.split('/').pop()}: ↑${status.ahead} ↓${status.behind}`
  );
  decorationProvider.refreshRepo(repoPath);
  treeViewProvider.refresh();
}

export function activate(context: vscode.ExtensionContext): void {
  console.log('[Git Pull Indicator] Extension activated');
  outputChannel = vscode.window.createOutputChannel('Git Pull Indicator');
  const cfg = readConfig();
  statusService = new GitStatusService(cfg);
  decorationProvider = new GitPullDecorationProvider(
    () => statusService.getStatuses(),
    () => readConfig().showCleanRepositories,
    () => readConfig().useAsciiBadges
  );
  treeViewProvider = new StatusTreeViewProvider(
    () => statusService.getStatuses(),
    decorationProvider
  );
  const onRepoGitChange = (repoPath: string): void => {
    void refreshSingleRepository(repoPath);
  };

  repoWatcher = new GitRepoWatcher(onRepoGitChange);
  nodeGitWatcher = new NodeGitWatcher(onRepoGitChange);

  context.subscriptions.push(
    subscribeGitExtension(onRepoGitChange),
    subscribeDocumentSave(() => lastRepoPaths, onRepoGitChange),
    subscribeWindowFocus(() => {
      void refreshWorkspace(false);
    }),
    { dispose: () => nodeGitWatcher.dispose() }
  );

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'gitPullIndicator.refresh';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem, outputChannel, {
    dispose: () => {
      repoWatcher.dispose();
      nodeGitWatcher.dispose();
    },
  });

  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(decorationProvider)
  );

  context.subscriptions.push(
    vscode.window.createTreeView('gitPullIndicator.statusView', {
      treeDataProvider: treeViewProvider,
      showCollapseAll: false,
    })
  );

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
      await statusService.refreshAll((repoPath) => {
        done += 1;
        decorationProvider.refreshRepo(repoPath);
        statusBarItem.text = `$(sync~spin) Git Pull: ${done}/${lastRepoPaths.length}`;
      });
      decorationProvider.refresh();
      treeViewProvider.refresh();
      statusBarItem.text = `$(git-branch) Git Pull: ${lastRepoPaths.length} repos`;
      outputChannel.clear();
      logRepoSummary();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitPullIndicator.focusView', () => {
      void vscode.commands.executeCommand('gitPullIndicator.statusView.focus');
    })
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
      void vscode.window.showInformationMessage(
        'Git Pull Indicator: no git repos found. Open a parent folder that contains repos, or increase gitPullIndicator.maxDepth.',
        'Open Output'
      ).then((choice) => {
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
    if (pathsEqual(normalized, repoNorm) || normalized.startsWith(repoNorm + '/')) {
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
  nodeGitWatcher?.dispose();
}
