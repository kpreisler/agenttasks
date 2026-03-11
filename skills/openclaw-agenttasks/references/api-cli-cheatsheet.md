# API + CLI Cheatsheet

Use this for task operations. Do not treat these as code-change instructions.

## API routes

- `GET /meta` -> states + task types for UI controls.
- `GET /tasks?state=<state>&taskType=<type>&agent=<name>` -> list tasks with optional filters.
- `GET /tasks/:id` -> fetch one task.
- `POST /tasks` -> create task (`title`, `description`, `priority`, `taskType`, `state`, `payload`).
- `PATCH /tasks/:id` -> update editable fields (`title`, `description`, `priority`, `agent`, `taskType`, `payload`).
- `GET /tasks/next?agent=<name>&taskType=<type>` -> claim next matching runnable task.
- `POST /tasks/:id/claim` -> claim a specific task.
- `POST /tasks/:id/state` -> set state directly.
- `POST /tasks/:id/fail` -> retry/fail logic through queue config.
- `POST /tasks/:id/complete` -> legacy shortcut to done.
- `GET /tasks/:id/dependencies` -> list dependency ids.
- `POST /tasks/:id/dependencies` -> add dependency/dependencies.
- `DELETE /tasks/:id/dependencies/:dependsOnId` -> remove dependency.

## CLI commands

- `node cli.js add "..." [--type <taskType>]`
- `node cli.js list [state] [--type <taskType>]`
- `node cli.js next [agent] [--type <taskType>]`
- `node cli.js claim <id> <agent>`
- `node cli.js update <id> [--title ...] [--description ...] [--priority <n>] [--type <taskType>] [--agent <name>]`
- `node cli.js state <id> <state>`
- `node cli.js done <id>`
- `node cli.js fail <id>`
- `node cli.js dep add <taskId> <dependsOnId>`
- `node cli.js dep list <taskId>`
- `node cli.js dep rm <taskId> <dependsOnId>`

## Common operator sequences

### Create -> Ready -> Claim

1. `node cli.js add "Draft release notes" --type marketing`
2. `node cli.js list inbox --type marketing` (get task id)
3. `node cli.js state <id> ready`
4. `node cli.js next web --type marketing`

### Blocked dependency setup

1. `node cli.js dep add <childId> <dependencyId>`
2. `node cli.js state <childId> blocked`
3. Complete dependency (`node cli.js done <dependencyId>`) or `POST /tasks/:id/state { \"state\":\"done\" }`
4. Child auto-moves from `blocked` to `ready`.

## UI

- `GET /ui` serves the board frontend from `public/ui/`.
- Drag-drop calls `POST /tasks/:id/state`.
- Panel forms call `POST /tasks`, `PATCH /tasks/:id`, `POST /tasks/:id/claim`, and `/tasks/next`.

## Heartbeat pattern

1. Check active work for agent:
   - `GET /tasks?state=doing&agent=<agentName>`
2. If no result, claim next:
   - `GET /tasks/next?agent=<agentName>&taskType=<type>`
