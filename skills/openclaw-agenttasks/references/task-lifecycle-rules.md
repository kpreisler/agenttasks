# Task Lifecycle Rules

## State model

Valid states:
- `inbox`
- `ready`
- `doing`
- `blocked`
- `done`
- `failed`

New tasks default to `inbox` unless a valid state is provided.

## Queue and claim behavior

- Queue pickup only considers `ready` tasks with `run_after <= now`.
- Optional `taskType` filter narrows candidate tasks.
- Dependencies are enforced at claim/pickup time:
  - A task is claimable only when all dependency tasks are `done`.
- `GET /tasks/next` claims and returns the claimed task.
- `POST /tasks/:id/claim` claims one specific task if claimable.

## Dependency behavior

- Dependencies are stored in `task_dependencies`.
- A task with unresolved dependencies can still be manually set to `ready`, but queue/claim will skip it.
- If a task is `blocked`, it auto-moves to `ready` when all dependencies become `done`.

## Retry behavior

- `POST /tasks/:id/fail` increments attempts.
- If attempts reach `maxAttempts`, task becomes `failed`.
- Otherwise task returns to `ready` with delayed `run_after`.

## Editing behavior

- Generic field edits go through `PATCH /tasks/:id`.
- State changes are not allowed through `PATCH /tasks/:id`; use `POST /tasks/:id/state`.
