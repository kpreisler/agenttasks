const db = require('./db')
const queue = require('./queue')
const allowedStates = new Set(require('./config/states.json').states)
const allowedTaskTypes = new Set(require('./config/task_types.json').taskTypes)

const args = process.argv.slice(2)
db.init()

function print(tasks) {
  if (!tasks.length) {
    console.log('no tasks')
    return
  }
  for (const t of tasks) {
    const agentLabel = t.agent ? ` @${t.agent}` : ''
    const typeLabel = t.task_type ? ` (${t.task_type})` : ''
    console.log(`#${t.id} [${t.state}]${agentLabel}${typeLabel} ${t.title || ''}`)
  }
}

function readFlagValue(argv, flagName) {
  const i = argv.indexOf(flagName)
  if (i === -1) return null
  return argv[i + 1] || null
}

function stripFlag(argv, flagName) {
  const i = argv.indexOf(flagName)
  if (i === -1) return argv.slice()
  return argv.slice(0, i).concat(argv.slice(i + 2))
}

const cmd = args[0]
if (cmd === 'add') {
  const taskType = readFlagValue(args, '--type')
  if (taskType && !allowedTaskTypes.has(taskType)) {
    console.error(`invalid task type: ${taskType}`)
    process.exitCode = 1
  } else {
    const rest = stripFlag(args.slice(1), '--type')
    const title = rest.join(' ')
    db.createTask({ title, state: 'ready', task_type: taskType || 'general' })
    console.log('task added')
  }
} else if (cmd === 'list') {
  const taskType = readFlagValue(args, '--type')
  const state = args[1] && args[1] !== '--type' ? args[1] : null
  if (state && !allowedStates.has(state)) {
    console.error(`invalid state filter: ${state}`)
    process.exitCode = 1
  } else if (taskType && !allowedTaskTypes.has(taskType)) {
    console.error(`invalid task type filter: ${taskType}`)
    process.exitCode = 1
  } else {
    print(db.listTasks(state, taskType))
  }
} else if (cmd === 'next') {
  const taskType = readFlagValue(args, '--type')
  const nextArgs = stripFlag(args.slice(1), '--type')
  const agent = nextArgs[0] || 'cli'
  if (taskType && !allowedTaskTypes.has(taskType)) {
    console.error(`invalid task type filter: ${taskType}`)
    process.exitCode = 1
  } else {
    const task = queue.next(agent, taskType)
    if (!task) console.log('no tasks ready')
    else console.log(task)
  }
} else if (cmd === 'claim') {
  const taskId = args[1]
  const agent = args[2] || 'cli'
  const task = queue.claim(taskId, agent)
  if (!task) console.log('task is not claimable')
  else console.log(task)
} else if (cmd === 'done') {
  queue.complete(args[1])
} else if (cmd === 'update') {
  const taskId = Number(args[1])
  const existing = db.getTaskById(taskId)
  if (!existing) {
    console.error('task not found')
    process.exitCode = 1
  } else {
    const taskType = readFlagValue(args, '--type')
    if (taskType && !allowedTaskTypes.has(taskType)) {
      console.error(`invalid task type: ${taskType}`)
      process.exitCode = 1
    } else {
      const title = readFlagValue(args, '--title')
      const description = readFlagValue(args, '--description')
      const priority = readFlagValue(args, '--priority')
      const agent = readFlagValue(args, '--agent')

      const updates = {}
      if (title !== null) updates.title = title
      if (description !== null) updates.description = description
      if (priority !== null) updates.priority = Number(priority)
      if (agent !== null) updates.agent = agent
      if (taskType !== null) updates.task_type = taskType

      if (!Object.keys(updates).length) {
        console.error('no updates provided')
        process.exitCode = 1
      } else {
        db.updateTask(taskId, updates)
        console.log('task updated')
      }
    }
  }
} else if (cmd === 'state') {
  queue.setState(args[1], args[2])
} else if (cmd === 'dep') {
  const action = args[1]
  if (action === 'add') {
    const taskId = Number(args[2])
    const dependsOnId = Number(args[3])
    db.addDependency(taskId, dependsOnId)
    console.log('dependency added')
  } else if (action === 'list') {
    const taskId = Number(args[2])
    const deps = db.listDependencies(taskId)
    console.log(deps.map((d) => d.depends_on).join(' '))
  } else if (action === 'rm') {
    const taskId = Number(args[2])
    const dependsOnId = Number(args[3])
    const result = db.removeDependency(taskId, dependsOnId)
    console.log(result.changes > 0 ? 'dependency removed' : 'dependency not found')
  } else {
    console.log('dep commands: node cli.js dep add <taskId> <dependsOnId> | dep list <taskId> | dep rm <taskId> <dependsOnId>')
  }
} else if (cmd === 'fail') {
  queue.fail(args[1], 'cli failure')
} else {
  console.log(`Commands\nnode cli.js add "task" [--type <taskType>]\nnode cli.js list [state] [--type <taskType>]\nnode cli.js next [agent] [--type <taskType>]\nnode cli.js claim <id> <agent>\nnode cli.js update <id> [--title \"...\"] [--description \"...\"] [--priority <n>] [--type <taskType>] [--agent <name>]\nnode cli.js done <id>\nnode cli.js state <id> <state>\nnode cli.js dep add <taskId> <dependsOnId>\nnode cli.js dep list <taskId>\nnode cli.js dep rm <taskId> <dependsOnId>\nnode cli.js fail <id>`)
}
