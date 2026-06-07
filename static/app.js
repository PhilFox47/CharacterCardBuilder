/* ── State ───────────────────────────────────────────────── */
const state = {
  sessionId: null,
  cardType:  'single',
  apiKey:    localStorage.getItem('nano_api_key') || '',
  card:      null,
  loading:   false,
  activeTab: 'preview',
};

/* ── DOM refs ────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const setupOverlay   = $('setupOverlay');
const setupApiKey    = $('setupApiKey');
const apiKeyRow      = $('apiKeyRow');
const startBtn       = $('startBtn');
const chatPanel      = $('chatPanel');
const chatTopbar     = $('chatTopbar');
const chatMessages   = $('chatMessages');
const chatInputArea  = $('chatInputArea');
const chatStatus     = $('chatStatus');
const typeBadge      = $('typeBadge');
const messageInput   = $('messageInput');
const sendBtn        = $('sendBtn');
const generateBtn    = $('generateBtn');
const newBtn         = $('newBtn');
const settingsBtn    = $('settingsBtn');
const settingsDrawer = $('settingsDrawer');
const closeSettings  = $('closeSettingsBtn');
const settingsApiKey = $('settingsApiKey');
const settingsModel  = $('settingsModel');
const saveSettings   = $('saveSettingsBtn');
const loadingBar     = $('loadingBar');
const cardEmpty      = $('cardEmpty');
const cardName       = $('cardName');
const cardTabs       = $('cardTabs');
const downloadBtn    = $('downloadBtn');
const regenBtn       = $('regenBtn');
const regenModal     = $('regenModal');
const regenFeedback  = $('regenFeedback');
const regenCancel    = $('regenCancelBtn');
const regenConfirm   = $('regenConfirmBtn');
const toastCont      = $('toastContainer');

/* ── Init ────────────────────────────────────────────────── */
async function init() {
  // Check if server has a key configured
  try {
    const cfg = await apiFetch('/api/config', 'GET');
    if (cfg.has_server_key) {
      apiKeyRow.style.display = 'none'; // key is on server
    }
    settingsModel.value = cfg.model || 'xiaomi/mimo-v2.5-pro:thinking';
  } catch (_) {}

  // Restore saved key into setup field
  if (state.apiKey) {
    setupApiKey.value = state.apiKey;
    settingsApiKey.value = state.apiKey;
  }

  // Type selection
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.cardType = btn.dataset.type;
    });
  });

  startBtn.addEventListener('click', startSession);
  sendBtn.addEventListener('click', sendMessage);
  generateBtn.addEventListener('click', generateCard);
  newBtn.addEventListener('click', resetToSetup);
  settingsBtn.addEventListener('click', () => settingsDrawer.classList.add('open'));
  closeSettings.addEventListener('click', () => settingsDrawer.classList.remove('open'));
  saveSettings.addEventListener('click', saveSettingsHandler);
  downloadBtn.addEventListener('click', downloadCard);
  regenBtn.addEventListener('click', () => { regenFeedback.value = ''; regenModal.style.display = 'flex'; });
  regenCancel.addEventListener('click', () => regenModal.style.display = 'none');
  regenConfirm.addEventListener('click', regenerateCard);

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Textarea auto-resize + enter to send
  messageInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
  });
}

/* ── API helpers ─────────────────────────────────────────── */
async function apiFetch(path, method = 'POST', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(path, opts);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || `HTTP ${resp.status}`);
  }
  return resp.json();
}

function getApiKey() {
  return setupApiKey.value.trim() || settingsApiKey.value.trim() || state.apiKey || undefined;
}

/* ── Loading ─────────────────────────────────────────────── */
function setLoading(on) {
  state.loading = on;
  loadingBar.style.display = on ? 'block' : 'none';
  sendBtn.disabled = on;
  generateBtn.disabled = on;
  startBtn.disabled = on;
}

/* ── Toast ───────────────────────────────────────────────── */
function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  toastCont.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

