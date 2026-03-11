const boardEl = document.getElementById('board')
const statusEl = document.getElementById('status')
const createForm = document.getElementById('create-form')
const editForm = document.getElementById('edit-form')
const editTargetEl = document.getElementById('edit-target')
const claimNextBtn = document.getElementById('claim-next')
const claimSelectedBtn = document.getElementById('claim-selected')
const refreshBtn = document.getElementById('refresh-board')
const selectedLabelEl = document.getElementById('selected-task')
const agentInput = document.getElementById('agent')
const nextTypeFilter = document.getElementById('next-type-filter')
const actionDock = document.getElementById('action-dock')
const actionMenu = document.getElementById('action-menu')
const launcherBtn = document.getElementById('launcher')
const panelButtons = Array.from(document.querySelectorAll('[data-open-panel]'))
const panelCloseButtons = Array.from(document.querySelectorAll('[data-close-panels]'))
const panels = Array.from(document.querySelectorAll('.floating-panel'))

const createTaskType = document.getElementById('create-task-type')
const editTaskType = document.getElementById('edit-task-type')

const cardTemplate = document.getElementById('card-template')

let states = []
let taskTypes = []
let tasks = []
let selectedTaskId = null
let activePanel = null
let lastRenderSignature = ''

function showStatus(message, isError = false) {
  statusEl.textContent = message
  statusEl.style.color = isError ? '#9b3328' : ''
}

async function fetchJson(url, options) {
  const res = await fetch(url, options)
  let body
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (!res.ok) {
    const msg = body && body.error ? body.error : `${res.status} ${res.statusText}`
    throw new Error(msg)
  }
  return body
}

function option(label, value) {
  const el = document.createElement('option')
  el.textContent = label
  el.value = value
  return el
}

function populateSelectors() {
  for (const type of taskTypes) {
    createTaskType.append(option(type, type))
    editTaskType.append(option(type, type))
    nextTypeFilter.append(option(type, type))
  }

  createTaskType.value = 'general'
}

function setDockOpen(open) {
  actionDock.classList.toggle('open', open)
  launcherBtn.setAttribute('aria-expanded', open ? 'true' : 'false')
}

function openPanel(name) {
  activePanel = name && name !== 'none' ? name : null
  for (const panel of panels) {
    panel.classList.toggle('open', panel.dataset.panel === activePanel)
  }
}

