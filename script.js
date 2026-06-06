// ==================== CODEMIRROR SETUP ====================
const editor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
  lineNumbers: true,
  mode: 'python',
  theme: 'dracula',
  tabSize: 4,
  indentUnit: 4,
  autofocus: true,
  lineWrapping: true,
  viewportMargin: Infinity
});

// Live status bar updates
editor.on('cursorActivity', () => {
  const c = editor.getCursor();
  document.getElementById('line-col').textContent = `Ln ${c.line + 1}, Col ${c.ch + 1}`;
});

editor.on('change', () => {
  document.getElementById('char-count').textContent = `${editor.getValue().length} chars`;
});

// Init char count on load
document.getElementById('char-count').textContent = `${editor.getValue().length} chars`;


// ==================== DOM REFS ====================
const analyzeBtn    = document.getElementById('analyze-btn');
const placeholder   = document.getElementById('placeholder');
const loader        = document.getElementById('loader');
const resultSection = document.getElementById('result-section');
const respTime      = document.getElementById('resp-time');
const tokenDisplay  = document.getElementById('token-display');


// ==================== STATE HELPERS ====================
function showPlaceholder() {
  placeholder.style.display = 'flex';
  loader.classList.remove('active');
  resultSection.classList.remove('active');
}

function showLoader() {
  placeholder.style.display = 'none';
  loader.classList.add('active');
  resultSection.classList.remove('active');
}

function showResult() {
  placeholder.style.display = 'none';
  loader.classList.remove('active');
  resultSection.classList.add('active');
}


// ==================== CLAUDE API CALL ====================
async function analyzeCode() {
  const code = editor.getValue().trim();
  if (!code) { showPlaceholder(); return; }

  showLoader();
  analyzeBtn.disabled = true;
  respTime.textContent = '';
  tokenDisplay.textContent = '';

  const t0 = Date.now();

  const prompt = `You are a friendly AI coding tutor. Analyze this Python code carefully.

Return ONLY a valid JSON object with this exact structure (no extra text, no markdown fences):
{
  "error_type": "SyntaxError" | "LogicError" | "RuntimeError" | "NameError" | "TypeError" | "No Error",
  "severity": "high" | "medium" | "low" | "none",
  "summary": "one-sentence summary of the issue",
  "steps": [
    {
      "title": "short step title",
      "body": "detailed explanation of this step",
      "fixed_code": "corrected code snippet or empty string if not applicable"
    }
  ]
}

Python code to analyze:
\`\`\`python
${code}
\`\`\``;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API ${response.status}: ${err.slice(0, 200)}`);
    }

    const data = await response.json();
    const rawText = data?.content?.[0]?.text || '';
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    // Strip markdown fences if AI added them
    let parsed;
    try {
      const clean = rawText.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      throw new Error('AI returned unexpected format. Please try again.');
    }

    // Show response time and token usage
    respTime.textContent = `${elapsed}s`;
    if (data.usage) {
      tokenDisplay.textContent = `${data.usage.input_tokens + data.usage.output_tokens} tokens`;
    }

    renderResult(parsed);

  } catch (err) {
    showResult();
    resultSection.innerHTML = `
      <div class="err-banner">
        <span>⚠️</span>
        <div>
          <strong>Request failed</strong><br>
          ${escapeHTML(err.message)}
        </div>
      </div>`;
  } finally {
    analyzeBtn.disabled = false;
  }
}


// ==================== UI RENDERING ====================
function renderResult({ error_type, severity, summary, steps }) {
  const isOk      = error_type === 'No Error';
  const badgeClass = isOk ? 'badge-ok' : (severity === 'high' ? 'badge-error' : 'badge-warn');
  const badgeIcon  = isOk ? '✅' : (severity === 'high' ? '🔴' : '🟡');

  let html = `
    <div class="badge ${badgeClass}">
      ${badgeIcon} ${escapeHTML(error_type || 'Analysis')}
    </div>
    <p style="color:var(--muted); font-size:.82rem; margin-bottom:1.2rem; line-height:1.6;">
      ${escapeHTML(summary || '')}
    </p>
    <ul class="step-list">
  `;

  (steps || []).forEach((step, i) => {
    const delay = i * 0.06;
    html += `
      <li class="step-item" style="animation-delay:${delay}s">
        <div class="step-num">${i + 1}</div>
        <div style="flex:1">
          <div style="font-weight:700; color:var(--text); margin-bottom:.35rem; font-size:.85rem;">
            ${escapeHTML(step.title || '')}
          </div>
          <div>${escapeHTML(step.body || '')}</div>
          ${step.fixed_code
            ? `<div class="fixed-code">${escapeHTML(step.fixed_code)}</div>`
            : ''
          }
        </div>
      </li>
    `;
  });

  html += `</ul>`;
  resultSection.innerHTML = html;
  showResult();
}


// ==================== XSS PROTECTION ====================
function escapeHTML(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}


// ==================== EVENT LISTENERS ====================
analyzeBtn.addEventListener('click', analyzeCode);

// Ctrl + Enter shortcut
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    analyzeCode();
  }
});