/* ── Message rendering ───────────────────────────────────── */
function renderMarkdown(text) {
  // Basic formatting: **bold**, *italic*, `code`
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

function addMessage(role, text, id = null) {
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;
  if (id) wrap.id = id;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'assistant' ? '⚔' : '👤';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = renderMarkdown(text);

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return bubble;
}

function addTypingIndicator() {
  const wrap = document.createElement('div');
  wrap.className = 'message assistant';
  wrap.id = 'typingIndicator';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = '⚔';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
  const t = $('typingIndicator');
  if (t) t.remove();
}

/* ── Session management ──────────────────────────────────── */
async function startSession() {
  const apiKey = getApiKey();

  // Save key for later
  if (apiKey) {
    state.apiKey = apiKey;
    localStorage.setItem('nano_api_key', apiKey);
    settingsApiKey.value = apiKey;
  }

  setLoading(true);
  try {
    const res = await apiFetch('/api/start', 'POST', {
      card_type: state.cardType,
      api_key: apiKey || null,
    });

    state.sessionId = res.session_id;

    // Hide setup, show chat
    setupOverlay.style.display = 'none';
    chatTopbar.style.display = 'flex';
    chatInputArea.style.display = 'block';
    newBtn.style.display = 'inline-flex';

    const labels = { single: 'Single Character', group: 'Group', scenario: 'Scenario' };
    typeBadge.textContent = labels[state.cardType] || state.cardType;

    chatMessages.innerHTML = '';
    addMessage('assistant', res.message);
    messageInput.focus();

  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
  } finally {
    setLoading(false);
  }
}

function resetToSetup() {
  state.sessionId = null;
  state.card = null;
  chatMessages.innerHTML = '';
  setupOverlay.style.display = 'flex';
  chatTopbar.style.display = 'none';
  chatInputArea.style.display = 'none';
  newBtn.style.display = 'none';
  cardName.textContent = 'Card Preview';
  cardTabs.style.display = 'none';
  downloadBtn.style.display = 'none';
  regenBtn.style.display = 'none';
  cardEmpty.style.display = 'flex';
  ['tabPreview', 'tabGreetings', 'tabJson'].forEach(id => $(`${id}`).style.display = 'none');
  chatStatus.textContent = 'Gathering details…';
}

/* ── Chat ────────────────────────────────────────────────── */
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || state.loading || !state.sessionId) return;

  messageInput.value = '';
  messageInput.style.height = 'auto';
  addMessage('user', text);
  addTypingIndicator();
  setLoading(true);

  try {
    const res = await apiFetch('/api/chat', 'POST', {
      session_id: state.sessionId,
      message: text,
      api_key: getApiKey() || null,
    });

    removeTypingIndicator();
    addMessage('assistant', res.message);

    // If AI signals readiness, update status
    if (res.message.includes('Generate Card') || res.message.includes('generate your')) {
      chatStatus.textContent = 'Ready to generate!';
    }

  } catch (err) {
    removeTypingIndicator();
    toast(`Error: ${err.message}`, 'error');
  } finally {
    setLoading(false);
    messageInput.focus();
  }
}

/* ── Card generation ─────────────────────────────────────── */
async function generateCard() {
  if (!state.sessionId || state.loading) return;

  addMessage('assistant', '✨ Generating your character card — this uses a thinking model and typically takes 1–3 minutes. Please wait…');
  chatStatus.textContent = 'Generating card…';
  setLoading(true);
  addTypingIndicator();

  // Show elapsed time so the user knows it hasn't frozen
  const startTime = Date.now();
  const timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    chatStatus.textContent = `Generating… ${elapsed}s`;
  }, 1000);

  try {
    const res = await apiFetch('/api/generate', 'POST', {
      session_id: state.sessionId,
      api_key: getApiKey() || null,
    });

    clearInterval(timerInterval);
    removeTypingIndicator();
    state.card = res.card;
    renderCard(res.card);
    addMessage('assistant', '✅ Your character card is ready! You can preview it in the panel or download the JSON to import into SillyTavern.');
    chatStatus.textContent = 'Card generated!';
    toast('Card generated successfully!', 'success');

  } catch (err) {
    clearInterval(timerInterval);
    removeTypingIndicator();
    addMessage('assistant', `⚠ Generation error: ${err.message}\n\nPlease try again — thinking models occasionally time out on large requests.`);
    toast(`Generation failed: ${err.message}`, 'error');
    chatStatus.textContent = 'Ready to generate!';
  } finally {
    setLoading(false);
  }
}

