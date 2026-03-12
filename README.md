# AgentTasks Skills Showcase

Public demo repository for showcasing agent task orchestration and Codex skill-driven operations.

This project contains:
- A lightweight task API and queue engine (`Express` + `SQLite`)
- A CLI for task operations
- A drag/drop web board at `/ui`
- An operator skill definition under `skills/openclaw-agenttasks`

## Purpose

This repo is designed to demonstrate how an agent can:
- Create, triage, and claim work
- Manage task lifecycle and dependencies
- Operate through CLI, API, or UI
- Follow explicit workflow guardrails from a skill file

## Project Layout

```text
.
├─ server.js
├─ db.js
├─ queue.js
├─ cli.js
├─ config/
├─ public/ui/
├─ skills/openclaw-agenttasks/
│  ├─ SKILL.md
│  ├─ references/
│  └─ agents/
├─ test/
└─ tasks.db
```

## Quickstart

```bash
npm install
npm test
npm start
```

After starting:
- API: `http://127.0.0.1:3000`
- Board UI: `http://127.0.0.1:3000/ui`

## Skills Demo

Primary skill file:
- `skills/openclaw-agenttasks/SKILL.md`

Supporting references:
- `skills/openclaw-agenttasks/references/api-cli-cheatsheet.md`
- `skills/openclaw-agenttasks/references/task-lifecycle-rules.md`

Suggested demo flow:
1. Start API with `npm start`.
2. Create a task with `node cli.js add "Demo task" --type research`.
3. Move it to ready with `node cli.js state <id> ready`.
4. Claim work with `node cli.js next demo-agent --type research`.
5. Open `/ui` and verify state changes visually.

## Key Endpoints

- `GET /tasks`
- `POST /tasks`
- `PATCH /tasks/:id`
- `GET /tasks/next?agent=<name>&taskType=<type>`
- `POST /tasks/:id/claim`
- `POST /tasks/:id/state`
- `GET /meta`

## Notes

- This repository is scoped to AgentTasks and skill operations.
- Marketing/website content is maintained separately.
