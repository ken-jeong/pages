const THREAD_COLORS = ['#378ADD', '#7F77DD', '#D85A30', '#1D9E75', '#BA7517', '#C94040', '#3E9E9E'];

function colorFor(id, colors = THREAD_COLORS) {
  return colors[(id - 1) % colors.length];
}

function setStatus(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = 'status' + (type ? ' ' + type : '');
}

function makeBadge(id, className = 'person-badge') {
  const badge = document.createElement('div');
  badge.className = className;
  badge.style.background = colorFor(id);
  badge.textContent = 'T' + id;
  return badge;
}

function renderQueue(elId, ids, done = false, empty = '(비어 있음)') {
  const queue = document.getElementById(elId);
  queue.replaceChildren(...ids.map(id => makeBadge(id, 'person-pill' + (done ? ' done' : ''))));
  if (!ids.length) {
    const label = document.createElement('span');
    label.className = 'queue-empty';
    label.textContent = empty;
    queue.appendChild(label);
  }
}

function createRecursiveLock(prefix, messages) {
  let holder = null, depth = 0, queue = [], next = 1;
  const status = (msg, type = '') => setStatus(prefix + '-status', msg, type);

  function render() {
    const resource = document.getElementById(prefix + '-resource');
    resource.querySelectorAll('.person-badge, .badge-count').forEach(el => el.remove());
    resource.classList.toggle('occupied-r', holder !== null);
    if (holder !== null) {
      resource.appendChild(makeBadge(holder));
      if (depth > 1) {
        const count = document.createElement('div');
        count.className = 'badge-count';
        count.textContent = 'depth ' + depth;
        resource.appendChild(count);
      }
    }
    document.getElementById(prefix + '-counter').textContent = messages.counter(holder, depth);
    renderQueue(prefix + '-queue', queue);
  }

  render();
  return {
    enter() {
      const id = next++;
      if (holder === null) {
        holder = id; depth = 1;
        status(messages.enter(id), 'ok');
      } else {
        queue.push(id);
        status(messages.queued(id, holder), 'warn');
      }
      render();
    },
    reenter() {
      if (holder === null) { status(messages.noReenter); return; }
      depth++;
      status(messages.reenter(holder, depth), 'ok');
      render();
    },
    leave() {
      if (holder === null) { status(messages.noOwner); return; }
      const prev = holder;
      if (depth > 1) {
        depth--;
        status(messages.partial(prev, depth), 'ok');
      } else {
        holder = queue.shift() ?? null;
        depth = holder === null ? 0 : 1;
        status(holder === null ? messages.free(prev) : messages.transfer(prev, holder), 'ok');
      }
      render();
    },
    reset() {
      holder = null; depth = 0; queue = []; next = 1;
      status(messages.initial);
      render();
    }
  };
}
