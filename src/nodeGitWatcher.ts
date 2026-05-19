import * as vscode from 'vscode';
import { resolveFsPath } from './pathUtils';

export function subscribeDocumentSave(
  getRepoPaths: () => string[],
  onRepoChanged: (repoPath: string) => void
): vscode.Disposable {
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  return vscode.workspace.onDidSaveTextDocument((doc) => {
    if (doc.uri.scheme !== 'file') {
      return;
    }
    const filePath = resolveFsPath(doc.uri.fsPath);
    const repo = getRepoPaths().find(
      (r) => filePath === resolveFsPath(r) || filePath.startsWith(resolveFsPath(r) + '/')
    );
    if (!repo) {
      return;
    }
    const key = resolveFsPath(repo);
    const t = pending.get(key);
    if (t) {
      clearTimeout(t);
    }
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        onRepoChanged(key);
      }, 600)
    );
  });
}

/** Refresh when user returns to Cursor after commit in external terminal. */
export function subscribeWindowFocus(
  onFocus: () => void
): vscode.Disposable {
  let debounce: ReturnType<typeof setTimeout> | undefined;
  return vscode.window.onDidChangeWindowState((state) => {
    if (!state.focused) {
      return;
    }
    if (debounce) {
      clearTimeout(debounce);
    }
    debounce = setTimeout(() => {
      debounce = undefined;
      onFocus();
    }, 300);
  });
}
