document.addEventListener('DOMContentLoaded', () => {
  try { document.body.classList.add('seeding-nav-muted'); } catch (e) {}
  const randomizeBtn = document.querySelector('.randomize-btn');
  const customBtn = document.querySelector('.custom-btn');
  const moveBtn = document.querySelector('.move-fencer-btn');
  const saveBtn = document.querySelector('.save-btn');
  const removeCopyBtn = document.querySelector('.remove-copy-btn');
  const output = document.getElementById('seeding-output');
  let moveModeActive = false;
  let removalMode = false;
  let currentPools = [];
  let seedingDirty = false;

  // CSV header aliases reused from checkin.js to normalize imported fields
  const CSV_ALIASES = {
    born: ['born','birthyear','year','yob','birth year','birth_date','dob','year born'],
    club: ['club','club(s)','club name','affiliation','team','organization','org','club/organization','club_name','association','home club','affiliation name','attending club'],
    rank: ['rank','rating','usa rating','seed','ranking','classification','class','rating (usa)','usa_rating','current rank'],
    division: ['division','category','age group','div'],
    country: ['country','nationality','nat','nation'],
    member: ['member','member id','membership','membership number','member#','license','licence','license number']
  };

  function placeCaretAtEnd(el) {
    try {
      if (!el) return;
      el.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      if (el.childNodes.length > 0) {
        const lastNode = el.childNodes[el.childNodes.length - 1];
        const offset = lastNode.nodeType === 3 ? lastNode.length : 1;
        range.setStart(lastNode, offset);
      } else {
        range.setStart(el, 0);
      }
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
  }

  function generateRecommendations(total) {
    if (!total || total < 1) return [];
    const pairs = [];
    const limit = Math.floor(Math.sqrt(total));
    for (let i = 1; i <= limit; i++) {
      if (total % i === 0) {
        const pools = i;
        const size = total / i;
        pairs.push({ pools, size });
        if (i !== size) pairs.push({ pools: size, size: pools });
      }
    }
    const score = (p) => Math.abs(p.size - 6.5) * 10 + p.pools;
    pairs.sort((a, b) => score(a) - score(b));
    return pairs.slice(0, 4);
  }

  function splitIntoFixedPools(list, poolCount) {
    if (!Array.isArray(list) || poolCount < 1) return [];
    const pools = Array.from({ length: poolCount }, () => []);
    const n = list.length;
    const base = Math.floor(n / poolCount);
    let rem = n % poolCount;
    let idx = 0;
    for (let p = 0; p < poolCount; p++) {
      const size = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
      const slice = list.slice(idx, idx + size);
      pools[p] = slice;
      idx += size;
    }
    return pools;
  }

  // Utility: read fencers from sessionStorage (import.js writes to this key)
  function loadFencers() {
    try {
      const raw = sessionStorage.getItem('fencingapp:fencers') || localStorage.getItem('fencingapp:fencers') || '[]';
      const arr = JSON.parse(raw || '[]');
      // Ensure minimal normalized fields
      // If imported/checkin data includes a `checked` flag, prefer only checked fencers
      const hasCheckedFlag = Array.isArray(arr) && arr.some(x => Object.prototype.hasOwnProperty.call(x, 'checked'));
      const filtered = Array.isArray(arr) ? arr.filter(x => !hasCheckedFlag || !!x.checked) : [];

      return filtered.map((f, i) => {
        const id = f.id || `seed-${i}`;
        const name = f.name || (f.fullname || f.full_name) || `Fencer ${i+1}`;
        const born = f.born || f.birthyear || f.yob || '';
        // normalize rank from raw headers similar to checkin.js
        let rawObj = f.raw || {};
        if (rawObj && rawObj.raw && typeof rawObj.raw === 'object' && Object.keys(rawObj.raw).length > 0) rawObj = rawObj.raw;
        const rawLower = {};
        try { Object.keys(rawObj || {}).forEach(k => { rawLower[(k||'').toLowerCase().trim()] = rawObj[k]; }); } catch (e) {}
        const headerGet = (keys) => {
          for (let k of keys) {
            if (Object.prototype.hasOwnProperty.call(rawLower, k) && rawLower[k]) return rawLower[k];
          }
          return '';
        };
        const isLikelyRank = (key, v) => {
          if (!v || typeof v !== 'string') return false;
          const s = v.trim();
          if (!s) return false;
          const hk = (key||'').toLowerCase();
          const headerSuggestsRank = /rank|rating|usa rating|seed|ranking|classification|class/.test(hk);
          if (/^[A-Za-z]\d{1,3}$/.test(s)) return true;
          if (/^[A-Za-z]$/.test(s)) return true;
          if (/^U?\d{1,3}$/.test(s) && headerSuggestsRank) return true;
          if (/seed|rank|rating/i.test(s) && headerSuggestsRank) return true;
          return false;
        };

        let rank = (f.rank || f.rating || f.category || f['class'] || headerGet(CSV_ALIASES.rank) || '').toString().trim();
        if (!rank) {
          for (const k of Object.keys(rawLower)) {
            const v = rawLower[k];
            if (isLikelyRank(k, String(v||''))) { rank = String(v).trim(); break; }
          }
        }

        const club = (f.club || headerGet(CSV_ALIASES.club) || '').toString().trim();
        return { id, name, born, rank, club, raw: f };
      });
    } catch (e) { return []; }
  }

  // Show Add Fencer modal for seeding page with pool number input
  function showAddFencerModal() {
    try {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.style.zIndex = 1220;

      const card = document.createElement('article');
      card.className = 'fencer-card modal-card add-fencer-modal';
      card.innerHTML = `
        <div class="fencer-row">
          <div class="fencer-left">
            <div class="fencer-name"><span style="font-size:1.12rem;">Please input the information below to add fencer!</span></div>
            <div class="fencer-name"><span class="fencer-fullname" contenteditable="true" role="textbox" aria-label="Full name" data-placeholder="Enter Name"></span></div>
            <div class="fencer-meta meta-rows">
              <div class="meta-row"><span class="meta-part meta-year" contenteditable="true" role="textbox" aria-label="Year of birth" data-placeholder="Enter Year Born"></span></div>
              <div class="meta-row"><span class="meta-part meta-rank" contenteditable="true" role="textbox" aria-label="Rank" data-placeholder="Enter Current Rank"></span></div>
              <div class="meta-row"><span class="meta-part meta-club" contenteditable="true" role="textbox" aria-label="Club" data-placeholder="Enter Attending Club"></span></div>
            </div>
            <div class="fencer-meta" style="margin-top:12px;">
              <span class="meta-part meta-pool" contenteditable="true" role="textbox" aria-label="Pool number" data-placeholder="Enter Attending Pool" style="display:block;width:100%;"></span>
            </div>
            <div class="meta-actions">
              <button class="frutiger-aero-button modal-cancel">Cancel</button>
              <button class="frutiger-aero-button modal-confirm" style="--hue:140deg;">Confirm</button>
            </div>
          </div>
        </div>`;

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      // Activate fade-in
      requestAnimationFrame(() => { overlay.classList.add('modal-active'); card.classList.add('fade-enter-active'); });
      document.body.classList.add('modal-open');

      // Wire interactions
      const fullnameEl = card.querySelector('.fencer-fullname');
      const metaYear = card.querySelector('.meta-year');
      const metaRank = card.querySelector('.meta-rank');
      const metaClub = card.querySelector('.meta-club');
      const metaPool = card.querySelector('.meta-pool');

      const focusFirst = () => { try { if (fullnameEl) { fullnameEl.focus(); placeCaretAtEnd(fullnameEl); } } catch (e) {} };
      focusFirst();

      // Hover-to-type for modal fields
      const focusEditable = (el) => {
        if (!el) return;
        try {
          el.addEventListener('mouseenter', () => { try { el.focus(); if (el.contentEditable === 'true') placeCaretAtEnd(el); } catch (e) {} });
          el.addEventListener('touchstart', () => { try { el.focus(); if (el.contentEditable === 'true') placeCaretAtEnd(el); } catch (e) {} }, { passive: true });
        } catch (e) {}
      };
      [fullnameEl, metaYear, metaRank, metaClub, metaPool].forEach(focusEditable);

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
      keepPlaceholderWhenCleared(fullnameEl);
      keepPlaceholderWhenCleared(metaPool);

      // Restrict pool field to numeric input only
      if (metaPool) {
        metaPool.addEventListener('keypress', (e) => {
          if (!/[0-9]/.test(e.key) && e.key !== 'Enter' && e.key !== 'Backspace') {
            e.preventDefault();
          }
        });
        metaPool.addEventListener('paste', (e) => {
          e.preventDefault();
          const text = (e.clipboardData || window.clipboardData).getData('text');
          const numeric = text.replace(/[^0-9]/g, '');
          if (numeric) {
            document.execCommand('insertText', false, numeric);
          }
        });
      }

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

      // Confirm: validate and add to pool
      const confirmBtn = card.querySelector('.modal-confirm');
      if (confirmBtn) confirmBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        try {
          const name = (fullnameEl?.innerText || '').toString().trim();
          const born = (metaYear?.innerText || '').toString().trim();
          const rank = (metaRank?.innerText || '').toString().trim();
          const club = (metaClub?.innerText || '').toString().trim();
          const poolNumStr = (metaPool?.innerText || '').toString().trim();
          const poolNum = parseInt(poolNumStr, 10);

          // Validate
          if (!name) { fullnameEl && fullnameEl.classList.add('input-invalid'); fullnameEl && fullnameEl.focus(); fullnameEl && placeCaretAtEnd(fullnameEl); return; }
          if (!poolNumStr || !poolNum || poolNum < 1 || poolNum > currentPools.length) {
            alert(`Please enter a valid pool number (1-${currentPools.length})`);
            metaPool && metaPool.focus();
            metaPool && placeCaretAtEnd(metaPool);
            return;
          }

          // Create fencer object
          let bornVal = born; if (bornVal && bornVal.length > 4) bornVal = bornVal.slice(0, 4);
          const newF = {
            id: `f-auto-${Date.now()}-${Math.floor(Math.random()*9000)}`,
            name: name,
            born: bornVal || '',
            rank: rank || '',
            club: club || '',
            raw: { name, born: bornVal, rank, club }
          };

          // Add to specified pool (poolNum is 1-indexed)
          currentPools[poolNum - 1].push(newF);

          // Also persist to sessionStorage fencers list
          let raw = sessionStorage.getItem('fencingapp:fencers');
          let fencers = raw ? JSON.parse(raw) : [];
          fencers.unshift(newF);
          sessionStorage.setItem('fencingapp:fencers', JSON.stringify(fencers));

          markDirty();
          renderPools(currentPools, 1);
          cleanup();
        } catch (err) { console.error('confirm add fencer failed', err); }
      });

      // overlay click to cancel
      overlay.addEventListener('click', (ev) => { if (ev.target === overlay) cleanup(); });

    } catch (e) { console.error('showAddFencerModal error', e); }
  }

  function showCustomModal() {
    try {
      const fencers = loadFencers();
      const total = (fencers || []).length;
      if (!total) { alert('No fencers available. Import or add fencers first.'); return; }
      const recs = generateRecommendations(total);

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.style.zIndex = 1220;

      const card = document.createElement('article');
      card.className = 'fencer-card modal-card add-fencer-modal';
      const recItems = recs.map(r => `<button class="frutiger-aero-button rec-option" data-pools="${r.pools}" data-size="${r.size}" style="--hue:220deg;justify-content:center;">${r.pools} Pools x ${r.size} Competitors in Pool</button>`).join('');
      card.innerHTML = `
        <div class="fencer-row" style="flex-direction:column; align-items:stretch; gap:12px;">
          <div class="fencer-name"><span style="font-size:1.12rem;">Recommended Options:</span></div>
          <div class="meta-actions" style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top: 9px;">${recItems || '<div class="muted">No exact factors found.</div>'}</div>
          <div class="fencer-name" style="margin-top:6px;"><span style="font-size:1.12rem;">Custom Format:</span></div>
          <div class="fencer-meta meta-rows" style="gap:10px; flex-wrap:wrap; align-items:center;">
            <div class="meta-row" style="gap:8px; align-items:center; display:flex;"><span class="meta-part meta-custom-pools" contenteditable="true" role="textbox" aria-label="Number of pools" data-placeholder="#" style="width:4.5ch;"></span><span style="display:flex; align-items:center;">Number of Pools</span></div>
            <span style="display:flex; align-items:center;">with</span>
            <div class="meta-row" style="gap:8px; align-items:center; display:flex;"><span class="meta-part meta-custom-size" contenteditable="true" role="textbox" aria-label="Competitors in pool" data-placeholder="#" style="width:4.5ch;"></span><span style="display:flex; align-items:center;">Competitors in Pool</span></div>
          </div>
          <div class="meta-actions" style="justify-content:flex-end; gap:10px; margin-top:8px;">
            <button class="frutiger-aero-button modal-cancel">Cancel</button>
            <button class="frutiger-aero-button modal-confirm" style="--hue:140deg;">Apply</button>
          </div>
        </div>`;

      overlay.appendChild(card);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => { overlay.classList.add('modal-active'); card.classList.add('fade-enter-active'); });
      document.body.classList.add('modal-open');

      const poolsEl = card.querySelector('.meta-custom-pools');
      const sizeEl = card.querySelector('.meta-custom-size');
      const recButtons = Array.from(card.querySelectorAll('.rec-option'));
      const focusEditable = (el) => {
        if (!el) return;
        try {
          el.addEventListener('mouseenter', () => { try { el.focus(); placeCaretAtEnd(el); } catch (e) {} });
          el.addEventListener('touchstart', () => { try { el.focus(); placeCaretAtEnd(el); } catch (e) {} }, { passive: true });
        } catch (e) {}
      };
      [poolsEl, sizeEl].forEach(focusEditable);

      const normalizeNumeric = (el) => {
        if (!el) return;
        const handler = () => {
          try {
            const text = (el.innerText || '').replace(/[^0-9]/g, '');
            if (el.textContent !== text) {
              el.textContent = text;
              placeCaretAtEnd(el);
            }
          } catch (e) {}
        };
        el.addEventListener('input', handler);
        el.addEventListener('blur', handler);
      };
      
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
      };
      
      normalizeNumeric(poolsEl);
      normalizeNumeric(sizeEl);
      keepPlaceholderWhenCleared(poolsEl);
      keepPlaceholderWhenCleared(sizeEl);

      recButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const poolsVal = btn.getAttribute('data-pools');
          const sizeVal = btn.getAttribute('data-size');
          if (poolsEl) poolsEl.textContent = poolsVal || '';
          if (sizeEl) sizeEl.textContent = sizeVal || '';
        });
      });

      const cleanup = () => {
        try {
          overlay.classList.remove('modal-active');
          card.classList.remove('fade-enter-active');
          document.body.classList.remove('modal-open');
          setTimeout(() => { try { overlay && overlay.remove(); } catch (e) {} }, 520);
        } catch (e) {}
      };

      const applySelection = () => {
        try {
          const pools = parseInt((poolsEl?.innerText || '').trim(), 10);
          const size = parseInt((sizeEl?.innerText || '').trim(), 10);
          if (!pools || pools < 1) { alert('Enter a valid number of pools'); return; }
          const list = loadFencers();
          if (!list || !list.length) { alert('No fencers available.'); return; }
          const shuffled = shuffleArray(list);
          currentPools = splitIntoFixedPools(shuffled, pools);
          // Assign randomized global seed numbers across all fencers (mixed within pools)
          try {
            const n = shuffled.length;
            const perm = Array.from({ length: n }, (_, i) => i + 1);
            const permShuffled = shuffleArray(perm);
            let k = 0;
            currentPools.forEach(pool => {
              pool.forEach(f => { f.seed = permShuffled[k++]; });
            });
          } catch (e) {}
          markDirty();
          renderPools(currentPools, 1);
          cleanup();
        } catch (e) { console.error('Custom apply failed', e); }
      };

      const cancelBtn = card.querySelector('.modal-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); cleanup(); });
      const confirmBtn = card.querySelector('.modal-confirm');
      if (confirmBtn) confirmBtn.addEventListener('click', (e) => { e.preventDefault(); applySelection(); });
      overlay.addEventListener('click', (ev) => { if (ev.target === overlay) cleanup(); });

    } catch (e) { console.error('showCustomModal error', e); }
  }

  // Move mode toggle: highlight button + enable drag/drop
  function setMoveMode(enabled) {
    moveModeActive = !!enabled;
    if (moveBtn) {
      moveBtn.classList.toggle('active', moveModeActive);
      moveBtn.setAttribute('aria-pressed', moveModeActive ? 'true' : 'false');
    }
    document.body.classList.toggle('move-mode-active', moveModeActive);
    // Re-render to refresh draggable attributes/state
    if (currentPools && currentPools.length) renderPools(currentPools, 1);
  }

  function markDirty() {
    seedingDirty = true;
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.classList.remove('disabled');
    }
  }

  function markClean() {
    seedingDirty = false;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.classList.add('disabled');
    }
  }

  function moveFencerBetweenPools(sourcePoolIdx, fencerId, targetPoolIdx, beforeFencerId) {
    if (!currentPools || !Array.isArray(currentPools)) return;
    const sIdx = Number(sourcePoolIdx);
    const tIdx = Number(targetPoolIdx);
    if (Number.isNaN(sIdx) || Number.isNaN(tIdx) || sIdx < 0 || tIdx < 0) return;
    const source = currentPools[sIdx];
    const target = currentPools[tIdx];
    if (!Array.isArray(source) || !Array.isArray(target)) return;
    const fromIndex = source.findIndex(x => (x && (x.id || x.name)) && (x.id || x.name) === fencerId);
    if (fromIndex < 0) return;
    const [fencer] = source.splice(fromIndex, 1);
    let insertAt = target.length;
    if (beforeFencerId) {
      const tPos = target.findIndex(x => (x && (x.id || x.name)) && (x.id || x.name) === beforeFencerId);
      if (tPos >= 0) insertAt = tPos;
    }
    target.splice(insertAt, 0, fencer);
    markDirty();
    renderPools(currentPools, 1);
  }

  // Resolve rank/class for a fencer from multiple possible locations
  function resolveRank(f) {
    try {
      if (!f) return '';
      
      // Check for weapon-specific rating based on event weapon
      const eventWeapon = sessionStorage.getItem('fencingapp:event-weapon') || '';
      if (eventWeapon && f.ratings && f.ratings[eventWeapon]) {
        const weaponRating = f.ratings[eventWeapon];
        if (weaponRating && weaponRating !== 'U') {
          return weaponRating;
        }
      }
      
      // Also check raw.Ratings if available
      if (eventWeapon && f.raw && f.raw.Ratings && f.raw.Ratings[eventWeapon]) {
        const weaponRating = f.raw.Ratings[eventWeapon];
        if (weaponRating && weaponRating !== 'U') {
          return weaponRating;
        }
      }
      
      // Accept single-letter or letter+digits classifications; reject plain numeric placements.
      const isClassLike = (s) => !!s && (/^[A-Za-z]$/.test(s) || /^[A-Za-z]\d{1,3}$/.test(s));
      const normalize = (v) => v && String(v).trim() ? String(v).trim() : '';

      // 1) direct fields: prefer class-like values
      const direct = normalize(f.rank || f.rating || f.category || f['class'] || '');
      if (direct && isClassLike(direct)) return direct;
      if (direct && !/^\d+$/.test(direct)) return direct;

      // helper to inspect raw objects and collect candidate values
      const inspect = (obj) => {
        if (!obj || typeof obj !== 'object') return '';
        const rawObj = (obj.raw && typeof obj.raw === 'object' && Object.keys(obj.raw || {}).length) ? obj.raw : obj;
        const rawLower = {};
        Object.keys(rawObj || {}).forEach(k => { rawLower[(k||'').toLowerCase().trim()] = rawObj[k]; });
        const found = [];
        for (const key of CSV_ALIASES.rank) {
          if (Object.prototype.hasOwnProperty.call(rawLower, key) && rawLower[key]) found.push(normalize(rawLower[key]));
        }
        ['classification','class','category'].forEach(k => { if (rawLower[k]) found.push(normalize(rawLower[k])); });
        if (!found.length) return '';
        // prefer class-like among found
        const classLike = found.find(isClassLike);
        if (classLike) return classLike;
        // prefer non-numeric values
        const nonNumeric = found.find(v => !/^\d+$/.test(v));
        if (nonNumeric) return nonNumeric;
        return found[0];
      };

      // 2) inspect f.raw
      const fromRaw = inspect(f.raw || f);
      if (fromRaw) return fromRaw;

      // 3) check persisted sessionStorage canonical record for this id
      try {
        const rawStore = sessionStorage.getItem('fencingapp:fencers') || '[]';
        const arrStore = JSON.parse(rawStore || '[]') || [];
        const found = arrStore.find(sf => sf && sf.id && f && f.id && sf.id === f.id);
        if (found) {
          const d = normalize(found.rank || found.rating || found.category || found['class'] || '');
          if (d && isClassLike(d)) return d;
          if (d && !/^\d+$/.test(d)) return d;
          const fromFound = inspect(found.raw || found);
          if (fromFound) return fromFound;
        }
      } catch (e) {}

      // 4) conservative fallback: don't return pure numeric placement; prefer any class-like heuristic
      return '';
    } catch (e) { return ''; }
  }

  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Partition into pools trying to achieve sizes 6-7 where possible
  function computePools(n) {
    if (n <= 0) return [];
    // Start with the minimal number of pools if using max size 7
    let pools = Math.ceil(n / 7);
    // Increase pools until average >=6 (so no pool smaller than 6 when possible)
    while (pools > 1 && (n / pools) < 6) {
      pools = pools - 1;
    }
    // Now distribute n into `pools` buckets as evenly as possible
    const base = Math.floor(n / pools);
    let rem = n % pools;
    const sizes = new Array(pools).fill(base).map(() => 0);
    for (let i = 0; i < pools; i++) {
      sizes[i] = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
    }
    return sizes;
  }

  function splitIntoPools(shuffled) {
    const n = shuffled.length;
    const sizes = computePools(n);
    const pools = [];
    let idx = 0;
    for (let p = 0; p < sizes.length; p++) {
      const size = sizes[p];
      const group = shuffled.slice(idx, idx + size);
      pools.push(group);
      idx += size;
    }
    return pools;
  }

  function parseName(fullName) {
    if (!fullName) return { last: '', first: '' };
    const s = fullName.trim();
    if (s.includes(',')) {
      const parts = s.split(',').map(x => x.trim());
      return { last: parts[0], first: (parts[1] || '') };
    }
    const parts = s.split(/\s+/);
    if (parts.length === 1) return { last: parts[0], first: '' };
    const last = parts[parts.length - 1];
    const first = parts.slice(0, parts.length - 1).join(' ');
    return { last, first };
  }

  // Render helper: create pool DOM
  function renderPools(pools, seedStart = 1) {
    // Drop any empty pools before rendering so empty headers disappear
    const nonEmptyPools = Array.isArray(pools) ? pools.filter(p => Array.isArray(p) && p.length > 0) : [];
    currentPools = nonEmptyPools;
    output.innerHTML = '';
    if (!nonEmptyPools || nonEmptyPools.length === 0) {
      output.innerHTML = '<p class="muted">No fencers found. Import fencers on the Check-in page first.</p>';
      return;
    }

    // Ensure each fencer has a stable randomized seed number (1..N).
    // If some seeds are missing, assign only missing ones from available numbers.
    try {
      const flatList = [];
      (nonEmptyPools || []).forEach(pool => {
        (pool || []).forEach(f => { if (f) flatList.push(f); });
      });
      const N = flatList.length;
      if (N > 0) {
        const existing = new Set();
        flatList.forEach(f => {
          const s = Number.isFinite(Number(f.seed)) ? Number(f.seed) : null;
          if (s && s >= 1 && s <= N) existing.add(s);
        });
        const available = [];
        for (let i = 1; i <= N; i++) { if (!existing.has(i)) available.push(i); }
        // Randomize available seed numbers so new assignments are not biased
        for (let i = available.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [available[i], available[j]] = [available[j], available[i]];
        }
        let idxAvail = 0;
        flatList.forEach(f => {
          const s = Number.isFinite(Number(f.seed)) ? Number(f.seed) : null;
          if (!s || s < 1 || s > N) {
            // Assign next available unique seed
            f.seed = available[idxAvail] || (idxAvail + 1);
            idxAvail += 1;
          }
        });
      }
    } catch (e) { /* ignore seed assignment errors */ }
    // Build a quick lookup of persisted fencers from sessionStorage so we
    // can prefer the canonical normalized `rank`/`born` values that may
    // have been normalized and persisted by the Check-in code.
    const _storedById = {};
    let _storedList = [];
    try {
      const rawStore = sessionStorage.getItem('fencingapp:fencers') || '[]';
      const arrStore = JSON.parse(rawStore || '[]') || [];
      _storedList = arrStore;
      arrStore.forEach(sf => { if (sf && sf.id) _storedById[sf.id] = sf; });
    } catch (e) {}
    try { console.debug('seeding: loaded persisted fencers (sample 5)', (_storedList||[]).slice(0,5)); } catch(e){}
    nonEmptyPools.forEach((pool, pIndex) => {
      const poolWrapper = document.createElement('section');
      poolWrapper.className = 'pool-wrapper';

      // Pool card (left area)
      const poolCard = document.createElement('div');
      poolCard.className = 'pool-card fencer-card';
      poolCard.setAttribute('role', 'group');
      poolCard.setAttribute('aria-label', `Pool ${pIndex+1}`);
      poolCard.innerHTML = `
        <div class="pool-header" style="width:100%; display:flex; gap:8px; align-items:center; justify-content:flex-start;">
          <div class="pool-title" style="font-weight:600;line-height:1.2;padding:4px 0">Pool ${pIndex+1}</div>
          <div class="pool-controls" style="display:flex; gap:8px; align-items:center; margin-left:8px;">
            <label style="display:flex;align-items:center;gap:6px;font-size:0.95rem">Strip:<input class="strip-input" type="text" maxlength="3" size="3" placeholder="#" style="width:44px;min-width:36px;padding:6px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);background:transparent;color:inherit;text-align:center"></label>
            <label style="display:flex;align-items:center;gap:6px;font-size:0.95rem">Referee:<input class="referee-input" type="text" placeholder="Name" style="min-width:120px;padding:6px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);background:transparent;color:inherit"></label>
          </div>
        </div>
      `;

      // Hover-to-type: focusing inputs on hover/touch like other editable areas
      try {
        const stripInput = poolCard.querySelector('.strip-input');
        const refInput = poolCard.querySelector('.referee-input');
        const focusAndSelect = (el) => { try { el.focus(); if (typeof el.select === 'function') el.select(); } catch (e) {} };
        if (stripInput) {
          stripInput.addEventListener('mouseenter', () => focusAndSelect(stripInput));
          stripInput.addEventListener('touchstart', () => focusAndSelect(stripInput), { passive: true });
        }
        if (refInput) {
          refInput.addEventListener('mouseenter', () => focusAndSelect(refInput));
          refInput.addEventListener('touchstart', () => focusAndSelect(refInput), { passive: true });
        }
      } catch (e) {}

      // Seed list card
      const listCard = document.createElement('div');
      listCard.className = 'pool-list fencer-card';
      listCard.style.marginTop = '12px';
      listCard.style.flexDirection = 'column';
      listCard.style.gap = '8px';
      listCard.dataset.poolIndex = String(pIndex);
      if (moveModeActive) {
        listCard.addEventListener('dragover', (e) => { e.preventDefault(); listCard.classList.add('drag-over'); });
        listCard.addEventListener('dragleave', () => listCard.classList.remove('drag-over'));
        listCard.addEventListener('drop', (e) => {
          e.preventDefault();
          listCard.classList.remove('drag-over');
          const sourcePool = e.dataTransfer.getData('sourcePool');
          const fencerId = e.dataTransfer.getData('fencerId');
          if (!fencerId) return;
          moveFencerBetweenPools(sourcePool, fencerId, pIndex, null);
        });
      }

      // For each fencer in pool, create a row
      pool.forEach((f) => {
        const row = document.createElement('div');
        row.className = 'fencer-card';
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '10px 14px';
        const rowId = f.id || `seed-${(Number.isFinite(Number(f.seed)) ? Number(f.seed) : (pIndex + 1))}`;
        row.dataset.fencerId = rowId;
        // Ensure the fencer object carries the same id so removal filter matches
        if (!f.id) { f.id = rowId; }
        // Optional: reflect id on a common attribute for tooling consistency
        try { row.setAttribute('data-id', rowId); } catch (e) {}
        row.dataset.fencerName = f.name || '';
        row.dataset.poolIndex = String(pIndex);
        if (moveModeActive) {
          row.draggable = true;
          row.addEventListener('dragstart', (e) => {
            try { e.dataTransfer.setData('sourcePool', String(pIndex)); } catch (err) {}
            try { e.dataTransfer.setData('fencerId', row.dataset.fencerId || ''); } catch (err) {}
            e.dataTransfer.effectAllowed = 'move';
            row.classList.add('dragging');
            // Custom drag image so the ghost matches the glass card styling
            try {
              const ghost = row.cloneNode(true);
              ghost.classList.add('drag-ghost');
              ghost.style.width = `${row.offsetWidth}px`;
              ghost.style.position = 'absolute';
              ghost.style.top = '-9999px';
              ghost.style.left = '-9999px';
              document.body.appendChild(ghost);
              const rect = row.getBoundingClientRect();
              e.dataTransfer.setDragImage(ghost, rect.width / 2, rect.height / 2);
              row._dragGhost = ghost;
            } catch (err) {}
          });
          row.addEventListener('dragend', () => {
            row.classList.remove('dragging');
            try {
              if (row._dragGhost && row._dragGhost.parentNode) {
                row._dragGhost.parentNode.removeChild(row._dragGhost);
              }
            } catch (err) {}
            row._dragGhost = null;
          });
          row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drag-over'); });
          row.addEventListener('dragleave', () => { row.classList.remove('drag-over'); });
          row.addEventListener('drop', (e) => {
            e.preventDefault();
            row.classList.remove('drag-over');
            const sourcePool = e.dataTransfer.getData('sourcePool');
            const fencerId = e.dataTransfer.getData('fencerId');
            if (!fencerId) return;
            moveFencerBetweenPools(sourcePool, fencerId, pIndex, row.dataset.fencerId || null);
          });
        }

        const left = document.createElement('div');
        left.style.display = 'flex';
        left.style.alignItems = 'center';
        left.style.gap = '12px';

        const seedBox = document.createElement('div');
        seedBox.style.fontWeight = '800';
        seedBox.style.minWidth = '36px';
        seedBox.style.textAlign = 'center';
        seedBox.textContent = (Number.isFinite(Number(f.seed)) ? String(Number(f.seed)) : '');

        const meta = document.createElement('div');
        meta.style.overflow = 'hidden';
        meta.style.whiteSpace = 'nowrap';
        meta.style.textOverflow = 'ellipsis';
        const parsed = parseName(f.name || '');
        // Prefer an exact persisted value from sessionStorage (copy-paste behavior):
        // 1) match by id
        // 2) fallback to match by name + birth year
        let storedF = (f && f.id) ? _storedById[f.id] : null;
        if (!storedF && _storedList && _storedList.length) {
          const wantName = (f && f.name) ? (''+f.name).toString().trim().toLowerCase() : '';
          const wantBorn = (f && f.born) ? (''+f.born).toString().trim() : '';
          storedF = _storedList.find(sf => {
            try {
              const n = (sf && sf.name) ? (''+sf.name).toString().trim().toLowerCase() : ((sf && sf.raw && sf.raw.name) ? (''+sf.raw.name).toString().trim().toLowerCase() : '');
              const b = (sf && sf.born) ? (''+sf.born).toString().trim() : ((sf && sf.raw && sf.raw.born) ? (''+sf.raw.born).toString().trim() : '');
              return (wantName && n === wantName) || (wantName && sf && sf.raw && (''+sf.raw.name).toString().trim().toLowerCase() === wantName) || (wantName && n && n.includes(wantName));
            } catch (e) { return false; }
          }) || null;
        }
        const age = storedF && storedF.born ? String(storedF.born) : (f.born ? String(f.born) : '');
        // If a persisted record exists, copy its canonical rank/class directly
        // (this mirrors the check-in UI behavior). Only fall back to heuristics
        // when no persisted canonical value exists.
        let rank = '';
        
        // First try to get weapon-specific rating
        const eventWeapon = sessionStorage.getItem('fencingapp:event-weapon') || '';
        if (eventWeapon) {
          if (storedF && storedF.ratings && storedF.ratings[eventWeapon]) {
            rank = storedF.ratings[eventWeapon];
          } else if (storedF && storedF.raw && storedF.raw.Ratings && storedF.raw.Ratings[eventWeapon]) {
            rank = storedF.raw.Ratings[eventWeapon];
          } else if (f.ratings && f.ratings[eventWeapon]) {
            rank = f.ratings[eventWeapon];
          } else if (f.raw && f.raw.Ratings && f.raw.Ratings[eventWeapon]) {
            rank = f.raw.Ratings[eventWeapon];
          }
        }
        
        // Fall back to generic rank if no weapon-specific rating
        if (!rank && storedF) rank = (storedF.rank || storedF.category || storedF['class'] || storedF.rating || '');
        if (!rank) rank = resolveRank(f);
        if (/^\d+$/.test(String(rank || '').trim())) rank = '';
        try { console.debug('seeding: fencer resolved', { id: f.id, name: f.name, storedF: storedF, rankResolved: rank }); } catch(e){}
        const lastUpper = (parsed.last || '').toString().toUpperCase();
        const firstNorm = (parsed.first || '').toString().trim();
        const display = `${firstNorm} ${lastUpper}`.trim();
        // Show age (year) and rank together on the meta line to keep them grouped
        const extras = [age, rank].filter(Boolean).join(' · ');
        meta.textContent = `${display}${extras ? ' · ' + extras : ''}`;

        left.appendChild(seedBox);
        left.appendChild(meta);

        const right = document.createElement('div');
        right.style.display = 'flex';
        right.style.alignItems = 'center';
        right.style.gap = '8px';

        const clip = document.createElement('button');
        clip.className = 'frutiger-aero-button card-action info-btn';
        clip.type = 'button';
        clip.setAttribute('aria-label','Information');
        clip.setAttribute('data-action','info');
        clip.setAttribute('data-id', f.id || '');
        clip.textContent = '📋';
        clip.draggable = false;

        right.appendChild(clip);

        row.appendChild(left);
        row.appendChild(right);

        listCard.appendChild(row);

        // seed is stable per fencer; no per-render increment
      });

      poolWrapper.appendChild(poolCard);
      poolWrapper.appendChild(listCard);
      poolWrapper.style.marginBottom = '18px';

      output.appendChild(poolWrapper);
    });
  }

  // Main randomize handler
  function onRandomize() {
    const fencers = loadFencers();
    if (!fencers || fencers.length === 0) {
      // generate demo data if none present
      const demo = [];
      for (let i = 1; i <= 18; i++) demo.push({ id: `d-${i}`, name: `Lastname${i}, First${i}`, born: 2000 - (i%12), rank: `C${i}` });
      sessionStorage.setItem('fencingapp:fencers', JSON.stringify(demo));
    }
    const list = loadFencers();
    const shuffled = shuffleArray(list);
    const pools = splitIntoPools(shuffled);
    currentPools = pools;
    // Assign randomized global seed numbers across all fencers (mixed within pools)
    try {
      const n = shuffled.length;
      const perm = Array.from({ length: n }, (_, i) => i + 1);
      const permShuffled = shuffleArray(perm);
      let k = 0;
      currentPools.forEach(pool => {
        pool.forEach(f => { f.seed = permShuffled[k++]; });
      });
    } catch (e) {}
    markDirty();
    renderPools(currentPools, 1);
  }

  // Save handler: persist current pools and mark clean
  function onSave() {
    if (!currentPools || currentPools.length === 0) {
      alert('No pools to save yet. Randomize or build pools first.');
      return;
    }
    try {
      sessionStorage.setItem('fencingapp:seeding-pools', JSON.stringify(currentPools));
      console.log('Seeding saved:', currentPools);
      markClean();
    } catch (e) {
      console.error('Save failed:', e);
      alert('Save failed. Please try again.');
    }
  }

  // Attach events
  if (randomizeBtn) randomizeBtn.addEventListener('click', onRandomize);
  if (customBtn) customBtn.addEventListener('click', showCustomModal);
  if (moveBtn) moveBtn.addEventListener('click', () => setMoveMode(!moveModeActive));
  if (saveBtn) saveBtn.addEventListener('click', onSave);
  if (removeCopyBtn) {
    removeCopyBtn.addEventListener('click', (e) => {
      try {
        removalMode = !removalMode;
        if (removalMode) {
          output.classList.add('removal-mode');
          removeCopyBtn.classList.add('remove-active');
          removeCopyBtn.setAttribute('aria-pressed','true');
        } else {
          output.classList.remove('removal-mode');
          removeCopyBtn.classList.remove('remove-active');
          removeCopyBtn.setAttribute('aria-pressed','false');
        }
      } catch (err) {}
    });
  }

  // Intercept Add Fencer nav button clicks when on seeding page
  document.addEventListener('click', (e) => {
    try {
      const target = e.target.closest && e.target.closest('.add-fencer-btn');
      if (target && target.classList.contains('add-fencer-btn')) {
        e.preventDefault();
        e.stopPropagation();
        if (currentPools && currentPools.length > 0) {
          showAddFencerModal();
        } else {
          alert('Please create pools first by clicking Randomize.');
        }
      }
    } catch (err) {}
  });

  // Initialize Save button to disabled state
  markClean();

  // Load previously saved pools if available; otherwise build from fencers
  let rendered = false;
  try {
    const saved = sessionStorage.getItem('fencingapp:seeding-pools');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length) {
        currentPools = parsed;
        renderPools(currentPools, 1);
        markClean();
        rendered = true;
      }
    }
  } catch (e) {
    console.error('Failed to load saved seeding pools:', e);
  }

  if (!rendered) {
    try {
      const existing = loadFencers();
      if (existing && existing.length) {
        const shuffled = shuffleArray(existing);
        const pools = splitIntoPools(shuffled);
        currentPools = pools;
        // Assign randomized global seed numbers across all fencers (mixed within pools)
        try {
          const n = shuffled.length;
          const perm = Array.from({ length: n }, (_, i) => i + 1);
          const permShuffled = shuffleArray(perm);
          let k = 0;
          currentPools.forEach(pool => {
            pool.forEach(f => { f.seed = permShuffled[k++]; });
          });
        } catch (e) {}
        renderPools(currentPools, 1);
        markClean();
      }
    } catch (e) {}
  }

  // Remove-on-click with fade, only when in removal mode via universal nav button
  document.addEventListener('click', (e) => {
    try {
      const container = document.getElementById('seeding-output');
      if (!container || !container.classList.contains('removal-mode')) return;
      const card = e.target.closest && e.target.closest('.fencer-card');
      if (!card) return;
      // Ignore clicks on the pool list container itself
      if (card.classList && card.classList.contains('pool-list')) return;
      if (!card.dataset || (!card.dataset.fencerId && !card.getAttribute('data-id'))) return;
      const fid = card.dataset.fencerId || card.getAttribute('data-id');
      // Show confirm modal with reason input before removal
      showRemoveFencerModal(card, fid);
    } catch (err) {}
  });

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
            <button class="frutiger-aero-button modal-cancel">Cancel</button>
            <button class="frutiger-aero-button modal-confirm" style="--hue:140deg;">Confirm</button>
          </div>
        </div>`;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => { overlay.classList.add('modal-active'); modal.classList.add('fade-enter-active'); });
      document.body.classList.add('modal-open');

      // Hover/touch-to-focus for the reason input (match other modal inputs)
      try {
        const reasonInput = modal.querySelector('.reason-input');
        const focusAndSelect = (el) => { try { el.focus(); if (typeof el.select === 'function') el.select(); } catch (e) {} };
        if (reasonInput) {
          reasonInput.addEventListener('mouseenter', () => focusAndSelect(reasonInput));
          reasonInput.addEventListener('touchstart', () => focusAndSelect(reasonInput), { passive: true });
        }
      } catch (e) {}

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
          const poolEl = card.closest && card.closest('.pool-list');
          const pIndexStr = poolEl && poolEl.dataset && poolEl.dataset.poolIndex;
          const pIndex = pIndexStr ? parseInt(pIndexStr, 10) : -1;
          if (Array.isArray(currentPools) && pIndex >= 0 && currentPools[pIndex]) {
            // Optional: read reason
            const reasonVal = (modal.querySelector('.reason-input') && modal.querySelector('.reason-input').value) || '';
            // Store removal reason in sessionStorage for later use
            try {
              const logKey = 'fencingapp:seeding-removals';
              const raw = sessionStorage.getItem(logKey);
              const arr = raw ? JSON.parse(raw) : [];
              arr.push({ id: fid, name: rawName, poolIndex: pIndex, reason: reasonVal, at: new Date().toISOString() });
              sessionStorage.setItem(logKey, JSON.stringify(arr));
            } catch (err) { /* ignore logging errors */ }
            cleanup();
            // Animate the card out then update pools
            card.classList.add('removing');
            let handled = false;
            const finish = () => {
              if (handled) return; handled = true;
              // Remove by id, with a fallback match by name if id mismatch
              currentPools[pIndex] = currentPools[pIndex].filter(f => {
                const idMatch = (f.id||'').toString() === (fid||'').toString();
                const nameMatch = (f.name||'').toString().trim() === (rawName||'').toString().trim();
                return !(idMatch || nameMatch);
              });
              sessionStorage.setItem('fencingapp:seeding-pools', JSON.stringify(currentPools));
              renderPools(currentPools, 1);
              markDirty();
            };
            const onEnd = (ev) => {
              if (ev && ev.propertyName && ev.propertyName !== 'opacity') return;
              card.removeEventListener('transitionend', onEnd);
              finish();
            };
            card.addEventListener('transitionend', onEnd);
            setTimeout(() => onEnd(), 420);
          }
        } catch (err) { console.error('Confirm removal failed', err); cleanup(); }
      });

      overlay.addEventListener('click', (ev) => { if (ev.target === overlay) cleanup(); });
    } catch (e) { console.error('showRemoveFencerModal error', e); }
  }

  // Intercept Pools button clicks for save confirmation
  document.addEventListener('click', (e) => {
    try {
      const target = e.target.closest && e.target.closest('.pools-btn');
      if (target && target.classList.contains('pools-btn')) {
        e.preventDefault();
        e.stopPropagation();
        showPoolsNavigationModal();
      }
    } catch (err) {}
  });

  function showPoolsNavigationModal() {
    try {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.style.zIndex = 1220;

      const card = document.createElement('article');
      card.className = 'fencer-card modal-card';
      card.innerHTML = `
        <div class="fencer-row" style="flex-direction:column; align-items:stretch; gap:20px;">
          <div class="fencer-name"><span style="font-size:1.12rem; font-weight:700;">Would you like to save your changes and move on to Pools?</span></div>
          <div class="fencer-name"><span style="font-size:0.98rem; font-weight:400; line-height:1.4;">If not, continue editing Seeding to your preference.</span></div>
          <div class="meta-actions" style="display:flex; flex-direction:row; justify-content:flex-end; align-items:center; gap:14px;">
            <button class="frutiger-aero-button modal-cancel">Cancel</button>
            <button class="frutiger-aero-button modal-confirm" style="--hue:140deg;">Save & Continue</button>
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

      const cancelBtn = card.querySelector('.modal-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); cleanup(); });

      const confirmBtn = card.querySelector('.modal-confirm');
      if (confirmBtn) confirmBtn.addEventListener('click', (e) => {
        e.preventDefault();
        try {
          if (seedingDirty && currentPools && currentPools.length > 0) {
            sessionStorage.setItem('fencingapp:seeding-pools', JSON.stringify(currentPools));
            console.log('Seeding saved before navigation:', currentPools);
          }
          cleanup();
          setTimeout(() => { window.location.href = '/pools'; }, 30);
        } catch (err) {
          console.error('Save and navigate failed:', err);
          cleanup();
          setTimeout(() => { window.location.href = '/pools'; }, 30);
        }
      });

      overlay.addEventListener('click', (ev) => { if (ev.target === overlay) cleanup(); });

    } catch (e) { console.error('showPoolsNavigationModal error', e); }
  }

});

// Remove-on-click with fade, only when in removal mode via universal nav button
// (moved handlers/functions inside DOMContentLoaded scope above)
