const db=require('./db')
const queue=require('./queue')
const args=process.argv.slice(2)
db.init()
function print(tasks){ for(const t of tasks) console.log(`#${t.id} [${t.state}] ${t.title||''}`) }
const cmd=args[0]
if(cmd==='add'){ const title=args.slice(1).join(' '); db.createTask({title,state:'ready'}); console.log('task added') }
else if(cmd==='list'){ print(db.listTasks()) }
else if(cmd==='next'){ const agent=args[1]||'cli'; const task=queue.next(agent); if(!task) console.log('no tasks ready'); else console.log(task) }
else if(cmd==='done'){ queue.complete(args[1]) }
else if(cmd==='fail'){ queue.fail(args[1],'cli failure') }
else{ console.log(`Commands\nnode cli.js add "task"\nnode cli.js list\nnode cli.js next agent\nnode cli.js done <id>\nnode cli.js fail <id>`) }