async function regenerateCard() {
  regenModal.style.display = 'none';
  if (!state.sessionId || state.loading) return;

  const feedback = regenFeedback.value.trim();
  chatStatus.textContent = 'Regenerating…';
  setLoading(true);
  addTypingIndicator();

  const startTime = Date.now();
  const timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    chatStatus.textContent = `Regenerating… ${elapsed}s`;
  }, 1000);

  try {
    const res = await apiFetch('/api/regenerate', 'POST', {
      session_id: state.sessionId,
      feedback: feedback || null,
      api_key: getApiKey() || null,
    });

    clearInterval(timerInterval);
    removeTypingIndicator();
    state.card = res.card;
    renderCard(res.card);
    addMessage('assistant', '✅ Card regenerated! Check the preview panel.');
    chatStatus.textContent = 'Card generated!';
    toast('Card regenerated!', 'success');

  } catch (err) {
    clearInterval(timerInterval);
    removeTypingIndicator();
    toast(`Regeneration failed: ${err.message}`, 'error');
    chatStatus.textContent = 'Card generated!';
  } finally {
    setLoading(false);
  }
}

/* ── Card rendering ──────────────────────────────────────── */
function renderCard(card) {
  const data = card.data || {};
  const name = data.name || card.name || 'Character';

  cardEmpty.style.display = 'none';
  cardName.textContent = name;
  cardTabs.style.display = 'flex';
  downloadBtn.style.display = 'inline-flex';
  regenBtn.style.display = 'inline-flex';

  // Preview tab
  $('pvDescription').textContent = data.description || '';
  $('pvScenario').textContent    = data.scenario || '';
  $('pvFirstMes').textContent    = data.first_mes || '';
  $('pvCreatorNotes').textContent = data.creator_notes || '';

  const tagsEl = $('pvTags');
  tagsEl.innerHTML = '';
  (data.tags || []).forEach(tag => {
    const t = document.createElement('span');
    t.className = 'preview-tag';
    t.textContent = tag;
    tagsEl.appendChild(t);
  });

  // Greetings tab
  $('gFirstMes').textContent = data.first_mes || '';
  const altList = $('altGreetingsList');
  altList.innerHTML = '';
  (data.alternate_greetings || []).forEach((g, i) => {
    const num = document.createElement('div');
    num.className = 'preview-greeting-num';
    num.textContent = `Alternate ${i + 1}`;
    const block = document.createElement('div');
    block.className = 'preview-greeting';
    block.textContent = g;
    altList.appendChild(num);
    altList.appendChild(block);
  });

  // JSON tab
  $('jsonContent').textContent = JSON.stringify(card, null, 2);

  // Switch to preview tab
  switchTab('preview');
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  ['tabPreview', 'tabGreetings', 'tabJson'].forEach(id => {
    $(`${id}`).style.display = 'none';
  });
  const map = { preview: 'tabPreview', greetings: 'tabGreetings', json: 'tabJson' };
  if (map[tab]) $(`${map[tab]}`).style.display = 'block';
}

/* ── Download ────────────────────────────────────────────── */
function downloadCard() {
  if (!state.card) return;
  const name = (state.card.name || state.card.data?.name || 'character').replace(/\s+/g, '_');
  const blob = new Blob([JSON.stringify(state.card, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('JSON downloaded!', 'success');
}

/* ── Settings ────────────────────────────────────────────── */
function saveSettingsHandler() {
  const key = settingsApiKey.value.trim();
  if (key) {
    state.apiKey = key;
    setupApiKey.value = key;
    localStorage.setItem('nano_api_key', key);
  }
  settingsDrawer.classList.remove('open');
  toast('Settings saved.', 'success');
}

/* ── Boot ────────────────────────────────────────────────── */
init();
