const express = require('express')
const db = require('./db')
const queue = require('./queue')
const allowedStates = new Set(require('./config/states.json').states)
const allowedTaskTypes = new Set(require('./config/task_types.json').taskTypes)

function createApp() {
  const app = express()
  app.use(express.json())

  db.init()

  app.get('/tasks', (req, res) => {
    const state = req.query.state
    const taskType = req.query.taskType
    if (state && !allowedStates.has(state)) {
      return res.status(400).json({ status: 'error', error: 'invalid state filter' })
    }
    if (taskType && !allowedTaskTypes.has(taskType)) {
      return res.status(400).json({ status: 'error', error: 'invalid taskType filter' })
    }
    return res.json(db.listTasks(state, taskType))
  })

  app.post('/tasks', (req, res) => {
    const body = req.body || {}
    const inputType = body.taskType || body.task_type
    if (inputType && !allowedTaskTypes.has(inputType)) {
      return res.status(400).json({ status: 'error', error: 'invalid taskType' })
    }
    db.createTask(body)
    return res.json({ status: 'ok' })
  })

  app.get('/tasks/next', (req, res) => {
    const agent = req.query.agent || 'default'
    const taskType = req.query.taskType
    if (taskType && !allowedTaskTypes.has(taskType)) {
      return res.status(400).json({ status: 'error', error: 'invalid taskType filter' })
    }
    const task = queue.next(agent, taskType)
    if (!task) return res.json({ task: null })
    return res.json(task)
  })

  app.post('/tasks/:id/claim', (req, res) => {
    const { agent } = req.body || {}
    if (!agent) {
      return res.status(400).json({ status: 'error', error: 'agent is required' })
    }
    const task = queue.claim(req.params.id, agent)
    if (!task) {
      return res.status(409).json({ status: 'error', error: 'task is not claimable' })
    }
    return res.json(task)
  })

  app.post('/tasks/:id/state', (req, res) => {
    const { state, type, message } = req.body || {}
    if (!state || !allowedStates.has(state)) {
      return res.status(400).json({ status: 'error', error: 'invalid state' })
    }

    queue.setState(req.params.id, state, type || 'state', message || `state changed to ${state}`)
    return res.json({ status: 'ok' })
  })

  app.get('/tasks/:id/dependencies', (req, res) => {
    const rows = db.listDependencies(req.params.id)
    return res.json({ taskId: Number(req.params.id), dependencies: rows.map((r) => r.depends_on) })
  })

  app.post('/tasks/:id/dependencies', (req, res) => {
    const taskId = Number(req.params.id)
    const body = req.body || {}
    const ids = Array.isArray(body.dependsOn) ? body.dependsOn : [body.dependsOn]

    if (!ids.length || ids.some((id) => !Number.isInteger(Number(id)))) {
      return res.status(400).json({ status: 'error', error: 'dependsOn must be an id or array of ids' })
    }

    const numericIds = ids.map((id) => Number(id))
    db.addDependencies(taskId, numericIds)
    return res.json({ status: 'ok', taskId, dependsOn: numericIds })
  })

  app.delete('/tasks/:id/dependencies/:dependsOnId', (req, res) => {
    const taskId = Number(req.params.id)
    const dependsOnId = Number(req.params.dependsOnId)
    const result = db.removeDependency(taskId, dependsOnId)
    return res.json({ status: 'ok', removed: result.changes > 0 })
  })

  app.post('/tasks/:id/complete', (req, res) => {
    queue.complete(req.params.id)
    res.json({ status: 'ok' })
  })

  app.post('/tasks/:id/fail', (req, res) => {
    queue.fail(req.params.id, (req.body && req.body.message) || 'error')
    res.json({ status: 'ok' })
  })

  app.post('/tasks/:id/event', (req, res) => {
    db.logEvent(req.params.id, req.body.type, req.body.message)
    res.json({ status: 'ok' })
  })

  return app
}

function start(port = 3000) {
  const app = createApp()
  return app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`)
  })
}

if (require.main === module) {
  start(3000)
}

module.exports = { createApp, start }
