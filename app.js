import Deck from './deck.js';

const $ = selector => document.querySelector(selector);
const toasts = new Deck();

const people = ['Aarav', 'Meera', 'Kabir', 'Sara', 'Ishaan'];
const pick = list => list[Math.floor(Math.random() * list.length)];

const demos = {
  saved: () => toasts.success('Changes saved', { message: 'Your profile is up to date.' }),
  failed: () => toasts.error('Upload failed', {
    message: 'report.pdf is larger than 10 MB.',
    action: { label: 'Retry', onClick: () => demos.promise() },
  }),
  message: () => toasts.info(`${pick(people)} sent you a message`, {
    message: 'Can we move the review to Friday?',
    action: { label: 'Reply', onClick: () => toasts.success('Reply sent') },
  }),
  promise: () => toasts.promise(
    new Promise((resolve, reject) => setTimeout(() => (Math.random() > 0.25 ? resolve(12) : reject()), 1800)),
    { loading: 'Publishing post…', success: n => `Published to ${n} followers' feeds`, error: 'Publishing failed, try again' },
  ),
  burst: () => ['Build started', 'Tests passed', 'Preview deployed', 'Link copied', 'Build finished'].forEach((title, i) => {
    setTimeout(() => toasts.show({ title, tone: i === 4 ? 'success' : 'info' }), i * 220);
  }),
  clear: () => toasts.clear(),
};

document.querySelectorAll('[data-demo]').forEach(button => {
  button.addEventListener('click', () => demos[button.dataset.demo]());
});

$('#position').addEventListener('change', event => toasts.configure({ position: event.target.value }));
$('#max').addEventListener('input', event => {
  $('#max-out').textContent = event.target.value;
  toasts.configure({ max: Number(event.target.value) });
});
$('#duration').addEventListener('input', event => {
  $('#duration-out').textContent = `${(event.target.value / 1000).toFixed(1)} s`;
  toasts.configure({ duration: Number(event.target.value) });
});

// A first toast so the stack is visible on arrival.
setTimeout(() => toasts.info('Welcome to Deck', { message: 'Hover me, or swipe me away.', duration: 8000 }), 600);
