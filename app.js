'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const steps = [
  ['選擇使用方式', '純瀏覽器即插即用 / Google Drive 資料夾工作流', '使用模式'],
  ['提供 A / B 資料', 'A=投影片圖片；B=司儀稿 / 逐字稿', 'A/B 資料'],
  ['選擇 Cue 模式', '指定句、逐字稿配對、參閱標題鎖定', 'Cue 模式'],
  ['設定觸發與動作', '輸入關鍵字眼、動作、目標頁和門檻', 'Cue Builder'],
  ['彩排 / 正式放映', '語音辨識、自動跳頁、全螢幕播放', '放映測試'],
  ['儲存 / 部署', '匯出 project.vcue.json，部署到 GitHub + Vercel', 'Project']
];

const sampleScript = `司儀：2025至2026年度筲箕灣區區務委員會周年大會現在開始，請各位來賓就座。
司儀：現在恭請筲箕灣區會長呂凌鳴先生主持會議。
會長：2025至2026年度區務委員會周年大會，現在正式開始。
會長：議程一，通過2025年6月18日舉行之第49屆區務委員會周年大會會議紀錄。
司儀：大家可以參閱附件一。
會長：宣佈通過第49屆區務委員會周年大會會議記錄。
會長：無未了事項，進入議程三。
會長：宣佈通過2025至2026年度筲箕灣區的區務報告。
會長：宣佈通過2025至2026年度筲箕灣區的財務報告。
會長：通過追認區執行委員會批准之2026至2027年度之區財政預算。
司儀：大家可以參閱附件三。
會長：議程七，提名及選出2026至2027年度區執行委員會成員。
會長：確認通過委任楊少銓會計師為2026至2027年度筲箕灣區義務核數師。
會長：如果無的話，我宣佈周年大會圓滿結束。
司儀：由工作人員安排拍攝大合照。`;

