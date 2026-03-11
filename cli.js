const db = require('./db')
const queue = require('./queue')

const args = process.argv.slice(2)
db.init()

function print(tasks) {
  for (const t of tasks) {
    console.log(`#${t.id} [${t.state}] ${t.title || ''}`)
  }
}

const cmd = args[0]
if (cmd === 'add') {
  const title = args.slice(1).join(' ')
  db.createTask({ title, state: 'ready' })
  console.log('task added')
} else if (cmd === 'list') {
  print(db.listTasks())
} else if (cmd === 'next') {
  const agent = args[1] || 'cli'
  const task = queue.next(agent)
  if (!task) console.log('no tasks ready')
  else console.log(task)
} else if (cmd === 'done') {
  queue.complete(args[1])
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
  console.log(`Commands\nnode cli.js add "task"\nnode cli.js list\nnode cli.js next agent\nnode cli.js done <id>\nnode cli.js state <id> <state>\nnode cli.js dep add <taskId> <dependsOnId>\nnode cli.js dep list <taskId>\nnode cli.js dep rm <taskId> <dependsOnId>\nnode cli.js fail <id>`)
}
