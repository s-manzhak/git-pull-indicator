# Git Pull Indicator

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/zhakman.git-pull-indicator?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=zhakman.git-pull-indicator)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

VS Code and **Cursor** extension that shows Git sync status on repository folders in the Explorer.

## Install

**From Marketplace (recommended):**

```text
ext install zhakman.git-pull-indicator
```

Or search **Git Pull Indicator** in Extensions (`Ctrl+Shift+X`).

- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=zhakman.git-pull-indicator)

## Features

| Badge | Meaning |
|-------|---------|
| `↓` | Remote is ahead — **pull** required |
| `↑` | Local is ahead — **push** required |
| `↕` | Both incoming and outgoing commits |
| `?` | No upstream configured |
| `!` | Git check failed |
| `✓` | Up to date (if `showCleanRepositories` is enabled) |

- Scans **multiple Git repositories** in one workspace (monorepo-friendly)
- **Repositories** sidebar panel with `push N · pull M` summary
- Status bar: `Git Pull: N repos`
- Auto-refresh on Git changes, window focus, and periodic backup

ASCII fallback (`gitPullIndicator.useAsciiBadges`): `PL` / `PS` / `PM`.

## Commands

| Command | Description |
|---------|-------------|
| Git Pull Indicator: Refresh | Rescan workspace and update badges |
| Git Pull Indicator: Fetch All | `git fetch --quiet` in all repos |
| Git Pull Indicator: Open Repository Terminal | Open terminal in repo folder |
| Git Pull Indicator: Show Log | Output channel with repo list |
| Git Pull Indicator: Show Repositories Panel | Focus sidebar view |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `gitPullIndicator.refreshIntervalMinutes` | `1` | Backup full refresh interval |
| `gitPullIndicator.autoFetch` | `false` | Run `git fetch` before status check |
| `gitPullIndicator.maxDepth` | `4` | Max depth to search for `.git` |
| `gitPullIndicator.showCleanRepositories` | `false` | Show `✓` on up-to-date repos |
| `gitPullIndicator.useAsciiBadges` | `false` | Use PL/PS/PM instead of Unicode |

## Development

```bash
git clone https://github.com/zhakman/git-pull-indicator.git
cd git-pull-indicator
npm install
npm run compile
```

### Run (F5)

1. Open this folder in VS Code / Cursor
2. Edit `debug-test.code-workspace` — set `path` to a folder with Git repos
3. **Run and Debug** → **Run Extension** → F5

### Run (CLI)

```bash
GIT_TEST_FOLDER=/path/to/your/repos npm run debug:host
```

### Local install (symlink)

```bash
npm run install:local
# Developer: Reload Window
```

## Publish extension

See [PUBLISHING.md](./PUBLISHING.md).

## License

[MIT](LICENSE) © zhakman
