const form = document.getElementById('form');
const errorEl = document.getElementById('error');
const heading = document.getElementById('heading');
const subheading = document.getElementById('subheading');
const submitBtn = document.getElementById('submitBtn');
const passwordLabel = document.getElementById('passwordLabel');

let needsSetup = false;

async function init() {
  const res = await fetch('/api/setup-status');
  const data = await res.json();
  needsSetup = data.needsSetup;
  if (needsSetup) {
    heading.textContent = 'Create admin password';
    subheading.textContent = 'First run - set a password to protect this app';
    passwordLabel.textContent = 'New password (min 8 characters)';
    submitBtn.textContent = 'Create password & sign in';
  }
  if (data.needsCode) {
    document.getElementById('codeRow').hidden = false;
    document.getElementById('code').required = true;
  }
}
init();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  const password = document.getElementById('password').value;
  const endpoint = needsSetup ? '/api/setup' : '/api/login';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(needsSetup ? { password, code: document.getElementById('code').value } : { password }),
    });
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || 'Something went wrong';
      return;
    }
    window.location.href = '/';
  } catch (err) {
    errorEl.textContent = 'Network error: ' + err.message;
  }
});
