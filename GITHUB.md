# Публикация на GitHub

Репозиторий: **https://github.com/zhakman/git-pull-indicator**

## 1. Создать репозиторий на GitHub

1. https://github.com/new  
2. Name: `git-pull-indicator`  
3. Public, **без** README / .gitignore (уже есть в проекте)  
4. Create repository  

## 2. Первый push из папки проекта

```bash
cd /path/to/git-pull-indicator

git init
git add .
git status   # проверьте: нет node_modules, out, *.log

git commit -m "Initial release v0.1.0"

git branch -M main
git remote add origin https://github.com/zhakman/git-pull-indicator.git
git push -u origin main
```

## 3. Что не попадёт в Git (`.gitignore`)

- `node_modules/`, `out/`, `*.vsix`
- `deepseek-response.log`, `git-pull-indicator-task.md`
- локальные логи

## 4. После push

- Включите **Actions** — workflow `CI` собирает TypeScript на каждый PR
- Добавьте topics на GitHub: `vscode-extension`, `git`, `cursor`, `typescript`
- Ссылка на Marketplace уже в README

## 5. Обновления

```bash
# правки в коде
npm run compile
git add -A
git commit -m "fix: описание"
git push
```

Версию расширения поднимайте в `package.json` + `CHANGELOG.md`, затем `npm run publish` для Marketplace.