const state = {
  step: 0,
  appMode: 'browser',
  slides: [],
  currentSlide: 1,
  slideFitMode: 'contain',
  slideTitles: [],
  scriptText: '',
  scriptLines: [],
  scriptIndex: 0,
  cueModes: new Set(['keyword']),
  cues: [
    { enabled: true, trigger: '區務委員會周年大會現在正式開始', action: 'goto_slide', target: '3', threshold: 84 },
    { enabled: true, trigger: '宣佈通過第49屆區務委員會周年大會會議記錄', action: 'goto_slide', target: '4', threshold: 84 },
    { enabled: true, trigger: '無未了事項進入議程三', action: 'goto_slide', target: '5', threshold: 84 },
    { enabled: true, trigger: '如果無的話我宣佈周年大會圓滿結束', action: 'goto_slide', target: '12', threshold: 84 }
  ],
  cueIndex: 0,
  listening: false,
  recognition: null,
  lastTriggerAt: 0,
  pendingAction: null,
  lastHeard: '',
  interimTimer: null,
  lastSlideImport: null,
  numberBuffer: ''
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}
function nowTime() { return new Date().toLocaleTimeString('zh-HK', { hour12: false }); }
function log(msg, type = '') {
  const icon = type === 'ok' ? '✅' : type === 'warn' ? '⚠️' : type === 'bad' ? '❌' : type === 'listen' ? '🗣️' : '•';
  const box = $('#logBox');
  if (!box) return;
  box.textContent += `[${nowTime()}] ${icon} ${msg}\n`;
  box.scrollTop = box.scrollHeight;
}
function naturalCompare(a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }); }
function stripExt(name) { return String(name).replace(/\.[^.]+$/, ''); }
function normalizeText(text, loose = false) {
  let t = String(text || '').toLowerCase();
  t = t.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));
  // Common Cantonese/HK STT substitutions for meeting agendas.
  // e.g. 「議程一」 is often recognised as 「程序一」 or 「程式一」.
  t = t.replace(/程序/g, '議程').replace(/程式/g, '議程').replace(/日程/g, '議程').replace(/流程/g, '議程');
  t = t.replace(/[\s\t\n\r,，。.!！?？:：;；、\-—_()（）\[\]【】「」『』《》〈〉"'‘’“”\/\\]+/g, '');
  if (loose) t = t.replace(/[0-9零〇一二三四五六七八九十百千萬兩第屆年月日號年度至]/g, '');
  return t;
}
function lcsLength(a, b) {
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  let prev = new Array(n + 1).fill(0), curr = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}
function lcsScore(a, b) {
  if (!a || !b) return 0;
  const lcs = lcsLength(a, b);
  return Math.round(100 * (0.72 * (lcs / a.length) + 0.28 * ((2 * lcs) / (a.length + b.length))));
}
function matchScore(cue, spoken) {
  const a1 = normalizeText(cue, false), b1 = normalizeText(spoken, false);
  const a2 = normalizeText(cue, true), b2 = normalizeText(spoken, true);
  function one(a, b) {
    if (!a || !b) return 0;
    if (b.includes(a)) return 100;
    if (a.includes(b)) {
      const enoughCoverage = b.length >= Math.min(6, Math.ceil(a.length * 0.55));
      const agendaAnchor = /(?:議程|附件)[一二三四五六七八九十0-9]?/.test(b) && b.length >= 3;
      const usefulShortCue = b.length >= 4;
      if (enoughCoverage) return Math.min(96, Math.round(78 + 18 * (b.length / a.length)));
      if (agendaAnchor) return 92;
      if (usefulShortCue) return 88;
    }
    return lcsScore(a, b);
  }
  return Math.max(one(a1, b1), one(a2, b2) - 4);
}
function getThreshold() { return Number($('#defaultThreshold')?.value || 84); }
function getCooldownMs() { return Number($('#cooldownSeconds')?.value || 3) * 1000; }
function getTriggerMode() { return $('#triggerMode')?.value || 'sequential'; }
function enabledCues() { return state.cues.map((c, i) => ({ ...c, index: i })).filter(c => c.enabled !== false); }
function nextEnabledCueIndex(from = state.cueIndex) {
  for (let i = from; i < state.cues.length; i++) if (state.cues[i].enabled !== false) return i;
  return -1;
}

function setStep(n) { state.step = Math.max(0, Math.min(steps.length - 1, n)); render(); }
function renderNav() {
  $('#stepNav').innerHTML = steps.map((s, i) => `<button class="${i === state.step ? 'active' : i < state.step ? 'done' : ''}" data-nav-step="${i}">
    <div class="step-no">${i < state.step ? '✓' : i + 1}</div><div><div class="step-title">${s[2]}</div><div class="step-desc">${s[1]}</div></div>
  </button>`).join('');
  $$('[data-nav-step]').forEach(btn => btn.addEventListener('click', () => setStep(Number(btn.dataset.navStep))));
}
function renderHeader() {
  $('#screenTitle').textContent = steps[state.step][0];
  $('#screenDesc').textContent = steps[state.step][1];
  const slideState = state.slides.length ? `${state.slides.length} 張 slides` : '未載入 slides';
  const scriptState = state.scriptLines.length ? `${state.scriptLines.length} 行稿` : '未解析司儀稿';
  const listenState = state.listening ? '正在聆聽' : '未聆聽';
  $('#badges').innerHTML = `
    <span class="badge"><span class="dot ${state.appMode === 'browser' ? 'green' : 'blue'}"></span>${state.appMode === 'browser' ? 'Browser' : 'Google Drive'}</span>
    <span class="badge"><span class="dot ${state.slides.length ? 'green' : 'yellow'}"></span>${slideState}</span>
    <span class="badge"><span class="dot ${state.scriptLines.length ? 'green' : 'yellow'}"></span>${scriptState}</span>
    <span class="badge"><span class="dot ${state.listening ? 'green' : ''}"></span>${listenState}</span>
    <span class="badge">${state.cues.filter(c => c.enabled !== false).length} cues</span>`;
}
function renderScreens() {
  $$('.screen').forEach(sec => sec.classList.toggle('active', Number(sec.dataset.screen) === state.step));
  $$('.choice').forEach(c => c.classList.toggle('selected', c.dataset.appMode === state.appMode));
  $$('.mode-card').forEach(c => c.classList.toggle('selected', state.cueModes.has(c.dataset.cueMode)));
  const modeHelp = $('#modeHelp');
  if (modeHelp) modeHelp.innerHTML = state.appMode === 'browser'
    ? '<strong>純瀏覽器模式：</strong>請選擇本機 slides 圖片資料夾，以及貼上或載入司儀稿。所有資料留在本機，不上傳到伺服器。'
    : '<strong>Google Drive 資料夾模式：</strong>第一版請先將 Drive 活動資料夾同步/下載到電腦，然後選擇其中的 slides 資料夾和 project.vcue.json。第二版可接 Google Picker。';
}
function renderSlides() {
  const list = $('#slideList');
  if (list) {
    list.innerHTML = state.slides.length
      ? state.slides.slice(0, 40).map(s => `<div class="file-line"><div><b>#${s.slideNo} ${escapeHtml(s.name)}</b><br><span>${escapeHtml(state.slideTitles[s.slideNo - 1] || '')}</span></div><span class="green">OK</span></div>`).join('') + (state.slides.length > 40 ? `<div class="file-line"><div><b>⋯</b><br><span>共 ${state.slides.length} 張</span></div></div>` : '')
      : (state.lastSlideImport && state.lastSlideImport.selected
        ? `<div class="file-line"><div><b>未載入任何圖片</b><br><span>剛才選了 ${state.lastSlideImport.selected} 個項目，但沒有可讀取的 PNG/JPG/WebP/GIF/BMP。例子：${escapeHtml(state.lastSlideImport.examples || '沒有檔名')}</span></div><span class="red">0 張</span></div>`
        : '<div class="file-line"><div><b>未載入</b><br><span>請選擇投影片圖片資料夾，或手動選擇多個 PNG/JPG 檔。</span></div><span class="yellow">待設定</span></div>');
  }
  const titleList = $('#slideTitleList');
  if (titleList) {
    titleList.innerHTML = state.slides.length
      ? state.slides.map((s, i) => `<div class="title-row"><span>第 ${i + 1} 頁</span><input data-slide-title-index="${i}" value="${escapeHtml(state.slideTitles[i] || stripExt(s.name))}" /></div>`).join('')
      : '<p class="muted small">載入 slides 後可在此編輯每頁標題。Title Lock 模式會用這些標題匹配。</p>';
    $$('[data-slide-title-index]').forEach(inp => inp.addEventListener('input', () => { state.slideTitles[Number(inp.dataset.slideTitleIndex)] = inp.value; renderProjectPreview(); }));
  }
}
function renderScriptLines() {
  const box = $('#scriptLines');
  if (!box) return;
  if (!state.scriptLines.length) {
    box.innerHTML = '<p class="muted small">尚未解析司儀稿。請到上一步貼上稿並按「解析司儀稿」。</p>';
    return;
  }
  box.innerHTML = state.scriptLines.map((line, i) => `<button class="script-line ${i === state.scriptIndex ? 'active' : ''}" data-add-script-cue="${i}">
    <div class="meta"><span>稿第 ${i + 1} 行</span><span>點擊加入 cue</span></div>${escapeHtml(line.text)}
  </button>`).join('');
  $$('[data-add-script-cue]').forEach(btn => btn.addEventListener('click', () => {
    const line = state.scriptLines[Number(btn.dataset.addScriptCue)];
    state.cues.push({ enabled: true, trigger: line.text, action: 'goto_slide', target: String(suggestSlideFromText(line.text) || state.currentSlide || 1), threshold: getThreshold() });
    render();
  }));
}
function renderCueTable() {
  const table = $('#cueTable');
  if (!table) return;
  table.innerHTML = state.cues.map((c, i) => `<tr>
    <td class="col-order"><b>${i + 1}</b></td>
    <td class="col-enabled"><input type="checkbox" data-cue-field="enabled" data-cue-index="${i}" ${c.enabled !== false ? 'checked' : ''} /></td>
    <td><input data-cue-field="trigger" data-cue-index="${i}" value="${escapeHtml(c.trigger)}" /></td>
    <td class="col-action"><select data-cue-field="action" data-cue-index="${i}">
      <option value="goto_slide" ${c.action === 'goto_slide' ? 'selected' : ''}>跳到頁碼</option>
      <option value="next_slide" ${c.action === 'next_slide' ? 'selected' : ''}>下一頁</option>
      <option value="goto_title" ${c.action === 'goto_title' ? 'selected' : ''}>跳到標題</option>
      <option value="confirm" ${c.action === 'confirm' ? 'selected' : ''}>提示確認</option>
    </select></td>
    <td class="col-target"><input data-cue-field="target" data-cue-index="${i}" value="${escapeHtml(c.target)}" placeholder="3 / 財務" /></td>
    <td class="col-threshold"><input type="number" min="60" max="98" data-cue-field="threshold" data-cue-index="${i}" value="${c.threshold || getThreshold()}" /></td>
    <td class="col-tools"><button class="btn small danger" data-delete-cue="${i}">刪除</button></td>
  </tr>`).join('');
  $$('[data-cue-field]').forEach(el => { el.addEventListener('input', updateCueFromInput); el.addEventListener('change', updateCueFromInput); });
  $$('[data-delete-cue]').forEach(btn => btn.addEventListener('click', () => { state.cues.splice(Number(btn.dataset.deleteCue), 1); if (state.cueIndex > state.cues.length) state.cueIndex = 0; render(); }));
}
function updateCueFromInput(e) {
  const el = e.target, i = Number(el.dataset.cueIndex), field = el.dataset.cueField;
  if (!state.cues[i]) return;
  if (field === 'enabled') state.cues[i][field] = el.checked;
  else if (field === 'threshold') state.cues[i][field] = Number(el.value || getThreshold());
  else state.cues[i][field] = el.value;
  updateDerived();
}
function renderRules() {
  const box = $('#rulePreview'); if (!box) return;
  const items = [];
  if (state.cueModes.has('keyword')) items.push(['指定句 Cue', '真正跳頁主要由 Cue Builder 表格控制。Sequential 只等待下一個；Smart Sequential 可跳到之後的 cue。']);
  if (state.cueModes.has('transcript')) items.push(['逐字稿配對', '系統會在下一段稿附近尋找最接近內容，更新 script position；如命中 cue 亦可觸發。']);
  if (state.cueModes.has('titleLock')) items.push(['參閱標題鎖定', '偵測「參閱 / 進入 / 請看」後面的標題，與 slide title 做 fuzzy match。']);
  box.innerHTML = items.map(([a,b]) => `<div class="file-line"><div><b>${a}</b><br><span>${b}</span></div><span class="green">ON</span></div>`).join('') || '<p class="muted">未選任何 cue 模式。</p>';
}
function currentCueText() {
  if (!state.cues.length) return '下一個 cue：未設定';
  const mode = getTriggerMode();
  if (mode === 'sequential' || mode === 'smart') {
    const idx = nextEnabledCueIndex(state.cueIndex);
    if (idx < 0) return '所有 cue 已完成';
    const c = state.cues[idx];
    const prefix = mode === 'smart' ? 'Smart｜下一個' : '下一個';
    return `${prefix} cue #${idx + 1}：${c.trigger} → ${actionText(c)}`;
  }
  if (mode === 'confirm') return `Confirm 模式：命中後需確認｜${enabledCues().length} 個 cue`;
  return `Any 模式：${enabledCues().length} 個 cue 任一命中可觸發`;
}
function actionText(c) {
  if (!c) return '';
  if (c.action === 'next_slide') return '下一頁';
  if (c.action === 'goto_title') return `標題：${c.target}`;
  if (c.action === 'confirm') return `提示確認：${c.target || '下一頁'}`;
  return `第 ${c.target} 頁`;
}
function triggerAlternatives(trigger) {
  return String(trigger || '')
    .split(/[|｜；;]/)
    .map(x => x.trim())
    .filter(Boolean);
}
function renderStage() {
  const stage = $('#stage');
  if (stage) {
    stage.classList.remove('fit-contain', 'fit-cover', 'fit-fill');
    stage.classList.add('fit-' + (state.slideFitMode || 'contain'));
  }
  const img = $('#slideImage'), ph = $('#slidePlaceholder');
  const total = state.slides.length;
  const cur = total ? Math.max(1, Math.min(state.currentSlide, total)) : 0;
  if (total && cur) { state.currentSlide = cur; img.src = state.slides[cur - 1].url; img.style.display = 'block'; ph.style.display = 'none'; }
  else { img.removeAttribute('src'); img.style.display = 'none'; ph.style.display = 'block'; }
  const slideText = total ? `Slide ${cur} / ${total}` : 'Slide - / -';
  $('#overlaySlide').textContent = slideText;
  $('#currentSlideBadge').textContent = slideText;
  const cueText = currentCueText();
  $('#overlayCue').textContent = cueText;
  $('#nextCueBadge').textContent = cueText;
  $('#overlayHeard').textContent = state.lastHeard || '—';
  $('#listenDot').className = 'dot' + (state.listening ? ' green' : '');
  $('#listenState').textContent = state.listening ? '正在聆聽' : '未開始聆聽';
}
function renderProjectPreview() { const box = $('#projectJsonPreview'); if (box) box.textContent = JSON.stringify(buildProject(), null, 2); }
function updateDerived() { renderHeader(); renderStage(); renderProjectPreview(); }
function render() {
  renderNav(); renderHeader(); renderScreens(); renderSlides(); renderScriptLines(); renderCueTable(); renderRules(); renderStage(); renderProjectPreview();
  $('#prevStepBtn').disabled = state.step === 0;
  $('#nextStepBtn').textContent = state.step === steps.length - 1 ? '回到開始' : '下一步 →';
  $('#stepBadge').textContent = `Step ${state.step + 1} / ${steps.length}`;
}

function isLikelyImageFile(file) {
  const name = String(file && file.name || '');
  const type = String(file && file.type || '').toLowerCase();
  return /^image\//.test(type) || /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(name);
}
function loadSlideFiles(fileList, source = '檔案選擇') {
  const selected = Array.from(fileList || []);
  const files = selected.filter(isLikelyImageFile);
  files.sort((a,b) => naturalCompare(a.webkitRelativePath || a.name, b.webkitRelativePath || b.name));
  state.lastSlideImport = {
    source,
    selected: selected.length,
    loaded: files.length,
    examples: selected.slice(0, 5).map(f => `${f.name || '(無檔名)'}${f.type ? ' [' + f.type + ']' : ''}`).join('、')
  };
  state.slides.forEach(s => { try { URL.revokeObjectURL(s.url); } catch (_) {} });
  state.slides = files.map((file, i) => ({ slideNo: i + 1, name: file.webkitRelativePath || file.name, url: URL.createObjectURL(file) }));
  state.slideTitles = state.slides.map((s, i) => state.slideTitles[i] || stripExt(s.name).replace(/^.*[\\/]/, ''));
  state.currentSlide = state.slides.length ? 1 : 0;
  if (files.length) {
    log(`已由「${source}」載入 ${files.length} 張投影片圖片`, 'ok');
  } else {
    log(`未能由「${source}」讀取圖片。選到 ${selected.length} 個項目；請確認是已解壓的 PNG/JPG 圖片，而不是 zip/pdf/pptx。`, 'warn');
    if (selected.length) alert(`未讀到任何圖片。\n\n你剛才選了 ${selected.length} 個項目，但它們不是可讀的 PNG/JPG/WebP/GIF/BMP，或瀏覽器沒有提供檔案。\n\n檔案例子：${state.lastSlideImport.examples || '沒有'}\n\n請嘗試：\n1. 用 Chrome / Edge 桌面版\n2. 將 Canva zip 先解壓\n3. 用「方法 B」手動選擇多個 PNG 檔\n4. 不要直接選 Google Drive 網頁內的檔，請先同步/下載到本機。`);
  }
  render();
}

function readEntry(entry) {
  return new Promise(resolve => {
    if (!entry) return resolve([]);
    if (entry.isFile) {
      entry.file(file => resolve([file]), () => resolve([]));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const all = [];
      const readBatch = () => reader.readEntries(async entries => {
        if (!entries.length) return resolve(all.flat());
        const nested = await Promise.all(entries.map(readEntry));
        all.push(...nested);
        readBatch();
      }, () => resolve(all.flat()));
      readBatch();
    } else resolve([]);
  });
}
async function filesFromDrop(dataTransfer) {
  const items = Array.from(dataTransfer.items || []);
  if (items.length && items[0].webkitGetAsEntry) {
    const nested = await Promise.all(items.map(item => readEntry(item.webkitGetAsEntry())));
    return nested.flat();
  }
  return Array.from(dataTransfer.files || []);
}
function parseScript(text) {
  state.scriptText = String(text || '');
  const raw = state.scriptText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines = [];
  for (let line of raw) {
    line = line.trim();
    if (!line || /^[-*_#\s]+$/.test(line) || /不用讀|括弧不要讀|黃底斜字只是資料/i.test(line)) continue;
    line = line.replace(/^\*+|\*+$/g, '').replace(/\([^)]*不要讀[^)]*\)/g, '').trim();
    if (line && line.length >= 4) lines.push({ text: line });
  }
  state.scriptLines = lines; state.scriptIndex = 0;
  log(`已解析司儀稿：${lines.length} 行`, lines.length ? 'ok' : 'warn');
  render();
}
function suggestSlideFromText(text) {
  let best = { slide: 0, score: 0 };
  state.slideTitles.forEach((title, i) => { const s = matchScore(title, text); if (s > best.score) best = { slide: i + 1, score: s }; });
  const m = String(text).match(/議程\s*[（(]?([一二三四五六七八九十0-9]+)[）)]?/);
  if (m && state.slideTitles.length) {
    const token = m[1];
    for (let i = 0; i < state.slideTitles.length; i++) if (normalizeText(state.slideTitles[i], false).includes(normalizeText('議程' + token, false))) return i + 1;
  }
  return best.score >= 70 ? best.slide : Math.min(state.slides.length || 13, Math.max(1, state.currentSlide || 1));
}

function parseCsvLine(line) {
  const cells = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i], next = line[i + 1];
    if (ch === '"') { if (q && next === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === ',' && !q) { cells.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  cells.push(cur.trim()); return cells;
}
function csvEscape(s) { s = String(s ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function importCueCsv(text) {
  const cues = [];
  const lines = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  for (const raw of lines) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const cells = parseCsvLine(line);
    if (/^(slide|page|頁碼|target)$/i.test(cells[0] || '')) continue;
    let cue;
    if (/^\d+$/.test(cells[0]) && cells[1]) cue = { enabled: true, trigger: cells[1], action: cells[2] || 'goto_slide', target: cells[0], threshold: Number(cells[3] || getThreshold()) };
    else if (cells[0]) cue = { enabled: true, trigger: cells[0], action: cells[1] || 'goto_slide', target: cells[2] || '', threshold: Number(cells[3] || getThreshold()) };
    if (cue && cue.trigger) cues.push(cue);
  }
  if (cues.length) state.cues = cues;
  log(`已匯入 ${cues.length} 個 cue`, cues.length ? 'ok' : 'warn');
  render();
}
function exportCueCsv() {
  const header = 'target,trigger,action,threshold\n';
  const body = state.cues.map(c => [c.target, c.trigger, c.action, c.threshold].map(csvEscape).join(',')).join('\n');
  downloadText('cues.csv', header + body, 'text/csv;charset=utf-8');
}

function buildProject() {
  return {
    schema: 'voice-cue-slide-project', version: 1, exportedAt: new Date().toISOString(), appMode: state.appMode,
    settings: { triggerMode: getTriggerMode(), speechLang: $('#speechLang')?.value || 'zh-HK', defaultThreshold: getThreshold(), cooldownSeconds: Number($('#cooldownSeconds')?.value || 3), titleWindow: Number($('#titleWindow')?.value || 8), slideFitMode: state.slideFitMode || 'contain', cueModes: Array.from(state.cueModes) },
    slideTitles: state.slideTitles.map((title, i) => ({ slideNo: i + 1, title })),
    scriptText: state.scriptText,
    cues: state.cues.map((c, i) => ({ order: i + 1, enabled: c.enabled !== false, trigger: c.trigger, action: c.action, target: c.target, threshold: c.threshold || getThreshold() })),
    notes: 'Browser 模式只保存設定和文字，不保存圖片檔案本身；重用時請重新選 slides 資料夾。'
  };
}
function applyProject(project) {
  if (!project || project.schema !== 'voice-cue-slide-project') throw new Error('這不是有效的 Voice Cue Project JSON');
  state.appMode = project.appMode === 'drive' ? 'drive' : 'browser';
  const s = project.settings || {};
  if (s.triggerMode && $('#triggerMode')) $('#triggerMode').value = s.triggerMode;
  if (s.speechLang && $('#speechLang')) $('#speechLang').value = s.speechLang;
  if (s.defaultThreshold && $('#defaultThreshold')) $('#defaultThreshold').value = String(s.defaultThreshold);
  if (s.cooldownSeconds && $('#cooldownSeconds')) $('#cooldownSeconds').value = String(s.cooldownSeconds);
  if (s.titleWindow && $('#titleWindow')) $('#titleWindow').value = String(s.titleWindow);
  if (s.slideFitMode) state.slideFitMode = ['contain', 'cover', 'fill'].includes(s.slideFitMode) ? s.slideFitMode : 'contain';
  if ($('#slideFitMode')) $('#slideFitMode').value = state.slideFitMode;
  if (Array.isArray(s.cueModes) && s.cueModes.length) state.cueModes = new Set(s.cueModes);
  if (Array.isArray(project.cues)) state.cues = project.cues.map(c => ({ enabled: c.enabled !== false, trigger: c.trigger || c.triggerText || '', action: c.action || 'goto_slide', target: String(c.target ?? c.targetSlideNo ?? ''), threshold: Number(c.threshold || s.defaultThreshold || 84) })).filter(c => c.trigger);
  if (Array.isArray(project.slideTitles)) project.slideTitles.forEach(x => { if (x.slideNo) state.slideTitles[x.slideNo - 1] = x.title || ''; });
  if (project.scriptText) { $('#scriptText').value = project.scriptText; parseScript(project.scriptText); }
  state.cueIndex = 0;
}
async function importProjectFile(file) {
  if (!file) return;
  try { applyProject(JSON.parse(await file.text())); log(`已載入 Project：${file.name}`, 'ok'); alert('已載入 Project JSON。Browser 模式下請再選一次投影片圖片資料夾。'); render(); }
  catch (err) { log(err.message || String(err), 'bad'); alert(err.message || String(err)); }
  finally { $('#projectFileInput').value = ''; }
}
function downloadText(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function downloadProject() { downloadText(`project-${new Date().toISOString().slice(0,10)}.vcue.json`, JSON.stringify(buildProject(), null, 2), 'application/json;charset=utf-8'); log('已下載 Project JSON', 'ok'); }

function gotoSlide(n, reason = '') {
  if (!state.slides.length) { log(`未載入投影片，不能跳到第 ${n} 頁`, 'warn'); return false; }
  const target = Math.max(1, Math.min(state.slides.length, Number(n) || 1));
  state.currentSlide = target; log(`跳到第 ${target} 頁${reason ? '｜' + reason : ''}`, 'ok'); renderStage(); return true;
}
function nextSlide() { if (state.slides.length) gotoSlide(Math.min(state.currentSlide + 1, state.slides.length), '下一頁'); }
function prevSlide() { if (state.slides.length) gotoSlide(Math.max(state.currentSlide - 1, 1), '上一頁'); }
function findTitleTarget(titleText) {
  const current = state.currentSlide || 1;
  const windowSize = Number($('#titleWindow')?.value || 8);
  let start = 0, end = state.slideTitles.length;
  if (windowSize < 999) { start = Math.max(0, current - 1); end = Math.min(state.slideTitles.length, current - 1 + windowSize + 1); }
  let best = { slide: 0, score: 0, title: '' };
  for (let i = start; i < end; i++) {
    const title = state.slideTitles[i] || `Slide ${i + 1}`;
    const s = matchScore(titleText, title);
    if (s > best.score) best = { slide: i + 1, score: s, title };
  }
  return best;
}
function executeAction(cue, source = '') {
  if (getTriggerMode() === 'confirm' || cue.action === 'confirm') { state.pendingAction = { cue, source }; renderPending(); return 'pending'; }
  if (cue.action === 'next_slide') return (nextSlide(), true);
  if (cue.action === 'goto_title') {
    const best = findTitleTarget(cue.target || cue.trigger);
    if (best.slide && best.score >= (cue.threshold || getThreshold())) return gotoSlide(best.slide, `${source}｜標題 ${best.title}｜${best.score}`);
    log(`找不到足夠相似標題：${cue.target}｜最佳 ${best.score}`, 'warn'); return false;
  }
  return gotoSlide(Number(cue.target), source);
}
function renderPending() {
  const box = $('#pendingBox'); if (!box) return;
  if (!state.pendingAction) { box.classList.remove('show'); box.innerHTML = ''; return; }
  const c = state.pendingAction.cue;
  box.classList.add('show');
  box.innerHTML = `<div><strong>等待確認：</strong>${escapeHtml(c.trigger)}<br><span class="small">動作：${escapeHtml(actionText(c))}</span></div><div class="row"><button class="btn small primary" id="confirmPendingBtn">確認跳頁</button><button class="btn small" id="cancelPendingBtn">取消</button></div>`;
  $('#confirmPendingBtn').addEventListener('click', () => { const pending = state.pendingAction; state.pendingAction = null; renderPending(); const cue = { ...pending.cue }; if (cue.action === 'confirm') cue.action = cue.target ? 'goto_slide' : 'next_slide'; const ok = executeAction(cue, pending.source + '｜確認'); if (ok === true) { state.lastTriggerAt = Date.now(); const mode = getTriggerMode(); if (Number.isInteger(pending.cue.index) && ((mode === 'sequential' && pending.cue.index === state.cueIndex) || (mode === 'smart' && pending.cue.index >= state.cueIndex))) state.cueIndex = pending.cue.index + 1; renderStage(); renderProjectPreview(); } });
  $('#cancelPendingBtn').addEventListener('click', () => { state.pendingAction = null; renderPending(); log('已取消 pending action', 'warn'); });
}

function findKeywordMatch(transcripts) {
  if (!state.cueModes.has('keyword')) return null;
  let candidates;
  const mode = getTriggerMode();
  if (mode === 'sequential') {
    const idx = nextEnabledCueIndex(state.cueIndex);
    candidates = idx >= 0 ? [{ ...state.cues[idx], index: idx }] : [];
  } else if (mode === 'smart') {
    // Search current and future cues only. This keeps order safety but allows recovery
    // if an earlier cue was missed or the operator starts testing from a later agenda.
    candidates = state.cues.map((c, i) => ({ ...c, index: i })).filter(c => c.enabled !== false && c.index >= state.cueIndex);
  } else candidates = enabledCues();
  let best = null;
  for (const cue of candidates) for (const spoken of transcripts) {
    for (const alt of triggerAlternatives(cue.trigger)) {
      const s = matchScore(alt, spoken);
      if (!best || s > best.score) best = { type: 'keyword', cue, index: cue.index, spoken, score: s, matchedText: alt };
    }
  }
  return best;
}
function updateTranscriptPosition(transcripts) {
  if (!state.cueModes.has('transcript') || !state.scriptLines.length) return null;
  const start = Math.max(0, state.scriptIndex - 1), end = Math.min(state.scriptLines.length, state.scriptIndex + 10);
  let best = null;
  for (let i = start; i < end; i++) for (const spoken of transcripts) {
    const s = matchScore(state.scriptLines[i].text, spoken);
    if (!best || s > best.score) best = { index: i, line: state.scriptLines[i], spoken, score: s };
  }
  if (best && best.score >= Math.max(72, getThreshold() - 8)) { state.scriptIndex = best.index; log(`逐字稿位置：第 ${best.index + 1} 行｜分數 ${best.score}`, 'ok'); renderScriptLines(); }
  return best;
}
function extractTitlePhrases(spoken) {
  const s = String(spoken || '');
  const patterns = [/(?:大家可以|請大家|請|可以)?參閱\s*([^，。,.!?！？]{1,24})/g,/(?:接下來|現在)?(?:進入|去到)\s*([^，。,.!?！？]{1,24})/g,/(?:請大家|請|大家)?(?:看|睇)\s*([^，。,.!?！？]{1,24})/g,/(?:以下是|以下為)\s*([^，。,.!?！？]{1,24})/g];
  const out = [];
  for (const re of patterns) { let m; while ((m = re.exec(s))) out.push(m[1].trim()); }
  return out;
}
function findTitleLockMatch(transcripts) {
  if (!state.cueModes.has('titleLock') || !state.slideTitles.length) return null;
  let best = null;
  for (const spoken of transcripts) for (const phrase of extractTitlePhrases(spoken)) {
    const b = findTitleTarget(phrase);
    if (!best || b.score > best.score) best = { type: 'titleLock', phrase, spoken, ...b };
  }
  return best;
}
function processTranscripts(transcripts, source = 'final', quiet = false) {
  transcripts = transcripts.filter(Boolean); if (!transcripts.length) return;
  state.lastHeard = transcripts.join(' / '); $('#overlayHeard').textContent = state.lastHeard;
  if (!quiet) log(`聽到：${state.lastHeard}`, 'listen');
  if (Date.now() - state.lastTriggerAt < getCooldownMs()) { if (!quiet) log('冷卻中，略過', 'warn'); return; }
  updateTranscriptPosition(transcripts);
  const keyword = findKeywordMatch(transcripts), titleLock = findTitleLockMatch(transcripts);
  let chosen = null;
  const keywordNeeded = keyword ? (source === 'interim' ? Math.min(96, (keyword.cue.threshold || getThreshold()) + 6) : (keyword.cue.threshold || getThreshold())) : 0;
  const titleNeeded = source === 'interim' ? Math.min(96, getThreshold() + 6) : getThreshold();
  if (keyword && keyword.score >= keywordNeeded) chosen = keyword;
  else if (titleLock && titleLock.score >= titleNeeded) chosen = titleLock;
  if (!chosen) {
    if (!quiet) {
      const scores = [];
      if (keyword) scores.push(`keyword ${keyword.score}/${keywordNeeded}｜等待 Cue #${keyword.index + 1}「${keyword.matchedText || keyword.cue.trigger}」`);
      if (titleLock) scores.push(`title ${titleLock.score}/${titleNeeded}「${titleLock.phrase}」→ ${titleLock.title}`);
      log(`未觸發${scores.length ? '｜最佳 ' + scores.join('；') : ''}`);
    }
    return;
  }
  if (quiet) log(`即時辨識命中前文字：${state.lastHeard}`, 'listen');
  if (chosen.type === 'keyword') {
    log(`命中 Cue #${chosen.index + 1}｜分數 ${chosen.score}｜匹配「${chosen.matchedText || chosen.cue.trigger}」｜原 cue：${chosen.cue.trigger}`, 'ok');
    const ok = executeAction(chosen.cue, `語音 Cue #${chosen.index + 1}`);
    if (ok === true) {
      state.lastTriggerAt = Date.now();
      const mode = getTriggerMode();
      if ((mode === 'sequential' && chosen.index === state.cueIndex) || (mode === 'smart' && chosen.index >= state.cueIndex)) state.cueIndex = chosen.index + 1;
    }
    else if (ok === 'pending') { state.lastTriggerAt = Date.now(); }
  } else {
    const cue = { trigger: `參閱/標題鎖定：${chosen.phrase}`, action: 'goto_slide', target: String(chosen.slide), threshold: getThreshold() };
    log(`命中 Title Lock｜「${chosen.phrase}」→ 第 ${chosen.slide} 頁「${chosen.title}」｜分數 ${chosen.score}`, 'ok');
    const ok = executeAction(cue, 'Title Lock'); if (ok === true || ok === 'pending') state.lastTriggerAt = Date.now();
  }
  renderStage(); renderProjectPreview();
}

function startListening() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert('此瀏覽器不支援 Web Speech Recognition。請使用最新版 Chrome 或 Edge。'); log('瀏覽器不支援 Web Speech Recognition', 'bad'); return; }
  if (state.listening) return;
  state.recognition = new SR();
  state.recognition.lang = $('#speechLang')?.value || 'zh-HK';
  state.recognition.continuous = true;
  state.recognition.interimResults = true;
  state.recognition.maxAlternatives = Number($('#maxAlternatives')?.value || 3);
  state.recognition.onstart = () => { state.listening = true; log(`開始聆聽｜${state.recognition.lang}`, 'ok'); render(); };
  state.recognition.onerror = e => { const err = e.error || 'unknown'; log(`語音辨識錯誤：${err}`, err === 'not-allowed' ? 'bad' : 'warn'); if (err === 'not-allowed' || err === 'service-not-allowed') state.listening = false; renderStage(); };
  state.recognition.onend = () => { if (state.listening) setTimeout(() => { try { state.recognition && state.recognition.start(); } catch (_) {} }, 350); else render(); };
  state.recognition.onresult = event => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i], candidates = [];
      for (let j = 0; j < res.length; j++) candidates.push(res[j].transcript.trim());
      if (res.isFinal) {
        clearTimeout(state.interimTimer);
        processTranscripts(candidates, 'final', false);
      } else if (candidates[0]) {
        $('#overlayHeard').textContent = candidates[0] + '（辨識中）';
        clearTimeout(state.interimTimer);
        const snapshot = candidates.slice();
        // Some browsers show the correct interim text but delay/never emit a final result
        // for very short Cantonese cues such as 「議程一」. Try a quiet high-confidence
        // interim match after the text is stable for a short moment.
        state.interimTimer = setTimeout(() => processTranscripts(snapshot, 'interim', true), 650);
      }
    }
  };
  try { state.recognition.start(); } catch (err) { log(err.message || String(err), 'bad'); }
}
function stopListening() { state.listening = false; if (state.recognition) { try { state.recognition.stop(); } catch (_) {} } state.recognition = null; log('已停止聆聽'); render(); }
function toggleFullscreen() { const st = $('#stage'); if (document.fullscreenElement) document.exitFullscreen().catch(()=>{}); else st.requestFullscreen().catch(err => log(err.message || String(err), 'warn')); }
function setProjectorMode(on) {
  document.body.classList.toggle('projector-mode', !!on);
  if (on) {
    if (state.step !== 4) state.step = 4;
    log('已進入投影模式。建議再按 F11 隱藏瀏覽器工具列；按 P 或 Esc 離開投影模式。', 'ok');
  } else {
    document.body.classList.remove('show-overlay');
    log('已離開投影模式');
  }
  render();
}
function toggleProjectorMode() { setProjectorMode(!document.body.classList.contains('projector-mode')); }

