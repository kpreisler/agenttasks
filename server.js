const express=require('express')
const db=require('./db')
const queue=require('./queue')
const app=express()
app.use(express.json())
db.init()

app.get('/tasks',(req,res)=>{ res.json(db.listTasks()) })
app.post('/tasks',(req,res)=>{ db.createTask(req.body); res.json({status:'ok'}) })
app.get('/tasks/next',(req,res)=>{
 const agent=req.query.agent||'default'
 const task=queue.next(agent)
 if(!task) return res.json({task:null})
 res.json(task)
})
app.post('/tasks/:id/complete',(req,res)=>{ queue.complete(req.params.id); res.json({status:'ok'}) })
app.post('/tasks/:id/fail',(req,res)=>{ queue.fail(req.params.id,req.body.message||'error'); res.json({status:'ok'}) })
app.post('/tasks/:id/event',(req,res)=>{ db.logEvent(req.params.id,req.body.type,req.body.message); res.json({status:'ok'}) })
app.listen(3000,()=>{ console.log('API running on http://localhost:3000') })
