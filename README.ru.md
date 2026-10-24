# grok-plugin-cc

English: [README.md](./README.md)

Используйте [Grok Build CLI](https://x.ai) из [Claude Code](https://claude.ai/code) как второго агента — компаньон в стиле **Codex** для ревью, adversarial-ревью, вопросов, rescue/task и необязательного гейта при остановке.

```
Claude Code  ──slash / NL──►  grok:grok-rescue / commands
                              └─ node scripts/grok-companion.mjs
                                   └─ grok -p --output-format json
```

## Установка (60 секунд)

```bash
# Claude Code
/plugin marketplace add Surdeddd/grok-plugin-cc
/plugin install grok@grok-marketplace
/reload-plugins
/grok:setup
```

Требования: авторизованный **Grok Build CLI** (`~/.grok/bin/grok`), Node ≥ 18.

Локальная разработка:

```bash
claude plugin marketplace add <path-to-your-clone>
claude plugin install grok@grok-marketplace
npm --prefix <path-to-your-clone> run check
```

## Вызов на естественном языке

Скажите что-нибудь вроде:

- «вызови grok» / «grok-агент» / «подними grok»
- "call grok" / "spawn grok" / "ask grok to fix …"

→ Claude запускает **`grok:grok-rescue`** → команда `task` компаньона → headless Grok (по умолчанию с правом записи).

Slash-команда: `/grok:rescue <task>`.

## Команды

| Команда | Режим | Что делает |
|---|---|---|
| `/grok:setup` | — | Проверяет бинарник и авторизацию; включает/выключает гейт ревью; показывает resume для текущего cwd |
| `/grok:review` | plan + **schema** | Структурированное ревью (`--scope` / `--base`) |
| `/grok:adversarial-review` | plan + **schema** | Оспаривает дизайн и подход |
| `/grok:ask` | plan | Свободные вопросы и ответы |
| `/grok:rescue` | write (`task`) | Делегирует работу через субагента |
| `/grok:status` / `result` / `cancel` | — | Управление задачами (status по умолчанию — для текущего cwd) |
| `/grok:wait` | — | Блокируется до завершения задачи (`--follow` — живой лог) |
| `/grok:logs` | — | Хвост журнала прогресса (`--follow`) |

Флаги: `--background`, `--wait`, `--resume` / `--fresh`, `--scope`, `--base`, `--best-of-n`, `--check`, `--model`, `--max-turns`, `--dry-run`, `--stream`.

### Структурированное ревью

Ревью используют Grok `--json-schema` в Codex-совместимой форме:

`verdict` · `summary` · `findings[]` · `next_steps[]`

Человекочитаемый вывод — markdown; `--json` возвращает полный конверт задачи (включая `structured`).

Области:

```bash
/grok:review --scope working-tree
/grok:review --scope branch --base main
/grok:adversarial-review --scope auto
```

### Resume (по рабочему каталогу)

Сессии задач индексируются по cwd в `~/.grok-plugin-cc/cwd-index/`.

- `/grok:rescue --resume` → последняя сессия задачи **для этого репозитория**
- если сохранённого id сессии нет → откат на `grok --continue` для cwd

### Гейт ревью при остановке (необязательно)

```bash
/grok:setup --enable-review-gate
/grok:setup --disable-review-gate
```

Когда гейт включён, Stop-хук запускает Grok в plan-режиме; первая строка ответа должна быть `ALLOW:` или `BLOCK:`.
Чисто служебные ходы (setup/status) пропускаются; запущенные фоновые задачи учитываются в заметке.

## CLI компаньона

```bash
node scripts/grok-companion.mjs setup --json
node scripts/grok-companion.mjs review --dry-run
node scripts/grok-companion.mjs task --resume-last "continue"
node scripts/grok-companion.mjs task-resume-candidate
node scripts/grok-companion.mjs status
node scripts/grok-companion.mjs cancel --all
node scripts/grok-companion.mjs prune --keep 50
node scripts/grok-companion.mjs wait <job-id> --follow
node scripts/grok-companion.mjs logs <job-id> --follow
node scripts/grok-companion.mjs review --best-of-n 3 --scope working-tree
node scripts/grok-companion.mjs task --check "fix flaky test"
node scripts/grok-companion.mjs doctor
```

### Прогресс

Фоновые и обычные задачи task и ask пишут:

`~/.grok-plugin-cc/jobs/<id>.progress.jsonl`

- `status` — краткая сводка прогресса  
- `logs --follow` — живой журнал  
- `wait --follow` — блокировка со стримом до завершения  

### Best-of-N / check

```bash
/grok:review --best-of-n 3 --scope working-tree
/grok:rescue --check "implement the fix and verify"
```

Использует `--best-of-n` / `--check` Grok CLI (больше токенов; качество важнее скорости).

## Тесты и демо

```bash
npm test          # unit + dry-run smoke (no Grok tokens)
npm run check     # syntax + tests
npm run demo      # printable dry-run walkthrough
```

См. [DEMO.md](./DEMO.md). CI: GitHub Actions на `main` и в PR.

## Переменные окружения

| Переменная | Назначение |
|---|---|
| `GROK_PLUGIN_CC_GROK_BIN` | Абсолютный путь к `grok` |
| `GROK_PLUGIN_CC_STATE_DIR` | Переопределяет каталог состояния (по умолчанию `~/.grok-plugin-cc`) |

## Структура

```
agents/grok-rescue.md     # NL-discoverable subagent
commands/                 # slash commands
skills/                   # forwarder contracts
scripts/grok-companion.mjs
scripts/lib/              # cwd-index, review-render
schemas/review-output.schema.json
hooks/hooks.json          # optional Stop gate
```

## Отличия от Codex (честно)

Всё ещё легче, чем `codex-plugin-cc`: нет app-server брокера и нативного пути через review-сервис. Достаточно близко для ежедневного multi-model rescue и структурированных ревью.

## Лицензия

MIT
