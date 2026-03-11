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

test('GET /tasks/:id returns the task and PATCH /tasks/:id updates editable fields', async () => {
  const ctx = createIsolatedContext()
  const app = ctx.createApp()
  const srv = await withServer(app)

  try {
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'orig title',
        description: 'orig desc',
        state: 'inbox',
        taskType: 'research',
        payload: { a: 1 }
      })
    })

    let res = await fetch(`${srv.baseUrl}/tasks`)
    let tasks = await res.json()
    const taskId = tasks[0].id

    res = await fetch(`${srv.baseUrl}/tasks/${taskId}`)
    assert.equal(res.status, 200)
    let task = await res.json()
    assert.equal(task.id, taskId)
    assert.equal(task.title, 'orig title')

    res = await fetch(`${srv.baseUrl}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        description: 'new desc',
        taskType: 'marketing',
        priority: 7,
        payload: { b: 2 }
      })
    })
    assert.equal(res.status, 200)
    task = await res.json()
    assert.equal(task.description, 'new desc')
    assert.equal(task.task_type, 'marketing')
    assert.equal(task.priority, 7)
    assert.equal(task.payload, JSON.stringify({ b: 2 }))

    res = await fetch(`${srv.baseUrl}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskType: 'not-valid' })
    })
    assert.equal(res.status, 400)

    res = await fetch(`${srv.baseUrl}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: 'ready' })
    })
    assert.equal(res.status, 400)
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

test('GET /tasks/next supports optional taskType filter', async () => {
  const ctx = createIsolatedContext()
  const app = ctx.createApp()
  const srv = await withServer(app)

  try {
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'marketing-task', state: 'ready', taskType: 'marketing', priority: 5 })
    })
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'research-task', state: 'ready', taskType: 'research', priority: 10 })
    })

    let res = await fetch(`${srv.baseUrl}/tasks/next?agent=worker-a&taskType=marketing`)
    assert.equal(res.status, 200)
    let claimed = await res.json()
    assert.equal(claimed.task_type, 'marketing')
    assert.equal(claimed.title, 'marketing-task')

    res = await fetch(`${srv.baseUrl}/tasks/next?agent=worker-b&taskType=not-valid`)
    assert.equal(res.status, 400)
  } finally {
    await srv.close()
    ctx.db.close()
    fs.rmSync(ctx.dir, { recursive: true, force: true })
  }
})

test('POST /tasks/:id/claim claims selected claimable task', async () => {
  const ctx = createIsolatedContext()
  const app = ctx.createApp()
  const srv = await withServer(app)

  try {
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'pick-me', state: 'ready' })
    })

    let res = await fetch(`${srv.baseUrl}/tasks`)
    const tasks = await res.json()
    const taskId = tasks[0].id

    res = await fetch(`${srv.baseUrl}/tasks/${taskId}/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agent: 'dashboard-user' })
    })
    assert.equal(res.status, 200)
    const claimed = await res.json()
    assert.equal(claimed.state, 'doing')
    assert.equal(claimed.agent, 'dashboard-user')
  } finally {
    await srv.close()
    ctx.db.close()
    fs.rmSync(ctx.dir, { recursive: true, force: true })
  }
})

