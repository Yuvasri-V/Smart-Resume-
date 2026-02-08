// Util helpers
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const toast = (msg) => {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
};

// header year (not visible in this layout, but keep)
document.addEventListener('DOMContentLoaded', () => {
  // Auth modal wiring
  initAuth();
  wireDrop('match-drop', 'match-file', () => previewFile($('#match-file'), 'resume-preview'));
  wireDrop('ats-drop', 'ats-file', () => previewFile($('#ats-file'), 'resume-preview-ats'));
  initHandlers();
});

// ---------------- AUTH ----------------
function getUsers() { return JSON.parse(localStorage.getItem('users') || '[]'); }
function saveUsers(users) { localStorage.setItem('users', JSON.stringify(users)); }
function getCurrentUser() { return JSON.parse(localStorage.getItem('currentUser') || 'null'); }
function setCurrentUser(user) { localStorage.setItem('currentUser', JSON.stringify(user)); }
function removeCurrentUser() { localStorage.removeItem('currentUser'); }

function initAuth() {
  const authModal = $('#auth-modal');
  $('#btn-auth').addEventListener('click', () => openModal(authModal));
  $$('.tab').forEach(tab => tab.addEventListener('click', onTabClick));
  $$('.modal-close, .modal-backdrop').forEach(el => el.addEventListener('click', () => closeModal(authModal)));
  updateAuthUI();

  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = $('#login-email').value.trim();
    const pwd = $('#login-password').value.trim();
    if (!email || !pwd) { toast('Please fill in all fields'); return; }
    const users = getUsers();
    const found = users.find(u => u.email === email && u.password === pwd);
    if (found) { setCurrentUser(found); closeModal(authModal); updateAuthUI(); toast('Logged in'); }
    else toast('Invalid email/password. Please sign up.');
  });

  $('#signup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#signup-name').value.trim();
    const email = $('#signup-email').value.trim();
    const pwd = $('#signup-password').value.trim();
    if (!name || !email || !pwd) { toast('Please fill in all fields'); return; }
    let users = getUsers();
    if (users.some(u => u.email === email)) { toast('Account exists — please login'); return; }
    const newUser = { name, email, password: pwd };
    users.push(newUser); saveUsers(users);
    setCurrentUser(newUser); closeModal($('#auth-modal')); updateAuthUI(); toast('Account created');
  });
}

function updateAuthUI() {
  const user = getCurrentUser();
  const btn = $('#btn-auth');
  if (user) {
    btn.textContent = `Logout (${user.name || user.email})`;
    btn.onclick = () => { removeCurrentUser(); updateAuthUI(); toast('Logged out'); };
  } else {
    btn.textContent = 'Login / Sign up';
    btn.onclick = () => openModal($('#auth-modal'));
  }
}

function onTabClick(e) {
  const tab = e.currentTarget;
  $$('.tab').forEach(t => t.classList.remove('active'));
  $$('.tab-panel').forEach(p => p.classList.remove('active'));
  tab.classList.add('active');
  const target = '#panel-' + tab.dataset.tab;
  const panel = document.querySelector(target);
  if (panel) panel.classList.add('active');
}

function openModal(m) { m.classList.add('active'); m.setAttribute('open',''); m.setAttribute('aria-hidden','false'); }
function closeModal(m) { m.classList.remove('active'); m.removeAttribute('open'); m.setAttribute('aria-hidden','true'); }

// ---------------- File preview & drag/drop ----------------
function previewFile(input, iframeId) {
  const file = input.files[0];
  if (!file) return null;
  const url = URL.createObjectURL(file);
  const iframe = document.getElementById(iframeId);
  iframe.src = url;
  return { file, url };
}
function wireDrop(labelId, inputId, onChange) {
  const label = document.getElementById(labelId);
  const input = document.getElementById(inputId);
  if (!label || !input) return;
  label.addEventListener('dragover', e => { e.preventDefault(); label.style.borderColor = 'rgba(122,168,255,.6)'; });
  label.addEventListener('dragleave', () => { label.style.borderColor = ''; });
  label.addEventListener('drop', e => {
    e.preventDefault();
    label.style.borderColor = '';
    if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; onChange(); }
  });
  input.addEventListener('change', onChange);
}

