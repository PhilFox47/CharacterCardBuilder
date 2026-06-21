/* ── State ───────────────────────────────────────────────── */
const state = {
  sessionId:    null,
  cardType:     'single',
  apiKey:       localStorage.getItem('nano_api_key') || '',
  model:        localStorage.getItem('nano_model') || '',   // empty = use server default
  card:         null,
  loading:      false,
  activeTab:    'preview',
  isEdit:       false,   // true when editing an imported card
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
  // Check if server has a key configured; get server default model
  try {
    const cfg = await apiFetch('/api/config', 'GET');
    if (cfg.has_server_key) {
      apiKeyRow.style.display = 'none'; // key is on server
    }
    // Always set an explicit value: saved override first, then server default.
    // This ensures getModel() always returns something and the model is always
    // sent explicitly in every API request — no silent fallback to a stale server default.
    settingsModel.value = state.model || cfg.model || 'xiaomi/mimo-v2.5-pro:thinking';
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
  // Return the locally-saved model override, or undefined to use server default
  return settingsModel.value.trim() || state.model || undefined;
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

// Streams a generation request via SSE, returning the card on success.
// Sends periodic progress events to keep any intermediate proxies alive.
async function streamCardGeneration(url, body, onProgress) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || `HTTP ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep the trailing incomplete line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return null;

      let event;
      try { event = JSON.parse(data); } catch (e) { continue; }

      if (event.type === 'card') return event.card;
      if (event.type === 'error') throw new Error(event.message);
      if (event.type === 'progress' && onProgress) onProgress(event.chars);
    }
  }

  throw new Error('Generation ended without a card response.');
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
    const card = await streamCardGeneration(
      '/api/generate',
      { session_id: state.sessionId, api_key: getApiKey() || null, mode, model: getModel() || null },
      (chars) => { /* chars received so far — could display if desired */ }
    );

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
    const card = await streamCardGeneration(
      '/api/regenerate',
      { session_id: state.sessionId, feedback: feedback || null, api_key: getApiKey() || null, model: getModel() || null },
      null
    );

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
  const model = settingsModel.value.trim();
  state.model = model;
  if (model) {
    localStorage.setItem('nano_model', model);
  } else {
    localStorage.removeItem('nano_model');
  }
  settingsDrawer.classList.remove('open');
  toast('Settings saved.', 'success');
}

/* ── Boot ────────────────────────────────────────────────── */
init();
