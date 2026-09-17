/*!
 * Deck — a toast stack. MIT © 2026 Yagnik Barasiya
 * https://github.com/YagnikBarasiya23/deck-toast-stack
 */

/**
 * Where each toast sits. `heights` is newest first. Collapsed, older toasts
 * tuck behind the newest one, scaled down and peeking out; expanded, they fan
 * into a list. `direction` is -1 when the stack grows upwards (bottom corners)
 * and 1 when it grows downwards (top corners).
 */
export function stackLayout(heights, { expanded = false, gap = 12, peek = 12, max = 3, direction = -1 } = {}) {
  let offset = 0;
  return heights.map((height, i) => {
    let y;
    let scale = 1;
    if (expanded) {
      y = offset;
      offset += height + gap;
    } else {
      // Behind toasts line up their far edge with the front toast's, then peek past it.
      y = i * peek + (i ? heights[0] - height : 0);
      scale = 1 - Math.min(i, max) * 0.05;
    }
    const hidden = i >= max && !expanded;
    return { y: y * direction, scale, opacity: hidden ? 0 : 1, hidden };
  });
}

/** Whether a released swipe should dismiss: far enough, or flicked fast enough. */
export function swipeOutcome(dx, velocity, width, { distance = 0.4, speed = 0.45 } = {}) {
  if (Math.abs(dx) > width * distance) return Math.sign(dx);
  if (Math.abs(velocity) > speed && Math.sign(velocity) === Math.sign(dx)) return Math.sign(velocity);
  return 0;
}

/** Total height the stack occupies, used to keep the hover area continuous. */
export const stackExtent = (heights, options) => {
  const layout = stackLayout(heights, options);
  return heights.reduce((max, h, i) => (layout[i].hidden ? max : Math.max(max, Math.abs(layout[i].y) + h)), 0);
};

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const ICONS = {
  success: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  error: '<path d="M12 7v6m0 4h.01"/><circle cx="12" cy="12" r="9"/>',
  info: '<path d="M12 11v6m0-10h.01"/><circle cx="12" cy="12" r="9"/>',
  loading: '<path d="M12 3a9 9 0 1 0 9 9"/>',
};

let uid = 0;

