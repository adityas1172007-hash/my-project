// ==================== GEMINI API CONFIGURATION ====================
// IMPORTANT: Replace with your actual Gemini API key
// Get your key from https://aistudio.google.com/app/apikey
const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY'; // <-- SET YOUR KEY HERE

// ==================== CODEMIRROR SETUP (Fixed Theme & Missing Elements) ====================
const editor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
  lineNumbers: true,
  mode: 'python',
  theme: 'monokai',           // Fixed: matches CSS theme (was 'dracula')
  tabSize: 4,
  indentUnit: 4,
  autofocus: true,
  lineWrapping: true,
  viewportMargin: Infinity
});

// Helper: Ensure UI elements exist (line-col, token-display)
function ensureDynamicElements() {
  // Add Line/Col display to Code cell header if missing
  if (!document.getElementById('line-col')) {
    const codeCellMeta = document.querySelector('.code-cell .cell-meta');
    if (codeCellMeta) {
      const lineColSpan = document.createElement('span');
      lineColSpan.id = 'line-col';
      lineColSpan.style.marginLeft = '12px';
      lineColSpan.style.fontFamily = 'var(--font-mono)';
      lineColSpan.textContent = 'Ln 1, Col 1';
      codeCellMeta.appendChild(lineColSpan);
    }
  }
  
  // Add Token display to Output cell header if missing
  if (!document.getElementById('token-display')) {
    const outputCellMeta = document.querySelector('.output-cell .cell-meta');
    if (outputCellMeta) {
      const tokenSpan = document.createElement('span');
      tokenSpan.id = 'token-display';
      tokenSpan.style.marginLeft = '12px';
      tokenSpan.innerHTML = '<i class="fas fa-coins"></i> <span>0 tokens</span>';
      outputCellMeta.appendChild(tokenSpan);
    } else {
      // Fallback: create in resp-time parent
      const respTimeParent = document.getElementById('resp-time')?.parentNode;
      if (respTimeParent && !document.getElementById('token-display')) {
        const tokenSpan = document.createElement('span');
        tokenSpan.id = 'token-display';
        tokenSpan.style.marginLeft = '12px';
        tokenSpan.innerHTML = '<i class="fas fa-coins"></i> <span>0 tokens</span>';
        respTimeParent.appendChild(tokenSpan);
      }
    }
  }
}

// Update live line/col & char count
function updateStatusBar() {
  const cursor = editor.getCursor();
  const lineColElem = document.getElementById('line-col');
  if (lineColElem) {
    lineColElem.textContent = `Ln ${cursor.line + 1}, Col ${cursor.ch + 1}`;
  }
  const charCountElem = document.getElementById('char-count');
  if (charCountElem) {
    charCountElem.textContent = `${editor.getValue().length} chars`;
  }
}

editor.on('cursorActivity', updateStatusBar);
editor.on('change', updateStatusBar);

// Init UI
ensureDynamicElements();
updateStatusBar();

// ==================== DOM REFS ====================
const analyzeBtn    = document.getElementById('analyze-btn');
const placeholder   = document.getElementById('placeholder');
const loader        = document.getElementById('loader');
const resultSection = document.getElementById('result-section');
const respTime      = document.getElementById('resp-time');

// Helper to update token display
function updateTokenDisplay(tokens) {
  const tokenSpan = document.getElementById('token-display');
  if (tokenSpan) {
    tokenSpan.innerHTML = `<i class="fas fa-coins"></i> <span>${tokens} tokens</span>`;
  }
}

// ==================== UI STATE HELPERS ====================
function showPlaceholder() {
  if (placeholder) placeholder.style.display = 'flex';
  if (loader) loader.style.display = 'none';
  if (resultSection) {
    resultSection.style.display = 'none';
    resultSection.innerHTML = '';
  }
}

function showLoader() {
  if (placeholder) placeholder.style.display = 'none';
  if (loader) loader.style.display = 'flex';
  if (resultSection) {
    resultSection.style.display = 'none';
    resultSection.innerHTML = '';
  }
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

  // Check for API key
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY') {
    showResult();
    resultSection.innerHTML = `
      <div class="err-banner" style="background:rgba(242,139,130,0.15); border-left:4px solid #f28b82; padding:16px; border-radius:8px;">
        <i class="fas fa-key" style="color:#f28b82; margin-right:10px;"></i>
        <strong>API Key Missing</strong><br>
        Please set your valid Gemini API key in the script.js file (GEMINI_API_KEY variable).
      </div>`;
    return;
  }

  showLoader();
  analyzeBtn.disabled = true;
  respTime.textContent = '';
  updateTokenDisplay(0);

  const t0 = Date.now();

  // System prompt enforcing strict JSON output
  const systemInstruction = `You are an expert Python code analyzer. Analyze the given Python code and return ONLY valid JSON.
Strictly follow this exact JSON schema (no extra text, no markdown formatting):
{
  "error_type": "SyntaxError" | "LogicError" | "RuntimeError" | "NameError" | "TypeError" | "No Error",
  "severity": "high" | "medium" | "low" | "none",
  "summary": "one-sentence summary of the issue",
  "steps": [
    {
      "title": "short step title",
      "body": "detailed explanation",
      "fixed_code": "corrected code snippet or empty string"
    }
  ]
}
If code has no errors, use "No Error", severity "none", and provide optimization tips in steps.`;

  const userPrompt = `Python code to analyze:
\`\`\`python
${code}
\`\`\``;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: [{
          parts: [{ text: userPrompt }]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errData = await response.text();
      throw new Error(`Gemini API Error (${response.status}): ${errData.slice(0, 200)}`);
    }

    const data = await response.json();
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    respTime.textContent = `${elapsed}s`;

    // Extract token usage if available
    const usage = data?.usageMetadata;
    if (usage) {
      const totalTokens = (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0);
      updateTokenDisplay(totalTokens);
    }

    // Extract the JSON response from Gemini
    let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!rawText) throw new Error('Empty response from Gemini');

    // Clean possible markdown fences
    let cleanJson = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    let parsed = JSON.parse(cleanJson);
    
    // Validate required fields
    if (!parsed.error_type || !parsed.severity || !parsed.summary || !Array.isArray(parsed.steps)) {
      throw new Error('Incomplete JSON structure from AI');
    }
    
    renderResult(parsed);
  } catch (err) {
    console.error(err);
    showResult();
    resultSection.innerHTML = `
      <div class="err-banner" style="background:rgba(242,139,130,0.15); border-left:4px solid #f28b82; padding:16px; border-radius:8px;">
        <i class="fas fa-exclamation-triangle" style="color:#f28b82; margin-right:10px;"></i>
        <strong>Analysis Failed</strong><br>
        ${escapeHTML(err.message)}
        <div style="font-size:0.75rem; margin-top:8px; color:#9aa0a6;">Please check API key or network connection.</div>
      </div>`;
  } finally {
    analyzeBtn.disabled = false;
  }
}