function truncate(text, max = 150) {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function computeTasksSignature(list) {
  return list
    .map((t) => [t.id, t.state, t.title || '', t.description || '', t.priority ?? '', t.agent || '', t.task_type || ''].join('|'))
    .join('||')
}

function setSelectedTask(taskId) {
  selectedTaskId = taskId
  const task = tasks.find((t) => t.id === taskId) || null

  document.querySelectorAll('.task-card').forEach((card) => {
    card.classList.toggle('selected', Number(card.dataset.taskId) === taskId)
  })

  if (!task) {
    selectedLabelEl.textContent = 'No card selected'
    claimSelectedBtn.disabled = true
    editTargetEl.textContent = 'Select a card to edit.'
    editForm.reset()
    editTaskType.value = taskTypes[0] || 'general'
    return
  }

  selectedLabelEl.textContent = `Selected #${task.id}: ${task.title || '(untitled)'}`
  claimSelectedBtn.disabled = false
  editTargetEl.textContent = `Editing #${task.id}`

  editForm.elements.title.value = task.title || ''
  editForm.elements.description.value = task.description || ''
  editForm.elements.priority.value = task.priority ?? 0
  editForm.elements.taskType.value = task.task_type || 'general'
}

function onCardDragStart(event) {
  const card = event.currentTarget
  event.dataTransfer.setData('text/task-id', card.dataset.taskId)
  event.dataTransfer.effectAllowed = 'move'
}

async function moveTask(taskId, toState) {
  const task = tasks.find((t) => t.id === taskId)
  if (!task || task.state === toState) return

  const previousState = task.state
  task.state = toState
  renderBoard()
  lastRenderSignature = computeTasksSignature(tasks)

  try {
    await fetchJson(`/tasks/${taskId}/state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: toState })
    })
    await loadTasks()
    showStatus(`Moved #${taskId} to ${toState}`)
  } catch (err) {
    task.state = previousState
    renderBoard()
    showStatus(`Move failed: ${err.message}`, true)
  }
}

function buildColumn(state, stateTasks) {
  const column = document.createElement('section')
  column.className = 'column'
  column.dataset.state = state

  const title = document.createElement('h3')
  title.textContent = state

  const count = document.createElement('p')
  count.className = 'column-count'
  count.textContent = `${stateTasks.length} task${stateTasks.length === 1 ? '' : 's'}`

  const list = document.createElement('div')
  list.className = 'task-list'

  if (stateTasks.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'empty-note'
    empty.textContent = 'Drop tasks here'
    list.append(empty)
  }

  for (const task of stateTasks) {
    const card = cardTemplate.content.firstElementChild.cloneNode(true)
    card.dataset.taskId = String(task.id)

    card.querySelector('.meta').textContent = `#${task.id} · p${task.priority ?? 0}`
    card.querySelector('.type-badge').textContent = task.task_type || 'general'
    card.querySelector('h3').textContent = task.title || '(untitled task)'
    card.querySelector('.desc').textContent = truncate(task.description || 'No description')
    card.querySelector('.agent').textContent = task.agent ? `Agent: ${task.agent}` : 'Unclaimed'

    card.addEventListener('click', () => {
      setSelectedTask(task.id)
      openPanel('edit')
    })
    card.addEventListener('dragstart', onCardDragStart)

    if (task.id === selectedTaskId) {
      card.classList.add('selected')
    }

    list.append(card)
  }

  column.addEventListener('dragover', (e) => {
    e.preventDefault()
    column.classList.add('drop-target')
  })

  column.addEventListener('dragleave', () => {
    column.classList.remove('drop-target')
  })

  column.addEventListener('drop', async (e) => {
    e.preventDefault()
    column.classList.remove('drop-target')
    const taskId = Number(e.dataTransfer.getData('text/task-id'))
    await moveTask(taskId, state)
  })

  column.append(title, count, list)
  return column
}

function renderBoard() {
  boardEl.replaceChildren()
  for (const state of states) {
    const stateTasks = tasks.filter((t) => t.state === state)
    boardEl.append(buildColumn(state, stateTasks))
  }
}

async function loadMeta() {
  const data = await fetchJson('/meta')
  states = data.states
  taskTypes = data.taskTypes
  populateSelectors()
}

async function loadTasks() {
  const incoming = await fetchJson('/tasks')
  const signature = computeTasksSignature(incoming)
  tasks = incoming

  if (signature !== lastRenderSignature) {
    renderBoard()
    lastRenderSignature = signature
  }

  if (selectedTaskId !== null) {
    const stillExists = tasks.some((t) => t.id === selectedTaskId)
    if (!stillExists) {
      setSelectedTask(null)
    } else {
      setSelectedTask(selectedTaskId)
    }
  }
}

async function createTask(event) {
  event.preventDefault()
  const formData = new FormData(createForm)
  const payload = {
    title: formData.get('title'),
    description: formData.get('description') || null,
    priority: Number(formData.get('priority') || 0),
    taskType: formData.get('taskType'),
  }

  try {
    await fetchJson('/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
    createForm.reset()
    createTaskType.value = payload.taskType || 'general'
    showStatus('Task created')
    await loadTasks()
    openPanel('none')
  } catch (err) {
    showStatus(`Create failed: ${err.message}`, true)
  }
}

async function saveEdits(event) {
  event.preventDefault()
  if (!selectedTaskId) {
    showStatus('Select a card before editing', true)
    return
  }

  const payload = {
    title: editForm.elements.title.value,
    description: editForm.elements.description.value,
    priority: Number(editForm.elements.priority.value || 0),
    taskType: editForm.elements.taskType.value
  }

  try {
    await fetchJson(`/tasks/${selectedTaskId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
    showStatus(`Saved #${selectedTaskId}`)
    await loadTasks()
    openPanel('none')
  } catch (err) {
    showStatus(`Update failed: ${err.message}`, true)
  }
}

async function claimNext() {
  const agent = agentInput.value.trim() || 'web'
  const taskType = nextTypeFilter.value
  const query = new URLSearchParams({ agent })
  if (taskType) query.set('taskType', taskType)

  try {
    const task = await fetchJson(`/tasks/next?${query.toString()}`)
    if (!task || task.task === null) {
      showStatus('No matching task available')
    } else {
      showStatus(`Claimed #${task.id} for ${agent}`)
      await loadTasks()
      setSelectedTask(task.id)
    }
  } catch (err) {
    showStatus(`Claim next failed: ${err.message}`, true)
  }
}

async function claimSelected() {
  if (!selectedTaskId) return
  const agent = agentInput.value.trim() || 'web'

  try {
    const task = await fetchJson(`/tasks/${selectedTaskId}/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agent })
    })
    showStatus(`Claimed #${task.id} for ${agent}`)
    await loadTasks()
    setSelectedTask(task.id)
  } catch (err) {
    showStatus(`Claim failed: ${err.message}`, true)
  }
}

async function init() {
  try {
    await loadMeta()
    await loadTasks()
    showStatus('Board ready')
  } catch (err) {
    showStatus(`Failed to load: ${err.message}`, true)
  }

  createForm.addEventListener('submit', createTask)
  editForm.addEventListener('submit', saveEdits)
  claimNextBtn.addEventListener('click', claimNext)
  claimSelectedBtn.addEventListener('click', claimSelected)
  refreshBtn.addEventListener('click', loadTasks)
  launcherBtn.addEventListener('click', () => {
    const next = !actionDock.classList.contains('open')
    setDockOpen(next)
  })

  for (const btn of panelButtons) {
    btn.addEventListener('click', () => {
      const target = btn.dataset.openPanel
      openPanel(target)
      setDockOpen(false)
      if (target === 'edit' && !selectedTaskId) {
        showStatus('Select a task card before editing', true)
      }
    })
  }

  for (const btn of panelCloseButtons) {
    btn.addEventListener('click', () => openPanel('none'))
  }

  document.addEventListener('click', (event) => {
    if (!actionDock.contains(event.target)) {
      setDockOpen(false)
    }
  })

  setInterval(() => {
    loadTasks().catch(() => {})
  }, 7000)

  openPanel('none')
}

init()
