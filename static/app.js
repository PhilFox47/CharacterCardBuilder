/* ── State ───────────────────────────────────────────────── */
const state = {
  sessionId:    null,
  cardType:     'single',
  apiKey:       localStorage.getItem('nano_api_key') || '',
  model:        localStorage.getItem('nano_model') || '',   // empty = use server default (Nano-GPT)
  lmModel:      localStorage.getItem('cc_lmstudio_model') || '',   // empty = use whatever LM Studio has loaded
  backend:      localStorage.getItem('cc_backend') || 'nanogpt',   // 'nanogpt' | 'lmstudio'
  lmUrl:        localStorage.getItem('cc_lmstudio_url') || '',
  serverModelNano: '',
  serverModelLm:   '',
  hasServerKey: false,
  card:         null,
  loading:      false,
  activeTab:    'preview',
  isEdit:       false,   // true when editing an imported card
};

/* ── DOM refs ────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const setupOverlay    = $('setupOverlay');
const setupApiKey     = $('setupApiKey');
const apiKeyRow       = $('apiKeyRow');
const setupBackend    = $('setupBackend');
const lmStudioRow     = $('lmStudioRow');
const setupLmUrl      = $('setupLmUrl');
const settingsBackend    = $('settingsBackend');
const settingsApiKeyField = $('settingsApiKeyField');
const settingsLmUrlField  = $('settingsLmUrlField');
const settingsLmUrl       = $('settingsLmUrl');
const headerSubtitle  = $('headerSubtitle');
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
const overhaulBtn    = $('overhaulBtn');
const importRow      = $('importRow');
const importJson     = $('importJson');
const importFile     = $('importFile');
const importFileName = $('importFileName');
const newBtn         = $('newBtn');
const settingsBtn    = $('settingsBtn');
const settingsDrawer = $('settingsDrawer');
const closeSettings  = $('closeSettingsBtn');
const settingsApiKey = $('settingsApiKey');
const settingsModel  = $('settingsModel');
const settingsModelNote = $('settingsModelNote');
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
  // Check if server has a key configured; get server defaults for both backends
  try {
    const cfg = await apiFetch('/api/config', 'GET');
    state.hasServerKey = !!cfg.has_server_key;
    state.serverModelNano = cfg.model || '';
    state.serverModelLm = cfg.lmstudio_model || '';
    if (!state.lmUrl) {
      state.lmUrl = cfg.lmstudio_base_url || 'http://localhost:1234/v1';
    }
  } catch (_) {}

  // Restore saved key into setup field
  if (state.apiKey) {
    setupApiKey.value = state.apiKey;
    settingsApiKey.value = state.apiKey;
  }

  // Restore backend + LM Studio URL, and reflect them in both UI locations
  setupBackend.value = state.backend;
  settingsBackend.value = state.backend;
  setupLmUrl.value = state.lmUrl;
  settingsLmUrl.value = state.lmUrl;
  applyBackendVisibility();
  // Show the model saved for the CURRENTLY selected backend, not whatever
  // was last typed for the other one — this is what stops a Nano-GPT model
  // string (or vice versa) leaking into the wrong backend's request.
  syncModelFieldToBackend();

  setupBackend.addEventListener('change', () => {
    state.backend = setupBackend.value;
    settingsBackend.value = state.backend;
    applyBackendVisibility();
    syncModelFieldToBackend();
  });
  settingsBackend.addEventListener('change', () => {
    state.backend = settingsBackend.value;
    setupBackend.value = state.backend;
    applyBackendVisibility();
    syncModelFieldToBackend();
  });

  // Type selection
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.cardType = btn.dataset.type;
      // Reveal the JSON input only for Import
      importRow.style.display = state.cardType === 'import' ? 'block' : 'none';
      startBtn.textContent = state.cardType === 'import' ? 'Import & Edit →' : 'Start Building →';
    });
  });

  // Load a .json file into the import textarea
  importFile.addEventListener('change', () => {
    const file = importFile.files[0];
    if (!file) return;
    importFileName.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => { importJson.value = reader.result; };
    reader.readAsText(file);
  });

  startBtn.addEventListener('click', startSession);
  sendBtn.addEventListener('click', sendMessage);
  generateBtn.addEventListener('click', () => generateCard(state.isEdit ? 'edit' : null));
  overhaulBtn.addEventListener('click', () => generateCard('overhaul'));
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

/* ── Backend selection ───────────────────────────────────── */
function applyBackendVisibility() {
  const isLocal = state.backend === 'lmstudio';
  lmStudioRow.style.display = isLocal ? 'flex' : 'none';
  settingsLmUrlField.style.display = isLocal ? 'flex' : 'none';
  // API key isn't needed for a local LM Studio server, or when the server has one configured.
  const showApiKey = !isLocal && !state.hasServerKey;
  apiKeyRow.style.display = showApiKey ? 'flex' : 'none';
  settingsApiKeyField.style.display = showApiKey ? 'flex' : 'none';
  headerSubtitle.textContent = isLocal ? 'SillyTavern · Friction Lite · LM Studio (local)' : 'SillyTavern · Friction Lite · Nano-GPT';
}

