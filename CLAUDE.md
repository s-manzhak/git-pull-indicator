# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A VS Code / Cursor extension (`zhakman.git-pull-indicator`) that shows Git pull/push sync badges on repository root folders in the Explorer, plus a "Git Pull Push" tree panel and a status-bar summary. It is monorepo / multi-root aware: it scans a workspace for many `.git` repos and tracks each one's ahead/behind state.

## Commands

```bash
npm install
npm run compile          # tsc -p ./  → emits to out/ (entry: out/extension.js)
npm run watch            # tsc -watch for iterative development
npm run package          # vsce package → .vsix
npm run publish          # vsce publish (publisher: zhakman; see PUBLISHING.md)
```

There is **no test suite and no linter** — CI (`.github/workflows/ci.yml`) only runs `npm ci && npm run compile`. The TypeScript compile (strict mode, see `tsconfig.json`) is the only gate; make sure it passes before considering a change done.

### Running the extension locally

- **F5 in the editor**: edit `debug-test.code-workspace` to point `path` at a folder containing Git repos, then Run and Debug → Run Extension.
- **CLI**: `GIT_TEST_FOLDER=/path/to/repos npm run debug:host` (launches an Extension Development Host via `scripts/open-debug-host.sh`; override `CURSOR_BIN` to use VS Code).
- **Symlink install** (no debug host): `npm run install:local` links the source into `~/.cursor/extensions`.

## Architecture

The extension is a single activation (`src/extension.ts`) that wires together a status store, several change sources, and two UI surfaces. There is no class hierarchy — modules communicate through a shared `GitStatusService` and a single `onRepoGitChange` callback.

**Data flow:** change source → `GitStatusService` (the status store) → refresh the three UI surfaces (folder decorations, tree view, status bar).

### Core pieces

- **`gitStatusService.ts`** — the single source of truth. Holds `Map<repoPath, RepoStatus>`. `resolveRepoStatus()` deliberately combines two sources: ahead/behind/upstream/isDirty come from the **git CLI** (`git status --porcelain=v1 --branch`, parsed in `applyPorcelainStatus`), while HEAD commit/branch metadata come from the **vscode.git API**. The git extension API's `ahead`/`behind` are unreliable, which is why the CLI is authoritative for sync counts. Uses `asyncPool.ts` (`runPool`) to bound concurrency (`statusConcurrency`, max 8).
- **`gitScanner.ts`** — `scanRepositories()` walks workspace folders to `maxDepth` looking for `.git`, skipping `DEFAULT_IGNORE_FOLDERS` (node_modules, dist, etc.). Stops descending once a repo is found (no nested-repo recursion).
- **`gitApiStatus.ts`** — thin typed wrapper over the built-in `vscode.git` extension API. Caches the API handle module-globally (`setGitApi`/`cachedApi`).

### Change sources (all feed `onRepoGitChange`)

These run in parallel and are intentionally redundant so an update is rarely missed:

1. **`gitExtensionListener.ts`** — primary. Subscribes to each repo's `state.onDidChange` from the git API, debounced 400ms. Distinguishes a *sync* change (commit/ahead/behind/upstream changed → full re-check via CLI) from a *dirty-only* change (working tree only → applies API status with `dirtyOnly` so CLI ahead/behind aren't clobbered with the API's unreliable 0s). Re-attaches to repos every 5s to catch late-opened ones.
2. **`gitRepoWatcher.ts`** — fallback file watcher on `.git/logs/HEAD`, `.git/refs/remotes/**`, `.git/FETCH_HEAD`, `.git/packed-refs`, debounced 1500ms.
3. **`nodeGitWatcher.ts`** — `subscribeDocumentSave` (refresh repo on file save) and `subscribeWindowFocus` (refresh on window focus, gated by `refreshOnWindowFocus`).
4. A periodic timer (`refreshIntervalMinutes`) as a final backup.

### UI surfaces

- **`repoFolderDecorationProvider.ts`** — `FileDecorationProvider` that badges/colors **only the repo root folder** in Explorer (`propagate: false`), not files inside (built-in Git owns those). Note `extension.ts` re-fires decorations on a 300ms delay (`scheduleFolderDecorationRefresh`) so they aren't overwritten by built-in Git's own decorations.
- **`statusTreeView.ts`** — the "Git Pull Push" panel (`gitPullIndicator.statusView`), one row per repo.
- **`syncBadge.ts`** — single source for badge glyphs/tooltips: `↓` pull, `↑` push, `↕` diverged, `?` no upstream, `!` error, `✓` clean. ASCII fallback `PL`/`PS`/`PM` via `useAsciiBadges`.

### Path handling

`pathUtils.ts` is used everywhere repos are compared. Always compare paths with `pathsEqual()` / `resolveFsPath()` — never raw string equality. `resolveFsPath` resolves symlinks (e.g. `~/Desktop`) and caches results so Explorer URIs match scanned paths. This matters because the same repo can arrive as different path strings from the scanner, the git API, and Explorer URIs.

## Conventions

- TypeScript strict mode; emitted JS in `out/` is committed-ignored (built artifact). Edit `src/`, never `out/`.
- New user-facing settings go in `package.json` `contributes.configuration` **and** `readConfig()` + the `GitPullIndicatorConfig` type in `src/types.ts`.
- New commands go in `package.json` `contributes.commands` **and** a `registerCommand` in `activate()`.
- **Do not modify icon assets in `resources/`** (`icon.png`, `git-pull-icon.svg`, etc.) unless the user explicitly asks for an icon change — see `.cursor/rules/icons-do-not-edit.mdc`.
- Release flow: bump `version` in `package.json`, add a `CHANGELOG.md` entry, then `npm run compile && npm run publish`.
