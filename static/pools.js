document.addEventListener('DOMContentLoaded', () => {
  const poolBtn = document.querySelector('.pool-btn');
  const moveFencerBtn = document.querySelector('.move-fencer-btn');
  const advancementBtn = document.querySelector('.advancement-btn');
  const connectDeviceBtn = document.querySelector('.connect-device-btn');
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
    if (advancementBtn) {
      const isComplete = isPoolComplete();
      if (isComplete) {
        advancementBtn.classList.remove('disabled');
        advancementBtn.removeAttribute('aria-disabled');
        advancementBtn.disabled = false;
      } else {
        advancementBtn.classList.add('disabled');
        advancementBtn.setAttribute('aria-disabled', 'true');
        advancementBtn.disabled = true;
      }
    }
  }

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
    if (allComplete) body.classList.remove('pools-nav-muted');
    else body.classList.add('pools-nav-muted');
  }

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
            <button class="frutiger-aero-button modal-close">Close</button>
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
              <button class="frutiger-aero-button modal-cancel">Cancel</button>
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

  if (advancementBtn) {
    advancementBtn.addEventListener('click', () => {
      console.log('Advancement button clicked');
      // TODO: Implement advancement rules functionality
    });
  }

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
  updatePoolButtonText();
  renderCurrentPool();
  updatePoolsNavState();

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
            <button class="frutiger-aero-button modal-cancel">Cancel</button>
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
              <button class="frutiger-aero-button modal-cancel">Cancel</button>
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
            <button class="frutiger-aero-button modal-cancel">Cancel</button>
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
});
