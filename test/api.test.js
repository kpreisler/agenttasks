const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { once } = require('node:events')

function resetModule(name) {
  const resolved = require.resolve(name)
  delete require.cache[resolved]
}

function createIsolatedContext() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agenttasks-test-'))
  const dbPath = path.join(dir, 'tasks.db')
  process.env.TASKS_DB_PATH = dbPath

  resetModule('../db')
  resetModule('../queue')
  resetModule('../server')

  const db = require('../db')
  const serverModule = require('../server')

  return {
    dir,
    db,
    createApp: serverModule.createApp
  }
}

async function withServer(app) {
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) return reject(err)
          resolve()
        })
      })
  }
}

test('POST /tasks/:id/state updates to any valid state and rejects invalid states', async () => {
  const ctx = createIsolatedContext()
  const app = ctx.createApp()
  const srv = await withServer(app)

  try {
    let res = await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'task1', state: 'ready', priority: 3 })
    })
    assert.equal(res.status, 200)

    res = await fetch(`${srv.baseUrl}/tasks`)
    const tasks = await res.json()
    assert.equal(tasks.length, 1)
    const taskId = tasks[0].id
    assert.equal(tasks[0].state, 'ready')

    res = await fetch(`${srv.baseUrl}/tasks/${taskId}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: 'blocked' })
    })
    assert.equal(res.status, 200)

    res = await fetch(`${srv.baseUrl}/tasks`)
    const afterBlocked = await res.json()
    assert.equal(afterBlocked[0].state, 'blocked')

    res = await fetch(`${srv.baseUrl}/tasks/${taskId}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: 'not-a-real-state' })
    })
    assert.equal(res.status, 400)

    res = await fetch(`${srv.baseUrl}/tasks`)
    const afterInvalid = await res.json()
    assert.equal(afterInvalid[0].state, 'blocked')
  } finally {
    await srv.close()
    ctx.db.close()
    fs.rmSync(ctx.dir, { recursive: true, force: true })
  }
})

test('GET /tasks/next claims task for agent and returns doing state', async () => {
  const ctx = createIsolatedContext()
  const app = ctx.createApp()
  const srv = await withServer(app)

  try {
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'run me', state: 'ready', priority: 10 })
    })

    const res = await fetch(`${srv.baseUrl}/tasks/next?agent=worker-a`)
    assert.equal(res.status, 200)
    const claimed = await res.json()

    assert.equal(claimed.title, 'run me')
    assert.equal(claimed.state, 'doing')
    assert.equal(claimed.agent, 'worker-a')
  } finally {
    await srv.close()
    ctx.db.close()
    fs.rmSync(ctx.dir, { recursive: true, force: true })
  }
})

test('legacy /complete endpoint still marks task done', async () => {
  const ctx = createIsolatedContext()
  const app = ctx.createApp()
  const srv = await withServer(app)

  try {
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'finish me', state: 'ready' })
    })

    let res = await fetch(`${srv.baseUrl}/tasks`)
    let tasks = await res.json()
    const taskId = tasks[0].id

    res = await fetch(`${srv.baseUrl}/tasks/${taskId}/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    })
    assert.equal(res.status, 200)

    res = await fetch(`${srv.baseUrl}/tasks`)
    tasks = await res.json()
    assert.equal(tasks[0].state, 'done')
  } finally {
    await srv.close()
    ctx.db.close()
    fs.rmSync(ctx.dir, { recursive: true, force: true })
  }
})

test('POST /tasks/:id/fail retries up to maxAttempts then marks failed', async () => {
  const ctx = createIsolatedContext()
  const app = ctx.createApp()
  const srv = await withServer(app)

  try {
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'flaky', state: 'ready' })
    })

    let res = await fetch(`${srv.baseUrl}/tasks`)
    let tasks = await res.json()
    const taskId = tasks[0].id

    for (let i = 1; i <= 2; i += 1) {
      res = await fetch(`${srv.baseUrl}/tasks/${taskId}/fail`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: `failed #${i}` })
      })
      assert.equal(res.status, 200)

      res = await fetch(`${srv.baseUrl}/tasks`)
      tasks = await res.json()
      assert.equal(tasks[0].state, 'ready')
      assert.equal(tasks[0].attempts, i)
    }

    res = await fetch(`${srv.baseUrl}/tasks/${taskId}/fail`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'failed #3' })
    })
    assert.equal(res.status, 200)

    res = await fetch(`${srv.baseUrl}/tasks`)
    tasks = await res.json()
    assert.equal(tasks[0].state, 'failed')
    assert.equal(tasks[0].attempts, 3)
  } finally {
    await srv.close()
    ctx.db.close()
    fs.rmSync(ctx.dir, { recursive: true, force: true })
  }
})