// Each backend keeps its OWN model override, so switching backends never
// sends a leftover Nano-GPT model string to LM Studio (or vice versa).
function syncModelFieldToBackend() {
  if (state.backend === 'lmstudio') {
    settingsModel.value = state.lmModel || state.serverModelLm || '';
    settingsModel.placeholder = 'e.g. gemma-3-12b-it-qat-heretic';
    if (settingsModelNote) {
      settingsModelNote.textContent = "The exact model ID LM Studio shows for what you have loaded. Leave blank to let LM Studio use whatever's currently loaded.";
    }
  } else {
    settingsModel.value = state.model || state.serverModelNano || '';
    settingsModel.placeholder = 'xiaomi/mimo-v2.5-pro:thinking';
    if (settingsModelNote) {
      settingsModelNote.textContent = 'Overrides the server default. Saved locally per backend — switching backends won\'t overwrite the other one\'s model.';
    }
  }
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

function getModel() {
  // Whatever's currently typed wins (it reflects the active backend — see
  // syncModelFieldToBackend). Otherwise fall back to that backend's own
  // saved override. Returning undefined lets the server use its default
  // (for LM Studio: whatever model is currently loaded).
  const typed = settingsModel.value.trim();
  if (typed) return typed;
  return (getBackend() === 'lmstudio' ? state.lmModel : state.model) || undefined;
}

function getBackend() {
  return state.backend === 'lmstudio' ? 'lmstudio' : 'nanogpt';
}

function getBaseUrl() {
  if (getBackend() !== 'lmstudio') return undefined;
  return (setupLmUrl.value.trim() || settingsLmUrl.value.trim() || state.lmUrl || 'http://localhost:1234/v1');
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

  if (state.cardType === 'import') {
    return importCard(apiKey);
  }

  state.isEdit = false;
  setLoading(true);
  try {
    const res = await apiFetch('/api/start', 'POST', {
      card_type: state.cardType,
      api_key: apiKey || null,
      model: getModel() || null,
      backend: getBackend(),
      base_url: getBaseUrl() || null,
    });

    state.sessionId = res.session_id;
    enterChatView();

    const labels = { single: 'Single Character', group: 'Group', scenario: 'Scenario' };
    typeBadge.textContent = labels[state.cardType] || state.cardType;
    overhaulBtn.style.display = 'none';
    generateBtn.textContent = '✨ Generate Card';

    addMessage('assistant', res.message);
    messageInput.focus();

  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
  } finally {
    setLoading(false);
  }
}

async function importCard(apiKey) {
  const raw = importJson.value.trim();
  if (!raw) {
    toast('Paste card JSON or choose a .json file first.', 'error');
    return;
  }
  // Validate JSON client-side for a friendlier error
  try { JSON.parse(raw); }
  catch (e) { toast(`That isn't valid JSON: ${e.message}`, 'error'); return; }

  state.isEdit = true;
  setLoading(true);
  try {
    const res = await apiFetch('/api/import', 'POST', {
      card_json: raw,
      api_key: apiKey || null,
      model: getModel() || null,
      backend: getBackend(),
      base_url: getBaseUrl() || null,
    });

    state.sessionId = res.session_id;
    enterChatView();

    typeBadge.textContent = 'Editing';
    overhaulBtn.style.display = 'inline-flex';
    generateBtn.textContent = '✨ Apply Edits';
    chatStatus.textContent = 'Review the card, then edit or overhaul.';

    // Show the imported card immediately
    state.card = res.card;
    renderCard(res.card);

    addMessage('assistant', res.message);
    messageInput.focus();

  } catch (err) {
    toast(`Import failed: ${err.message}`, 'error');
  } finally {
    setLoading(false);
  }
}

function enterChatView() {
  setupOverlay.style.display = 'none';
  chatTopbar.style.display = 'flex';
  chatInputArea.style.display = 'block';
  newBtn.style.display = 'inline-flex';
  chatMessages.innerHTML = '';
}

function resetToSetup() {
  state.sessionId = null;
  state.card = null;
  state.isEdit = false;
  chatMessages.innerHTML = '';
  setupOverlay.style.display = 'flex';
  chatTopbar.style.display = 'none';
  chatInputArea.style.display = 'none';
  newBtn.style.display = 'none';
  overhaulBtn.style.display = 'none';
  generateBtn.textContent = '✨ Generate Card';
  importJson.value = '';
  importFileName.textContent = '';
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
      model: getModel() || null,
      backend: getBackend(),
      base_url: getBaseUrl() || null,
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

// Poll /api/job/:id until done or error. Returns the card on success.
// Each poll request is a short GET — no long-lived connection, no proxy timeout.
async function pollJob(jobId) {
  let failures = 0;
  while (true) {
    await new Promise(r => setTimeout(r, 6000));
    let job;
    try {
      job = await apiFetch(`/api/job/${jobId}`, 'GET');
      failures = 0;
    } catch (err) {
      // Tolerate transient network blips — give up after 3 consecutive failures
      if (++failures >= 3) throw new Error(`Lost contact with the server: ${err.message}`);
      continue;
    }
    if (job.status === 'done') return job.card;
    if (job.status === 'error') throw new Error(job.error);
    // 'pending' or 'running' → keep polling
  }
}

async function generateCard(mode = null) {
  if (!state.sessionId || state.loading) return;

  const verb = mode === 'overhaul' ? 'Overhauling' : (mode === 'edit' ? 'Applying edits to' : 'Generating');
  const noun = mode === 'overhaul' ? 'overhauled' : (mode === 'edit' ? 'edited' : 'generated');
  addMessage('assistant', `✨ ${verb} your character card — this uses a thinking model and may take several minutes (longer for group/overhaul jobs). Please wait…`);
  chatStatus.textContent = `${verb} card…`;
  setLoading(true);
  addTypingIndicator();

  const startTime = Date.now();
  const timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    chatStatus.textContent = `${verb}… ${elapsed}s`;
  }, 1000);

  try {
    // This POST returns a job_id immediately — no long wait, no proxy timeout.
    const { job_id } = await apiFetch('/api/generate', 'POST', {
      session_id: state.sessionId,
      api_key: getApiKey() || null,
      mode: mode,
      model: getModel() || null,
      backend: getBackend(),
      base_url: getBaseUrl() || null,
    });

    // Poll until the background job finishes.
    const card = await pollJob(job_id);

    clearInterval(timerInterval);
    removeTypingIndicator();
    state.card = card;
    renderCard(card);
    addMessage('assistant', `✅ Your character card is ${noun}! You can preview it in the panel or download the JSON to import into SillyTavern.`);
    chatStatus.textContent = 'Card ready!';
    toast(`Card ${noun} successfully!`, 'success');

  } catch (err) {
    clearInterval(timerInterval);
    removeTypingIndicator();
    addMessage('assistant', `⚠ Error: ${err.message}\n\nPlease try again — thinking models occasionally time out on large requests.`);
    toast(`Failed: ${err.message}`, 'error');
    chatStatus.textContent = 'Ready to try again.';
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
    const { job_id } = await apiFetch('/api/regenerate', 'POST', {
      session_id: state.sessionId,
      feedback: feedback || null,
      api_key: getApiKey() || null,
      model: getModel() || null,
      backend: getBackend(),
      base_url: getBaseUrl() || null,
    });

    const card = await pollJob(job_id);

    clearInterval(timerInterval);
    removeTypingIndicator();
    state.card = card;
    renderCard(card);
    addMessage('assistant', '✅ Card regenerated! Check the preview panel.');
    chatStatus.textContent = 'Card generated!';
    toast('Card regenerated!', 'success');

  } catch (err) {
    clearInterval(timerInterval);
    removeTypingIndicator();
    toast(`Regeneration failed: ${err.message}`, 'error');
    chatStatus.textContent = 'Ready to try again.';
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
  // The model field always belongs to whichever backend is selected right now
  // (see syncModelFieldToBackend) — save it into that backend's own slot.
  const model = settingsModel.value.trim();
  if (settingsBackend.value === 'lmstudio') {
    state.lmModel = model;
    if (model) localStorage.setItem('cc_lmstudio_model', model);
    else localStorage.removeItem('cc_lmstudio_model');
  } else {
    state.model = model;
    if (model) localStorage.setItem('nano_model', model);
    else localStorage.removeItem('nano_model');
  }

  state.backend = settingsBackend.value;
  setupBackend.value = state.backend;
  localStorage.setItem('cc_backend', state.backend);

  const lmUrl = settingsLmUrl.value.trim();
  state.lmUrl = lmUrl;
  setupLmUrl.value = lmUrl;
  if (lmUrl) {
    localStorage.setItem('cc_lmstudio_url', lmUrl);
  } else {
    localStorage.removeItem('cc_lmstudio_url');
  }

  applyBackendVisibility();
  syncModelFieldToBackend();
  settingsDrawer.classList.remove('open');
  toast('Settings saved.', 'success');
}

/* ── Boot ────────────────────────────────────────────────── */
init();
