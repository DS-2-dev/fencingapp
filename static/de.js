document.addEventListener('DOMContentLoaded', () => {
  // Remove Fencer button: toggle removal mode and allow fencer removal with modal (match Pools page)
  let deRemoveMode = false;
  const removeCopyBtn = document.querySelector('.remove-copy-btn');
  const deCardsStack = document.getElementById('de-cards-stack');
  const saveBtn = document.querySelector('.save-btn');
  let deDirty = false;

  function markDirty() {
    deDirty = true;
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.classList.remove('disabled');
      try { saveBtn.removeAttribute('aria-disabled'); } catch(e){}
      try { saveBtn.removeAttribute('tabindex'); } catch(e){}
    }
  }

  function markClean() {
    deDirty = false;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.classList.add('disabled');
      try { saveBtn.setAttribute('aria-disabled', 'true'); } catch(e){}
      try { saveBtn.setAttribute('tabindex', '-1'); } catch(e){}
    }
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', (e) => {
      e && e.preventDefault();
      try {
        // Persist DE order (flat array of fencer ids) and pair scores
        const order = [];
        const scores = [];
        const wrappers = container.querySelectorAll('.de-pair-wrapper');
        wrappers.forEach((wrap) => {
          const cards = wrap.querySelectorAll('.de-pair-cards .fencer-card');
          cards.forEach(c => { if (c && c.dataset && c.dataset.id) order.push(c.dataset.id); });
          const inputs = Array.from(wrap.querySelectorAll('.score-input'));
          scores.push(inputs.map(inp => inp.value));
        });
        try { sessionStorage.setItem('fencingapp:de-order', JSON.stringify(order)); } catch(e) {}
        try { sessionStorage.setItem('fencingapp:de-scores', JSON.stringify(scores)); } catch(e) {}
      } catch (err) { console.error('Failed to save DE state', err); }
      markClean();
      console.log('DE Save clicked');
    });
  }
  if (removeCopyBtn) {
    removeCopyBtn.classList.remove('disabled');
    removeCopyBtn.removeAttribute('aria-disabled');
    removeCopyBtn.removeAttribute('tabindex');
    removeCopyBtn.style.pointerEvents = 'auto';
    removeCopyBtn.addEventListener('click', function(e) {
      e.preventDefault();
      deRemoveMode = !deRemoveMode;
      removeCopyBtn.classList.toggle('remove-active', deRemoveMode);
      if (deCardsStack) {
        if (deRemoveMode) deCardsStack.classList.add('removal-mode');
        else deCardsStack.classList.remove('removal-mode');
      }
    });
  }

  // Click handler for fencer cards in removal mode
  if (deCardsStack) {
    deCardsStack.addEventListener('click', function(e) {
      if (!deRemoveMode) return;
      const card = e.target.closest('.fencer-card');
      if (!card || !deCardsStack.contains(card)) return;
      // Show confirmation modal
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.style.zIndex = 1220;
      const modalCard = document.createElement('article');
      modalCard.className = 'fencer-card modal-card pool-delete-modal';
      // derive a friendly name like Pools modal
      const rawName = (card.querySelector('.fencer-fullname') && card.querySelector('.fencer-fullname').textContent) ? card.querySelector('.fencer-fullname').textContent : (card.dataset && card.dataset.fencerName ? card.dataset.fencerName : '');
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
      const parsed = parseNameLocal(rawName || '');
      const lastUpper = (parsed.last || '').toString().toUpperCase();
      const friendlyName = [parsed.first, lastUpper].filter(Boolean).join(' ').trim() || rawName || 'this fencer';

      modalCard.innerHTML = `
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
      overlay.appendChild(modalCard);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => { overlay.classList.add('modal-active'); modalCard.classList.add('fade-enter-active'); });
      document.body.classList.add('modal-open');
      const cleanup = () => {
        try { overlay.classList.remove('modal-active'); modalCard.classList.remove('fade-enter-active'); document.body.classList.remove('modal-open'); setTimeout(() => { try { overlay && overlay.remove(); } catch(e) {} }, 520); } catch(e) {}
      };
      modalCard.querySelector('.modal-cancel').addEventListener('click', (ev) => { ev.preventDefault(); cleanup(); });
      // Focus behavior for the reason input
      const reasonInput = modalCard.querySelector('.reason-input');
      if (reasonInput) {
        reasonInput.addEventListener('mouseenter', () => { try { reasonInput.focus(); if (typeof reasonInput.select === 'function') reasonInput.select(); } catch(e){} });
        reasonInput.addEventListener('touchstart', () => { try { reasonInput.focus(); if (typeof reasonInput.select === 'function') reasonInput.select(); } catch(e){} }, { passive: true });
      }

      modalCard.querySelector('.modal-confirm').addEventListener('click', (ev) => {
        ev.preventDefault();
        // capture optional reason and log it similarly to Pools
        try {
          const fid = card.dataset && card.dataset.id ? card.dataset.id : '';
          const reasonVal = (modalCard.querySelector('.reason-input') && modalCard.querySelector('.reason-input').value) || '';
          try {
            const logKey = 'fencingapp:seeding-removals';
            const raw = sessionStorage.getItem(logKey);
            const arr = raw ? JSON.parse(raw) : [];
            arr.push({ id: fid, name: rawName, reason: reasonVal, at: new Date().toISOString(), source: 'de' });
            sessionStorage.setItem(logKey, JSON.stringify(arr));
          } catch (err) { /* ignore logging errors */ }
        } catch (e) {}
        // Animate card removal using transitionend event (Pools method)
        card.offsetWidth; // force reflow
        card.classList.add('removing');
        let handled = false;
        const finish = () => {
          if (handled) return; handled = true;
          try { markDirty(); } catch(e) {}
          card.remove();
          cleanup();
          deRemoveMode = false;
          if (removeCopyBtn) removeCopyBtn.classList.remove('remove-active');
          if (deCardsStack) deCardsStack.classList.remove('removal-mode');
        };
        const onEnd = (ev) => {
          if (ev && ev.propertyName && ev.propertyName !== 'opacity') return;
          card.removeEventListener('transitionend', onEnd);
          finish();
        };
        card.addEventListener('transitionend', onEnd);
        setTimeout(() => onEnd(), 420);
      });
      overlay.addEventListener('click', (ev) => { if (ev.target === overlay) cleanup(); });
    });
  }
      // Add de-nav-muted to body for proper Results button style
      try { document.body.classList.add('de-nav-muted'); } catch(e) {}
    // Gray out Results button and show modal on click
    try {
      const resultsBtn = document.querySelector('.results-btn');
      if (resultsBtn) {
        resultsBtn.classList.add('disabled');
        resultsBtn.setAttribute('aria-disabled', 'true');
        resultsBtn.setAttribute('tabindex', '-1');
        resultsBtn.style.pointerEvents = 'auto'; // allow click for modal
        resultsBtn.addEventListener('click', function(e) {
          e.preventDefault();
          // Create modal overlay
          const overlay = document.createElement('div');
          overlay.className = 'modal-overlay';
          overlay.setAttribute('role', 'dialog');
          overlay.style.zIndex = 1220;
          // Modal card
          const card = document.createElement('article');
          card.className = 'fencer-card modal-card';
          card.style.maxWidth = '480px';
          card.innerHTML = `
            <div class="fencer-row">
              <div class="fencer-left">
                <div class="fencer-name" style="font-size:1.12rem; font-weight:700; margin-bottom:8px;">It seems this bracket isn't complete!</div>
                <div class="fencer-meta" style="margin-bottom:18px; font-size:1rem;">Do you want to continue with current results?</div>
                <div class="meta-actions" style="margin-top:10px; display:flex; gap:10px; justify-content:flex-end;">
                  <button class="frutiger-aero-button modal-cancel confirm-btn" style="--hue:0deg; --sat:0;">Cancel</button>
                  <button class="frutiger-aero-button modal-confirm" style="--hue:140deg;">Yes</button>
                </div>
              </div>
            </div>`;
          overlay.appendChild(card);
          document.body.appendChild(overlay);
          requestAnimationFrame(() => { overlay.classList.add('modal-active'); card.classList.add('fade-enter-active'); });
          document.body.classList.add('modal-open');
          // Modal button handlers
          const cleanup = () => {
            try { overlay.classList.remove('modal-active'); card.classList.remove('fade-enter-active'); document.body.classList.remove('modal-open'); setTimeout(() => { try { overlay && overlay.remove(); } catch(e) {} }, 520); } catch(e) {}
          };
          card.querySelector('.modal-cancel').addEventListener('click', (e) => { e.preventDefault(); cleanup(); });
          card.querySelector('.modal-confirm').addEventListener('click', (e) => {
            e.preventDefault();
            cleanup();
            window.location.href = '/results';
          });
          overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
        });
      }
    } catch (e) {}
  // Gray out Add Fencer button on DE page
  try {
    const addFencerBtn = document.querySelector('.add-fencer-btn');
    if (addFencerBtn) {
      addFencerBtn.classList.add('disabled');
      addFencerBtn.setAttribute('aria-disabled', 'true');
      addFencerBtn.setAttribute('tabindex', '-1');
      addFencerBtn.style.pointerEvents = 'none';
    }
  } catch (e) {}
  // Populate DE cards stack by reusing the same fencer card markup used on Check-in
  const container = document.getElementById('de-cards-stack');
  if (!container) return;

  // Try sessionStorage first (imports are stored there); fall back to localStorage
  let fencers = [];
  try {
    const raw = sessionStorage.getItem('fencingapp:fencers') || localStorage.getItem('fencingapp:fencers');
    if (raw) fencers = JSON.parse(raw) || [];
  } catch (e) { fencers = []; }

  // If an explicit DE order exists (array of ids), use it to order fencers
  try {
    const orderRaw = sessionStorage.getItem('fencingapp:de-order') || localStorage.getItem('fencingapp:de-order');
    if (orderRaw) {
      const order = JSON.parse(orderRaw) || [];
      if (Array.isArray(order) && order.length) {
        const byId = (fencers || []).reduce((m, f) => { m[f.id] = f; return m; }, {});
        fencers = order.map(id => byId[id]).filter(Boolean);
      }
    }
  } catch (e) {}

  // If no fencers, show a friendly hint
  if (!fencers || fencers.length === 0) {
    container.innerHTML = '<div class="empty-note">No fencers available. Import participants on the Check-in page.</div>';
    return;
  }

  // Helper to render a single fencer card DOM node (simple subset of checkin card)
  function makeFencerCard(f) {
    const card = document.createElement('article');
    card.className = 'fencer-card';
    card.setAttribute('data-id', f.id || '');
    const name = escapeHtml(f.name || '');
    const rank = (f.rank || '').toString().trim();
    const club = (f.club || '').toString().trim();
    let meta = '';
    if (rank && club) meta = `${escapeHtml(rank)} · ${escapeHtml(club)}`;
    else if (rank) meta = escapeHtml(rank);
    else if (club) meta = escapeHtml(club);
    card.innerHTML = `
      <div class="fencer-row">
        <div class="fencer-left">
          <div class="fencer-name"><span class="fencer-fullname">${name}</span></div>
          <div class="fencer-meta">${meta}</div>
        </div>
        <div class="card-actions" aria-hidden="false">
          <button class="frutiger-aero-button card-action info-btn" type="button" aria-label="Information" data-action="info" data-id="${escapeHtml(f.id || '')}">📋</button>
        </div>
      </div>
    `;
    return card;
  }

  // Score helpers for pair validation and win highlighting
  function parseScore(v) {
    const n = parseInt((v||'').toString().trim(), 10);
    if (Number.isNaN(n)) return null;
    return n;
  }

  function updatePairState(pairEl) {
    const pair = pairEl.querySelector('.de-pair');
    const inputs = pairEl.querySelectorAll('.score-input');
    if (!inputs || inputs.length === 0) return;
    const a = inputs[0];
    const b = inputs[1];
    const va = parseScore(a.value);
    const vb = b ? parseScore(b.value) : null;

    // Remove any advancing element for this pair
    const container = pairEl.parentElement;
    let advancingEl = pairEl.querySelector('.advancing-wrapper');
    if (advancingEl) pairEl.removeChild(advancingEl);

    // Clear error/win states
    a.classList.remove('score-input-win', 'score-input-error');
    if (b) b.classList.remove('score-input-win', 'score-input-error');

    // Validate ranges. Non-numeric or out-of-range is an error.
    const invalidA = va === null || va < 0 || va > 15;
    const invalidB = vb === null || vb < 0 || vb > 15;
    if (invalidA && a.value.trim() !== '') a.classList.add('score-input-error');
    if (b && invalidB && b.value.trim() !== '') b.classList.add('score-input-error');

    // If one reached 15 and the other did not, mark winner
    if (va === 15 && vb !== 15) {
      a.classList.add('score-input-win');
      // Create advancing
      const winnerCard = pair.querySelector('.de-pair-cards .fencer-card:first-child');
      const winnerId = winnerCard.dataset.id;
      const winnerFencer = fencers.find(f => f.id == winnerId);
      if (winnerFencer) {
        const advancing = document.createElement('div');
        advancing.className = 'advancing-wrapper';
        const advCard = makeFencerCard(winnerFencer);
        const advInput = document.createElement('input');
        advInput.type = 'text';
        advInput.className = 'score-input';
        advInput.setAttribute('inputmode', 'numeric');
        advInput.setAttribute('placeholder', '#');
        // size advancing to match the pair's card width so it doesn't fill full area
        try {
          const cardsCol = pair.querySelector('.de-pair-cards');
          if (cardsCol) {
            const w = Math.round(cardsCol.getBoundingClientRect().width);
            advancing.style.width = w + 'px';
          }
        } catch (e) {}
        advancing.appendChild(advCard);
        advInput.addEventListener('input', () => { try { markDirty(); } catch(e){}; try { updatePairState(pairEl); } catch(e){} });
        advInput.addEventListener('blur', () => { try { updatePairState(pairEl); } catch(e){} });
        advancing.appendChild(advInput);
        pairEl.appendChild(advancing);
        // ensure advancing element is visible by scrolling the DE stack if needed
        try {
          const root = pairEl.closest('.de-cards-stack') || document.getElementById('de-cards-stack');
          if (root) {
            const advRect = advancing.getBoundingClientRect();
            const rootRect = root.getBoundingClientRect();
            const over = advRect.right - rootRect.right + 12; // small padding
            if (over > 0) root.scrollLeft += Math.ceil(over);
          }
        } catch (e) {}
      }
      return;
    }
    if (vb === 15 && va !== 15) {
      b.classList.add('score-input-win');
      // Create advancing
      const winnerCard = pair.querySelector('.de-pair-cards .fencer-card:nth-child(2)');
      const winnerId = winnerCard.dataset.id;
      const winnerFencer = fencers.find(f => f.id == winnerId);
      if (winnerFencer) {
        const advancing = document.createElement('div');
        advancing.className = 'advancing-wrapper';
        const advCard = makeFencerCard(winnerFencer);
        const advInput = document.createElement('input');
        advInput.type = 'text';
        advInput.className = 'score-input';
        advInput.setAttribute('inputmode', 'numeric');
        advInput.setAttribute('placeholder', '#');
        try {
          const cardsCol = pair.querySelector('.de-pair-cards');
          if (cardsCol) {
            const w = Math.round(cardsCol.getBoundingClientRect().width);
            advancing.style.width = w + 'px';
          }
        } catch (e) {}
        advancing.appendChild(advCard);
        advInput.addEventListener('input', () => { try { markDirty(); } catch(e){}; try { updatePairState(pairEl); } catch(e){} });
        advInput.addEventListener('blur', () => { try { updatePairState(pairEl); } catch(e){} });
        advancing.appendChild(advInput);
        pairEl.appendChild(advancing);
        // ensure advancing element is visible by scrolling the DE stack if needed
        try {
          const root = pairEl.closest('.de-cards-stack') || document.getElementById('de-cards-stack');
          if (root) {
            const advRect = advancing.getBoundingClientRect();
            const rootRect = root.getBoundingClientRect();
            const over = advRect.right - rootRect.right + 12;
            if (over > 0) root.scrollLeft += Math.ceil(over);
          }
        } catch (e) {}
      }
      return;
    }

    // If both are 15 -> error (no ties allowed)
    if (va === 15 && vb === 15) {
      a.classList.add('score-input-error');
      if (b) b.classList.add('score-input-error');
      return;
    }

    // Otherwise ensure no win markers and both enabled
    if (a) a.classList.remove('score-input-win', 'score-input-error');
    if (b) { b.classList.remove('score-input-win', 'score-input-error'); }
  }

  // Simple HTML escaper
  function escapeHtml(s) { return (s||'').toString().replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]; }); }

  // Build pairs sequentially
  const frag = document.createDocumentFragment();
  for (let i = 0; i < fencers.length; i += 2) {
    const a = fencers[i];
    const b = fencers[i+1];
    // wrapper holds the stacked pair and the external controls (score inputs)
    const pairWrapper = document.createElement('div');
    pairWrapper.className = 'de-pair-wrapper';

    const pairWrap = document.createElement('div');
    pairWrap.className = 'de-pair' + (b ? '' : ' bye');

    // controls container: inside the pair, displays score inputs vertically
    const controls = document.createElement('div');
    controls.className = 'pair-controls';
    // first input for the top card
    const inputA = document.createElement('input');
    inputA.type = 'text';
    inputA.className = 'score-input';
    inputA.setAttribute('inputmode', 'numeric');
    inputA.setAttribute('placeholder', '#');
    inputA.dataset.pos = '0';
    // second input if opponent exists
    let inputB = null;
    if (b) {
      inputB = document.createElement('input');
      inputB.type = 'text';
      inputB.className = 'score-input';
      inputB.setAttribute('inputmode', 'numeric');
      inputB.setAttribute('placeholder', '#');
      inputB.dataset.pos = '1';
    }
    controls.appendChild(inputA);
    if (inputB) controls.appendChild(inputB);

    // cards container
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'de-pair-cards';
    if (a) cardsContainer.appendChild(makeFencerCard(a));
    if (b) cardsContainer.appendChild(makeFencerCard(b));

    pairWrap.appendChild(cardsContainer);
    pairWrap.appendChild(controls);

    // wire live validation on input and mark dirty on change
    const validate = () => updatePairState(pairWrapper);
    inputA.addEventListener('input', () => { try { markDirty(); } catch(e){}; validate(); });
    inputA.addEventListener('blur', validate);
    if (inputB) {
      inputB.addEventListener('input', () => { try { markDirty(); } catch(e){}; validate(); });
      inputB.addEventListener('blur', validate);
    }

    pairWrapper.appendChild(pairWrap);
    frag.appendChild(pairWrapper);
    // subtle separator between groups
    const sep = document.createElement('div'); sep.className = 'pair-sep'; frag.appendChild(sep);
  }

  container.appendChild(frag);

  // Initialize save button state as clean/disabled
  try { markClean(); } catch(e) {}

  // After rendering, sync input heights to match the corresponding card heights
  function syncControlHeights() {
    try {
      const wrappers = container.querySelectorAll('.de-pair-wrapper');
      wrappers.forEach((wrap) => {
        const pair = wrap.querySelector('.de-pair');
        const controls = wrap.querySelectorAll('.pair-controls .score-input, .pair-controls input.score-input');
        // If controls were created as direct children (older code), also try .pair-controls
        const controlContainer = wrap.querySelector('.pair-controls') || wrap.querySelector('div:nth-child(2)');
        const inputs = controlContainer ? Array.from(controlContainer.querySelectorAll('.score-input')) : Array.from(controls);
        const cards = pair ? Array.from(pair.querySelectorAll('.fencer-card')) : [];
        // Map top card -> first input, bottom card -> second input
        if (inputs.length > 0 && cards.length > 0) {
          const aH = Math.max(36, Math.round(cards[0].getBoundingClientRect().height));
          inputs[0].style.height = aH + 'px';
        }
        if (inputs.length > 1 && cards.length > 1) {
          const bH = Math.max(36, Math.round(cards[1].getBoundingClientRect().height));
          inputs[1].style.height = bH + 'px';
        }
      });
    } catch (e) {}
  }

  // Debounced resize handler
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { syncControlHeights(); resizeTimer = null; }, 100);
  });
  // initial sync
  requestAnimationFrame(syncControlHeights);

});
