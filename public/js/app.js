import { api } from './api.js';
import { EmomTimer } from './timer.js';

const byId = (id) => document.getElementById(id);
const views = ['auth', 'list', 'form', 'runner'];
let loggedIn = false;

function showView(name) {
  for (const view of views) {
    byId(`view-${view}`).classList.toggle('hidden', view !== name);
  }

  document.body.dataset.view = name;
}

function applyChrome() {
  byId('logout-btn').classList.toggle('hidden', !loggedIn);
  byId('login-btn').classList.toggle('hidden', loggedIn);
  byId('guest-banner').classList.toggle('hidden', loggedIn);
  byId('learn').classList.toggle('hidden', loggedIn);
}

function formatClock(totalSeconds) {
  const seconds = Math.ceil(totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

// ---- Auth ----

const authForm = byId('auth-form');
const authError = byId('auth-error');

async function handleAuth(action) {
  authError.textContent = '';

  const email = byId('auth-email').value.trim();
  const password = byId('auth-password').value;

  try {
    await action(email, password);
    await enterApp();
  } catch (error) {
    authError.textContent = error.message;
  }
}

authForm.addEventListener('submit', (event) => {
  event.preventDefault();
  handleAuth(api.login);
});

byId('register-btn').addEventListener('click', () => {
  if (authForm.reportValidity()) {
    handleAuth(api.register);
  }
});

byId('logout-btn').addEventListener('click', async () => {
  await api.logout();
  showGuestHome();
});

byId('login-btn').addEventListener('click', () => showView('auth'));
byId('banner-login').addEventListener('click', () => showView('auth'));
byId('guest-link').addEventListener('click', () => showGuestHome());

// ---- Workout list ----

async function renderList() {
  const { workouts } = await api.listWorkouts();
  const list = byId('workout-list');

  list.innerHTML = '';
  byId('list-empty').classList.toggle('hidden', workouts.length > 0);

  for (const workout of workouts) {
    list.appendChild(workoutItem(workout));
  }
}

function workoutItem(workout) {
  const rounds = workout.total_duration_sec / workout.interval_sec;
  const item = document.createElement('li');
  const info = document.createElement('div');

  info.innerHTML = `<strong>${escapeHtml(workout.name)}</strong>` +
    `<span class="muted"> ${rounds} × ${workout.interval_sec}s · ${formatClock(workout.total_duration_sec)}</span>`;

  const actions = document.createElement('div');
  actions.className = 'row';
  actions.append(
    button('Run', () => openRunner(workout)),
    button('Edit', () => openForm(workout), 'secondary'),
    button('Delete', () => removeWorkout(workout.id), 'danger')
  );

  item.append(info, actions);

  return item;
}

function button(label, onClick, variant) {
  const element = document.createElement('button');
  element.textContent = label;

  if (variant) {
    element.className = variant;
  }

  element.addEventListener('click', onClick);

  return element;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;

  return div.innerHTML;
}

async function removeWorkout(id) {
  if (window.confirm('Delete this workout?')) {
    await api.deleteWorkout(id);
    await renderList();
  }
}

byId('new-btn').addEventListener('click', () => openForm(null));

// ---- Form ----

const workoutForm = byId('workout-form');
const formError = byId('form-error');
let editingId = null;

const intervalInput = byId('w-interval');
const roundsInput = byId('w-rounds');
const leadInput = byId('w-lead');

function updateFormDerived() {
  byId('w-lead-out').textContent = leadInput.value;

  const interval = Number(intervalInput.value);
  const rounds = Number(roundsInput.value) || 0;

  byId('w-total').textContent = formatClock(interval * rounds);
}

for (const input of [intervalInput, roundsInput, leadInput]) {
  input.addEventListener('input', updateFormDerived);
}

function openForm(workout) {
  editingId = workout ? workout.id : null;
  formError.textContent = '';
  byId('form-title').textContent = loggedIn ? (workout ? 'Edit workout' : 'New workout') : 'Quick workout';
  byId('form-submit').textContent = loggedIn ? 'Save' : 'Start';
  byId('form-cancel').classList.toggle('hidden', !loggedIn);

  const nameInput = byId('w-name');
  nameInput.required = loggedIn;
  nameInput.placeholder = loggedIn ? '' : 'Workout';
  nameInput.value = workout ? workout.name : '';
  intervalInput.value = String(workout ? workout.interval_sec : 60);
  roundsInput.value = String(workout ? workout.total_duration_sec / workout.interval_sec : 10);
  leadInput.value = String(workout ? workout.warning_lead_sec : 10);

  updateFormDerived();
  showView('form');
}

workoutForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.textContent = '';

  const interval = Number(intervalInput.value);
  const payload = {
    name: byId('w-name').value.trim(),
    interval_sec: interval,
    warning_lead_sec: Number(leadInput.value),
    total_duration_sec: interval * Number(roundsInput.value)
  };

  if (!loggedIn) {
    if (payload.name.length === 0) {
      payload.name = 'Workout';
    }

    openRunner(payload);

    return;
  }

  try {
    if (editingId) {
      await api.updateWorkout(editingId, payload);
    } else {
      await api.createWorkout(payload);
    }

    await renderList();
    showView('list');
  } catch (error) {
    formError.textContent = error.message;
  }
});