test('GET /tasks includes agent for claimed tasks', async () => {
  const ctx = createIsolatedContext()
  const app = ctx.createApp()
  const srv = await withServer(app)

  try {
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'show-agent', state: 'ready' })
    })

    let res = await fetch(`${srv.baseUrl}/tasks`)
    let tasks = await res.json()
    const taskId = tasks[0].id

    await fetch(`${srv.baseUrl}/tasks/${taskId}/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agent: 'dashboard-user' })
    })

    res = await fetch(`${srv.baseUrl}/tasks`)
    tasks = await res.json()
    assert.equal(tasks[0].agent, 'dashboard-user')
    assert.equal(tasks[0].state, 'doing')
  } finally {
    await srv.close()
    ctx.db.close()
    fs.rmSync(ctx.dir, { recursive: true, force: true })
  }
})

test('GET /tasks supports filtering by state', async () => {
  const ctx = createIsolatedContext()
  const app = ctx.createApp()
  const srv = await withServer(app)

  try {
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'r1', state: 'ready' })
    })
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'i1', state: 'inbox' })
    })

    let res = await fetch(`${srv.baseUrl}/tasks?state=ready`)
    assert.equal(res.status, 200)
    let tasks = await res.json()
    assert.equal(tasks.length, 1)
    assert.equal(tasks[0].state, 'ready')
    assert.equal(tasks[0].title, 'r1')

    res = await fetch(`${srv.baseUrl}/tasks?state=badstate`)
    assert.equal(res.status, 400)
  } finally {
    await srv.close()
    ctx.db.close()
    fs.rmSync(ctx.dir, { recursive: true, force: true })
  }
})

test('POST /tasks supports taskType and rejects invalid taskType', async () => {
  const ctx = createIsolatedContext()
  const app = ctx.createApp()
  const srv = await withServer(app)

  try {
    let res = await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'market task', state: 'ready', taskType: 'marketing' })
    })
    assert.equal(res.status, 200)

    res = await fetch(`${srv.baseUrl}/tasks`)
    let tasks = await res.json()
    assert.equal(tasks[0].task_type, 'marketing')

    res = await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'bad type task', taskType: 'unknown-type' })
    })
    assert.equal(res.status, 400)

    res = await fetch(`${srv.baseUrl}/tasks`)
    tasks = await res.json()
    assert.equal(tasks.length, 1)
  } finally {
    await srv.close()
    ctx.db.close()
    fs.rmSync(ctx.dir, { recursive: true, force: true })
  }
})

test('GET /tasks supports filtering by taskType and combined filters', async () => {
  const ctx = createIsolatedContext()
  const app = ctx.createApp()
  const srv = await withServer(app)

  try {
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'm-ready', state: 'ready', taskType: 'marketing' })
    })
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'r-ready', state: 'ready', taskType: 'research' })
    })
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'm-inbox', state: 'inbox', taskType: 'marketing' })
    })

    let res = await fetch(`${srv.baseUrl}/tasks?taskType=marketing`)
    assert.equal(res.status, 200)
    let tasks = await res.json()
    assert.equal(tasks.length, 2)
    assert.ok(tasks.every((t) => t.task_type === 'marketing'))

    res = await fetch(`${srv.baseUrl}/tasks?state=ready&taskType=marketing`)
    assert.equal(res.status, 200)
    tasks = await res.json()
    assert.equal(tasks.length, 1)
    assert.equal(tasks[0].title, 'm-ready')

    res = await fetch(`${srv.baseUrl}/tasks?taskType=not-valid`)
    assert.equal(res.status, 400)
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

test('dependencies API can add/list/remove dependencies', async () => {
  const ctx = createIsolatedContext()
  const app = ctx.createApp()
  const srv = await withServer(app)

  try {
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'parent', state: 'ready' })
    })
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'child', state: 'ready' })
    })

    let res = await fetch(`${srv.baseUrl}/tasks`)
    let tasks = await res.json()
    const parent = tasks.find((t) => t.title === 'parent')
    const child = tasks.find((t) => t.title === 'child')

    res = await fetch(`${srv.baseUrl}/tasks/${child.id}/dependencies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dependsOn: parent.id })
    })
    assert.equal(res.status, 200)

    res = await fetch(`${srv.baseUrl}/tasks/${child.id}/dependencies`)
    assert.equal(res.status, 200)
    let deps = await res.json()
    assert.deepEqual(deps.dependencies, [parent.id])

    res = await fetch(`${srv.baseUrl}/tasks/${child.id}/dependencies/${parent.id}`, {
      method: 'DELETE'
    })
    assert.equal(res.status, 200)
    const rmPayload = await res.json()
    assert.equal(rmPayload.removed, true)

    res = await fetch(`${srv.baseUrl}/tasks/${child.id}/dependencies`)
    deps = await res.json()
    assert.deepEqual(deps.dependencies, [])
  } finally {
    await srv.close()
    ctx.db.close()
    fs.rmSync(ctx.dir, { recursive: true, force: true })
  }
})

test('dependencies block queue until dependency task is done', async () => {
  const ctx = createIsolatedContext()
  const app = ctx.createApp()
  const srv = await withServer(app)

  try {
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'dependency', state: 'ready', priority: 20 })
    })
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'blocked-task', state: 'ready', priority: 10 })
    })

    let res = await fetch(`${srv.baseUrl}/tasks`)
    const tasks = await res.json()
    const dependency = tasks.find((t) => t.title === 'dependency')
    const blockedTask = tasks.find((t) => t.title === 'blocked-task')

    res = await fetch(`${srv.baseUrl}/tasks/${blockedTask.id}/dependencies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dependsOn: dependency.id })
    })
    assert.equal(res.status, 200)

    res = await fetch(`${srv.baseUrl}/tasks/next?agent=worker-1`)
    let nextTask = await res.json()
    assert.equal(nextTask.id, dependency.id)

    await fetch(`${srv.baseUrl}/tasks/${dependency.id}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: 'done' })
    })

    res = await fetch(`${srv.baseUrl}/tasks/next?agent=worker-2`)
    nextTask = await res.json()
    assert.equal(nextTask.id, blockedTask.id)
  } finally {
    await srv.close()
    ctx.db.close()
    fs.rmSync(ctx.dir, { recursive: true, force: true })
  }
})

