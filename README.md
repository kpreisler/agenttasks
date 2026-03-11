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
  "agent": "TEXT"
}
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

# List all tasks
node cli.js list

# Claim next task for an agent
node cli.js next worker1

# Mark a task as done
node cli.js done <task_id>

# Mark a task as failed
node cli.js fail <task_id>
```

---

## API Endpoints

| Method | Endpoint                 | Description                         |
| ------ | ------------------------ | ----------------------------------- |
| GET    | `/tasks`                 | List all tasks                      |
| POST   | `/tasks`                 | Add a new task (JSON body)          |
| GET    | `/tasks/next?agent=name` | Get next runnable task for an agent |
| POST   | `/tasks/:id/complete`    | Mark task complete                  |
| POST   | `/tasks/:id/fail`        | Mark task failed                    |
| POST   | `/tasks/:id/event`       | Log a custom event for task         |

**Example JSON body to add a task:**

```json
{
  "title": "Download video",
  "priority": 5,
  "payload": { "url": "https://example.com/video.mp4" }
}
```

---

## Task Dependencies & Retries

* Tasks can depend on other tasks using `task_dependencies` (managed via `db.js`)
* Tasks automatically retry based on `queue.json`
* Exceeding `maxAttempts` marks the task as `failed`

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

```

This is **everything in one copyable block**, ready to save as `README.md`.  

If you want, I can also make a **version with a slightly nicer ASCII diagram for multiple dependencies and retries** that looks like a small flowchart. That usually helps visualize pipelines at a glance. Do you want me to do that?
```

