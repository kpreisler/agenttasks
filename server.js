const express = require('express')
const db = require('./db')
const queue = require('./queue')
const allowedStates = new Set(require('./config/states.json').states)

function createApp() {
  const app = express()
  app.use(express.json())

  db.init()

  app.get('/tasks', (req, res) => {
    res.json(db.listTasks())
  })

  app.post('/tasks', (req, res) => {
    db.createTask(req.body || {})
    res.json({ status: 'ok' })
  })

  app.get('/tasks/next', (req, res) => {
    const agent = req.query.agent || 'default'
    const task = queue.next(agent)
    if (!task) return res.json({ task: null })
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