byId('form-cancel').addEventListener('click', () => showView('list'));

// ---- Runner ----

let timer = null;
const startBtn = byId('run-start');

function openRunner(workout) {
  stopTimer();
  byId('run-name').textContent = workout.name;
  byId('run-time').textContent = formatClock(workout.interval_sec);
  byId('run-rounds').textContent = `Round 1 / ${workout.total_duration_sec / workout.interval_sec}`;
  byId('run-total').textContent = `Total ${formatClock(workout.total_duration_sec)}`;
  startBtn.textContent = 'Start';
  startBtn.dataset.state = 'idle';
  startBtn.dataset.workout = JSON.stringify(workout);
  showView('runner');
}

function onRunUpdate(state) {
  byId('run-time').textContent = formatClock(state.remainingInterval);
  byId('run-rounds').textContent = `Round ${state.currentInterval} / ${timer.intervals}`;
  byId('run-total').textContent = `Total remaining ${formatClock(state.remainingTotal)}`;
}

function onRunFinish() {
  startBtn.textContent = 'Done';
  startBtn.dataset.state = 'done';
  byId('run-rounds').textContent = 'Finished';

  if (!loggedIn) {
    byId('signup-modal').classList.remove('hidden');
  }
}

byId('modal-dismiss').addEventListener('click', () => {
  byId('signup-modal').classList.add('hidden');
});

byId('modal-signup').addEventListener('click', () => {
  byId('signup-modal').classList.add('hidden');
  stopTimer();
  showView('auth');
});

startBtn.addEventListener('click', () => {
  const state = startBtn.dataset.state;

  if (state === 'idle' || state === 'done') {
    const workout = JSON.parse(startBtn.dataset.workout);
    timer = new EmomTimer(workout, onRunUpdate, onRunFinish);
    timer.start();
    startBtn.textContent = 'Pause';
    startBtn.dataset.state = 'running';
  } else if (state === 'running') {
    timer.pause();
    startBtn.textContent = 'Resume';
    startBtn.dataset.state = 'paused';
  } else if (state === 'paused') {
    timer.resume();
    startBtn.textContent = 'Pause';
    startBtn.dataset.state = 'running';
  }
});

byId('run-reset').addEventListener('click', () => {
  const workout = JSON.parse(startBtn.dataset.workout);
  openRunner(workout);
});

byId('run-back').addEventListener('click', () => {
  stopTimer();

  if (loggedIn) {
    showView('list');
  } else {
    showView('form');
  }
});

function stopTimer() {
  if (timer != null) {
    timer.stop();
    timer = null;
  }
}

// ---- Bootstrap ----

async function enterApp() {
  loggedIn = true;
  applyChrome();
  await renderList();
  showView('list');
}

function showGuestHome() {
  loggedIn = false;
  applyChrome();
  openForm(null);
}

async function boot() {
  try {
    await api.me();
    await enterApp();
  } catch {
    showGuestHome();
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

boot();