// ==================== RENDER RESULT (Enhanced with fixed code styling) ====================
function renderResult({ error_type, severity, summary, steps }) {
  const isOk = error_type === 'No Error';
  let badgeClass = 'badge-ok';
  let badgeIcon = '✅';
  
  if (!isOk) {
    if (severity === 'high') {
      badgeClass = 'badge-error';
      badgeIcon = '🔴';
    } else {
      badgeClass = 'badge-warn';
      badgeIcon = '🟡';
    }
  }
  
  let html = `
    <div class="badge ${badgeClass}" style="display:inline-flex; align-items:center; gap:6px; margin-bottom:12px;">
      ${badgeIcon} ${escapeHTML(error_type)}
    </div>
    <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:20px; line-height:1.6;">
      ${escapeHTML(summary)}
    </p>
    <ul class="step-list" style="list-style:none; margin:0; padding:0;">
  `;
  
  (steps || []).forEach((step, idx) => {
    html += `
      <li style="background:var(--bg-cell); border:1px solid var(--border-color); border-left:3px solid var(--accent-color); border-radius:6px; margin-bottom:12px; padding:14px; transition:all 0.1s;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
          <span style="background:var(--accent-color); color:#121212; width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center; border-radius:20px; font-size:0.75rem; font-weight:bold;">${idx+1}</span>
          <strong style="color:var(--text-main); font-size:0.9rem;">${escapeHTML(step.title)}</strong>
        </div>
        <div style="color:var(--text-muted); font-size:0.85rem; line-height:1.5; margin-bottom:${step.fixed_code ? '12px' : '0'};">
          ${escapeHTML(step.body)}
        </div>
        ${step.fixed_code ? `
          <div style="background:#0a0a0a; border-radius:6px; padding:12px; margin-top:10px; font-family:var(--font-mono); font-size:0.8rem; overflow-x:auto; border:1px solid #333;">
            <i class="fas fa-code" style="color:var(--accent-color); margin-right:8px;"></i>
            <span style="color:#81c995;">Fixed code:</span>
            <pre style="margin:8px 0 0 0; white-space:pre-wrap; word-break:break-word;">${escapeHTML(step.fixed_code)}</pre>
          </div>
        ` : ''}
      </li>
    `;
  });
  
  html += `</ul>`;
  resultSection.innerHTML = html;
  showResult();
}

// ==================== XSS PROTECTION ====================
function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

// ==================== EVENT LISTENERS ====================
analyzeBtn.addEventListener('click', analyzeCode);

// Ctrl+Enter (Cmd+Enter on Mac) shortcut
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    analyzeCode();
  }
});

// ==================== INJECT MISSING CSS STYLES (for badge-warn, fixed-code) ====================
const styleInject = document.createElement('style');
styleInject.textContent = `
  .badge-warn {
    background-color: rgba(251, 188, 4, 0.15);
    color: #fbbc04;
    border: 1px solid rgba(251, 188, 4, 0.3);
    padding: 4px 12px;
    border-radius: 20px;
    font-weight: 600;
    font-size: 0.75rem;
  }
  .badge-error {
    background-color: rgba(242, 139, 130, 0.15);
    color: #f28b82;
    border: 1px solid rgba(242, 139, 130, 0.3);
    padding: 4px 12px;
    border-radius: 20px;
    font-weight: 600;
    font-size: 0.75rem;
  }
  .badge-ok {
    background-color: rgba(129, 201, 149, 0.15);
    color: #81c995;
    border: 1px solid rgba(129, 201, 149, 0.3);
    padding: 4px 12px;
    border-radius: 20px;
    font-weight: 600;
    font-size: 0.75rem;
  }
  #result-section {
    display: block;
  }
  .err-banner i {
    margin-right: 8px;
  }
`;
document.head.appendChild(styleInject);

// Initial placeholder display
showPlaceholder();
