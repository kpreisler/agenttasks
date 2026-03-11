const db=require('./db')
const queueConfig=require('./config/queue.json')

function next(agent){
 const task=db.nextRunnable()
 if(!task) return null
 db.claimTask(task.id,agent)
 db.logEvent(task.id,'claim',`claimed by ${agent}`)
 return task
}

function complete(id){ db.updateState(id,'done'); db.logEvent(id,'complete','task finished') }
function fail(id,message){ db.logEvent(id,'error',message); db.failTask(id,queueConfig) }

module.exports={next,complete,fail}
