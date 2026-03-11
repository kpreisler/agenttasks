---
name: openclaw-agenttasks
description: Use the AgentTasks system as an operator through API, CLI, or `/ui` board. Use when asked to create tasks, update details, move states, claim tasks, manage dependencies, triage queues, or report task status. Do not modify task-manager source code unless the user explicitly asks for implementation changes.
---

# OpenClaw AgentTasks

## Overview

Use this skill to run AgentTasks operations and workflows.
Treat the task manager as an existing service. Default to task operations, not code edits.

## Operator Workflow

1. Choose operation surface:
- CLI when operating directly on the host (`node cli.js ...`).
- API when user asks for HTTP usage or integration examples.
- `/ui` when user wants visual drag/drop interaction.

2. For any task action, identify `id` first:
- Use `node cli.js list ...` or `GET /tasks` and pick by `id`.

3. Run requested operations:
- Create/update tasks.
- Move state (`inbox/ready/doing/blocked/done/failed`).
- Claim next or specific task.
- Add/list/remove dependencies.
- Filter by state/type for triage.

4. Explain lifecycle constraints when relevant (see `references/task-lifecycle-rules.md`):
- `ready` required for pickup/claim.
- Dependencies gate claimability.
- `blocked` auto-unblocks to `ready` when dependencies complete.

5. Report back with concrete command/API results and task ids.

## Reference Files

- For endpoint and command surface: read `references/api-cli-cheatsheet.md`.
- For state/dependency/claim contracts: read `references/task-lifecycle-rules.md`.

Load only the reference needed for the current request.

## Guardrails

- Do not edit `db.js`, `queue.js`, `server.js`, `cli.js`, tests, or UI files unless explicitly asked to change implementation.
- Prefer operating existing endpoints/commands over inventing new workflow.
- Keep state transitions valid and explicit.
- When asked for “next task,” ask whether to filter by `taskType` if ambiguity matters.

## Done Criteria (Operator Requests)

- Requested task operations were executed successfully.
- Response includes ids/states affected.
- If blocked by constraints (dependencies/state), explain exact reason and next action.