// ---------------- Helpers ----------------
function renderPills(containerId, items) {
  const ul = document.getElementById(containerId);
  if (!ul) return;
  ul.innerHTML = '';
  (items || []).forEach(s => {
    const li = document.createElement('li');
    li.textContent = s;
    ul.appendChild(li);
  });
}
function setScore(scoreElId, barId, value) {
  const el = document.getElementById(scoreElId);
  const bar = document.getElementById(barId);
  const v = Math.max(0, Math.min(100, Math.round(value || 0)));
  if (el) el.textContent = v + '%';
  if (bar) bar.style.width = v + '%';
}

// ---------------- Main handlers ----------------
function initHandlers() {
  $('#btn-analyze-match').addEventListener('click', analyzeMatchHandler);
  $('#btn-clear-match').addEventListener('click', clearMatchHandler);
  $('#open-resume').addEventListener('click', () => {
    const iframe = $('#resume-preview'); if (!iframe.src) { toast('No resume loaded'); return; } window.open(iframe.src, '_blank');
  });

  $('#btn-analyze-ats').addEventListener('click', analyzeAtsHandler);
  $('#btn-clear-ats').addEventListener('click', clearAtsHandler);
  $('#open-resume-ats').addEventListener('click', () => {
    const iframe = $('#resume-preview-ats'); if (!iframe.src) { toast('No resume loaded'); return; } window.open(iframe.src, '_blank');
  });
}

// analyze match -> call backend
async function analyzeMatchHandler() {
  const resumeInput = $('#match-file');
  const title = $('#job-title').value.trim();
  const jd = $('#job-desc').value.trim();
  if (!resumeInput.files.length) { toast('Upload a resume'); return; }
  if (!jd && !title) { toast('Provide either Job Title or Job Description'); return; }

  // Fill required skills preview (local detection from JD/title)
  if (jd) {
    const detected = extractSkillsFromText(jd);
    renderPills('required-skills', detected);
  } else {
    renderPills('required-skills', []);
  }

  const form = new FormData();
  form.append('resume', resumeInput.files[0]);
  if (jd) form.append('jd_text', jd);
  if (title) form.append('job_title', title);

  try {
    const resp = await fetch('http://127.0.0.1:8000/analyze-resume-vs-job/', {
      method: 'POST',
      body: form
    });
    const data = await resp.json();
    if (!resp.ok) {
      const err = data.error || 'Server returned an error';
      toast(err);
      return;
    }

    // Match & ATS scores
    setScore('match-score', 'match-progress', data.match_score || 0);
    setScore('ats-score', 'ats-progress', data.ats_score || 0);

    // Matched skills shown as pills
    renderPills('required-skills', data.matched_skills || []);

    // Suggestions panel
    const suggestions = $('#match-suggestions');
    suggestions.innerHTML = '';

    // Missing skills + resources
    const missing = data.missing_with_resources || [];
    const mDiv = document.createElement('div');
    const h = document.createElement('h5'); h.textContent = 'Missing Skills & Free Resources'; h.style.marginTop = '6px';
    mDiv.appendChild(h);
    if (missing.length === 0) {
      const p = document.createElement('p'); p.textContent = 'None — great! 🎉';
      mDiv.appendChild(p);
    } else {
      const ul = document.createElement('ul');
      missing.forEach(item => {
        // item may be object {skill, resource} or key->value depending backend
        let skill, resource;
        if (typeof item === 'object') { skill = item.skill || item.name || '?'; resource = item.resource || item.link || '#'; }
        else { skill = item; resource = `https://www.google.com/search?q=${encodeURIComponent(skill + ' course')}`; }
        const li = document.createElement('li');
        const a = document.createElement('a'); a.href = resource; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = 'Free course';
        li.innerHTML = `<strong>${skill}</strong> — `;
        li.appendChild(a);
        ul.appendChild(li);
      });
      mDiv.appendChild(ul);
    }
    suggestions.appendChild(mDiv);

    // Eligibility check if only job title was supplied
    if (title && !jd) {
      const eligDiv = document.createElement('div');
      const eh = document.createElement('h5'); eh.textContent = 'Eligibility Check'; eligDiv.appendChild(eh);
      if (missing.length === 0) {
        const p = document.createElement('p'); p.innerHTML = `✅ You appear <strong>eligible</strong> for <em>${title}</em>.`;
        eligDiv.appendChild(p);
      } else {
        const p = document.createElement('p'); p.innerHTML = `❌ You are <strong>not eligible</strong> yet for <em>${title}</em>. Complete the missing skills above.`;
        eligDiv.appendChild(p);
      }
      suggestions.appendChild(eligDiv);
    }

    // Suggested job from backend (single)
    if (data.suggested_job) {
      const jobDiv = document.createElement('div');
      jobDiv.style.marginTop = '10px';
      const jh = document.createElement('h5'); jh.textContent = 'Suggested Job';
      jobDiv.appendChild(jh);
      const p = document.createElement('p'); p.innerHTML = `You should consider applying for: <strong>${data.suggested_job}</strong>`;
      jobDiv.appendChild(p);
      suggestions.appendChild(jobDiv);
    }

    toast('Analysis complete');
  } catch (err) {
    console.error(err);
    toast('Failed to connect to backend. Make sure FastAPI server is running.');
  }
}

