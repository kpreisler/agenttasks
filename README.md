````markdown
# Agent Task Manager v1

A lightweight **local task management and orchestration system** built with Node.js, Express, and SQLite.  

Supports:  
- Configurable task fields and states  
- Agent-based task queue  
- Task dependencies  
- Automatic retries with backoff  
- JSON payloads  
- CLI and REST API  
- Event logging  

---

## Table of Contents

- [Installation](#installation)  
- [Project Structure](#project-structure)  
- [Configuration](#configuration)  
- [Running the API](#running-the-api)  
- [CLI Usage](#cli-usage)  
- [API Endpoints](#api-endpoints)  
- [Task Dependencies & Retries](#task-dependencies--retries)  
- [License](#license)  

---

## Installation

```bash
# Create project folder
mkdir ./task-manager-v1
cd ./task-manager-v1

# Initialize npm
npm init -y
npm install express better-sqlite3
````

If you used the setup script, everything is already in `./task-manager-v1`.

---

## Project Structure

```
task-manager-v1/
├─ package.json          # npm project
├─ server.js             # REST API
├─ db.js                 # SQLite DB helper
├─ queue.js              # Queue and task logic
├─ cli.js                # CLI for adding/listing tasks
├─ config/
│   ├─ states.json       # Task states
│   ├─ fields.json       # Configurable task fields
│   ├─ task_types.json   # Allowed task categories
│   └─ queue.json        # Queue settings (retries, working states)
└─ tasks.db              # SQLite database (auto-created)
```

---

## Configuration

### Task States (`config/states.json`)

```json
["inbox","ready","doing","blocked","done","failed"]
```

### Task Fields (`config/fields.json`)

```json
{
  "title": "TEXT",
  "priority": "INTEGER",
  "agent": "TEXT",
  "task_type": "TEXT"
}
```

### Task Types (`config/task_types.json`)

```json
["general","marketing","research","engineering","ops","design"]
```

### Queue Settings (`config/queue.json`)

```json
{
  "readyStates": ["ready"],
  "workingState": "doing",
  "maxAttempts": 3,
  "retryDelayMs": 5000
}
```

* `maxAttempts`: retries before marking task `failed`
* `retryDelayMs`: delay (ms) before retrying a failed task

---

## Running the API

```bash
cd ./task-manager-v1
npm start
```

API is available at `http://localhost:3000`.

---

## CLI Usage

```bash
# Add a task
node cli.js add "Download video"

# Add a task with type
node cli.js add "Write campaign copy" --type marketing

# List all tasks
node cli.js list

# List tasks in a specific state
node cli.js list ready

# List tasks filtered by type
node cli.js list --type research

# List tasks filtered by state + type
node cli.js list ready --type marketing

# Claim next task for an agent
node cli.js next worker1

# Claim next task for an agent, filtered by task type
node cli.js next worker1 --type marketing

# Claim a specific task for an agent
node cli.js claim <task_id> <agent>

# Set task to any state
node cli.js state <task_id> <state>

# Add dependency: task_id depends on depends_on_id
node cli.js dep add <task_id> <depends_on_id>

# List dependency ids for task
node cli.js dep list <task_id>

# Remove dependency
node cli.js dep rm <task_id> <depends_on_id>

# Mark a task as done
node cli.js done <task_id>

# Mark a task as failed
node cli.js fail <task_id>
```

---

## API Endpoints

| Method | Endpoint                 | Description                         |
| ------ | ------------------------ | ----------------------------------- |
| GET    | `/tasks`                 | List tasks (optional `?state=` and/or `?taskType=`) |
| POST   | `/tasks`                 | Add a new task (JSON body)          |
| GET    | `/tasks/next?agent=name` | Get next runnable task (optional `&taskType=`) |
| POST   | `/tasks/:id/claim`       | Claim specific task for an agent    |
| POST   | `/tasks/:id/state`       | Set task state (generic)            |
| GET    | `/tasks/:id/dependencies` | List dependencies for task         |
| POST   | `/tasks/:id/dependencies` | Add dependency/dependencies to task|
| DELETE | `/tasks/:id/dependencies/:dependsOnId` | Remove a dependency    |
| POST   | `/tasks/:id/complete`    | Mark task complete (legacy shortcut)|
| POST   | `/tasks/:id/fail`        | Mark task failed                    |
| POST   | `/tasks/:id/event`       | Log a custom event for task         |

**Example JSON body to add a task:**

```json
{
  "title": "Download video",
  "priority": 5,
  "taskType": "research",
  "payload": { "url": "https://example.com/video.mp4" }
}
```

New tasks are created in `inbox` by default.  
To be picked up by an agent (`/tasks/next` or `/tasks/:id/claim`), a task must be moved to `ready`.

**Example transition:**

```bash
# Create task (starts in inbox)
node cli.js add "Download video"

# Move task to ready so it can be picked up
node cli.js state <task_id> ready
```

---

## Task Dependencies & Retries

* Tasks can depend on other tasks using `task_dependencies` (managed via `db.js`)
* Tasks automatically retry based on `queue.json`
* Exceeding `maxAttempts` marks the task as `failed`

### Dependency Enforcement Rules

* Dependency checks are enforced when fetching work from the queue (`GET /tasks/next`), not when setting state.
* The same claimability rules apply to direct claiming (`POST /tasks/:id/claim` and `node cli.js claim`).
* A task is runnable only if it is in `ready` state and **all** dependency tasks are in `done` state.
* You can still manually set any valid state through `POST /tasks/:id/state`, even if dependencies are unresolved.
* If a task has no dependencies, it can be dequeued as soon as it is `ready` (and `run_after` allows it).
* If a task is in `blocked`, it will automatically move to `ready` when all of its dependencies become `done`.

**Example flow:**

1. Task `B` depends on task `A`.
2. If `B` is `blocked`, it stays blocked while `A` is not `done`.
3. Once `A` is set to `done`, `B` auto-moves to `ready` and becomes eligible for `/tasks/next`.

---

## License

MIT License — free to use and modify.

---

## Optional Diagram of Task Flow

```
READY ──▶ DOING ──▶ DONE
  │         │
  ▼         ▼
BLOCKED     FAILED
```

* Tasks in **READY** state are picked up by agents.
* **DOING** tasks are in progress.
* **FAILED** tasks will retry based on `queue.json`.
* **BLOCKED** tasks wait for dependencies to complete.
