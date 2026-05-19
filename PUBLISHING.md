# Публикация (publisher: zhakman)

## 1. Publisher

Зарегистрируйте издателя **zhakman** (если ещё нет):  
https://marketplace.visualstudio.com/manage

## 2. Иконка

Уже есть: `resources/icon.png` (128×128).

## 3. Сборка VSIX

```bash
cd git-pull-indicator
npm install
npm run compile
npm install -g @vscode/vsce
npm run package
```

Файл: `git-pull-indicator-0.1.0.vsix`

## 4. Публикация

```bash
vsce login zhakman
# Personal Access Token: Azure DevOps → Marketplace (Manage)

npm run publish
```

Или:

```bash
vsce publish -p YOUR_TOKEN
```

## 5. Установка пользователями

В VS Code / Cursor: Extensions → **Git Pull Indicator** → Install.

ID расширения: `zhakman.git-pull-indicator`

## 6. Обновления

1. Поднять `version` в `package.json`
2. Записать в `CHANGELOG.md`
3. `npm run compile && npm run publish`