// clear match form
function clearMatchHandler() {
  $('#match-file').value = '';
  $('#job-title').value = '';
  $('#job-desc').value = '';
  $('#resume-preview').src = '';
  renderPills('required-skills', []);
  $('#match-suggestions').innerHTML = '';
  setScore('match-score', 'match-progress', 0);
  setScore('ats-score', 'ats-progress', 0);
}

// ---------------- ATS handlers (local heuristics) ----------------
function analyzeAtsHandler() {
  const resumeInput = $('#ats-file');
  if (!resumeInput.files.length) { toast('Upload a resume'); return; }
  const name = resumeInput.files[0].name.toLowerCase();
  let score = 70;
  if (name.includes('pdf')) score -= 10;
  if (name.includes('docx')) score += 5;
  setScore('ats-score', 'ats-progress', score);

  const issues = [
    { t: 'Use standard section headings (Experience, Education, Skills)', s: 'Helps ATS parsing' },
    { t: 'Avoid images, text boxes and tables', s: 'ATS can skip non-text elements' },
    { t: 'Use single-column layout', s: 'Improves parser accuracy' },
    { t: 'Include role-specific keywords', s: 'Match JD wording' }
  ];
  const list = $('#ats-issues'); list.innerHTML = '';
  issues.forEach(it => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${it.t}</strong><div style="color:var(--muted)">${it.s}</div>`;
    list.appendChild(li);
  });

  const sug = $('#ats-suggestions'); sug.innerHTML = '';
  const p = document.createElement('p'); p.textContent = 'Tip: Use common fonts (Arial/Calibri), 10–12pt, and avoid headers/footers for contact info.';
  sug.appendChild(p);
  toast('ATS check complete');
}

function clearAtsHandler() {
  $('#ats-file').value = '';
  $('#resume-preview-ats').src = '';
  $('#ats-issues').innerHTML = '';
  $('#ats-suggestions').innerHTML = '';
  setScore('ats-score', 'ats-progress', 0);
}

// ---------------- Simple local JD skill extractor for UI preview ----------------
function extractSkillsFromText(text) {
  const common = ['JavaScript','TypeScript','React','Angular','Vue','HTML','CSS','Tailwind','Node.js','Express','Python','Django','Flask','Java','Spring','C++','C#','SQL','MongoDB','PostgreSQL','AWS','Azure','GCP','Docker','Kubernetes','Git','CI/CD','REST','GraphQL','Microservices','Testing','Jest','Cypress','Tableau','Power BI','Machine Learning','NLP','R','Excel','Agile','Scrum'];
  const t = (text || '').toLowerCase();
  return common.filter(s => t.includes(s.toLowerCase()));
}
