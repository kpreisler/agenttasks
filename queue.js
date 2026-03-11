const db = require('./db')
const queueConfig = require('./config/queue.json')

function next(agent, taskType) {
  const task = db.nextRunnable(taskType)
  if (!task) return null
  db.claimTask(task.id, agent)
  db.logEvent(task.id, 'claim', `claimed by ${agent}`)
  return db.getTaskById(task.id)
}

function claim(id, agent) {
  const task = db.getClaimableTaskById(id)
  if (!task) return null
  db.claimTask(task.id, agent)
  db.logEvent(task.id, 'claim', `claimed by ${agent}`)
  return db.getTaskById(task.id)
}

function setState(id, state, eventType = 'state', message = `state changed to ${state}`) {
  db.updateState(id, state)
  db.logEvent(id, eventType, message)
}

function complete(id) {
  setState(id, 'done', 'complete', 'task finished')
}

function fail(id, message) {
  db.logEvent(id, 'error', message)
  db.failTask(id, queueConfig)
}

module.exports = { next, claim, setState, complete, fail }