function wireEvents() {
  $$('.choice').forEach(c => c.addEventListener('click', () => { state.appMode = c.dataset.appMode; render(); }));
  $$('[data-step-jump]').forEach(btn => btn.addEventListener('click', () => setStep(Number(btn.dataset.stepJump))));
  $('#prevStepBtn').addEventListener('click', () => setStep(state.step - 1));
  $('#nextStepBtn').addEventListener('click', () => state.step === steps.length - 1 ? setStep(0) : setStep(state.step + 1));
  ['importProjectTopBtn','importProjectHeroBtn','importProjectStepBtn'].forEach(id => $('#' + id).addEventListener('click', () => $('#projectFileInput').click()));
  $('#projectFileInput').addEventListener('change', e => importProjectFile(e.target.files && e.target.files[0]));
  $('#downloadProjectTopBtn').addEventListener('click', downloadProject);
  $('#downloadProjectBtn').addEventListener('click', downloadProject);
  $('#copyProjectBtn').addEventListener('click', async () => { try { await navigator.clipboard.writeText(JSON.stringify(buildProject(), null, 2)); alert('已複製 Project JSON'); } catch (_) { alert('未能複製，請手動選取。'); } });
  $('#slideFolderInput').addEventListener('change', e => loadSlideFiles(e.target.files, '資料夾選擇'));
  $('#slideFilesInput').addEventListener('change', e => loadSlideFiles(e.target.files, '手動多檔選擇'));
  const slideDropZone = $('#slideDropZone');
  if (slideDropZone) {
    ['dragenter', 'dragover'].forEach(evt => slideDropZone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); slideDropZone.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach(evt => slideDropZone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); slideDropZone.classList.remove('dragover'); }));
    slideDropZone.addEventListener('drop', async e => loadSlideFiles(await filesFromDrop(e.dataTransfer), '拖放'));
  }
  $('#scriptFileInput').addEventListener('change', async e => { const f = e.target.files && e.target.files[0]; if (f) { const text = await f.text(); $('#scriptText').value = text; parseScript(text); } });
  $('#parseScriptBtn').addEventListener('click', () => parseScript($('#scriptText').value));
  $('#loadSampleBtn').addEventListener('click', () => { $('#scriptText').value = sampleScript; parseScript(sampleScript); });
  $('#cueCsvInput').addEventListener('change', async e => { const f = e.target.files && e.target.files[0]; if (f) importCueCsv(await f.text()); });
  $$('.mode-card').forEach(c => c.addEventListener('click', () => { const m = c.dataset.cueMode; if (state.cueModes.has(m)) { if (state.cueModes.size > 1) state.cueModes.delete(m); } else state.cueModes.add(m); render(); }));
  ['triggerMode','speechLang','defaultThreshold','cooldownSeconds','titleWindow','maxAlternatives'].forEach(id => { const el = $('#' + id); if (el) el.addEventListener('change', updateDerived); });
  $('#addCueBtn').addEventListener('click', () => { state.cues.push({ enabled: true, trigger: '請輸入觸發句子', action: 'goto_slide', target: String(Math.min(state.slides.length || 13, Math.max(1, state.currentSlide || 1))), threshold: getThreshold() }); render(); });
  $('#suggestCueBtn').addEventListener('click', () => {
    const src = state.scriptLines.length ? state.scriptLines.map(x => x.text) : sampleScript.split('\n').map(x => x.trim()).filter(Boolean);
    const picked = src.filter(t => /正式開始|宣佈通過|無未了事項|議程[一二三四五六七八九十]|圓滿結束|大合照|參閱附件/.test(t)).slice(0, 18);
    state.cues = picked.map(t => ({ enabled: true, trigger: t.replace(/^[^：:]+[:：]/, ''), action: 'goto_slide', target: String(suggestSlideFromText(t)), threshold: getThreshold() }));
    render(); log(`已自動建議 ${state.cues.length} 個 cue`, 'ok');
  });
  $('#exportCsvBtn').addEventListener('click', exportCueCsv);
  $('#prevSlideBtn').addEventListener('click', prevSlide);
  $('#nextSlideBtn').addEventListener('click', nextSlide);
  $('#fullscreenBtn').addEventListener('click', toggleFullscreen);
  $('#projectorModeBtn').addEventListener('click', toggleProjectorMode);
  $('#stage').addEventListener('mousemove', () => {
    if (document.body.classList.contains('projector-mode')) {
      document.body.classList.add('show-overlay');
      clearTimeout(window.__vcOverlayTimer);
      window.__vcOverlayTimer = setTimeout(() => document.body.classList.remove('show-overlay'), 1600);
    }
  });
  $('#slideFitMode').addEventListener('change', e => { state.slideFitMode = e.target.value; renderStage(); renderProjectPreview(); });
  $('#startListenBtn').addEventListener('click', startListening);
  $('#stopListenBtn').addEventListener('click', stopListening);
  $('#resetCueProgressBtn').addEventListener('click', () => { state.cueIndex = 0; state.scriptIndex = 0; state.lastTriggerAt = 0; log('已重設 cue 進度', 'ok'); render(); });
  $('#manualTestBtn').addEventListener('click', () => processTranscripts([$('#manualHeardInput').value]));
  $('#clearLogBtn').addEventListener('click', () => $('#logBox').textContent = '');
  document.addEventListener('keydown', e => {
    const tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
    if (['input','textarea','select'].includes(tag)) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); nextSlide(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prevSlide(); }
    else if (e.key === 'Escape' && document.body.classList.contains('projector-mode')) { e.preventDefault(); setProjectorMode(false); }
    else if (e.key.toLowerCase() === 'f') { e.preventDefault(); toggleFullscreen(); }
    else if (e.key.toLowerCase() === 'p') { e.preventDefault(); toggleProjectorMode(); }
    else if (e.key === ' ') { e.preventDefault(); state.listening ? stopListening() : startListening(); }
    else if (/^[0-9]$/.test(e.key)) { state.numberBuffer = (state.numberBuffer + e.key).slice(-4); log(`頁碼輸入：${state.numberBuffer}`); }
    else if (e.key === 'Enter' && state.numberBuffer) { const n = Number(state.numberBuffer); state.numberBuffer = ''; gotoSlide(n, '鍵盤頁碼'); }
  });
}

wireEvents();
render();
log('準備完成。建議先載入示例或選擇 slides，再測試 cue。');