export default class Deck {
  constructor({ position = 'bottom-right', max = 3, duration = 5000, gap = 12, stiffness = 260, damping = 26, label = 'Notifications', hotkey = 'Alt+T' } = {}) {
    this.options = { position, max, duration, gap, stiffness, damping, hotkey };
    this.toasts = [];
    this.expanded = false;
    this.frame = 0;

    this.region = document.createElement('section');
    this.region.className = 'deck';
    this.region.setAttribute('aria-label', `${label} (${hotkey})`);
    this.region.tabIndex = -1;
    this.list = document.createElement('ol');
    this.list.className = 'deck-list';
    this.region.append(this.list);
    document.body.append(this.region);
    this.setPosition(position);

    this.region.addEventListener('pointerenter', () => this.expand(true));
    this.region.addEventListener('pointerleave', () => this.expand(false));
    this.region.addEventListener('focusin', () => this.expand(true));
    this.region.addEventListener('focusout', event => { if (!this.region.contains(event.relatedTarget)) this.expand(false); });
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Shows a toast and returns its id. */
  show({ title = '', message = '', tone = 'info', action, duration = this.options.duration } = {}) {
    const id = `deck-${++uid}`;
    const el = document.createElement('li');
    el.className = 'deck-toast';
    el.id = id;
    el.innerHTML = `
      <span class="deck-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></svg></span>
      <div class="deck-body"><p class="deck-title"></p><p class="deck-message"></p></div>
      <div class="deck-actions"></div>
      <button type="button" class="deck-close" aria-label="Dismiss notification"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <span class="deck-timer" aria-hidden="true"></span>`;
    const toast = { id, el, y: 0, vy: 0, ty: 0, x: 0, vx: 0, tx: 0, s: 0.9, vs: 0, ts: 1, height: 0, remaining: 0, started: 0, leaving: false };
    el.querySelector('.deck-close').addEventListener('click', () => this.dismiss(id));
    this.bindSwipe(toast);

    this.toasts.unshift(toast);
    this.list.prepend(el);
    this.fill(toast, { title, message, tone, action, duration });

    // Enter from just beyond the stack edge.
    const direction = this.direction();
    toast.y = -direction * 24;
    el.style.opacity = '0';
    this.measure();
    this.settle(!reduced());
    requestAnimationFrame(() => { el.style.opacity = ''; });
    this.region.dispatchEvent(new CustomEvent('deck:show', { detail: { id } }));
    return id;
  }

  success(title, options) { return this.show({ ...options, title, tone: 'success' }); }
  error(title, options) { return this.show({ ...options, title, tone: 'error' }); }
  info(title, options) { return this.show({ ...options, title, tone: 'info' }); }

  /** Replaces a toast's content in place; the stack re-measures and springs. */
  update(id, options) {
    const toast = this.toasts.find(t => t.id === id);
    if (!toast || toast.leaving) return;
    this.fill(toast, options);
    this.measure();
    this.settle(!reduced());
  }

  /** A loading toast that turns into success or error when the promise settles. */
  promise(promise, { loading = 'Working…', success = 'Done', error = 'Something went wrong' } = {}) {
    const id = this.show({ title: loading, tone: 'loading', duration: Infinity });
    const text = (value, arg) => (typeof value === 'function' ? value(arg) : value);
    promise.then(
      value => this.update(id, { title: text(success, value), tone: 'success', duration: this.options.duration }),
      reason => this.update(id, { title: text(error, reason), tone: 'error', duration: this.options.duration }),
    );
    return promise;
  }

  dismiss(id, direction = 0) {
    const toast = this.toasts.find(t => t.id === id);
    if (!toast || toast.leaving) return;
    toast.leaving = true;
    // A dismissed toast keeps its focus inside the region rather than dropping it to the page.
    const hadFocus = toast.el.contains(document.activeElement);
    this.toasts = this.toasts.filter(t => t !== toast);
    const width = toast.el.getBoundingClientRect().width;
    toast.tx = direction ? direction * (width + 48) : 0;
    toast.ts = direction ? toast.ts : 0.9;
    toast.el.classList.add('is-leaving');
    toast.el.style.opacity = '0';
    const remove = () => {
      toast.el.remove();
      this.region.dispatchEvent(new CustomEvent('deck:dismiss', { detail: { id } }));
    };
    if (reduced()) remove();
    else setTimeout(remove, 320);
    if (hadFocus) (this.toasts[0]?.el.querySelector('button') ?? this.region).focus();
    if (!this.toasts.length) this.expand(false);
    this.measure();
    this.settle(!reduced(), toast);
  }

  clear() {
    [...this.toasts].forEach(t => this.dismiss(t.id));
  }

  setPosition(position) {
    this.options.position = position;
    this.region.dataset.position = position;
    this.measure();
    this.settle(false);
  }

  configure(options) {
    Object.assign(this.options, options);
    if (options.position) this.setPosition(options.position);
    this.measure();
    this.settle(!reduced());
    return this;
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.region.remove();
  }

  direction() {
    return this.options.position.startsWith('top') ? 1 : -1;
  }

  fill(toast, { title, message, tone, action, duration }) {
    const { el } = toast;
    if (tone) {
      el.dataset.tone = tone;
      el.querySelector('.deck-icon svg').innerHTML = ICONS[tone] ?? ICONS.info;
      // Errors interrupt; everything else waits its turn.
      el.setAttribute('role', tone === 'error' ? 'alert' : 'status');
      el.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');
    }
    if (title !== undefined) el.querySelector('.deck-title').textContent = title;
    if (message !== undefined) el.querySelector('.deck-message').textContent = message;
    el.querySelector('.deck-message').hidden = !el.querySelector('.deck-message').textContent;
    if (action !== undefined) {
      const box = el.querySelector('.deck-actions');
      box.replaceChildren();
      if (action) {
        const button = Object.assign(document.createElement('button'), { type: 'button', className: 'deck-action', textContent: action.label });
        button.addEventListener('click', () => {
          action.onClick?.();
          if (action.dismiss !== false) this.dismiss(toast.id);
        });
        box.append(button);
      }
    }
    if (duration !== undefined) this.startTimer(toast, duration);
  }

  startTimer(toast, duration) {
    toast.duration = duration;
    toast.remaining = duration;
    const timer = toast.el.querySelector('.deck-timer');
    timer.hidden = !Number.isFinite(duration);
    this.resumeTimer(toast);
  }

  resumeTimer(toast) {
    clearTimeout(toast.timeout);
    if (!Number.isFinite(toast.remaining) || this.expanded || document.hidden || toast.leaving) return;
    toast.started = performance.now();
    toast.timeout = setTimeout(() => this.dismiss(toast.id), toast.remaining);
    const timer = toast.el.querySelector('.deck-timer');
    const done = 1 - toast.remaining / toast.duration;
    timer.style.transition = 'none';
    timer.style.transform = `scaleX(${1 - done})`;
    requestAnimationFrame(() => {
      timer.style.transition = `transform ${toast.remaining}ms linear`;
      timer.style.transform = 'scaleX(0)';
    });
  }

  pauseTimer(toast) {
    clearTimeout(toast.timeout);
    if (!Number.isFinite(toast.remaining) || !toast.started) return;
    toast.remaining = Math.max(0, toast.remaining - (performance.now() - toast.started));
    toast.started = 0;
    const timer = toast.el.querySelector('.deck-timer');
    timer.style.transition = 'none';
    timer.style.transform = `scaleX(${toast.remaining / toast.duration})`;
  }

  expand(expanded) {
    if (expanded === this.expanded || (expanded && !this.toasts.length)) return;
    this.expanded = expanded;
    this.region.classList.toggle('is-expanded', expanded);
    this.toasts.forEach(t => (expanded ? this.pauseTimer(t) : this.resumeTimer(t)));
    this.settle(!reduced());
  }

  measure() {
    this.toasts.forEach(t => { t.height = t.el.offsetHeight; });
  }

  /** Sets every toast's target and animates (or jumps) there. */
  settle(animate, ...extra) {
    const { gap, max } = this.options;
    const layout = stackLayout(this.toasts.map(t => t.height), { expanded: this.expanded, gap, max, direction: this.direction() });
    this.toasts.forEach((toast, i) => {
      toast.ty = layout[i].y;
      toast.ts = layout[i].scale;
      toast.el.style.zIndex = String(this.toasts.length - i);
      toast.el.classList.toggle('is-behind', i > 0 && !this.expanded);
      toast.el.classList.toggle('is-hidden', layout[i].hidden);
      toast.el.inert = layout[i].hidden;
      if (!toast.dragging) toast.tx = 0;
    });
    // Keep the hover area continuous so moving between fanned toasts doesn't collapse them.
    this.region.style.height = `${stackExtent(this.toasts.map(t => t.height), { expanded: this.expanded, gap, max, direction: this.direction() })}px`;

    const moving = [...this.toasts, ...extra];
    if (!animate) {
      moving.forEach(t => { t.y = t.ty; t.x = t.tx; t.s = t.ts; t.vy = t.vx = t.vs = 0; this.paint(t); });
      return;
    }
    this.moving = new Set([...(this.moving ?? []), ...moving]);
    if (!this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  tick = now => {
    const dt = Math.min((now - this.last) / 1000, 1 / 30);
    this.last = now;
    const { stiffness, damping } = this.options;
    const step = (t, key, vkey, target) => {
      for (let i = 0; i < 4; i++) {
        const a = -stiffness * (t[key] - target) - damping * t[vkey];
        t[vkey] += a * (dt / 4);
        t[key] += t[vkey] * (dt / 4);
      }
      return Math.abs(t[key] - target) > 0.05 || Math.abs(t[vkey]) > 0.05;
    };
    for (const t of this.moving) {
      let busy = step(t, 'y', 'vy', t.ty);
      if (!t.dragging) busy = step(t, 'x', 'vx', t.tx) || busy;
      busy = step(t, 's', 'vs', t.ts) || busy;
      if (!busy) {
        t.y = t.ty; t.s = t.ts;
        if (!t.dragging) t.x = t.tx;
        this.moving.delete(t);
      }
      this.paint(t);
    }
    this.frame = this.moving.size ? requestAnimationFrame(this.tick) : 0;
  };

  paint(t) {
    t.el.style.transform = `translate3d(${t.x}px, ${t.y}px, 0) scale(${t.s})`;
  }

  bindSwipe(toast) {
    const { el } = toast;
    let startX = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    el.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button')) return;
      toast.dragging = true;
      startX = lastX = event.clientX - toast.x;
      lastT = event.timeStamp;
      velocity = 0;
      el.setPointerCapture(event.pointerId);
      el.classList.add('is-dragging');
    });
    el.addEventListener('pointermove', event => {
      if (!toast.dragging) return;
      const dt = Math.max(1, event.timeStamp - lastT);
      velocity = 0.8 * ((event.clientX - lastX) / dt) + 0.2 * velocity;
      lastX = event.clientX;
      lastT = event.timeStamp;
      const dx = event.clientX - startX;
      // Rubber-band when dragging inwards past the resting edge.
      const inward = (this.options.position.endsWith('left') ? 1 : -1) * dx > 0 && !this.options.position.includes('center');
      toast.x = inward ? dx * 0.35 : dx;
      el.style.opacity = String(1 - Math.min(0.6, Math.abs(toast.x) / el.offsetWidth));
      this.paint(toast);
    });
    const release = event => {
      if (!toast.dragging) return;
      toast.dragging = false;
      el.classList.remove('is-dragging');
      el.releasePointerCapture?.(event.pointerId);
      el.style.opacity = '';
      const out = swipeOutcome(toast.x, velocity, el.offsetWidth);
      if (out) {
        toast.vx = velocity * 1000;
        this.dismiss(toast.id, out);
      } else {
        toast.vx = velocity * 1000;
        this.settle(!reduced());
      }
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    // Pausing for hover is handled by the region; touch has no hover, so a press pauses too.
    el.addEventListener('pointerdown', () => this.toasts.forEach(t => this.pauseTimer(t)), { passive: true });
    el.addEventListener('pointerup', () => { if (!this.expanded) this.toasts.forEach(t => this.resumeTimer(t)); }, { passive: true });
  }

  onKey = event => {
    const [mod, key] = this.options.hotkey.split('+');
    const wants = { Alt: event.altKey, Ctrl: event.ctrlKey, Shift: event.shiftKey, Meta: event.metaKey }[mod];
    if (wants && event.code === `Key${key.toUpperCase()}` && this.toasts.length) {
      event.preventDefault();
      this.toasts[0].el.querySelector('button').focus();
      return;
    }
    if (event.key === 'Escape' && this.region.contains(document.activeElement)) {
      const toast = this.toasts.find(t => t.el.contains(document.activeElement));
      if (toast) this.dismiss(toast.id);
    }
  };

  onVisibility = () => {
    this.toasts.forEach(t => (document.hidden ? this.pauseTimer(t) : this.resumeTimer(t)));
  };
}
