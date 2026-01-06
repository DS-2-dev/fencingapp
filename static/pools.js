document.addEventListener('DOMContentLoaded', () => {
  const poolBtn = document.querySelector('.pool-btn');
  const moveFencerBtn = document.querySelector('.move-fencer-btn');
  const advancementBtn = document.querySelector('.advancement-btn');
  const connectDeviceBtn = document.querySelector('.connect-device-btn');
  const printBtn = document.querySelector('.print-btn');
  const displayModeBtn = document.querySelector('.display-mode-btn');
  const saveBtn = document.querySelector('.save-btn');
  const output = document.getElementById('pools-output');
  const removeBtn = document.querySelector('.remove-btn');
  const removeCopyBtn = document.querySelector('.remove-copy-btn');

  const SCORE_STORAGE_PREFIX = 'fencingapp:pool-scores:';

  let poolsDirty = false;
  let currentPoolIndex = 0; // Track which pool is currently displayed
  let allPools = []; // Store all loaded pools
  let poolRemoveMode = false;
  let poolMoveMode = false;
  // (No advancement cutoff by default) — advancement will be determined later if configured.

  // Local HTML escape helper (keeps pools.js self-contained)
  function escapeHtml(s) {
    return String(s).replace(/[&<>"'`]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',"`":'&#96;'})[c]);
  }

  // --- Print helpers: split order list into columns before printing ---
  function splitOrderForPrint(selector = '.order-list') {
    try {
      let list = document.querySelector(selector);
      // fallback: try common order containers if specific selector not present
      if (!list) {
        const fallbacks = ['.order', '#order-list', '.order-output', '.order-print', '.overall-order', '.pairings', '.pairing-list'];
        for (const s of fallbacks) {
          const el = document.querySelector(s);
          if (el && el.children && el.children.length > 6) { list = el; break; }
        }
      }
      if (!list) return null;
      // save original HTML so we can restore after print
      if (!list.dataset._origHtml) list.dataset._origHtml = list.innerHTML;
      const items = Array.from(list.children);
      if (items.length === 0) return null;

      const container = document.createElement('div');
      container.className = 'order-print-columns';

      let idx = 0;
      const firstCol = document.createElement('div');
      firstCol.className = 'col';
      for (; idx < Math.min(12, items.length); idx++) firstCol.appendChild(items[idx]);
      container.appendChild(firstCol);

      while (idx < items.length) {
        const col = document.createElement('div');
        col.className = 'col';
        for (let c = 0; c < 8 && idx < items.length; c++, idx++) {
          col.appendChild(items[idx]);
        }
        container.appendChild(col);
      }

      list.innerHTML = '';
      list.appendChild(container);
      return list;
    } catch (e) { console.error('splitOrderForPrint error', e); return null; }
  }

  function restoreOrderAfterPrint(selector = '.order-list') {
    try {
      let list = document.querySelector(selector);
      if (!list) {
        const fallbacks = ['.order', '#order-list', '.order-output', '.order-print', '.overall-order', '.pairings', '.pairing-list'];
        for (const s of fallbacks) {
          const el = document.querySelector(s);
          if (el && el.dataset && el.dataset._origHtml) { list = el; break; }
        }
      }
      if (!list) return;
      if (list.dataset._origHtml) {
        list.innerHTML = list.dataset._origHtml;
        delete list.dataset._origHtml;
      }
    } catch (e) { console.error('restoreOrderAfterPrint error', e); }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeprint', () => { splitOrderForPrint('.order-list'); });
    window.addEventListener('afterprint', () => { restoreOrderAfterPrint('.order-list'); });
    // also support matchMedia for some browsers
    try {
      const m = window.matchMedia('print');
      if (m) m.addListener((mq) => { if (mq.matches) splitOrderForPrint('.order-list'); else restoreOrderAfterPrint('.order-list'); });
    } catch (e) {}
  }

  function markDirty() {
    poolsDirty = true;
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.classList.remove('disabled');
    }
  }

  function markClean() {
    poolsDirty = false;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.classList.add('disabled');
    }
  }

  // Normalize nav-related body classes and nav button attributes when arriving at Pools page
  function normalizeNavOnLoad() {
    try {
      const body = document.body;
      if (!body) return;
      // Remove classes that other pages may have left behind
      ['summary-nav-disabled', 'checkin-nav-disabled', 'seeding-nav-muted'].forEach(c => { try { body.classList.remove(c); } catch(e){} });
      // Ensure Pools-specific state is initialized
      updatePoolsNavState();
      // If pools are complete, ensure Results nav is active
      const resultsBtn = document.querySelector('.results-btn');
      if (resultsBtn) {
        // Keep Results visually disabled on the universal nav regardless of pool completion
        resultsBtn.classList.add('disabled');
        try { resultsBtn.setAttribute('aria-disabled', 'true'); } catch(e){}
        try { resultsBtn.setAttribute('tabindex', '-1'); } catch(e){}
      }
    } catch (e) { console.error('normalizeNavOnLoad error', e); }
  }

  function scoreKey(poolIndex) {
    return `${SCORE_STORAGE_PREFIX}${poolIndex}`;
  }

  function ensureMatrix(size, existing) {
    const matrix = Array.from({ length: size }, (_, r) => {
      const row = existing && Array.isArray(existing[r]) ? existing[r] : [];
      return Array.from({ length: size }, (_, c) => (row[c] || ''));
    });
    return matrix;
  }

  function loadPoolScores(poolIndex, size) {
    try {
      const raw = sessionStorage.getItem(scoreKey(poolIndex));
      if (!raw) return ensureMatrix(size);
      const parsed = JSON.parse(raw);
      return ensureMatrix(size, parsed);
    } catch (e) {
      console.error('Failed to load pool scores', e);
      return ensureMatrix(size);
    }
  }

  function persistPoolScores(poolIndex, matrix) {
    try {
      sessionStorage.setItem(scoreKey(poolIndex), JSON.stringify(matrix));
    } catch (e) {
      console.error('Failed to save pool scores', e);
    }
  }

  // Update Pool button text to show current pool number
  function updatePoolButtonText() {
    if (poolBtn && allPools.length > 0) {
      poolBtn.textContent = `Pool ${currentPoolIndex + 1}`;
    }
  }

  // Check if the current pool is completely filled with valid scores
  function isPoolComplete() {
    if (!allPools || allPools.length === 0 || currentPoolIndex < 0 || currentPoolIndex >= allPools.length) {
      return false;
    }

    const pool = allPools[currentPoolIndex];
    const poolSize = pool.length;
    const scores = loadPoolScores(currentPoolIndex, poolSize);

    // Check each bout (upper triangle) for valid scores
    for (let rIdx = 0; rIdx < poolSize; rIdx++) {
      for (let cIdx = rIdx + 1; cIdx < poolSize; cIdx++) {
        const myScore = parseInt(scores[rIdx][cIdx] || '0', 10);
        const oppScore = parseInt(scores[cIdx][rIdx] || '0', 10);

        // At least one must be ≥5 (someone won)
        if (myScore < 5 && oppScore < 5) {
          return false;
        }

        // Scores must be different (no ties)
        if (myScore === oppScore) {
          return false;
        }
      }
    }

    return true;
  }

  // Update advancement button disabled state based on pool completion
  function updateAdvancementButtonState() {
    if (!advancementBtn) return;
    const allComplete = areAllPoolsComplete();
    if (allComplete) {
      advancementBtn.classList.remove('disabled');
      try { advancementBtn.removeAttribute('aria-disabled'); } catch(e){}
      try { advancementBtn.removeAttribute('disabled'); } catch(e){}
      try { advancementBtn.disabled = false; } catch(e){}
      // Ensure pointer events are allowed so the button is clickable
      try { advancementBtn.style.pointerEvents = 'auto'; } catch(e){}
      try { document.body.classList.add('advancement-ready'); } catch(e){}
      // Mirror activation logic used for DE nav: restore keyboard and visual state
      try {
        try { advancementBtn.removeAttribute('tabindex'); } catch(e){}
        advancementBtn.style.removeProperty('--sat');
        advancementBtn.style.removeProperty('--hue');
        advancementBtn.style.removeProperty('--fg');
        advancementBtn.style.removeProperty('--bg');
        advancementBtn.style.removeProperty('--bg-dark');
        advancementBtn.style.removeProperty('opacity');
        advancementBtn.style.removeProperty('cursor');
        advancementBtn.style.removeProperty('box-shadow');
        advancementBtn.style.removeProperty('border-color');
        advancementBtn.style.removeProperty('background');
        advancementBtn.style.removeProperty('z-index');
        advancementBtn.style.removeProperty('pointer-events');
      } catch (e) {}
    } else {
      advancementBtn.classList.add('disabled');
      advancementBtn.setAttribute('aria-disabled', 'true');
      advancementBtn.disabled = true;
      try { document.body.classList.remove('advancement-ready'); } catch(e){}
      try { advancementBtn.setAttribute('tabindex', '-1'); } catch(e){}
    }
  }

  // Compute ranking metrics across all pools and return sorted list
  function computeAdvancementList() {
    const entries = [];
    if (!Array.isArray(allPools) || allPools.length === 0) return entries;
    // For each pool, load scores and compute per-fencer stats
    for (let pIdx = 0; pIdx < allPools.length; pIdx++) {
      const pool = allPools[pIdx] || [];
      const size = pool.length;
      if (!size) continue;
      const scores = loadPoolScores(pIdx, size);
      for (let i = 0; i < size; i++) {
        const f = pool[i];
        const id = f && f.id ? f.id : `p${pIdx}-i${i}`;
        let V = 0; let TS = 0; let TR = 0; let Attempts = 0;
        for (let j = 0; j < size; j++) {
          if (i === j) continue;
          const a = parseInt(scores[i][j] || '0', 10) || 0;
          const b = parseInt(scores[j][i] || '0', 10) || 0;
          // Only count valid bouts (one score >=5 and scores differ)
          if ((a >= 5 || b >= 5) && a !== b) {
            Attempts += 1;
            TS += a;
            TR += b;
            if (a > b) V += 1;
          }
        }
        const VA = Attempts > 0 ? (V / Attempts) : 0;
        const Indicator = TS - TR;
        entries.push({ id, name: f && f.name ? f.name : '', seed: f && f.seed ? f.seed : null, poolIndex: pIdx, V, Attempts, VA, TS, TR, Indicator });
      }
    }
    // Sort by: Win percentage (VA) desc, Indicator (TS-TR) desc, Touches Scored (TS) desc
    entries.sort((a, b) => {
      if (b.VA !== a.VA) return b.VA - a.VA;
      if (b.Indicator !== a.Indicator) return b.Indicator - a.Indicator;
      if (b.TS !== a.TS) return b.TS - a.TS;
      return 0;
    });

    // After sorting, detect exact ties (VA, Indicator, TS equal). For tied blocks,
    // shuffle their internal order randomly (placement is random but they share seed).
    const N = entries.length;
    let i = 0;
    while (i < N) {
      let j = i;
      while (j + 1 < N && Math.abs(entries[j + 1].VA - entries[i].VA) < 1e-9 && entries[j + 1].Indicator === entries[i].Indicator && entries[j + 1].TS === entries[i].TS) {
        j++;
      }
      if (j > i) {
        // shuffle entries[i..j]
        for (let k = j; k > i; k--) {
          const r = i + Math.floor(Math.random() * (k - i + 1));
          const tmp = entries[k]; entries[k] = entries[r]; entries[r] = tmp;
        }
      }
      i = j + 1;
    }

    // Assign final seeding position (1..N), collapsing tied groups to the same position
    let pos = 1;
    i = 0;
    while (i < N) {
      let j = i;
      while (j + 1 < N && Math.abs(entries[j + 1].VA - entries[i].VA) < 1e-9 && entries[j + 1].Indicator === entries[i].Indicator && entries[j + 1].TS === entries[i].TS) {
        j++;
      }
      const groupSize = j - i + 1;
      if (groupSize === 1) {
        entries[i].finalSeedNum = pos;
        entries[i].finalSeedDisplay = String(pos);
      } else {
        // tied group: all get same position with 'T'
        for (let k = i; k <= j; k++) {
          entries[k].finalSeedNum = pos;
          entries[k].finalSeedDisplay = `${pos}T`;
        }
      }
      // mark advances (100% by default)
      for (let k = i; k <= j; k++) {
        entries[k].advances = true;
        entries[k].VApercent = entries[k].VA * 100;
      }
      pos += groupSize;
      i = j + 1;
    }
    return entries;
  }

  // Build a print-friendly HTML for pools and open print dialog
  // Generate round-robin pairings to ensure balanced bouts and prevent fatigue
  function generateRoundRobinPairings(fencers) {
    const pairings = [];
    const n = fencers.length;
    if (n < 2) return pairings;

    // For odd number, add a bye
    const hasBye = n % 2 === 1;
    const participants = [...fencers];
    if (hasBye) {
      participants.push({ seed: 'BYE', name: 'BYE' });
    }

    const total = participants.length;
    // Generate rounds using circle method
    for (let round = 0; round < total - 1; round++) {
      for (let i = 0; i < total / 2; i++) {
        const a = participants[i];
        const b = participants[total - 1 - i];
        if (a.seed !== 'BYE' && b.seed !== 'BYE') {
          pairings.push(`${a.seed} ${a.name} VS. ${b.seed} ${b.name}`);
        }
      }
      // Rotate: move last to second position
      const last = participants.pop();
      participants.splice(1, 0, last);
    }
    return pairings;
  }

  // Show connect device modal for remote scoring
  function showConnectDeviceModal() {
    try {
      if (!Array.isArray(allPools) || allPools.length === 0) {
        alert('No pools available to connect devices.');
        return;
      }

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.style.zIndex = 1220;

      const card = document.createElement('article');
      card.className = 'fencer-card modal-card add-fencer-modal connect-device-modal';
      card.style.maxWidth = '800px';

      // Pool buttons in grid
      const poolButtons = allPools.map((pool, idx) => {
        return `<button class="frutiger-aero-button pool-select-btn" data-pool-index="${idx}" style="--hue:280; justify-content:center;">Pool ${idx + 1} (${pool.length} Fencers)</button>`;
      }).join('');

      card.innerHTML = `
        <div class="fencer-row">
          <div class="fencer-left">
            <div class="fencer-name"><span style="font-size:1.12rem; font-weight:700;">Connect multiple Devices for remote scoring!</span></div>
            <div class="pool-buttons-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-top:12px;">
              ${poolButtons}
            </div>
            <div class="meta-actions" style="margin-top:14px; display:flex; gap:10px; justify-content:flex-end;">
              <button class="frutiger-aero-button modal-cancel">Cancel</button>
            </div>
          </div>
          <div class="fencer-right">
            <div class="qr-area" style="display:none; flex-direction:column; align-items:flex-start; gap:12px; margin-left:18px;">
              <div class="qr-code" style="width:200px; height:200px; border:2px solid #000; display:flex; align-items:center; justify-content:center; font-size:1.5rem;">QR Code Placeholder</div>
              <button class="frutiger-aero-button connection-status-btn" style="--hue:120;">Not Connected</button>
            </div>
          </div>
        </div>`;

      overlay.appendChild(card);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => { overlay.classList.add('modal-active'); card.classList.add('fade-enter-active'); });
      document.body.classList.add('modal-open');

      const cleanup = () => {
        try { overlay.classList.remove('modal-active'); card.classList.remove('fade-enter-active'); document.body.classList.remove('modal-open'); setTimeout(() => { try { overlay && overlay.remove(); } catch(e) {} }, 520); } catch(e) {}
      };

      // Handle pool button clicks
      card.addEventListener('click', (e) => {
        const btn = e.target.closest('.pool-select-btn');
        if (btn) {
          const pIdx = parseInt(btn.dataset.poolIndex);
          const qrArea = card.querySelector('.qr-area');
          const qrCode = card.querySelector('.qr-code');
          qrCode.innerHTML = `<img src="/qr?pool=${pIdx + 1}" alt="QR Code for Pool ${pIdx + 1}" style="width:100%; height:100%; object-fit:contain;">`;
          qrArea.style.display = 'flex';
          // Update connection status
          const statusBtn = card.querySelector('.connection-status-btn');
          statusBtn.textContent = 'Not Connected';
          statusBtn.style.setProperty('--hue', '0'); // red
        }
      });

      const cancelBtn = card.querySelector('.modal-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); cleanup(); });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
    } catch (e) { console.error('showConnectDeviceModal error', e); }
  }

  function showPrintView() {
    try {
      if (!Array.isArray(allPools) || allPools.length === 0) {
        alert('No pools available to print.');
        return;
      }

      const makeMatchList = (names) => {
        const pairs = [];
        const n = names.length;
        let matchNo = 1;
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            pairs.push({ no: matchNo++, a: names[i], b: names[j] });
          }
        }
        return pairs;
      };

      const escape = escapeHtml;

      let html = `<!doctype html><html><head><meta charset="utf-8"><title>Pool Sheets</title>`;
      html += `<style>
        /* Black & white print-friendly styles */
        body{font-family: Arial, Helvetica, sans-serif; color:#000; background:#fff; margin:18px; -webkit-print-color-adjust:exact; print-color-adjust:exact}
        h2{margin:6px 0 8px 0; font-size:18px}
        .pool{page-break-inside:avoid; margin-bottom:28px; padding:12px; border:1px solid #000}
        .fencer-list{display:block; margin-bottom:10px}
        .fencer-row{display:flex; align-items:center; gap:12px; padding:6px 0; border-bottom:1px solid #ddd}
        .num-box{width:36px; height:28px; border:1px solid #000; display:inline-block; text-align:center; vertical-align:middle}
        .fencer-name{flex:1; font-weight:700}
        .pairings{margin-top:12px}
        .pairing{margin-bottom:10px; padding-bottom:6px; border-bottom:1px dashed #000}
        .pairing-title{font-weight:700}
        .pairing-score{margin-top:6px; font-family: monospace}
        .page-controls{margin-bottom:12px}
        /* Ensure blacked-out cells and any inline backgrounds print as solid */
        td[style*="background"]{ background:#000 !important; color:#fff !important; -webkit-print-color-adjust:exact; print-color-adjust:exact }
        *{ -webkit-print-color-adjust:exact; print-color-adjust:exact }
        /* Order list printed as two columns for compact layout */
        .order-list{ column-gap:18px; }
        @media print { .no-print{display:none} .order-list{ column-count:2; }
          .order-list > div { break-inside: avoid; page-break-inside: avoid; }
        }
      </style></head><body>`;

      html += `<div class="no-print page-controls"><button onclick="window.print()">Print</button></div>`;

      for (let pIdx = 0; pIdx < allPools.length; pIdx++) {
        const pool = allPools[pIdx] || [];
        // Helper: format stored name into "First LAST" where LAST is uppercase
        const formatName = (raw) => {
          if (!raw) return '';
          const s = String(raw).trim();
          // If comma-separated assume "Last, First" or similar
          if (s.includes(',')) {
            const parts = s.split(',').map(p => p.trim()).filter(Boolean);
            const last = (parts[0] || '').toUpperCase();
            const first = (parts[1] || '').replace(/\s+/g, ' ').trim();
            return (first ? first + ' ' : '') + last;
          }
          const parts = s.split(/\s+/).filter(Boolean);
          if (parts.length === 1) return parts[0];
          const last = parts[parts.length - 1].toUpperCase();
          const first = parts.slice(0, parts.length - 1).join(' ');
          return (first ? first + ' ' : '') + last;
        };
        const names = pool.map((f, idx) => ({ seed: f && f.seed ? f.seed : (idx+1), rawName: f && f.name ? f.name : ('Fencer ' + (idx+1)), name: formatName(f && f.name ? f.name : ('Fencer ' + (idx+1))) }));
        html += `<section class="pool"><h2>Pool ${pIdx + 1} — ${names.length} Fencers</h2>`;

        // Determine longest formatted name to size the Fencer column
        let maxLen = 0;
        for (let i = 0; i < names.length; i++) {
          const L = (names[i].name || '').length;
          if (L > maxLen) maxLen = L;
        }
        const nameColWidthCh = Math.max(20, maxLen + 1); // at least 20ch

        // Render fencer table: Seed # | Fencer | 1 | 2 | ... using colgroup
        html += `<table style="width:100%; border-collapse:collapse; margin-bottom:10px;">
            <colgroup>
              <col style="width:80px">
              <col style="width:${nameColWidthCh}ch">
              ${Array(names.length).fill('<col style="width:60px">').join('')}
            </colgroup>
            <thead>
              <tr>
                <th style="border:1px solid #000; padding:6px;">Seed #</th>
                <th style="border:1px solid #000; padding:6px;">Fencer</th>`;
        for (let c = 0; c < names.length; c++) {
          html += `<th style="border:1px solid #000; padding:6px; text-align:center">${c+1}</th>`;
        }
        html += `</tr></thead><tbody>`;
        for (let i = 0; i < names.length; i++) {
          const displayName = names[i].name;
          html += `<tr>`;
          html += `<td style="border:1px solid #000; padding:8px; text-align:center">${i+1}</td>`;
          html += `<td style="border:1px solid #000; padding:8px">${escape(displayName)}</td>`;
          for (let j = 0; j < names.length; j++) {
            if (i === j) {
              // Black out self cell (no bout vs self)
              html += `<td style="border:1px solid #000; padding:8px; height:28px; background:#000"></td>`;
            } else {
              html += `<td style="border:1px solid #000; padding:8px; height:28px"></td>`;
            }
          }
          html += `</tr>`;
        }
        html += `</tbody></table>`;

        // Order: pairing list formatted as '1 Name VS. 2 Name'
        const pairings = generateRoundRobinPairings(names);
        html += `<div style="margin-top:12px; font-weight:700">Order:</div>`;
        html += `<div class="order-list" style="margin-top:8px">`;
        pairings.forEach(p => {
          html += `<div style="margin:6px 0">${escape(p)}</div>`;
        });
        html += `</div>`;

        html += `</section>`;
      }

      html += `</body></html>`;

      const w = window.open('', '_blank');
      if (!w) { alert('Popup blocked — allow popups to print.'); return; }
      w.document.open();
      w.document.write(html);
      w.document.close();
      // Give the new window a moment to render then call print
      setTimeout(() => { try { w.focus(); w.print(); } catch (e) { console.error(e); } }, 250);

    } catch (e) { console.error('showPrintView error', e); alert('Unable to open print view.'); }
  }

  // Show advancement modal with ranking grid
  function showAdvancementModal() {
    try {
      const list = computeAdvancementList();
      if (!list || list.length === 0) {
        alert('No fencer data available to compute advancement.');
        return;
      }

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.style.zIndex = 1260;

      const card = document.createElement('article');
      card.className = 'fencer-card modal-card advancement-modal';
      // Header + subheader
      const headerHtml = `
        <div style="text-align:left; width:100%;">
          <div style="font-size:1.12rem;font-weight:700; text-align:left;">You are viewing Advancement!</div>
          <div style="margin-top:20px;">
            <div class="advancement-grid-header" style="display:grid; grid-template-columns:48px 1fr 40px 64px 56px 56px 84px; gap:8px; align-items:center;">
              <div class="adv-head-cell">Seed</div>
              <div class="adv-head-cell">Fencer Name</div>
              <div class="adv-head-cell" style="text-align:center">V</div>
              <div class="adv-head-cell" style="text-align:center">V/A%</div>
              <div class="adv-head-cell" style="text-align:center">TS</div>
              <div class="adv-head-cell" style="text-align:center">TR</div>
              <div class="adv-head-cell" style="text-align:center">Advance?</div>
            </div>
          </div>
        </div>`;

      // Build rows
      const rowsHtml = list.map(it => {
        const name = escapeHtml(it.name || '');
        const seedDisplay = it.finalSeedDisplay || it.seed || it.finalSeed || '';
        const v = it.V || 0;
        const va = isFinite(it.VApercent) ? `${it.VApercent.toFixed(1)}%` : '0%';
        const ts = it.TS || 0;
        const tr = it.TR || 0;
        const adv = it.advances ? 'Yes' : 'No';
        return `<div class="adv-row" style="display:grid; grid-template-columns:48px 1fr 40px 64px 56px 56px 84px; gap:8px; align-items:center; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.04);">
          <div class="adv-cell">${escapeHtml(String(seedDisplay))}</div>
          <div class="adv-cell">${name}</div>
          <div class="adv-cell" style="text-align:center">${v}</div>
          <div class="adv-cell" style="text-align:center">${va}</div>
          <div class="adv-cell" style="text-align:center">${ts}</div>
          <div class="adv-cell" style="text-align:center">${tr}</div>
          <div class="adv-cell" style="text-align:center">${adv}</div>
        </div>`;
      }).join('');

      card.innerHTML = `
        <div class="fencer-row" style="flex-direction:column; gap:12px;">
          <div class="advancement-grid-container">
            ${headerHtml}
            <div class="advancement-rows" style="max-height:420px;">${rowsHtml}</div>
          </div>
          <div class="meta-actions" style="margin-top:12px; display:flex; justify-content:flex-end;
            gap:10px;">
            <button class="frutiger-aero-button modal-close confirm-btn">Close</button>
          </div>
        </div>`;

      overlay.appendChild(card);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => { overlay.classList.add('modal-active'); card.classList.add('fade-enter-active'); });
      document.body.classList.add('modal-open');

      const cleanup = () => {
        try { overlay.classList.remove('modal-active'); card.classList.remove('fade-enter-active'); document.body.classList.remove('modal-open'); setTimeout(() => { try { overlay && overlay.remove(); } catch(e) {} }, 520); } catch(e) {}
      };

      const closeBtn = card.querySelector('.modal-close'); if (closeBtn) closeBtn.addEventListener('click', (e) => { e.preventDefault(); cleanup(); });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
    } catch (e) { console.error('showAdvancementModal error', e); }
  }

  // Wire print button to open print view
  if (printBtn) {
    printBtn.addEventListener('click', (e) => { e.preventDefault(); showPrintView(); });
  }

  // Wire connect device button
  const connectBtn = document.querySelector('.connect-device-btn');
  if (connectBtn) {
    connectBtn.addEventListener('click', (e) => { e.preventDefault(); showConnectDeviceModal(); });
  }

  // Inline fallback removed: rely on CSS for hover/transition parity

  // Check if ALL pools are completely filled with valid scores
  function areAllPoolsComplete() {
    if (!Array.isArray(allPools) || allPools.length === 0) return false;
    for (let pIdx = 0; pIdx < allPools.length; pIdx++) {
      const pool = allPools[pIdx];
      const size = Array.isArray(pool) ? pool.length : 0;
      if (!size) return false;
      const scores = loadPoolScores(pIdx, size);
      for (let rIdx = 0; rIdx < size; rIdx++) {
        for (let cIdx = rIdx + 1; cIdx < size; cIdx++) {
          const a = parseInt(scores[rIdx][cIdx] || '0', 10);
          const b = parseInt(scores[cIdx][rIdx] || '0', 10);
          if (a < 5 && b < 5) return false;
          if (a === b) return false;
        }
      }
    }
    return true;
  }

  // Toggle Pools page nav state: gray out DE until all pools complete
  function updatePoolsNavState() {
    const body = document.body;
    if (!body) return;
    const allComplete = areAllPoolsComplete();
    const deBtn = document.querySelector('.de-btn');
    const resultsBtn = document.querySelector('.results-btn');
    // Toggle `pools-nav-muted` so DE/Results become active when pools complete.
    if (!allComplete) {
      body.classList.add('pools-nav-muted');
      if (deBtn) { deBtn.classList.add('disabled'); try { deBtn.setAttribute('aria-disabled', 'true'); } catch(e){} }
      if (resultsBtn) { resultsBtn.classList.add('disabled'); try { resultsBtn.setAttribute('aria-disabled', 'true'); } catch(e){} }
    } else {
      body.classList.remove('pools-nav-muted');
      if (deBtn) { deBtn.classList.remove('disabled'); try { deBtn.removeAttribute('aria-disabled'); } catch(e){} try { deBtn.removeAttribute('tabindex'); } catch(e){} }
      // Even when all pools are complete, keep Results visually disabled per product decision
      if (resultsBtn) { resultsBtn.classList.add('disabled'); try { resultsBtn.setAttribute('aria-disabled', 'true'); } catch(e){} try { resultsBtn.setAttribute('tabindex', '-1'); } catch(e){} }
    }
  }

  // Return array of incomplete pool indices
  function getIncompletePools() {
    const incomplete = [];
    if (!Array.isArray(allPools) || allPools.length === 0) return incomplete;
    for (let pIdx = 0; pIdx < allPools.length; pIdx++) {
      const pool = allPools[pIdx];
      const size = Array.isArray(pool) ? pool.length : 0;
      if (!size) { incomplete.push(pIdx); continue; }
      const scores = loadPoolScores(pIdx, size);
      let ok = true;
      for (let rIdx = 0; rIdx < size && ok; rIdx++) {
        for (let cIdx = rIdx + 1; cIdx < size; cIdx++) {
          const a = parseInt(scores[rIdx][cIdx] || '0', 10);
          const b = parseInt(scores[cIdx][rIdx] || '0', 10);
          if (a < 5 && b < 5) { ok = false; break; }
          if (a === b) { ok = false; break; }
        }
      }
      if (!ok) incomplete.push(pIdx);
    }
    return incomplete;
  }

  // Show modal warning listing incomplete pools and allow user to continue
  function showPoolsDeletionModal(anchor) {
    try {
      const incomplete = getIncompletePools();
      if (!Array.isArray(incomplete) || incomplete.length === 0) {
        // nothing to delete, just navigate
        try { window.location.href = anchor.getAttribute('href') || '/de'; } catch (e) { window.location.href = '/de'; }
        return;
      }

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.style.zIndex = 1250;

      const card = document.createElement('article');
      card.className = 'fencer-card modal-card pool-delete-modal';
      // Build buttons for each incomplete pool
      const poolButtonsHtml = incomplete.map(idx => {
        const pool = allPools[idx] || [];
        return `<button class="frutiger-aero-button incomplete-pool-btn" data-pool-index="${idx}" style="--hue:280;">Pool ${idx+1} (${pool.length} Fencer${pool.length===1?'':'s'})</button>`;
      }).join('');

      card.innerHTML = `
        <div class="fencer-row" style="flex-direction:column; gap:12px; align-items:stretch;">
          <div class="fencer-name"><span style="font-size:1.12rem; font-weight:700;">Careful, it seems you aren’t ready to move on yet!</span></div>
          <div class="fencer-meta" style="font-size:0.95rem; opacity:0.95;">The following incomplete Pools will be deleted:</div>
          <div class="incomplete-pools-grid" style="display:grid; grid-template-columns:repeat(2, minmax(140px, 1fr)); gap:8px; align-items:center; margin-top:6px;">${poolButtonsHtml}</div>
          <div class="meta-actions" style="margin-top:12px; display:flex; gap:10px; justify-content:flex-end;">
            <button class="frutiger-aero-button modal-cancel confirm-btn" style="--hue:0deg; --sat:0;">Cancel</button>
            <button class="frutiger-aero-button modal-continue" style="--hue:140;">Continue Regardless</button>
          </div>
        </div>`;

      overlay.appendChild(card);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => { overlay.classList.add('modal-active'); card.classList.add('fade-enter-active'); });
      document.body.classList.add('modal-open');

      const cleanup = () => {
        try {
          overlay.classList.remove('modal-active'); card.classList.remove('fade-enter-active'); document.body.classList.remove('modal-open');
          setTimeout(() => { try { overlay && overlay.remove(); } catch (e) {} }, 520);
        } catch (e) {}
      };

      // clicking a pool button navigates to that pool (select)
      const poolBtns = card.querySelectorAll('.incomplete-pool-btn');
      poolBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const idx = parseInt(btn.getAttribute('data-pool-index'), 10);
          if (!isNaN(idx) && idx >= 0 && idx < allPools.length) {
            currentPoolIndex = idx;
            renderCurrentPool();
            updatePoolButtonText();
            cleanup();
          }
        });
      });

      const cancelBtn = card.querySelector('.modal-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); cleanup(); });

      const contBtn = card.querySelector('.modal-continue');
      if (contBtn) contBtn.addEventListener('click', (e) => {
        e.preventDefault();
        try {
          // Remove incomplete pools and their stored scores
          const keep = [];
          for (let p = 0; p < allPools.length; p++) {
            if (incomplete.indexOf(p) === -1) keep.push(allPools[p]);
            else {
              // clear associated scores
              try { sessionStorage.removeItem(scoreKey(p)); } catch (err) {}
            }
          }
          allPools = keep;
          // persist shortened pools
          try { sessionStorage.setItem('fencingapp:seeding-pools', JSON.stringify(allPools)); } catch (err) {}
          cleanup();
          // small delay then navigate to /de
          setTimeout(() => { try { window.location.href = anchor.getAttribute('href') || '/de'; } catch (e) { window.location.href = '/de'; } }, 260);
        } catch (err) { console.error('ContinueRegardless error', err); }
      });

      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
    } catch (e) { console.error('showPoolsDeletionModal error', e); }
  }

  // Intercept clicks on the DE button when pools are incomplete, show the deletion modal
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('.de-btn');
    if (!a) return;
    if (!document.body.classList.contains('pools-nav-muted')) return; // only when muted
    ev.preventDefault();
    try { showPoolsDeletionModal(a); } catch (e) { console.error(e); }
  });

  // Show pool selection modal with buttons only
  function showFencerListModal() {
    try {
      if (!allPools || allPools.length === 0) {
        alert('No pools available. Complete seeding first.');
        console.warn('showFencerListModal: No pools available');
        return;
      }

      console.log('showFencerListModal: Loaded', allPools.length, 'pools');

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.style.zIndex = 1220;

      const card = document.createElement('article');
      card.className = 'fencer-card modal-card pool-selection-modal';

      // Build pool selection buttons (use active class, avoid inline box-shadow)
      const poolButtons = allPools.map((pool, idx) => {
        const isActive = idx === currentPoolIndex;
        const activeClass = isActive ? ' active' : '';
        return `<button class="frutiger-aero-button pool-select-btn${activeClass}" data-pool-index="${idx}" style="--hue:280; justify-content:center;">Pool ${idx + 1} (${pool.length} Fencer${pool.length === 1 ? '' : 's'})</button>`;
      }).join('');

      card.innerHTML = `
        <div class="fencer-row" style="flex-direction:column; align-items:stretch; gap:16px;">
          <div class="fencer-name"><span style="font-size:1.12rem; font-weight:700;">Select a Pool</span></div>
          <div class="pool-buttons-grid">${poolButtons}</div>
          <div class="meta-actions" style="justify-content:flex-end; gap:10px; margin-top:8px;">
            <button class="frutiger-aero-button modal-close confirm-btn">Close</button>
          </div>
        </div>`;

      overlay.appendChild(card);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => { overlay.classList.add('modal-active'); card.classList.add('fade-enter-active'); });
      document.body.classList.add('modal-open');

      const cleanup = () => {
        try {
          overlay.classList.remove('modal-active');
          card.classList.remove('fade-enter-active');
          document.body.classList.remove('modal-open');
          setTimeout(() => { try { overlay && overlay.remove(); } catch (e) {} }, 520);
        } catch (e) {}
      };

      // Pool selection button handlers
      const poolSelectButtons = card.querySelectorAll('.pool-select-btn');
      poolSelectButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const poolIndex = parseInt(btn.getAttribute('data-pool-index'), 10);
          if (!isNaN(poolIndex) && poolIndex >= 0 && poolIndex < allPools.length) {
            currentPoolIndex = poolIndex;
            updatePoolButtonText();
            renderCurrentPool();
            // Update active class on buttons so CSS can control outline/glow
            poolSelectButtons.forEach(b => {
              const idx = parseInt(b.getAttribute('data-pool-index'), 10);
              if (idx === poolIndex) b.classList.add('active'); else b.classList.remove('active');
            });
            cleanup();
          }
        });
      });

      const closeBtn = card.querySelector('.modal-close');
      if (closeBtn) closeBtn.addEventListener('click', (e) => { e.preventDefault(); cleanup(); });

      overlay.addEventListener('click', (ev) => { if (ev.target === overlay) cleanup(); });

    } catch (e) {
      console.error('showFencerListModal error', e);
    }
  }

  // Load saved seeding pools from sessionStorage
  function loadPools() {
    try {
      const raw = sessionStorage.getItem('fencingapp:seeding-pools');
      if (raw) {
        const pools = JSON.parse(raw);
        console.log('loadPools: Successfully loaded', Array.isArray(pools) ? pools.length : 0, 'pools from sessionStorage', pools);
        return Array.isArray(pools) ? pools : [];
      }
      console.warn('loadPools: No seeding-pools found in sessionStorage');
      return [];
    } catch (e) {
      console.error('Failed to load pools:', e);
      return [];
    }
  }

  // Render current pool only
  function renderCurrentPool() {
    if (!output) return;
    output.innerHTML = '';
    
    if (!allPools || allPools.length === 0) {
      output.innerHTML = '<p class="muted">No pools available. Complete seeding first.</p>';
      return;
    }

    if (currentPoolIndex < 0 || currentPoolIndex >= allPools.length) {
      output.innerHTML = '<p class="muted">Invalid pool selection.</p>';
      return;
    }

    const pool = allPools[currentPoolIndex];
    const pIndex = currentPoolIndex;

    if (!Array.isArray(pool) || pool.length === 0) {
      output.innerHTML = '<p class="muted">This pool is empty.</p>';
      return;
    }

    const scores = loadPoolScores(pIndex, pool.length);

    // Validate a bout: at least one fencer must have ≥5 touches, and scores must differ (no ties)
    const validateBout = (rIdx, cIdx, input) => {
      const myScore = parseInt(input.value || '0', 10);
      // Find reciprocal cell (the opponent's score from same bout)
      const recipScore = parseInt(scores[cIdx][rIdx] || '0', 10);
      
      // At least one must be ≥5 (someone won)
      if (myScore < 5 && recipScore < 5) {
        input.classList.add('score-input-error');
        input.title = 'Invalid bout: at least one fencer must score ≥5';
        return false;
      }
      
      // Scores must be different (no ties)
      if (myScore === recipScore) {
        input.classList.add('score-input-error');
        input.title = 'No ties allowed: scores must be different';
        return false;
      }
      
      input.classList.remove('score-input-error');
      input.title = '';
      return true;
    };

    const formatName = (full) => {
      const raw = (full || '').toString().trim();
      if (!raw) return '';
      // If name is in "Last, First" format, split on comma.
      let first = '';
      let last = '';
      if (raw.indexOf(',') !== -1) {
        const parts = raw.split(',');
        last = (parts[0] || '').trim();
        first = (parts.slice(1).join(',') || '').trim();
      } else {
        const parts = raw.split(/\s+/);
        if (parts.length === 1) return parts[0];
        last = parts.pop();
        first = parts.join(' ');
      }

      const capitalize = (s) => {
        return s.split(/\s+/).map(w => {
          const lower = (w || '').toLowerCase();
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        }).join(' ');
      };

      const firstFormatted = capitalize(first);
      const lastFormatted = (last || '').toUpperCase();
      return `${firstFormatted} ${lastFormatted}`.trim();
    };

    const poolWrapper = document.createElement('section');
    poolWrapper.className = 'pool-wrapper pool-score-wrapper';

    // Top header removed per request — keep the area focused on the grid only.

    const grid = document.createElement('div');
    grid.className = 'pool-grid';
    const columnCount = pool.length;
    // Use smaller minimums for the name column and score columns so the
    // grid can fit within the page without requiring a horizontal scroller.
    // Score columns use flexible `1fr` to shrink as needed while keeping
    // a usable minimum width.
    // Slightly increase the name-column minimum so fencer cards are a bit longer
    // and make score columns a touch wider for readability.
    grid.style.gridTemplateColumns = `minmax(380px, 1.6fr) repeat(${columnCount}, minmax(72px, 1fr))`;

    const labelCell = document.createElement('div');
    labelCell.className = 'grid-cell grid-label';
    // keep the cell for column alignment but clear its visible text
    labelCell.textContent = '';
    grid.appendChild(labelCell);
    for (let c = 0; c < columnCount; c++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell grid-header-cell';
      // Render the number directly as text content
      cell.textContent = String(c + 1);
      grid.appendChild(cell);
    }

    pool.forEach((fencer, rIdx) => {
      const lane = document.createElement('div');
      lane.className = 'grid-cell fencer-lane';
      // attach identifier for removal and actions
      lane.setAttribute('data-id', String(fencer.id || rIdx));

      const laneRow = document.createElement('div');
      laneRow.className = 'fencer-lane-row';

      const infoBtn = document.createElement('button');
      infoBtn.type = 'button';
      // Use the frutiger-aero-button class so the extra-info button
      // matches the app's Frutiger Aero visuals (glossy, hue variable, glow)
      infoBtn.className = 'frutiger-aero-button card-action info-btn';
      infoBtn.title = 'View fencer details';
      infoBtn.innerHTML = '📋';

      const laneInfo = document.createElement('div');
      laneInfo.className = 'lane-info';

      const name = document.createElement('div');
      name.className = 'lane-name';
      const displayName = formatName(fencer.name || `Fencer ${rIdx + 1}`);
      name.textContent = displayName;

      const metaRow = document.createElement('div');
      metaRow.className = 'lane-meta';
      
      // Get weapon-specific rank if available
      let rank = '';
      const eventWeapon = sessionStorage.getItem('fencingapp:event-weapon') || '';
      if (eventWeapon) {
        if (fencer.ratings && fencer.ratings[eventWeapon]) {
          rank = fencer.ratings[eventWeapon];
        } else if (fencer.raw && fencer.raw.Ratings && fencer.raw.Ratings[eventWeapon]) {
          rank = fencer.raw.Ratings[eventWeapon];
        }
      }
      // Fall back to generic rank
      if (!rank) {
        rank = (fencer.rank || '').toString().trim();
      }
      
      const born = (fencer.born || '').toString().trim();
      const metaBits = [born && ` ${born}`, rank && ` ${rank}`].filter(Boolean);
      metaRow.textContent = metaBits.join(' • ');

      laneInfo.appendChild(name);
      if (metaBits.length) laneInfo.appendChild(metaRow);

      const badge = document.createElement('div');
      badge.className = 'seed-badge';
      badge.textContent = (rIdx + 1);

      laneRow.appendChild(infoBtn);
      laneRow.appendChild(laneInfo);
      laneRow.appendChild(badge);
      lane.appendChild(laneRow);
      // Clicks are handled via delegated removal-mode behavior (see document click handler)
      // set data attributes for use by delegated handler
      lane.dataset.fencerId = fencer.id || '';
      lane.dataset.fencerName = fencer.name || '';
      grid.appendChild(lane);

      for (let cIdx = 0; cIdx < columnCount; cIdx++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell score-cell';

        if (rIdx === cIdx) {
          cell.classList.add('score-cell-blocked');
          cell.textContent = '—';
        } else {
          const input = document.createElement('input');
          input.type = 'text';
          input.maxLength = 1;
          input.className = 'score-input';
          input.placeholder = '0';
          input.value = scores[rIdx][cIdx] || '';
          input.dataset.row = rIdx;
          input.dataset.col = cIdx;
          
          // Update win state for both cells in this bout
          const updateWinState = () => {
            const myScore = parseInt(input.value || '0', 10);
            const recipScore = parseInt(scores[cIdx][rIdx] || '0', 10);
            
            // This cell wins if its score > opponent's score
            if (myScore > recipScore && myScore > 0) {
              input.classList.add('score-input-win');
            } else {
              input.classList.remove('score-input-win');
            }
            
            // Also update opponent's cell if it exists
            try {
              const recipCell = grid.querySelector(`.score-input[data-row="${cIdx}"][data-col="${rIdx}"]`);
              if (recipCell) {
                if (recipScore > myScore && recipScore > 0) {
                  recipCell.classList.add('score-input-win');
                } else {
                  recipCell.classList.remove('score-input-win');
                }
              }
            } catch (e) {}
          };
          
          // Initialize win state from existing data
          updateWinState();
          
          // Hover-to-type: focus and select the input on mouseenter or touchstart
          const focusAndSelect = (el) => { try { el.focus(); if (typeof el.select === 'function') el.select(); } catch (e) {} };
          input.addEventListener('mouseenter', () => focusAndSelect(input));
          input.addEventListener('touchstart', () => focusAndSelect(input), { passive: true });
          
          // Validate: only 0-5 allowed
          const validateScore = (val) => {
            const trimmed = (val || '').toString().trim();
            if (!trimmed) return ''; // empty is OK
            const num = parseInt(trimmed, 10);
            if (isNaN(num) || num < 0 || num > 5) {
              input.classList.add('score-input-error');
              input.title = 'Score must be 0-5';
              return null; // invalid
            }
            // Now check if bout is valid (at least one fencer ≥5)
            input.value = String(num);
            if (!validateBout(rIdx, cIdx, input)) {
              return null; // bout invalid
            }
            input.classList.remove('score-input-error');
            input.title = '';
            return String(num);
          };
          
          input.addEventListener('blur', (ev) => {
            const valid = validateScore(ev.target.value);
            if (valid !== null) {
              scores[rIdx][cIdx] = valid;
              persistPoolScores(pIndex, scores);
              markDirty();
              input.value = valid;
              updateWinState();
              updateAdvancementButtonState();
              updatePoolsNavState();
            }
          });
          
          input.addEventListener('change', (ev) => {
            const valid = validateScore(ev.target.value);
            if (valid !== null) {
              scores[rIdx][cIdx] = valid;
              persistPoolScores(pIndex, scores);
              markDirty();
              updateWinState();
              updateAdvancementButtonState();
              updatePoolsNavState();
            }
          });
          
          // Pressing Enter should advance focus to the next score input
          input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              try { input.blur(); } catch (e) {}
              const inputs = Array.from(grid.querySelectorAll('.score-input'));
              const idx = inputs.indexOf(input);
              const next = inputs[idx + 1];
              if (next) {
                try { next.focus(); if (typeof next.select === 'function') next.select(); } catch (e) {}
              }
            }
          });
          
          cell.appendChild(input);
        }

        grid.appendChild(cell);
      }
    });

    poolWrapper.appendChild(grid);
    output.appendChild(poolWrapper);
    
    // Update advancement button state based on pool completion
    updateAdvancementButtonState();
    // Update DE nav state based on all pools completion
    updatePoolsNavState();
  }

  // Button handlers
  if (poolBtn) {
    poolBtn.addEventListener('click', () => {
      showFencerListModal();
    });
  }

  // Advancement button behavior is initialized later by `setupAdvancementButton()`

  // Add fencer modal for pools page
  function showAddFencerModal() {
    try {
      if (!allPools || allPools.length === 0 || currentPoolIndex < 0 || currentPoolIndex >= allPools.length) {
        alert('No pool selected. Please select a pool first.');
        return;
      }

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.style.zIndex = 1220;

      const card = document.createElement('article');
      card.className = 'fencer-card modal-card add-fencer-modal';
      card.innerHTML = `
        <div class="fencer-row">
          <div class="fencer-left">
            <div class="fencer-name"><span style="font-size:1.12rem;">Add fencer to Pool ${currentPoolIndex + 1}</span></div>
            <div class="fencer-name"><span class="fencer-fullname" contenteditable="true" role="textbox" aria-label="Full name" data-placeholder="Enter Name"></span></div>
            <div class="fencer-meta meta-rows">
              <div class="meta-row"><span class="meta-part meta-year" contenteditable="true" role="textbox" aria-label="Year of birth" data-placeholder="Enter Year Born"></span></div>
              <div class="meta-row"><span class="meta-part meta-rank" contenteditable="true" role="textbox" aria-label="Rank" data-placeholder="Enter Current Rank"></span></div>
              <div class="meta-row"><span class="meta-part meta-club" contenteditable="true" role="textbox" aria-label="Club" data-placeholder="Enter Attending Club"></span></div>
            </div>
            <div class="meta-actions">
              <button class="frutiger-aero-button modal-cancel confirm-btn" style="--hue:0deg; --sat:0;">Cancel</button>
              <button class="frutiger-aero-button modal-confirm" style="--hue:140deg;">Confirm</button>
            </div>
          </div>
        </div>`;

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      requestAnimationFrame(() => { overlay.classList.add('modal-active'); card.classList.add('fade-enter-active'); });
      document.body.classList.add('modal-open');

      // Wire interactions
      const fullnameEl = card.querySelector('.fencer-fullname');
      const metaYear = card.querySelector('.meta-year');
      const metaRank = card.querySelector('.meta-rank');
      const metaClub = card.querySelector('.meta-club');

      const focusFirst = () => { try { if (fullnameEl) fullnameEl.focus(); } catch (e) {} };
      focusFirst();

      // Hover-to-type for modal fields
      const focusEditable = (el) => {
        if (!el) return;
        try {
          el.addEventListener('mouseenter', () => { try { el.focus(); } catch (e) {} });
          el.addEventListener('touchstart', () => { try { el.focus(); } catch (e) {} }, { passive: true });
        } catch (e) {}
      };
      [fullnameEl, metaYear, metaRank, metaClub].forEach(focusEditable);

      // Normalize empty fields so placeholder shows after deleting text
      const keepPlaceholderWhenCleared = (el) => {
        if (!el) return;
        const handler = () => {
          try {
            const txt = (el.innerText || '').trim();
            if (!txt) el.textContent = '';
          } catch (e) {}
        };
        el.addEventListener('input', handler);
        el.addEventListener('blur', handler);
        el.addEventListener('keyup', handler);
      };
      [fullnameEl, metaYear, metaRank, metaClub].forEach(keepPlaceholderWhenCleared);

      const cleanup = () => {
        try {
          overlay.classList.remove('modal-active');
          card.classList.remove('fade-enter-active');
          document.body.classList.remove('modal-open');
          setTimeout(() => { try { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch(e) {} }, 520);
        } catch(e) {}
      };

      // Cancel
      const cancelBtn = card.querySelector('.modal-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', (ev) => { ev.preventDefault(); cleanup(); });

      // Confirm: validate and add to current pool
      const confirmBtn = card.querySelector('.modal-confirm');
      if (confirmBtn) confirmBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        try {
          const name = (fullnameEl?.innerText || '').toString().trim();
          const born = (metaYear?.innerText || '').toString().trim();
          const rank = (metaRank?.innerText || '').toString().trim();
          const club = (metaClub?.innerText || '').toString().trim();

          // Validate name is required
          if (!name) {
            fullnameEl && fullnameEl.classList.add('input-invalid');
            fullnameEl && fullnameEl.focus();
            return;
          }

          // Create fencer object
          let bornVal = born;
          if (bornVal && bornVal.length > 4) bornVal = bornVal.slice(0, 4);
          const newF = {
            id: `f-auto-${Date.now()}-${Math.floor(Math.random()*9000)}`,
            name: name,
            born: bornVal || '',
            rank: rank || '',
            club: club || '',
            seed: allPools[currentPoolIndex].length + 1
          };

          // Add to current pool
          allPools[currentPoolIndex].push(newF);

          // Persist pools
          sessionStorage.setItem('fencingapp:seeding-pools', JSON.stringify(allPools));

          // Clear scores for this pool since size changed
          sessionStorage.removeItem(scoreKey(currentPoolIndex));

          markDirty();
          renderCurrentPool();
          cleanup();
        } catch (err) { console.error('confirm add fencer failed', err); }
      });

      // Overlay click to cancel
      overlay.addEventListener('click', (ev) => { if (ev.target === overlay) cleanup(); });

    } catch (e) { console.error('showAddFencerModal error', e); }
  }

  // Toggle pool removal mode when global Remove buttons are clicked
  function setPoolRemoveMode(on) {
    poolRemoveMode = !!on;
    if (output) {
      if (poolRemoveMode) output.classList.add('removal-mode'); else output.classList.remove('removal-mode');
    }
    if (removeBtn) removeBtn.classList.toggle('remove-active', poolRemoveMode);
    if (removeCopyBtn) removeCopyBtn.classList.toggle('remove-active', poolRemoveMode);
  }

  // Toggle pool move mode
  function setPoolMoveMode(on) {
    poolMoveMode = !!on;
    if (output) {
      if (poolMoveMode) output.classList.add('move-mode'); else output.classList.remove('move-mode');
    }
    if (moveFencerBtn) moveFencerBtn.classList.toggle('move-active', poolMoveMode);
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => { e.preventDefault(); setPoolRemoveMode(!poolRemoveMode); });
  }
  if (removeCopyBtn) {
    removeCopyBtn.addEventListener('click', (e) => { e.preventDefault(); setPoolRemoveMode(!poolRemoveMode); });
  }

  if (moveFencerBtn) {
    moveFencerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      setPoolMoveMode(!poolMoveMode);
    });
  }

  // Placeholder: advancement button setup will be handled by setupAdvancementButton()

  if (connectDeviceBtn) {
    connectDeviceBtn.addEventListener('click', () => {
      console.log('Connect Device button clicked');
      // TODO: Implement device connection functionality
    });
  }

  if (displayModeBtn) {
    displayModeBtn.addEventListener('click', () => {
      console.log('Display Mode button clicked');
      // TODO: Implement display mode toggle functionality
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      console.log('Save button clicked');
      markClean();
    });
  }

  // Initialize
  markClean();
  allPools = loadPools();
  currentPoolIndex = 0;
  // Normalize nav classes/attributes for Pools page
  try { normalizeNavOnLoad(); } catch (e) {}
  updatePoolButtonText();
  renderCurrentPool();
  updatePoolsNavState();

  // Setup a single, robust Advancement button handler and visual toggles
  function setupAdvancementButton() {
    try {
      if (!advancementBtn) return;

      // Set visual/accessible state according to pool completion
      const refreshVisual = () => {
        const allComplete = areAllPoolsComplete();
        if (allComplete) {
          advancementBtn.classList.remove('disabled');
          try { advancementBtn.removeAttribute('aria-disabled'); } catch(e){}
          try { advancementBtn.removeAttribute('tabindex'); } catch(e){}
          try { advancementBtn.disabled = false; } catch(e){}
          try { document.body.classList.add('advancement-ready'); } catch(e){}
        } else {
          advancementBtn.classList.add('disabled');
          try { advancementBtn.setAttribute('aria-disabled', 'true'); } catch(e){}
          try { advancementBtn.setAttribute('tabindex', '-1'); } catch(e){}
          try { advancementBtn.disabled = true; } catch(e){}
          try { document.body.classList.remove('advancement-ready'); } catch(e){}
        }
      };

      // Click handler: show the advancement modal when data exists
      const onClick = (e) => {
        e && e.preventDefault();
        try {
          const list = computeAdvancementList();
          if (Array.isArray(list) && list.length > 0) {
            showAdvancementModal();
          } else {
            try { showInfoModal('Advancement is not available until all pools are complete.'); } catch (err) { try { alert('Advancement is not available until all pools are complete.'); } catch(e){} }
          }
        } catch (err) { console.error('Advancement click failed', err); }
      };

      // Ensure single listener
      advancementBtn.removeEventListener('click', onClick);
      advancementBtn.addEventListener('click', onClick);

      // Refresh initially and when pool state may change
      refreshVisual();
      // Hook into the existing state update points by monkey-patching updateAdvancementButtonState
      const origUpdate = updateAdvancementButtonState;
      updateAdvancementButtonState = function() { try { origUpdate(); } catch(e){} try { refreshVisual(); } catch(e){} };
    } catch (e) { console.error('setupAdvancementButton error', e); }
  }

  try { setupAdvancementButton(); } catch (e) {}

  // advancement cutoff UI removed — default behavior: no cutoff

  // Delegate clicks for removal-mode to replicate seeding page behavior
  document.addEventListener('click', (e) => {
    try {
      const container = document.getElementById('pools-output');
      
      // Handle removal mode
      if (container && container.classList.contains('removal-mode')) {
        const laneEl = e.target.closest && e.target.closest('.fencer-lane');
        if (!laneEl) return;
        // Ignore clicks on inner controls
        if (e.target && e.target.closest && e.target.closest('.card-action')) return;
        // Ensure element has fencer id/name
        if (!laneEl.dataset || (!laneEl.dataset.fencerId && !laneEl.getAttribute('data-id'))) return;
        const fid = laneEl.dataset.fencerId || laneEl.getAttribute('data-id');
        showRemoveFencerModal(laneEl, fid);
        return;
      }
      
      // Handle move mode
      if (container && container.classList.contains('move-mode')) {
        const laneEl = e.target.closest && e.target.closest('.fencer-lane');
        if (!laneEl) return;
        // Ignore clicks on inner controls
        if (e.target && e.target.closest && e.target.closest('.card-action')) return;
        // Ensure element has fencer id/name
        if (!laneEl.dataset || (!laneEl.dataset.fencerId && !laneEl.getAttribute('data-id'))) return;
        const fid = laneEl.dataset.fencerId || laneEl.getAttribute('data-id');
        const fname = laneEl.dataset.fencerName || '';
        showMoveFencerModal(laneEl, fid, fname);
        return;
      }
    } catch (err) { console.error('pools delegate error', err); }
  });
  
  // Show modal to select destination pool for moving fencer
  function showMoveFencerModal(card, fid, fname) {
    try {
      // Format name: First LAST
      const formatName = (full) => {
        const raw = (full || '').toString().trim();
        if (!raw) return 'Fencer';
        let first = '';
        let last = '';
        if (raw.indexOf(',') !== -1) {
          const parts = raw.split(',');
          last = (parts[0] || '').trim();
          first = (parts.slice(1).join(',') || '').trim();
        } else {
          const parts = raw.split(/\s+/);
          if (parts.length === 1) return parts[0];
          last = parts.pop();
          first = parts.join(' ');
        }
        const capitalize = (s) => {
          return s.split(/\s+/).map(w => {
            const lower = (w || '').toLowerCase();
            return lower.charAt(0).toUpperCase() + lower.slice(1);
          }).join(' ');
        };
        const firstFormatted = capitalize(first);
        const lastFormatted = (last || '').toUpperCase();
        return `${firstFormatted} ${lastFormatted}`.trim();
      };
      
      const displayName = formatName(fname);
      
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.style.zIndex = 1220;

      const modal = document.createElement('article');
      modal.className = 'fencer-card modal-card';
      
      // Build pool selection buttons
      const poolButtons = allPools.map((pool, idx) => {
        if (idx === currentPoolIndex) return ''; // Don't show current pool
        return `<button class="frutiger-aero-button pool-move-btn" data-pool-index="${idx}" style="--hue:280; justify-content:center; width:100%;">Pool ${idx + 1} (${pool.length} Fencer${pool.length === 1 ? '' : 's'})</button>`;
      }).filter(Boolean).join('');

      modal.innerHTML = `
        <div class="fencer-row" style="flex-direction:column; align-items:stretch; gap:16px;">
          <div class="fencer-name"><span style="font-size:1.12rem; font-weight:700;">Move fencer to which pool?</span></div>
          <div style="font-size:0.95rem; font-weight:400;">You are moving ${displayName} from Pool ${currentPoolIndex + 1}</div>
          <div class="pool-buttons-grid">${poolButtons}</div>
          <div class="meta-actions" style="justify-content:flex-end; gap:10px; margin-top:8px;">
            <button class="frutiger-aero-button modal-cancel confirm-btn" style="--hue:0deg; --sat:0;">Cancel</button>
          </div>
        </div>`;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => { overlay.classList.add('modal-active'); modal.classList.add('fade-enter-active'); });
      document.body.classList.add('modal-open');

      const cleanup = () => {
        try {
          overlay.classList.remove('modal-active');
          modal.classList.remove('fade-enter-active');
          document.body.classList.remove('modal-open');
          setTimeout(() => { try { overlay && overlay.remove(); } catch (e) {} }, 520);
        } catch (e) {}
      };

      const cancelBtn = modal.querySelector('.modal-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); cleanup(); });

      // Pool selection button handlers
      const poolMoveButtons = modal.querySelectorAll('.pool-move-btn');
      poolMoveButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const targetPoolIndex = parseInt(btn.getAttribute('data-pool-index'), 10);
          if (!isNaN(targetPoolIndex) && targetPoolIndex >= 0 && targetPoolIndex < allPools.length) {
            // Find and move the fencer
            const sourcePool = allPools[currentPoolIndex];
            const fencer = sourcePool.find(f => {
              const idMatch = (f.id||'').toString() === (fid||'').toString();
              const nameMatch = (f.name||'').toString().trim() === (fname||'').toString().trim();
              return idMatch || nameMatch;
            });
            
            if (fencer) {
              // Remove from current pool
              allPools[currentPoolIndex] = sourcePool.filter(f => {
                const idMatch = (f.id||'').toString() === (fid||'').toString();
                const nameMatch = (f.name||'').toString().trim() === (fname||'').toString().trim();
                return !(idMatch || nameMatch);
              });
              
              // Add to target pool
              allPools[targetPoolIndex].push(fencer);
              
              // Persist
              sessionStorage.setItem('fencingapp:seeding-pools', JSON.stringify(allPools));
              
              // Clear scores for both pools since their sizes changed
              sessionStorage.removeItem(scoreKey(currentPoolIndex));
              sessionStorage.removeItem(scoreKey(targetPoolIndex));
              
              markDirty();
              renderCurrentPool();
              updatePoolsNavState();
            }
            
            cleanup();
          }
        });
      });

      overlay.addEventListener('click', (ev) => { if (ev.target === overlay) cleanup(); });

    } catch (e) { console.error('showMoveFencerModal error', e); }
  }

  // Utility: show modal asking for removal reason, resolves with reason string or null if cancelled
  function showRemovalReasonModal(fencer) {
    return new Promise((resolve) => {
      try {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.zIndex = 1230;
        const card = document.createElement('article');
        card.className = 'fencer-card modal-card';
        card.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:12px;">
            <div style="font-weight:700;">Remove Fencer</div>
            <div>You're about to remove <strong>${(fencer && (fencer.name||'Unnamed'))}</strong> from Pool ${currentPoolIndex+1}.</div>
            <label style="font-size:0.95rem;">Reason (optional):</label>
            <textarea class="removal-reason-input" rows="4" style="width:100%;box-sizing:border-box;padding:8px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);"></textarea>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:6px;">
              <button class="frutiger-aero-button modal-cancel confirm-btn" style="--hue:0deg; --sat:0;">Cancel</button>
              <button class="frutiger-aero-button modal-confirm" style="--hue:360;">Remove</button>
            </div>
          </div>`;
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => { overlay.classList.add('modal-active'); card.classList.add('fade-enter-active'); document.body.classList.add('modal-open'); });

        const cleanup = () => { try { overlay.classList.remove('modal-active'); card.classList.remove('fade-enter-active'); document.body.classList.remove('modal-open'); setTimeout(() => { try { overlay && overlay.remove(); } catch(e){} }, 520); } catch(e){} };

        const textarea = card.querySelector('.removal-reason-input');
        const cancelBtn = card.querySelector('.modal-cancel');
        const confirmBtn = card.querySelector('.modal-confirm');

        cancelBtn.addEventListener('click', (e) => { e.preventDefault(); cleanup(); resolve(null); });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) { cleanup(); resolve(null); } });
        confirmBtn.addEventListener('click', (e) => { e.preventDefault(); const reason = textarea ? textarea.value.trim() : ''; cleanup(); resolve(reason); });
      } catch (err) { console.error(err); resolve(null); }
    });
  }

  // Seeding-style remove modal: confirm and optional reason, then remove fencer from pool
  function showRemoveFencerModal(card, fid) {
    try {
      const parseNameLocal = (s) => {
        if (!s || typeof s !== 'string') return { first: '', last: '' };
        const trimmed = s.trim();
        if (!trimmed) return { first: '', last: '' };
        if (trimmed.indexOf(',') !== -1) {
          const parts = trimmed.split(',');
          return { last: (parts[0]||'').trim(), first: (parts.slice(1).join(',')||'').trim() };
        }
        const parts = trimmed.split(/\s+/);
        if (parts.length === 1) return { first: parts[0], last: '' };
        return { first: parts.slice(0, parts.length-1).join(' '), last: parts[parts.length-1] };
      };

      const rawName = (card && card.dataset && card.dataset.fencerName) ? card.dataset.fencerName : '';
      const parsed = parseNameLocal(rawName || '');
      const lastUpper = (parsed.last || '').toString().toUpperCase();
      const friendlyName = [parsed.first, lastUpper].filter(Boolean).join(' ').trim() || rawName || 'this fencer';

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.style.zIndex = 1220;

      const modal = document.createElement('article');
      modal.className = 'fencer-card modal-card';
      modal.innerHTML = `
        <div class="fencer-row" style="flex-direction:column; align-items:stretch; gap:16px;">
          <div class="fencer-name"><span style="font-size:1.12rem; font-weight:700;">You are going to remove ${friendlyName} in an important stage!</span></div>
          <div class="fencer-name" style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:0.98rem; font-weight:400; line-height:1.4;">Reason for leave:</span>
            <input class="reason-input" type="text" placeholder="Type reason..." style="flex:1; min-width:200px; padding:6px; border-radius:8px; border:1px solid rgba(255,255,255,0.06); background:transparent; color:inherit; outline:none; box-shadow:none;" />
          </div>
          <div class="meta-actions" style="display:flex; flex-direction:row; justify-content:flex-end; align-items:center; gap:14px;">
            <button class="frutiger-aero-button modal-cancel confirm-btn" style="--hue:0deg; --sat:0;">Cancel</button>
            <button class="frutiger-aero-button modal-confirm" style="--hue:140deg;">Confirm</button>
          </div>
        </div>`;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => { overlay.classList.add('modal-active'); modal.classList.add('fade-enter-active'); });
      document.body.classList.add('modal-open');

      // Add hover-to-focus on the reason input
      const reasonInput = modal.querySelector('.reason-input');
      if (reasonInput) {
        reasonInput.addEventListener('mouseenter', () => {
          try { reasonInput.focus(); if (typeof reasonInput.select === 'function') reasonInput.select(); } catch (e) {}
        });
        reasonInput.addEventListener('touchstart', () => {
          try { reasonInput.focus(); if (typeof reasonInput.select === 'function') reasonInput.select(); } catch (e) {}
        }, { passive: true });
      }

      const cleanup = () => {
        try {
          overlay.classList.remove('modal-active');
          modal.classList.remove('fade-enter-active');
          document.body.classList.remove('modal-open');
          setTimeout(() => { try { overlay && overlay.remove(); } catch (e) {} }, 520);
        } catch (e) {}
      };

      const cancelBtn = modal.querySelector('.modal-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); cleanup(); });

      const confirmBtn = modal.querySelector('.modal-confirm');
      if (confirmBtn) confirmBtn.addEventListener('click', (e) => {
        e.preventDefault();
        try {
          const poolArr = Array.isArray(allPools[currentPoolIndex]) ? allPools[currentPoolIndex] : [];
          const reasonVal = (modal.querySelector('.reason-input') && modal.querySelector('.reason-input').value) || '';
          // Store removal reason
          try {
            const logKey = 'fencingapp:seeding-removals';
            const raw = sessionStorage.getItem(logKey);
            const arr = raw ? JSON.parse(raw) : [];
            arr.push({ id: fid, name: rawName, poolIndex: currentPoolIndex, reason: reasonVal, at: new Date().toISOString() });
            sessionStorage.setItem(logKey, JSON.stringify(arr));
          } catch (err) { /* ignore logging errors */ }
          cleanup();
          // Animate the card out then update pools
          card.classList.add('removing');
          let handled = false;
          const finish = () => {
            if (handled) return; handled = true;
            // Remove by id or name
            allPools[currentPoolIndex] = poolArr.filter(f => {
              const idMatch = (f.id||'').toString() === (fid||'').toString();
              const nameMatch = (f.name||'').toString().trim() === (rawName||'').toString().trim();
              return !(idMatch || nameMatch);
            });
            sessionStorage.setItem('fencingapp:seeding-pools', JSON.stringify(allPools));
            // Clear scores for this pool since the grid size has changed
            sessionStorage.removeItem(scoreKey(currentPoolIndex));
            renderCurrentPool();
            markDirty();
            updatePoolsNavState();
          };
          const onEnd = (ev) => {
            if (ev && ev.propertyName && ev.propertyName !== 'opacity') return;
            card.removeEventListener('transitionend', onEnd);
            finish();
          };
          card.addEventListener('transitionend', onEnd);
          setTimeout(() => onEnd(), 420);
        } catch (err) { console.error('Confirm removal failed', err); cleanup(); }
      });

      overlay.addEventListener('click', (ev) => { if (ev.target === overlay) cleanup(); });
    } catch (e) { console.error('showRemoveFencerModal error', e); }
  }

  // Poll localStorage for remote score updates
  function pollRemoteScores() {
    setInterval(() => {
      try {
        for (let pIdx = 0; pIdx < allPools.length; pIdx++) {
          const key = 'fencingapp:pool-scores:' + pIdx;
          const stored = localStorage.getItem(key);
          if (stored) {
            const remoteScores = JSON.parse(stored);
            // Merge with current scores
            const currentScores = loadPoolScores(pIdx, allPools[pIdx].length);
            Object.assign(currentScores, remoteScores);
            savePoolScores(pIdx, currentScores);
            // Re-render if current pool
            if (pIdx === currentPoolIndex) {
              renderPool(currentPoolIndex);
            }
          }
        }
      } catch (e) { console.error('Poll remote scores error', e); }
    }, 2000); // every 2 seconds
  }

  // Wire up add-fencer button to pools page
  document.addEventListener('click', (e) => {
    try {
      const target = e.target.closest && e.target.closest('.add-fencer-btn');
      if (target && target.classList.contains('add-fencer-btn')) {
        e.preventDefault();
        showAddFencerModal();
      }
    } catch (err) { console.error('add-fencer button handler error', err); }
  });

  // Start polling for remote updates
  pollRemoteScores();

  // Clean advancement initialization will be added below.
});
