// ==================== GEMINI API KEY (PROVIDED BY USER) ====================
const GEMINI_API_KEY = 'AQ.Ab8RN6Ks8OIYZv7ykJDgGEcjxynXxBcntAaAUhaous_6ZeoDGA';

// ==================== CODEMIRROR SETUP ====================
const editor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
  lineNumbers: true,
  mode: 'python',
  theme: 'monokai',
  tabSize: 4,
  indentUnit: 4,
  autofocus: true,
  lineWrapping: true,
  viewportMargin: Infinity
});

// Helper: Add line-col and token-display if missing
function ensureDynamicElements() {
  if (!document.getElementById('line-col')) {
    const meta = document.querySelector('.code-cell .cell-meta');
    if (meta) {
      const span = document.createElement('span');
      span.id = 'line-col';
      span.textContent = 'Ln 1, Col 1';
      meta.appendChild(span);
    }
  }
  if (!document.getElementById('token-display')) {
    const outputMeta = document.querySelector('.output-cell .cell-meta');
    if (outputMeta) {
      const tokenSpan = document.createElement('span');
      tokenSpan.id = 'token-display';
      tokenSpan.innerHTML = '<i class="fas fa-coins"></i> <span>0 tokens</span>';
      outputMeta.appendChild(tokenSpan);
    }
  }
}

function updateStatusBar() {
  const cursor = editor.getCursor();
  const lineCol = document.getElementById('line-col');
  if (lineCol) lineCol.textContent = `Ln ${cursor.line + 1}, Col ${cursor.ch + 1}`;
  const charCount = document.getElementById('char-count');
  if (charCount) charCount.textContent = `${editor.getValue().length} chars`;
}

editor.on('cursorActivity', updateStatusBar);
editor.on('change', updateStatusBar);

ensureDynamicElements();
updateStatusBar();

// DOM elements
const analyzeBtn = document.getElementById('analyze-btn');
const placeholder = document.getElementById('placeholder');
const loader = document.getElementById('loader');
const resultSection = document.getElementById('result-section');
const respTime = document.getElementById('resp-time');

function updateTokenDisplay(tokens) {
  const tokenSpan = document.getElementById('token-display');
  if (tokenSpan) tokenSpan.innerHTML = `<i class="fas fa-coins"></i> <span>${tokens} tokens</span>`;
}

function showPlaceholder() {
  if (placeholder) placeholder.style.display = 'flex';
  if (loader) loader.style.display = 'none';
  if (resultSection) { resultSection.style.display = 'none'; resultSection.innerHTML = ''; }
}

function showLoader() {
  if (placeholder) placeholder.style.display = 'none';
  if (loader) loader.style.display = 'flex';
  if (resultSection) { resultSection.style.display = 'none'; resultSection.innerHTML = ''; }
}

function showResult() {
  if (placeholder) placeholder.style.display = 'none';
  if (loader) loader.style.display = 'none';
  if (resultSection) resultSection.style.display = 'block';
}

// ==================== GEMINI API CALL ====================
async function analyzeCode() {
  const code = editor.getValue().trim();
  if (!code) {
    showPlaceholder();
    return;
  }

  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY') {
    showResult();
    resultSection.innerHTML = `
      <div class="err-banner">
        <i class="fas fa-key"></i> <strong>API Key Missing</strong><br>
        Please set your valid Gemini API key in script.js.
      </div>`;
    return;
  }

  showLoader();
  analyzeBtn.disabled = true;
  respTime.textContent = '';
  updateTokenDisplay(0);
  const t0 = Date.now();

  const systemInstruction = `You are an expert Python code analyzer. Return ONLY valid JSON with this exact schema:
{
  "error_type": "SyntaxError" | "LogicError" | "RuntimeError" | "NameError" | "TypeError" | "No Error",
  "severity": "high" | "medium" | "low" | "none",
  "summary": "one-sentence summary",
  "steps": [
    { "title": "step title", "body": "explanation", "fixed_code": "corrected code or empty string" }
  ]
}
No extra text, no markdown.`;

  const userPrompt = `Python code:\n\`\`\`python\n${code}\n\`\`\``;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: "application/json" }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API Error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    respTime.textContent = `${elapsed}s`;

    const usage = data?.usageMetadata;
    if (usage) {
      const total = (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0);
      updateTokenDisplay(total);
    }

    let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!rawText) throw new Error('Empty response from Gemini');
    
    let cleanJson = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    let parsed = JSON.parse(cleanJson);
    
    if (!parsed.error_type || !parsed.severity || !parsed.summary || !Array.isArray(parsed.steps)) {
      throw new Error('Invalid JSON structure from AI');
    }
    
    renderResult(parsed);
  } catch (err) {
    console.error(err);
    showResult();
    resultSection.innerHTML = `
      <div class="err-banner">
        <i class="fas fa-exclamation-triangle"></i> <strong>Analysis Failed</strong><br>
        ${escapeHTML(err.message)}
      </div>`;
  } finally {
    analyzeBtn.disabled = false;
  }
}

function renderResult({ error_type, severity, summary, steps }) {
  const isOk = error_type === 'No Error';
  let badgeClass = 'badge-ok', badgeIcon = '✅';
  if (!isOk) {
    if (severity === 'high') { badgeClass = 'badge-error'; badgeIcon = '🔴'; }
    else { badgeClass = 'badge-warn'; badgeIcon = '🟡'; }
  }
  
  let html = `<div class="${badgeClass}">${badgeIcon} ${escapeHTML(error_type)}</div>`;
  html += `<p style="color:var(--text-muted); margin-bottom:20px;">${escapeHTML(summary)}</p><ul class="step-list">`;
  
  (steps || []).forEach((step, idx) => {
    html += `
      <li>
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
          <span style="background:var(--accent-color); color:#121212; width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center; border-radius:20px; font-size:0.75rem; font-weight:bold;">${idx+1}</span>
          <strong>${escapeHTML(step.title)}</strong>
        </div>
        <div style="margin-bottom:${step.fixed_code ? '12px' : '0'};">${escapeHTML(step.body)}</div>
        ${step.fixed_code ? `
          <div class="fixed-code-block">
            <i class="fas fa-code" style="color:var(--accent-color); margin-right:8px;"></i>
            <span style="color:#81c995;">Fixed code:</span>
            <pre style="margin:8px 0 0 0; white-space:pre-wrap;">${escapeHTML(step.fixed_code)}</pre>
          </div>
        ` : ''}
      </li>
    `;
  });
  html += `</ul>`;
  resultSection.innerHTML = html;
  showResult();
}

function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

analyzeBtn.addEventListener('click', analyzeCode);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    analyzeCode();
  }
});

showPlaceholder();
