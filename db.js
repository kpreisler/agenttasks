const Database = require('better-sqlite3')
const fields = require('./config/fields.json').fields
const allowedStates = new Set(require('./config/states.json').states)
const allowedTaskTypes = new Set(require('./config/task_types.json').taskTypes)

const dbPath = process.env.TASKS_DB_PATH || 'tasks.db'
const db = new Database(dbPath)

function init() {
  const custom = Object.entries(fields)
    .map(([n, t]) => `${n} ${t}`)
    .join(',')

  db.prepare(`
 CREATE TABLE IF NOT EXISTS tasks (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 state TEXT,
 payload TEXT,
 attempts INTEGER DEFAULT 0,
 run_after INTEGER DEFAULT 0,
 created_at INTEGER,
 updated_at INTEGER,
 ${custom}
 )`).run()

  // Lightweight migration: ensure new configured fields are added to existing DBs.
  const existingColumns = new Set(db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name))
  for (const [name, type] of Object.entries(fields)) {
    if (!existingColumns.has(name)) {
      db.prepare(`ALTER TABLE tasks ADD COLUMN ${name} ${type}`).run()
    }
  }

  db.prepare(`
 CREATE TABLE IF NOT EXISTS task_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 task_id INTEGER,
 type TEXT,
 message TEXT,
 created_at INTEGER
 )`).run()

  db.prepare(`
 CREATE TABLE IF NOT EXISTS task_dependencies (
 task_id INTEGER,
 depends_on INTEGER,
 UNIQUE(task_id, depends_on)
 )`).run()
}

function createTask(data) {
  const now = Date.now()
  const cols = Object.keys(fields)
  const stmt = db.prepare(`
 INSERT INTO tasks (
 state,payload,created_at,updated_at,${cols.join(',')}
 ) VALUES (?,?,?,?,${cols.map(() => '?').join(',')})
 `)
  const values = cols.map((c) => {
    if (c === 'task_type') {
      const inputType = data.task_type || data.taskType
      return allowedTaskTypes.has(inputType) ? inputType : 'general'
    }
    return data[c] || null
  })
  const state = allowedStates.has(data.state) ? data.state : 'inbox'
  const result = stmt.run(state, JSON.stringify(data.payload || {}), now, now, ...values)
  return result.lastInsertRowid
}

function listTasks(state, taskType) {
  if (state && taskType) {
    return db.prepare('SELECT * FROM tasks WHERE state=? AND task_type=? ORDER BY created_at DESC').all(state, taskType)
  }
  if (state) {
    return db.prepare('SELECT * FROM tasks WHERE state=? ORDER BY created_at DESC').all(state)
  }
  if (taskType) {
    return db.prepare('SELECT * FROM tasks WHERE task_type=? ORDER BY created_at DESC').all(taskType)
  }
  return db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all()
}

function updateState(id, state) {
  db.prepare('UPDATE tasks SET state=?,updated_at=? WHERE id=?').run(state, Date.now(), id)
}

function logEvent(taskId, type, message) {
  db.prepare('INSERT INTO task_events (task_id,type,message,created_at) VALUES (?,?,?,?)').run(taskId, type, message, Date.now())
}

function addDependency(task, depends) {
  db.prepare('INSERT OR IGNORE INTO task_dependencies (task_id,depends_on) VALUES (?,?)').run(task, depends)
}

function addDependencies(taskId, dependsOnIds) {
  const stmt = db.prepare('INSERT OR IGNORE INTO task_dependencies (task_id,depends_on) VALUES (?,?)')
  const tx = db.transaction((ids) => {
    for (const dependsOnId of ids) {
      stmt.run(taskId, dependsOnId)
    }
  })
  tx(dependsOnIds)
}

function listDependencies(taskId) {
  return db.prepare('SELECT depends_on FROM task_dependencies WHERE task_id=? ORDER BY depends_on ASC').all(taskId)
}

function removeDependency(taskId, dependsOnId) {
  return db.prepare('DELETE FROM task_dependencies WHERE task_id=? AND depends_on=?').run(taskId, dependsOnId)
}

function listDependentTaskIds(dependsOnId) {
  return db.prepare('SELECT task_id FROM task_dependencies WHERE depends_on=?').all(dependsOnId)
}

function dependenciesDone(taskId) {
  const rows = db.prepare('SELECT t.state FROM task_dependencies d JOIN tasks t ON d.depends_on=t.id WHERE d.task_id=?').all(taskId)
  return rows.every((r) => r.state === 'done')
}

function nextRunnable(taskType) {
  const now = Date.now()
  let tasks
  if (taskType) {
    tasks = db.prepare("SELECT * FROM tasks WHERE state='ready' AND run_after<=? AND task_type=? ORDER BY priority DESC,created_at ASC").all(now, taskType)
  } else {
    tasks = db.prepare("SELECT * FROM tasks WHERE state='ready' AND run_after<=? ORDER BY priority DESC,created_at ASC").all(now)
  }
  for (const t of tasks) {
    if (dependenciesDone(t.id)) return t
  }
  return null
}

function getClaimableTaskById(id) {
  const task = db.prepare("SELECT * FROM tasks WHERE id=? AND state='ready' AND run_after<=?").get(id, Date.now())
  if (!task) return null
  if (!dependenciesDone(task.id)) return null
  return task
}

function claimTask(id, agent) {
  db.prepare("UPDATE tasks SET state='doing',agent=?,updated_at=? WHERE id=?").run(agent, Date.now(), id)
}

function failTask(id, queueConfig) {
  const t = db.prepare('SELECT attempts FROM tasks WHERE id=?').get(id)
  const attempts = t.attempts + 1
  if (attempts >= queueConfig.maxAttempts) {
    db.prepare("UPDATE tasks SET state='failed',attempts=?,updated_at=? WHERE id=?").run(attempts, Date.now(), id)
    return
  }

  const runAfter = Date.now() + queueConfig.retryDelayMs
  db.prepare("UPDATE tasks SET state='ready',attempts=?,run_after=?,updated_at=? WHERE id=?").run(attempts, runAfter, Date.now(), id)
}

function getTaskById(id) {
  return db.prepare('SELECT * FROM tasks WHERE id=?').get(id)
}

function close() {
  db.close()
}

module.exports = {
  db,
  init,
  createTask,
  listTasks,
  updateState,
  logEvent,
  addDependency,
  addDependencies,
  listDependencies,
  removeDependency,
  listDependentTaskIds,
  dependenciesDone,
  getClaimableTaskById,
  nextRunnable,
  claimTask,
  failTask,
  getTaskById,
  close
}
