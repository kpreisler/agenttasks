const express = require('express')
const path = require('node:path')
const db = require('./db')
const queue = require('./queue')
const allowedStates = new Set(require('./config/states.json').states)
const allowedTaskTypes = new Set(require('./config/task_types.json').taskTypes)

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/ui', express.static(path.join(__dirname, 'public/ui')))

  db.init()

  app.get('/', (req, res) => {
    res.redirect('/ui')
  })

  app.get('/meta', (req, res) => {
    return res.json({
      states: Array.from(allowedStates),
      taskTypes: Array.from(allowedTaskTypes)
    })
  })

  app.get('/tasks', (req, res) => {
    const state = req.query.state
    const taskType = req.query.taskType
    const agent = req.query.agent
    if (state && !allowedStates.has(state)) {
      return res.status(400).json({ status: 'error', error: 'invalid state filter' })
    }
    if (taskType && !allowedTaskTypes.has(taskType)) {
      return res.status(400).json({ status: 'error', error: 'invalid taskType filter' })
    }
    return res.json(db.listTasks(state, taskType, agent))
  })

  app.post('/tasks', (req, res) => {
    const body = req.body || {}
    const inputType = body.taskType || body.task_type
    if (inputType && !allowedTaskTypes.has(inputType)) {
      return res.status(400).json({ status: 'error', error: 'invalid taskType' })
    }
    const taskId = db.createTask(body)
    return res.json({ status: 'ok', id: Number(taskId) })
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

  app.get('/tasks/:id', (req, res) => {
    const task = db.getTaskById(req.params.id)
    if (!task) return res.status(404).json({ status: 'error', error: 'task not found' })
    return res.json(task)
  })

  app.patch('/tasks/:id', (req, res) => {
    const existing = db.getTaskById(req.params.id)
    if (!existing) return res.status(404).json({ status: 'error', error: 'task not found' })

    const body = req.body || {}
    if ('state' in body) {
      return res.status(400).json({ status: 'error', error: 'state is managed via /tasks/:id/state' })
    }

    const updates = {}
    if ('title' in body) updates.title = body.title
    if ('description' in body) updates.description = body.description
    if ('priority' in body) updates.priority = body.priority
    if ('agent' in body) updates.agent = body.agent
    if ('payload' in body) updates.payload = JSON.stringify(body.payload || {})

    if ('taskType' in body || 'task_type' in body) {
      const taskType = body.taskType || body.task_type
      if (!allowedTaskTypes.has(taskType)) {
        return res.status(400).json({ status: 'error', error: 'invalid taskType' })
      }
      updates.task_type = taskType
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ status: 'error', error: 'no updatable fields provided' })
    }

    db.updateTask(req.params.id, updates)
    return res.json(db.getTaskById(req.params.id))
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

function start(port = 3000, host = process.env.HOST || '127.0.0.1') {
  const app = createApp()
  const server = app.listen(port, host)
  server.on('listening', () => {
    console.log(`API running on http://${host}:${port}`)
  })
  server.on('error', (err) => {
    console.error(`API failed to start on ${host}:${port}: ${err.message}`)
    process.exitCode = 1
  })
  return server
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000)
  start(port)
}

module.exports = { createApp, start }