test('POST /tasks/:id/claim rejects non-claimable tasks with unresolved dependencies', async () => {
  const ctx = createIsolatedContext()
  const app = ctx.createApp()
  const srv = await withServer(app)

  try {
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'dep', state: 'ready' })
    })
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'target', state: 'ready' })
    })

    let res = await fetch(`${srv.baseUrl}/tasks`)
    const tasks = await res.json()
    const dep = tasks.find((t) => t.title === 'dep')
    const target = tasks.find((t) => t.title === 'target')

    await fetch(`${srv.baseUrl}/tasks/${target.id}/dependencies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dependsOn: dep.id })
    })

    res = await fetch(`${srv.baseUrl}/tasks/${target.id}/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agent: 'dashboard-user' })
    })
    assert.equal(res.status, 409)

    await fetch(`${srv.baseUrl}/tasks/${dep.id}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: 'done' })
    })

    res = await fetch(`${srv.baseUrl}/tasks/${target.id}/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agent: 'dashboard-user' })
    })
    assert.equal(res.status, 200)
    const claimed = await res.json()
    assert.equal(claimed.state, 'doing')
  } finally {
    await srv.close()
    ctx.db.close()
    fs.rmSync(ctx.dir, { recursive: true, force: true })
  }
})

test('blocked task automatically moves to ready when all dependencies are done', async () => {
  const ctx = createIsolatedContext()
  const app = ctx.createApp()
  const srv = await withServer(app)

  try {
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'dep-one', state: 'ready' })
    })
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'blocked-child', state: 'blocked' })
    })

    let res = await fetch(`${srv.baseUrl}/tasks`)
    let tasks = await res.json()
    const dep = tasks.find((t) => t.title === 'dep-one')
    const child = tasks.find((t) => t.title === 'blocked-child')

    await fetch(`${srv.baseUrl}/tasks/${child.id}/dependencies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dependsOn: dep.id })
    })

    await fetch(`${srv.baseUrl}/tasks/${dep.id}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: 'done' })
    })

    res = await fetch(`${srv.baseUrl}/tasks`)
    tasks = await res.json()
    const updatedChild = tasks.find((t) => t.id === child.id)
    assert.equal(updatedChild.state, 'ready')
  } finally {
    await srv.close()
    ctx.db.close()
    fs.rmSync(ctx.dir, { recursive: true, force: true })
  }
})

test('blocked task stays blocked until all dependencies are done', async () => {
  const ctx = createIsolatedContext()
  const app = ctx.createApp()
  const srv = await withServer(app)

  try {
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'dep-a', state: 'ready' })
    })
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'dep-b', state: 'ready' })
    })
    await fetch(`${srv.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'blocked-multi', state: 'blocked' })
    })

    let res = await fetch(`${srv.baseUrl}/tasks`)
    let tasks = await res.json()
    const depA = tasks.find((t) => t.title === 'dep-a')
    const depB = tasks.find((t) => t.title === 'dep-b')
    const child = tasks.find((t) => t.title === 'blocked-multi')

    await fetch(`${srv.baseUrl}/tasks/${child.id}/dependencies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dependsOn: [depA.id, depB.id] })
    })

    await fetch(`${srv.baseUrl}/tasks/${depA.id}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: 'done' })
    })

    res = await fetch(`${srv.baseUrl}/tasks`)
    tasks = await res.json()
    let updatedChild = tasks.find((t) => t.id === child.id)
    assert.equal(updatedChild.state, 'blocked')

    await fetch(`${srv.baseUrl}/tasks/${depB.id}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: 'done' })
    })

    res = await fetch(`${srv.baseUrl}/tasks`)
    tasks = await res.json()
    updatedChild = tasks.find((t) => t.id === child.id)
    assert.equal(updatedChild.state, 'ready')
  } finally {
    await srv.close()
    ctx.db.close()
    fs.rmSync(ctx.dir, { recursive: true, force: true })
  }
})
