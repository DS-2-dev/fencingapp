document.addEventListener('DOMContentLoaded', () => {
  // Remove Fencer button: toggle removal mode and allow fencer removal with modal (match Pools page)
  let deRemoveMode = false;
  const removeCopyBtn = document.querySelector('.remove-copy-btn');
  const container = document.getElementById('de-cards-stack');
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
          const cards = wrap.querySelectorAll('.de-pair-cards .pair-fencer, .de-pair-cards .fencer-card');
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
      if (container) {
        if (deRemoveMode) container.classList.add('removal-mode');
        else container.classList.remove('removal-mode');
      }
    });
  }

  // Click handler for fencer cards in removal mode
  if (container) {
    container.addEventListener('click', function(e) {
      if (!deRemoveMode) return;
      const card = e.target.closest('.fencer-card');
      if (!card || !container.contains(card)) return;
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
          <div class="fencer-name"><span style="font-size:1.12rem; font-weight:700;">You are going to remove ${escapeHtml(friendlyName)} in an important stage!</span></div>
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
          if (container) container.classList.remove('removal-mode');
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
  if (!container) return;

  // Propagation slots for building next-round advancing pairs
  // Keyed by slot index (0..), holds entries from two source pairs
  const propagationSlots = {};

  // Centralized cleanup utility: remove duplicate/leftover advancing wrappers.
  // Accepts either a single `winnerId`, an array `winnerIds`, or a `sourceKey` to
  // identify advancing elements to dedupe. When `preferCombined` is true, any
  // `.combined-adv` element will be kept over plain per-pair advancing wrappers.
  function cleanupAdvancingDuplicates({ sourceKey = null, winnerId = null, winnerIds = null, preferCombined = true } = {}) {
    try {
      if (!container) return;
      const advs = Array.from(container.querySelectorAll('.advancing-wrapper'));
      // Group candidates by winner id (if available) or by sourceKey
      const toKeep = new Set();
      const matches = [];
      advs.forEach((adv) => {
        try {
          let match = false;
          if (sourceKey && adv.dataset && adv.dataset.source && String(adv.dataset.source) === String(sourceKey)) match = true;
          if (!match && winnerId) {
            const inner = adv.querySelector && adv.querySelector('.fencer-card');
            const cid = inner && inner.getAttribute ? inner.getAttribute('data-id') : null;
            if (cid && String(cid) === String(winnerId)) match = true;
          }
          if (!match && Array.isArray(winnerIds) && winnerIds.length) {
            const inner = adv.querySelector && adv.querySelector('.fencer-card');
            const cid = inner && inner.getAttribute ? inner.getAttribute('data-id') : null;
            if (cid && winnerIds.indexOf(String(cid)) !== -1) match = true;
          }
          if (match) matches.push(adv);
        } catch (e) {}
      });
      if (!matches.length) return;
      // Prefer keeping combined-adv if requested
      let keeper = null;
      if (preferCombined) keeper = matches.find(m => m.classList && m.classList.contains('combined-adv')) || null;
      if (!keeper) keeper = matches[0];
      // Remove all others
      matches.forEach(m => { try { if (m !== keeper) m.remove(); } catch (e) {} });
    } catch (e) { /* ignore cleanup errors */ }
  }

  

  function getPairIndex(pairWrapper) {
    const wrappers = Array.from(container.querySelectorAll('.de-pair-wrapper'));
    return wrappers.indexOf(pairWrapper);
  }

  function addWinnerForPropagation(pairWrapper, winnerFencer, advInput) {
    try {
      const pairIndex = getPairIndex(pairWrapper);
      if (pairIndex < 0) {
        console.log('addWinnerForPropagation: pairWrapper not found in main list. wrappers length=', container ? container.querySelectorAll('.de-pair-wrapper').length : 'no-container', 'pairWrapper=', pairWrapper);
        return;
      }
      const slot = Math.floor(pairIndex / 2);
      if (!propagationSlots[slot]) propagationSlots[slot] = { entries: [], elem: null };
      // avoid duplicate registration for same pair
      const exists = propagationSlots[slot].entries.some(e => e.pairIndex === pairIndex);
      if (exists) {
        // update existing entry with latest advInput (advancing elements may be recreated)
        const idx = propagationSlots[slot].entries.findIndex(e => e.pairIndex === pairIndex);
        if (idx >= 0) {
          propagationSlots[slot].entries[idx].pairWrapper = pairWrapper;
          propagationSlots[slot].entries[idx].winnerFencer = winnerFencer;
          propagationSlots[slot].entries[idx].advInput = advInput;
          console.log('addWinnerForPropagation: updated existing entry for slot', slot, { pairIndex, winnerId: winnerFencer && winnerFencer.id });
          // ensure listeners are attached to newest inputs
          try { if (propagationSlots[slot].entries.length === 2) createCombinedSlot(slot); } catch (e) { console.log('addWinnerForPropagation: createCombinedSlot failed on update', e); }
        }
        return;
      }
      propagationSlots[slot].entries.push({ pairIndex, pairWrapper, winnerFencer, advInput });
      console.log('addWinnerForPropagation: registered', { pairIndex, slot, winnerId: winnerFencer && winnerFencer.id });
      // when two winners are present for this slot, create a combined advancing slot
      if (propagationSlots[slot].entries.length === 2) createCombinedSlot(slot);
    } catch (e) {}
  }

  // Attach listeners for the combined slot inputs; safe to call multiple times
  function attachCombinedListeners(slot) {
    try {
      const slotObj = propagationSlots[slot];
      if (!slotObj || !slotObj.entries || slotObj.entries.length < 2) return;
      const a = slotObj.entries[0];
      const b = slotObj.entries[1];
      const inA = a.advInput || a.pairWrapper.querySelector('.advancing-wrapper .score-input');
      const inB = b.advInput || b.pairWrapper.querySelector('.advancing-wrapper .score-input');

      function checkLinkedAdvLocal() {
        try {
          const va = parseScore(inA ? inA.value : '');
          const vb = parseScore(inB ? inB.value : '');
          if (inA) { inA.classList.remove('score-input-win', 'score-input-error'); }
          if (inB) { inB.classList.remove('score-input-win', 'score-input-error'); }
          const invalidA = va === null || va < 0 || va > 15;
          const invalidB = vb === null || vb < 0 || vb > 15;
          if (inA && invalidA && inA.value.trim() !== '') inA.classList.add('score-input-error');
          if (inB && invalidB && inB.value.trim() !== '') inB.classList.add('score-input-error');
          if (va === 15 && vb !== 15) {
            if (inA) inA.classList.add('score-input-win');
            console.log('attachCombinedListeners: advancing winner from entry A', { slot, winnerId: a.winnerFencer && a.winnerFencer.id });
            // Reset created flag to allow re-creation if needed
            if (slotObj) slotObj.created = false;
            createNextFromAdvSlot(slot, a.winnerFencer);
          } else if (vb === 15 && va !== 15) {
            if (inB) inB.classList.add('score-input-win');
            console.log('attachCombinedListeners: advancing winner from entry B', { slot, winnerId: b.winnerFencer && b.winnerFencer.id });
            // Reset created flag to allow re-creation if needed
            if (slotObj) slotObj.created = false;
            createNextFromAdvSlot(slot, b.winnerFencer);
          }
          try {
            // Prefer combined adv; remove duplicates for this slot/winner before appending
            const winnerIds = [];
            try { if (a && a.winnerFencer && a.winnerFencer.id) winnerIds.push(String(a.winnerFencer.id)); } catch (e) {}
            try { if (b && b.winnerFencer && b.winnerFencer.id) winnerIds.push(String(b.winnerFencer.id)); } catch (e) {}
            try { cleanupAdvancingDuplicates({ winnerIds, preferCombined: true }); } catch (e) {}
          } catch (e) {}
        } catch (e) { console.log('checkLinkedAdvLocal error', e); }
      }

      // remove previous listeners if present
      if (slotObj._listeners) {
        try {
          if (slotObj._listeners.inARef && slotObj._listeners.inAFn && slotObj._listeners.inARef.removeEventListener) slotObj._listeners.inARef.removeEventListener('input', slotObj._listeners.inAFn);
          if (slotObj._listeners.inBRef && slotObj._listeners.inBFn && slotObj._listeners.inBRef.removeEventListener) slotObj._listeners.inBRef.removeEventListener('input', slotObj._listeners.inBFn);
        } catch (e) { console.log('attachCombinedListeners: failed to remove old listeners', e); }
      }

      const listenerA = () => { try { markDirty(); } catch (e) {} ; checkLinkedAdvLocal(); };
      const listenerB = () => { try { markDirty(); } catch (e) {} ; checkLinkedAdvLocal(); };
      if (inA && inA.addEventListener) inA.addEventListener('input', listenerA);
      if (inB && inB.addEventListener) inB.addEventListener('input', listenerB);
      slotObj._listeners = { inARef: inA, inBRef: inB, inAFn: listenerA, inBFn: listenerB };
      // initial evaluation
      try { checkLinkedAdvLocal(); } catch (e) {}
    } catch (e) { console.log('attachCombinedListeners error', e); }
  }

  // Register an advancing winner (created absolutely positioned) into the next-level slot
  function registerAdvWinnerForNextSlot(currentSlot, winnerFencer, advInput, advElem) {
    try {
      const nextSlot = Math.floor(currentSlot / 2);
      if (!propagationSlots[nextSlot]) propagationSlots[nextSlot] = { entries: [], elem: null };
      // Use a synthetic pairIndex marker to avoid collisions
      const pairIndex = 'adv-' + currentSlot;
      const exists = propagationSlots[nextSlot].entries.some(e => e.pairIndex === pairIndex);
      if (exists) return;
      propagationSlots[nextSlot].entries.push({ pairIndex, pairWrapper: advElem, winnerFencer, advInput });
      console.log('registerAdvWinnerForNextSlot: registered adv into nextSlot', { currentSlot, nextSlot, winnerId: winnerFencer && winnerFencer.id });
      if (propagationSlots[nextSlot].entries.length === 2) createCombinedSlot(nextSlot);
    } catch (e) {}
  }

  // Remove any propagation registrations and created advancing elements for a given pair wrapper
  function removePropagationEntriesForPair(pairWrapper) {
    try {
      // gather fencer ids from this pair to identify propagation entries
      const ids = [];
      try {
        const rows = Array.from(pairWrapper.querySelectorAll('.pair-fencer, .fencer-card'));
        rows.forEach(r => { try { if (r && r.dataset && r.dataset.id) ids.push(String(r.dataset.id)); } catch (e) {} });
      } catch (e) {}
      Object.keys(propagationSlots).forEach((sKey) => {
        const s = Number(sKey);
        const slotObj = propagationSlots[s];
        if (!slotObj || !slotObj.entries) return;
        // remove entries that reference this pairWrapper or whose winner matches
        // any fencer in this pair (covers adv- markers too)
        const before = slotObj.entries.length;
        slotObj.entries = slotObj.entries.filter(e => {
          try { if (!e) return true; } catch (e) { return true; }
          if (e.pairWrapper === pairWrapper) return false;
          if (e.winnerFencer && ids.indexOf(String(e.winnerFencer.id)) !== -1) return false;
          // keep adv- markers unless they reference this slot numerically
          return true;
        });
        // detach any listeners for combined slot
        try {
          if (slotObj._listeners) {
            try { if (slotObj._listeners.inARef && slotObj._listeners.inAFn && slotObj._listeners.inARef.removeEventListener) slotObj._listeners.inARef.removeEventListener('input', slotObj._listeners.inAFn); } catch (e) {}
            try { if (slotObj._listeners.inBRef && slotObj._listeners.inBFn && slotObj._listeners.inBRef.removeEventListener) slotObj._listeners.inBRef.removeEventListener('input', slotObj._listeners.inBFn); } catch (e) {}
            slotObj._listeners = null;
          }
        } catch (e) {}
        // if fewer than 2 entries remain, remove any combined element and clear created flag
        if (!slotObj.entries || slotObj.entries.length < 2) {
          try { if (slotObj.elem && slotObj.elem.parentElement) slotObj.elem.parentElement.removeChild(slotObj.elem); } catch (e) {}
          slotObj.elem = null;
          slotObj.created = false;
        }
        // Also cleanup upward registrations that used this slot as source (adv-<s>)
        try {
          const nextSlot = Math.floor(s / 2);
          if (propagationSlots[nextSlot]) {
            propagationSlots[nextSlot].entries = propagationSlots[nextSlot].entries.filter(e => {
              try { if (!e) return false; } catch (ex) { return false; }
              if (typeof e.pairIndex === 'string' && e.pairIndex === ('adv-' + s)) return false;
              if (e.winnerFencer && ids.indexOf(String(e.winnerFencer.id)) !== -1) return false;
              return true;
            });
            if (propagationSlots[nextSlot].entries.length < 2) {
              try { if (propagationSlots[nextSlot].elem && propagationSlots[nextSlot].elem.parentElement) propagationSlots[nextSlot].elem.parentElement.removeChild(propagationSlots[nextSlot].elem); } catch (e) {}
              propagationSlots[nextSlot].elem = null;
              propagationSlots[nextSlot].created = false;
            }
          }
        } catch (e) {}
      });
    } catch (e) { console.log('removePropagationEntriesForPair error', e); }
  }

  // Remove any existing advancing-wrapper elements that reference the given
  // pair (by its dataset round/index) or the given winner id. Used to avoid
  // duplicate/leftover advancing cards when creating new ones.
  function removeExistingAdvancingFor(pairEl, winnerId) {
    try {
      const srcKey = (pairEl && pairEl.dataset && pairEl.dataset.round ? pairEl.dataset.round : '') + '-' + (pairEl && pairEl.dataset && pairEl.dataset.index ? pairEl.dataset.index : '');
      const advs = Array.from(container.querySelectorAll('.advancing-wrapper'));
      advs.forEach((adv) => {
        try {
          if (adv.dataset && adv.dataset.source && String(adv.dataset.source) === String(srcKey)) { adv.remove(); return; }
          const inner = adv.querySelector && adv.querySelector('.fencer-card');
          if (inner) {
            const cid = inner.getAttribute && inner.getAttribute('data-id');
            if (cid && winnerId && String(cid) === String(winnerId)) { adv.remove(); return; }
          }
          // also remove any advancing that is appended inside this pairEl
          if (adv.parentElement === pairEl) { adv.remove(); return; }
        } catch (e) {}
      });
    } catch (e) { /* ignore */ }
  }

  function createCombinedSlot(slot) {
    const slotObj = propagationSlots[slot];
    if (!slotObj || slotObj.entries.length < 2) return;
    try {
      const a = slotObj.entries[0];
      const b = slotObj.entries[1];
      console.log('createCombinedSlot: entries', slot, slotObj.entries.map(en => ({ pairIndex: en.pairIndex, winnerId: en.winnerFencer && en.winnerFencer.id })));
      // remove any leftover per-pair advancing wrappers so we don't duplicate
      try {
        if (a && a.pairWrapper) {
          const oldA = a.pairWrapper.querySelector && a.pairWrapper.querySelector('.advancing-wrapper');
          if (oldA) oldA.remove();
        }
      } catch (e) {}
      try {
        if (b && b.pairWrapper) {
          const oldB = b.pairWrapper.querySelector && b.pairWrapper.querySelector('.advancing-wrapper');
          if (oldB) oldB.remove();
        }
      } catch (e) {}
      // remove any previous combined element for this slot
      try { if (slotObj && slotObj.elem && slotObj.elem.parentElement) slotObj.elem.parentElement.removeChild(slotObj.elem); } catch (e) {}

      const rectA = a.pairWrapper.getBoundingClientRect();
      const rectB = b.pairWrapper.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const yA = rectA.top + rectA.height / 2 - containerRect.top;
      const yB = rectB.top + rectB.height / 2 - containerRect.top;
      const top = Math.round((yA + yB) / 2);
      const left = Math.round(rectA.right - containerRect.left + 24);
      // Create a visible combined advancing pair UI positioned between sources.
      // This shows both advancing fencers as a single pair card with two inputs
      // so the next-round match can be scored directly.
      const combined = document.createElement('div');
      combined.className = 'advancing-wrapper combined-adv';
      combined.style.position = 'absolute';
      combined.style.left = left + 'px';
      combined.style.top = top + 'px';
      combined.style.transform = 'translateY(-50%)';
      combined.style.zIndex = 20;
          // Clean up any existing advancing-wrapper elements in the container
          // that reference these same winners or are children of the source
          // pair wrappers to avoid leftover prior cards. Prefer combined UI.
          try {
            const winnerIds = [];
            if (a && a.winnerFencer && a.winnerFencer.id) winnerIds.push(String(a.winnerFencer.id));
            if (b && b.winnerFencer && b.winnerFencer.id) winnerIds.push(String(b.winnerFencer.id));
            cleanupAdvancingDuplicates({ winnerIds, preferCombined: true });
          } catch (e) {}

      // Build the pair structure inside the advancing wrapper
      const combinedPair = document.createElement('div');
      combinedPair.className = 'de-pair fencer-card';
      combinedPair.style.padding = '10px 14px';
      const cardsCol = document.createElement('div');
      cardsCol.className = 'de-pair-cards';

      // Row for entry A
      const rowA = document.createElement('div');
      rowA.className = 'pair-row';
      const fencerA = a.winnerFencer || null;
      const cardA = makePairFencerRow(fencerA, 0);
      const inpA = document.createElement('input'); inpA.type = 'text'; inpA.className = 'score-input'; inpA.setAttribute('inputmode','numeric'); inpA.setAttribute('placeholder','#'); inpA.dataset.pos = '0';
      rowA.appendChild(cardA);
      rowA.appendChild(inpA);

      // Row for entry B
      const rowB = document.createElement('div');
      rowB.className = 'pair-row';
      const fencerB = b.winnerFencer || null;
      const cardB = makePairFencerRow(fencerB, 1);
      const inpB = document.createElement('input'); inpB.type = 'text'; inpB.className = 'score-input'; inpB.setAttribute('inputmode','numeric'); inpB.setAttribute('placeholder','#'); inpB.dataset.pos = '1';
      rowB.appendChild(cardB);
      rowB.appendChild(inpB);

      cardsCol.appendChild(rowA);
      cardsCol.appendChild(rowB);
      combinedPair.appendChild(cardsCol);
      combined.appendChild(combinedPair);
      // size combined width to roughly match source pair width
      try { const refW = Math.round(Math.max(rectA.width, rectB.width)); combined.style.width = (refW + 6) + 'px'; } catch(e) {}
      // Final cleanup before append to avoid race-created duplicates
      try { cleanupAdvancingDuplicates({ winnerIds, preferCombined: true }); } catch (e) {}
      container.appendChild(combined);
      // Re-check microtask after append in case another creation raced in
      try { queueMicrotask(() => cleanupAdvancingDuplicates({ winnerIds, preferCombined: true })); } catch (e) {}
      slotObj.elem = combined;
      // Ensure combined pair has divider immediately
      try { ensureDividerForCard(combinedPair); } catch (e) {}
      // ensure the slot entries reference the combined inputs so propagation
      // code uses the visible combined inputs instead of any removed leftovers
      try { if (slotObj && slotObj.entries && slotObj.entries[0]) slotObj.entries[0].advInput = inpA; } catch (e) {}
      try { if (slotObj && slotObj.entries && slotObj.entries[1]) slotObj.entries[1].advInput = inpB; } catch (e) {}

      // find the advancing inputs from the per-pair wrappers
      const inA = a.advInput || a.pairWrapper.querySelector('.advancing-wrapper .score-input');
      const inB = b.advInput || b.pairWrapper.querySelector('.advancing-wrapper .score-input');

      function checkLinkedAdv() {
        try {
          const va = parseScore(inA ? inA.value : '');
          const vb = parseScore(inB ? inB.value : '');
          if (inA) { inA.classList.remove('score-input-win', 'score-input-error'); }
          if (inB) { inB.classList.remove('score-input-win', 'score-input-error'); }
          const invalidA = va === null || va < 0 || va > 15;
          const invalidB = vb === null || vb < 0 || vb > 15;
          if (inA && invalidA && inA.value.trim() !== '') inA.classList.add('score-input-error');
          if (inB && invalidB && inB.value.trim() !== '') inB.classList.add('score-input-error');
          if (va === 15 && vb !== 15) {
            if (inA) inA.classList.add('score-input-win');
            console.log('checkLinkedAdv: advancing winner from entry A', { slot, winnerId: a.winnerFencer && a.winnerFencer.id });
            // Reset created flag to allow re-creation if needed
            if (slotObj) slotObj.created = false;
            createNextFromAdvSlot(slot, a.winnerFencer);
          } else if (vb === 15 && va !== 15) {
            if (inB) inB.classList.add('score-input-win');
            console.log('checkLinkedAdv: advancing winner from entry B', { slot, winnerId: b.winnerFencer && b.winnerFencer.id });
            // Reset created flag to allow re-creation if needed
            if (slotObj) slotObj.created = false;
            createNextFromAdvSlot(slot, b.winnerFencer);
          }
        } catch (e) {}
      }

      // Also listen to the combined pair's inputs so the next-round match
      // can be scored directly. When a winner is detected, propagate forward.
      function checkCombinedAdv() {
        try {
          const ca = parseScore(inpA.value);
          const cb = parseScore(inpB.value);
          inpA.classList.remove('score-input-win','score-input-error');
          inpB.classList.remove('score-input-win','score-input-error');
          const invA = ca === null || ca < 0 || ca > 15;
          const invB = cb === null || cb < 0 || cb > 15;
          if (invA && inpA.value.trim() !== '') inpA.classList.add('score-input-error');
          if (invB && inpB.value.trim() !== '') inpB.classList.add('score-input-error');
          // 15 wins
          if (ca === 15 && cb !== 15) {
            inpA.classList.add('score-input-win');
            if (slotObj) slotObj.created = false;
            createNextFromAdvSlot(slot, a.winnerFencer);
            return;
          }
          if (cb === 15 && ca !== 15) {
            inpB.classList.add('score-input-win');
            if (slotObj) slotObj.created = false;
            createNextFromAdvSlot(slot, b.winnerFencer);
            return;
          }
          // If neither input indicates a winner and both are empty/invalid,
          // remove any registered propagation entries for the source pairs.
          try {
            const emptyA = ca === null || ca === undefined;
            const emptyB = cb === null || cb === undefined;
            if (emptyA && emptyB) {
              try { if (a && a.pairWrapper) removePropagationEntriesForPair(a.pairWrapper); } catch (e) {}
              try { if (b && b.pairWrapper) removePropagationEntriesForPair(b.pairWrapper); } catch (e) {}
            }
          } catch (e) {}
          // non-15 higher score wins if both present and valid
          if (ca !== null && cb !== null && !invA && !invB && ca !== cb) {
            if (ca > cb) {
              inpA.classList.add('score-input-win');
              if (slotObj) slotObj.created = false;
              createNextFromAdvSlot(slot, a.winnerFencer);
            } else {
              inpB.classList.add('score-input-win');
              if (slotObj) slotObj.created = false;
              createNextFromAdvSlot(slot, b.winnerFencer);
            }
            return;
          }
        } catch (e) { console.log('checkCombinedAdv error', e); }
      }

      if (inA) inA.addEventListener('input', () => { try { markDirty(); } catch (e) {} ; checkLinkedAdv(); });
      if (inB) inB.addEventListener('input', () => { try { markDirty(); } catch (e) {} ; checkLinkedAdv(); });
      if (inpA) inpA.addEventListener('input', () => { try { markDirty(); } catch (e) {} ; checkCombinedAdv(); });
      if (inpB) inpB.addEventListener('input', () => { try { markDirty(); } catch (e) {} ; checkCombinedAdv(); });

    } catch (e) {}
  }

  function createNextFromAdvSlot(slot, winnerFencer) {
    try {
      const slotObj = propagationSlots[slot]; if (!slotObj || !slotObj.elem) return;
      if (slotObj.created) return; // already created a next-round adv for this slot
      const containerRect = container.getBoundingClientRect();
      const slotRect = slotObj.elem.getBoundingClientRect();
      const left = Math.round(slotRect.right - containerRect.left + 24);
      const top = Math.round(slotRect.top - containerRect.top + slotRect.height / 2);
      const adv = document.createElement('div');
      adv.className = 'advancing-wrapper';
      adv.style.position = 'absolute';
      adv.style.left = left + 'px';
      adv.style.top = top + 'px';
      adv.style.transform = 'translateY(-50%)';
      // Use the same builder for card and input as first round
      const advCard = makeFencerCard(winnerFencer);
      adv.appendChild(advCard);
      const advInput = document.createElement('input');
      advInput.type = 'text';
      advInput.className = 'score-input';
      advInput.setAttribute('inputmode', 'numeric');
      advInput.setAttribute('placeholder', '#');
      // Event wiring: mark dirty; do not call updatePairState on absolute adv element
      advInput.addEventListener('input', () => {
        try { markDirty(); } catch(e){};
        // Check if this advancing input reached 15 to propagate further
        try {
          const va = parseScore(advInput.value);
          if (va === 15) {
            // Find which slot this advancing element belongs to
            const currentAdvElem = adv.parentElement;
            let foundSlot = null;
            Object.keys(propagationSlots).forEach(s => {
              const slotObj = propagationSlots[s];
              if (slotObj && slotObj.entries) {
                slotObj.entries.forEach(entry => {
                  if (entry && entry.advInput === advInput) {
                    foundSlot = Number(s);
                  }
                });
              }
            });
            if (foundSlot !== null) {
              console.log('Advancing input reached 15, slot:', foundSlot);
              // Reset created flag so we can create next round element
              if (propagationSlots[foundSlot]) propagationSlots[foundSlot].created = false;
              createNextFromAdvSlot(foundSlot, winnerFencer);
            }
          }
        } catch(e) { console.log('Error checking advancing win:', e); }
      });
      advInput.addEventListener('blur', () => { try { /* no-op for blur on advancing input */ } catch(e){} });
      advInput.addEventListener('mouseenter', () => { try { advInput.focus(); if (typeof advInput.select === 'function') advInput.select(); } catch(e){} });
      advInput.addEventListener('touchstart', () => { try { advInput.focus(); if (typeof advInput.select === 'function') advInput.select(); } catch(e){} }, { passive: true });
      adv.appendChild(advInput);
      // Ensure the adv wrapper has the middle divider for parity
      try { ensureDividerForCard(adv); } catch (e) {}
      // Height sync identical to first round
      requestAnimationFrame(() => {
        try {
          const h = Math.max(36, Math.round(advCard.getBoundingClientRect().height));
          advInput.style.height = h + 'px';
        } catch (e) {}
      });
      // Remove any existing advancing wrappers for this slot or same winner
      try {
        const existing = Array.from(container.querySelectorAll('.advancing-wrapper'));
        existing.forEach(e => {
          try {
            if (e.dataset && e.dataset.source && String(e.dataset.source) === ('adv-' + slot)) { e.remove(); return; }
            const inner = e.querySelector && e.querySelector('.fencer-card');
            if (inner) {
              const cid = inner.getAttribute && inner.getAttribute('data-id');
              if (cid && winnerFencer && String(cid) === String(winnerFencer.id)) { e.remove(); return; }
            }
          } catch (err) {}
        });
      } catch (e) {}
      try { adv.dataset.source = 'adv-' + slot; } catch (e) {}
      // Final cleanup before append to avoid race-created duplicates
      try { cleanupAdvancingDuplicates({ sourceKey: 'adv-' + slot, winnerId: winnerFencer && winnerFencer.id, preferCombined: true }); } catch (e) {}
      container.appendChild(adv);
      try { queueMicrotask(() => cleanupAdvancingDuplicates({ sourceKey: 'adv-' + slot, winnerId: winnerFencer && winnerFencer.id, preferCombined: true })); } catch (e) {}
      slotObj.created = true;
      console.log('createNextFromAdvSlot: created advancing element for slot', { slot, winnerId: winnerFencer && winnerFencer.id });
      // Register this advancing winner into the next-level slot so it can propagate further
      try { registerAdvWinnerForNextSlot(slot, winnerFencer, advInput, adv); } catch (e) { console.log('createNextFromAdvSlot: failed to register adv for next slot', e); }
    } catch (e) {}
  }

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

  // Save current DE scores (array of arrays) into sessionStorage
  function saveCurrentScores() {
    try {
      const wrappers = container.querySelectorAll('.de-pair-wrapper');
      const scores = [];
      wrappers.forEach((wrap) => {
        const inputs = Array.from(wrap.querySelectorAll('.score-input'));
        if (!inputs || inputs.length === 0) return;
        scores.push(inputs.map(inp => inp.value));
      });
      try { sessionStorage.setItem('fencingapp:de-scores', JSON.stringify(scores)); } catch (e) { console.log('saveCurrentScores: sessionStorage set failed', e); }
    } catch (e) { console.log('saveCurrentScores error', e); }
  }

  // If an advancement ordering exists (from Pools), seed the DE bracket from that ranking.
  try {
    const advRaw = sessionStorage.getItem('fencingapp:advancement-order') || localStorage.getItem('fencingapp:advancement-order');
    if (advRaw) {
      const advIds = JSON.parse(advRaw) || [];
      if (Array.isArray(advIds) && advIds.length) {
        const byId = (fencers || []).reduce((m, f) => { m[f.id] = f; return m; }, {});
        const N = advIds.length;
        // Create natural pairs: [1,N], [2,N-1], [3,N-2], ...
        const pairs = [];
        for (let i = 0; i < Math.floor(N / 2); i++) {
          pairs.push([advIds[i], advIds[N - 1 - i]]);
        }
        if (N % 2 === 1) pairs.push([advIds[Math.floor(N / 2)], null]);

        // Arrange pairs so that odd-indexed pairs (1st,3rd,...) appear at the top
        // in increasing order and even-indexed pairs (2nd,4th,...) appear at the
        // bottom in decreasing order. This makes top seeds meet late in bracket.
        const topPairs = [];
        const bottomPairs = [];
        for (let i = 0; i < pairs.length; i++) {
          if (i % 2 === 0) topPairs.push(pairs[i]);
          else bottomPairs.push(pairs[i]);
        }
        // bottomPairs should be appended in reverse so the 2nd pair ends up last
        const orderedPairs = topPairs.concat(bottomPairs.reverse());

        // Flatten ordered pairs into id order (filter out null BYEs)
        const seededIds = [];
        orderedPairs.forEach(p => { p.forEach(id => { if (id) seededIds.push(id); }); });

        const seeded = seededIds.map(id => byId[id]).filter(Boolean);
        const remaining = (fencers || []).filter(f => !seeded.includes(f));
        if (seeded.length) fencers = seeded.concat(remaining);
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

  // Helper to render a single row inside a unified pair card
  function makePairFencerRow(f, pos) {
    const row = document.createElement('div');
    row.className = 'pair-fencer';
    if (f && f.id) row.setAttribute('data-id', f.id);
    if (typeof pos !== 'undefined') row.setAttribute('data-pos', String(pos));
    // Format name as "First LASTNAME" (last name uppercase)
    const rawName = (f && f.name) ? (f.name || '').toString().trim() : '';
    let first = '';
    let last = '';
    if (rawName.indexOf(',') !== -1) {
      const parts = rawName.split(',');
      last = (parts[0]||'').trim();
      first = (parts.slice(1).join(',')||'').trim();
    } else if (rawName) {
      const parts = rawName.split(/\s+/);
      if (parts.length === 1) first = parts[0];
      else { last = parts.pop(); first = parts.join(' '); }
    }
    const name = escapeHtml(((first || '') + (last ? ' ' + last.toUpperCase() : '')).trim() || 'TBD');
    const rank = (f && f.rank) ? escapeHtml(f.rank) : '';
    const club = (f && f.club) ? escapeHtml(f.club) : '';
    let meta = '';
    if (rank && club) meta = `${rank} · ${club}`;
    else if (rank) meta = rank;
    else if (club) meta = club;
    // place info action to the left, then the name/meta to the right
    row.innerHTML = `
      <div class="fencer-row">
        <div class="card-actions" aria-hidden="false">
          <button class="frutiger-aero-button card-action info-btn" type="button" aria-label="Information" data-action="info" data-id="${escapeHtml((f && f.id) || '')}">📋</button>
        </div>
        <div class="fencer-left">
          <div class="fencer-name"><span class="fencer-fullname">${name}</span></div>
          <div class="fencer-meta">${escapeHtml(meta)}</div>
        </div>
      </div>`;
    return row;
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
    const pairParent = pairEl.parentElement;
    let advancingEl = pairEl.querySelector('.advancing-wrapper');
    if (advancingEl) pairEl.removeChild(advancingEl);
    // Only clear propagation registrations when the pair's score inputs are empty.
    // This avoids removing propagation entries when advancing wrappers are
    // temporarily removed as part of normal combined-slot creation.
    try {
      const aEmpty = !a.value || String(a.value).trim() === '';
      const bEmpty = !b || !b.value || String(b.value).trim() === '';
      if (aEmpty && bEmpty) {
        try { removePropagationEntriesForPair(pairEl); } catch (e) {}
      }
    } catch (e) {}

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
        try {
          const sourceKey = (pairEl && pairEl.dataset && pairEl.dataset.round ? pairEl.dataset.round : '') + '-' + (pairEl && pairEl.dataset && pairEl.dataset.index ? pairEl.dataset.index : '');
          const existing = Array.from(pairParent.querySelectorAll('.advancing-wrapper'));
          existing.forEach(e => {
            try {
              if (e.dataset && e.dataset.source && String(e.dataset.source) === String(sourceKey)) { e.remove(); return; }
            } catch (err) {}
          });
        } catch (err) {}
      // Create advancing
      const winnerRow = pair.querySelector('.de-pair-cards .pair-fencer[data-pos="0"]') || pair.querySelector('.de-pair-cards .pair-fencer');
      const winnerId = winnerRow && winnerRow.dataset ? winnerRow.dataset.id : '';
      const winnerFencer = fencers.find(f => f.id == winnerId);
      if (winnerFencer) {
        // If a combined advancing slot already exists for this pair's slot,
        // prefer the combined UI and avoid creating a per-pair advancing
        // element which can lead to duplicate cards. Determine the pair
        // index and slot, and if a combined element is present, skip
        // creating the per-pair advancing wrapper.
        try {
          const pIdx = getPairIndex(pairEl);
          const slotIdx = (pIdx >= 0) ? Math.floor(pIdx / 2) : null;
          if (slotIdx !== null && propagationSlots[slotIdx] && propagationSlots[slotIdx].elem) {
            // Ensure the slot's entry that corresponds to this pair
            // references the latest adv input element (if any).
            try {
              const slotObj = propagationSlots[slotIdx];
              if (slotObj && slotObj.entries && slotObj.entries.length) {
                for (let e of slotObj.entries) {
                  if (e && (e.pairWrapper === pairEl || e.pairIndex === pIdx)) {
                    // If a per-pair adv exists inside this pair, wire it up
                    const maybeAdvInput = pairEl.querySelector('.advancing-wrapper .score-input');
                    if (maybeAdvInput) e.advInput = maybeAdvInput;
                  }
                }
              }
            } catch (e) {}
            return;
          }
        } catch (e) {}
        // Remove any previously-created advancing element for this pair or
        // for this winner id to avoid duplicate/leftover cards.
          try {
            const sourceKey = (pairEl && pairEl.dataset && pairEl.dataset.round ? pairEl.dataset.round : '') + '-' + (pairEl && pairEl.dataset && pairEl.dataset.index ? pairEl.dataset.index : '');
            // Use central cleanup and prefer combined UI if present.
            cleanupAdvancingDuplicates({ sourceKey, winnerId: winnerFencer && winnerFencer.id, preferCombined: true });
          } catch (err) {}

        try { removeExistingAdvancingFor(pairEl, winnerFencer && winnerFencer.id); } catch(e){}
        try { removeExistingAdvancingFor(pairEl, winnerFencer && winnerFencer.id); } catch(e){}
        const advancing = document.createElement('div');
        advancing.className = 'advancing-wrapper';
        try { advancing.dataset.source = (pairEl && pairEl.dataset && pairEl.dataset.round ? pairEl.dataset.round : '') + '-' + (pairEl && pairEl.dataset && pairEl.dataset.index ? pairEl.dataset.index : ''); } catch (e) {}
        const advCard = makeFencerCard(winnerFencer);
        try { advCard.classList.add('de-like'); } catch (e) {}
        // Match advCard dimensions/transform to the source winner card for pixel parity
        try {
          const source = pair.querySelector('.de-pair-cards .pair-fencer[data-pos="0"]') || pair.querySelector('.de-pair-cards .pair-fencer');
          const src = source || pair.querySelector('.de-pair-cards .pair-fencer');
          if (src) {
            const srcRect = src.getBoundingClientRect();
            advCard.style.width = Math.round(srcRect.width) + 'px';
            advCard.style.height = Math.round(srcRect.height) + 'px';
            advCard.style.boxSizing = 'border-box';
            const cs = window.getComputedStyle(src);
            if (cs) {
              if (cs.transform) advCard.style.transform = cs.transform;
              if (cs.transformOrigin) advCard.style.transformOrigin = cs.transformOrigin;
            }
          }
        } catch (e) {}
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
        advInput.addEventListener('mouseenter', () => { try { advInput.focus(); if (typeof advInput.select === 'function') advInput.select(); } catch(e){} });
        advInput.addEventListener('touchstart', () => { try { advInput.focus(); if (typeof advInput.select === 'function') advInput.select(); } catch(e){} }, { passive: true });
        advancing.appendChild(advInput);
        // ensure advancing input height matches the card height after layout
        try {
          requestAnimationFrame(() => {
            try {
              const h = Math.max(36, Math.round(advCard.getBoundingClientRect().height));
              advInput.style.height = h + 'px';
            } catch (e) {}
          });
        } catch (e) {}
          // Add a middle divider to the advancing card for visual parity
          try { ensureDividerForCard(advancing); } catch (e) {}
          // Final cleanup before append and re-check after append to avoid races
          try { cleanupAdvancingDuplicates({ sourceKey: advancing.dataset && advancing.dataset.source ? advancing.dataset.source : null, winnerId: winnerFencer && winnerFencer.id, preferCombined: true }); } catch (e) {}
          pairEl.appendChild(advancing);
          try { queueMicrotask(() => cleanupAdvancingDuplicates({ sourceKey: advancing.dataset && advancing.dataset.source ? advancing.dataset.source : null, winnerId: winnerFencer && winnerFencer.id, preferCombined: true })); } catch (e) {}
          // Register this winner for propagation into the next-round slot
          try {
            console.log('updatePairState: created advancing (first-round) for pairIndex', getPairIndex(pairEl), 'winnerId', winnerFencer && winnerFencer.id);
            addWinnerForPropagation(pairEl, winnerFencer, advInput);
          } catch (e) { console.log('updatePairState: failed to register winner for propagation', e); }
        // Recompute vertical alignment so advancing card centers on the pair exactly
        try {
          requestAnimationFrame(() => {
            try {
              const wrapperRect = pairEl.getBoundingClientRect();
              const pairRect = pair.getBoundingClientRect();
              const top = (pairRect.top - wrapperRect.top) + (pairRect.height / 2);
              advancing.style.top = top + 'px';
              // keep transform centering
              advancing.style.transform = 'translateY(-50%)';
              // Nudge the advancing input so its visual center matches the card center
              try {
                const advCardRect = advCard.getBoundingClientRect();
                const advInputRect = advInput.getBoundingClientRect();
                const cardCenter = advCardRect.top + advCardRect.height / 2;
                const inputCenter = advInputRect.top + advInputRect.height / 2;
                let inputNudge = Math.round(cardCenter - inputCenter);
                inputNudge = Math.max(-18, Math.min(18, inputNudge));
                advInput.style.transform = `translate(-3px, ${inputNudge}px)`;
              } catch (e) {}
            } catch (e) {}
          });
        } catch (e) {}
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

    // Non-15 decisive win: if both scores present and valid, the higher score wins
    try {
      if (va !== null && vb !== null && !invalidA && !invalidB && va !== vb) {
        if (va > vb) {
          a.classList.add('score-input-win');
          const winnerRow = pair.querySelector('.de-pair-cards .pair-fencer[data-pos="0"]') || pair.querySelector('.de-pair-cards .pair-fencer');
          const winnerId = winnerRow && winnerRow.dataset ? winnerRow.dataset.id : '';
          const winnerFencer = fencers.find(f => f.id == winnerId);
          if (winnerFencer) {
            try {
              const sourceKey = (pairEl && pairEl.dataset && pairEl.dataset.round ? pairEl.dataset.round : '') + '-' + (pairEl && pairEl.dataset && pairEl.dataset.index ? pairEl.dataset.index : '');
              const existing = Array.from(pairParent.querySelectorAll('.advancing-wrapper'));
              existing.forEach(e => {
                try {
                  if (e.dataset && e.dataset.source && String(e.dataset.source) === String(sourceKey)) { e.remove(); return; }
                  const inner = e.querySelector && e.querySelector('.fencer-card');
                  if (inner) {
                    const cid = inner.getAttribute && inner.getAttribute('data-id');
                    if (cid && String(cid) === String(winnerFencer.id)) { e.remove(); }
                  }
                } catch (err) {}
              });
            } catch (err) {}
          try { removeExistingAdvancingFor(pairEl, winnerFencer && winnerFencer.id); } catch(e){}
          try { removeExistingAdvancingFor(pairEl, winnerFencer && winnerFencer.id); } catch(e){}
            const advancing = document.createElement('div');
            advancing.className = 'advancing-wrapper';
            try { advancing.dataset.source = (pairEl && pairEl.dataset && pairEl.dataset.round ? pairEl.dataset.round : '') + '-' + (pairEl && pairEl.dataset && pairEl.dataset.index ? pairEl.dataset.index : ''); } catch (e) {}
            const advCard = makeFencerCard(winnerFencer);
            try { advCard.classList.add('de-like'); } catch (e) {}
            try {
              const source = pair.querySelector('.de-pair-cards .pair-fencer[data-pos="0"]') || pair.querySelector('.de-pair-cards .pair-fencer');
              const src = source || pair.querySelector('.de-pair-cards .pair-fencer');
              if (src) {
                const srcRect = src.getBoundingClientRect();
                advCard.style.width = Math.round(srcRect.width) + 'px';
                advCard.style.height = Math.round(srcRect.height) + 'px';
                advCard.style.boxSizing = 'border-box';
                const cs = window.getComputedStyle(src);
                if (cs) {
                  if (cs.transform) advCard.style.transform = cs.transform;
                  if (cs.transformOrigin) advCard.style.transformOrigin = cs.transformOrigin;
                }
              }
            } catch (e) {}
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
            advInput.addEventListener('mouseenter', () => { try { advInput.focus(); if (typeof advInput.select === 'function') advInput.select(); } catch(e){} });
            advInput.addEventListener('touchstart', () => { try { advInput.focus(); if (typeof advInput.select === 'function') advInput.select(); } catch(e){} }, { passive: true });
            advancing.appendChild(advInput);
            try {
              requestAnimationFrame(() => {
                try {
                  const h = Math.max(36, Math.round(advCard.getBoundingClientRect().height));
                  advInput.style.height = h + 'px';
                } catch (e) {}
              });
            } catch (e) {}
            // Add a middle divider to the advancing card for visual parity
            try { ensureDividerForCard(advancing); } catch (e) {}
            // Add a middle divider to the advancing card for visual parity
            try { ensureDividerForCard(advancing); } catch (e) {}
            try { cleanupAdvancingDuplicates({ winnerId: winnerFencer && winnerFencer.id, preferCombined: true }); } catch (e) {}
            pairEl.appendChild(advancing);
            try { queueMicrotask(() => cleanupAdvancingDuplicates({ winnerId: winnerFencer && winnerFencer.id, preferCombined: true })); } catch (e) {}
            try {
              addWinnerForPropagation(pairEl, winnerFencer, advInput);
            } catch (e) { console.log('updatePairState: failed to register winner for propagation (non-15)', e); }
            try {
              requestAnimationFrame(() => {
                try {
                  const wrapperRect = pairEl.getBoundingClientRect();
                  const pairRect = pair.getBoundingClientRect();
                  const top = (pairRect.top - wrapperRect.top) + (pairRect.height / 2);
                  advancing.style.top = top + 'px';
                  advancing.style.transform = 'translateY(-50%)';
                  try {
                    const advCardRect = advCard.getBoundingClientRect();
                    const advInputRect = advInput.getBoundingClientRect();
                    const cardCenter = advCardRect.top + advCardRect.height / 2;
                    const inputCenter = advInputRect.top + advInputRect.height / 2;
                    let inputNudge = Math.round(cardCenter - inputCenter);
                    inputNudge = Math.max(-18, Math.min(18, inputNudge));
                    advInput.style.transform = `translate(-3px, ${inputNudge}px)`;
                  } catch (e) {}
                } catch (e) {}
              });
            } catch (e) {}
          }
        } else {
          b.classList.add('score-input-win');
          const winnerRow = pair.querySelector('.de-pair-cards .pair-fencer[data-pos="1"]') || (function(){ const all = pair.querySelectorAll('.de-pair-cards .pair-fencer'); return all && all[1] ? all[1] : all[0]; })();
          const winnerId = winnerRow && winnerRow.dataset ? winnerRow.dataset.id : '';
          const winnerFencer = fencers.find(f => f.id == winnerId);
          if (winnerFencer) {
            try {
              const sourceKey = (pairEl && pairEl.dataset && pairEl.dataset.round ? pairEl.dataset.round : '') + '-' + (pairEl && pairEl.dataset && pairEl.dataset.index ? pairEl.dataset.index : '');
              const existing = Array.from(container.querySelectorAll('.advancing-wrapper'));
              existing.forEach(e => {
                try {
                  if (e.dataset && e.dataset.source && String(e.dataset.source) === String(sourceKey)) { e.remove(); return; }
                  const inner = e.querySelector && e.querySelector('.fencer-card');
                  if (inner) {
                    const cid = inner.getAttribute && inner.getAttribute('data-id');
                    if (cid && String(cid) === String(winnerFencer.id)) { e.remove(); }
                  }
                } catch (err) {}
              });
            } catch (err) {}
            const advancing = document.createElement('div');
            advancing.className = 'advancing-wrapper';
            try {
              const sourceKey = (pairEl && pairEl.dataset && pairEl.dataset.round ? pairEl.dataset.round : '') + '-' + (pairEl && pairEl.dataset && pairEl.dataset.index ? pairEl.dataset.index : '');
              advancing.dataset.source = sourceKey;
            } catch (e) {}
            const advCard = makeFencerCard(winnerFencer);
              try { advCard.classList.add('de-like'); } catch (e) {}
            try {
              const source = pair.querySelector('.de-pair-cards .pair-fencer[data-pos="1"]') || (function(){ const all = pair.querySelectorAll('.de-pair-cards .pair-fencer'); return all && all[1] ? all[1] : all[0]; })();
              const src = source || pair.querySelector('.de-pair-cards .pair-fencer');
              if (src) {
                const srcRect = src.getBoundingClientRect();
                advCard.style.width = Math.round(srcRect.width) + 'px';
                advCard.style.height = Math.round(srcRect.height) + 'px';
                advCard.style.boxSizing = 'border-box';
                const cs = window.getComputedStyle(src);
                if (cs) {
                  if (cs.transform) advCard.style.transform = cs.transform;
                  if (cs.transformOrigin) advCard.style.transformOrigin = cs.transformOrigin;
                }
              }
            } catch (e) {}
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
            advInput.addEventListener('mouseenter', () => { try { advInput.focus(); if (typeof advInput.select === 'function') advInput.select(); } catch(e){} });
            advInput.addEventListener('touchstart', () => { try { advInput.focus(); if (typeof advInput.select === 'function') advInput.select(); } catch(e){} }, { passive: true });
            advancing.appendChild(advInput);
            try {
              requestAnimationFrame(() => {
                try {
                  const h = Math.max(36, Math.round(advCard.getBoundingClientRect().height));
                  advInput.style.height = h + 'px';
                } catch (e) {}
              });
            } catch (e) {}
            try { cleanupAdvancingDuplicates({ winnerId: winnerFencer && winnerFencer.id, preferCombined: true }); } catch (e) {}
            pairEl.appendChild(advancing);
            try { queueMicrotask(() => cleanupAdvancingDuplicates({ winnerId: winnerFencer && winnerFencer.id, preferCombined: true })); } catch (e) {}
            try { addWinnerForPropagation(pairEl, winnerFencer, advInput); } catch (e) { console.log('updatePairState: failed to register winner for propagation (non-15)', e); }
            try {
              requestAnimationFrame(() => {
                try {
                  const wrapperRect = pairEl.getBoundingClientRect();
                  const pairRect = pair.getBoundingClientRect();
                  const top = (pairRect.top - wrapperRect.top) + (pairRect.height / 2);
                  advancing.style.top = top + 'px';
                  advancing.style.transform = 'translateY(-50%)';
                  try {
                    const advCardRect = advCard.getBoundingClientRect();
                    const advInputRect = advInput.getBoundingClientRect();
                    const cardCenter = advCardRect.top + advCardRect.height / 2;
                    const inputCenter = advInputRect.top + advInputRect.height / 2;
                    let inputNudge = Math.round(cardCenter - inputCenter);
                    inputNudge = Math.max(-18, Math.min(18, inputNudge));
                    advInput.style.transform = `translate(-3px, ${inputNudge}px)`;
                  } catch (e) {}
                } catch (e) {}
              });
            } catch (e) {}
          }
        }
        return;
      }
    } catch (e) { console.log('non-15 win check error', e); }
    if (vb === 15 && va !== 15) {
      b.classList.add('score-input-win');
      // Create advancing
      const winnerRow = pair.querySelector('.de-pair-cards .pair-fencer[data-pos="1"]') || (function(){ const all = pair.querySelectorAll('.de-pair-cards .pair-fencer'); return all && all[1] ? all[1] : all[0]; })();
      const winnerId = winnerRow && winnerRow.dataset ? winnerRow.dataset.id : '';
      const winnerFencer = fencers.find(f => f.id == winnerId);
      if (winnerFencer) {
            try {
              const sourceKey = (pairEl && pairEl.dataset && pairEl.dataset.round ? pairEl.dataset.round : '') + '-' + (pairEl && pairEl.dataset && pairEl.dataset.index ? pairEl.dataset.index : '');
              const existing = Array.from(container.querySelectorAll('.advancing-wrapper'));
              existing.forEach(e => {
                try {
                  if (e.dataset && e.dataset.source && String(e.dataset.source) === String(sourceKey)) { e.remove(); return; }
                  const inner = e.querySelector && e.querySelector('.fencer-card');
                  if (inner) {
                    const cid = inner.getAttribute && inner.getAttribute('data-id');
                    if (cid && String(cid) === String(winnerFencer.id)) { e.remove(); }
                  }
                } catch (err) {}
              });
            } catch (err) {}
            const advancing = document.createElement('div');
            advancing.className = 'advancing-wrapper';
            try { advancing.dataset.source = (pairEl && pairEl.dataset && pairEl.dataset.round ? pairEl.dataset.round : '') + '-' + (pairEl && pairEl.dataset && pairEl.dataset.index ? pairEl.dataset.index : ''); } catch (e) {}
        const advCard = makeFencerCard(winnerFencer);
          try { advCard.classList.add('de-like'); } catch (e) {}
        // Match advCard dimensions/transform to the source winner card for pixel parity
        try {
          const source = pair.querySelector('.de-pair-cards .pair-fencer[data-pos="1"]') || (function(){ const all = pair.querySelectorAll('.de-pair-cards .pair-fencer'); return all && all[1] ? all[1] : all[0]; })();
          const src = source || pair.querySelector('.de-pair-cards .pair-fencer');
          if (src) {
            const srcRect = src.getBoundingClientRect();
            advCard.style.width = Math.round(srcRect.width) + 'px';
            advCard.style.height = Math.round(srcRect.height) + 'px';
            advCard.style.boxSizing = 'border-box';
            const cs = window.getComputedStyle(src);
            if (cs) {
              if (cs.transform) advCard.style.transform = cs.transform;
              if (cs.transformOrigin) advCard.style.transformOrigin = cs.transformOrigin;
            }
          }
        } catch (e) {}
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
        advInput.addEventListener('mouseenter', () => { try { advInput.focus(); if (typeof advInput.select === 'function') advInput.select(); } catch(e){} });
        advInput.addEventListener('touchstart', () => { try { advInput.focus(); if (typeof advInput.select === 'function') advInput.select(); } catch(e){} }, { passive: true });
        advancing.appendChild(advInput);
        // ensure advancing input height matches the card height after layout
        try {
          requestAnimationFrame(() => {
            try {
              const h = Math.max(36, Math.round(advCard.getBoundingClientRect().height));
              advInput.style.height = h + 'px';
            } catch (e) {}
          });
        } catch (e) {}
        try { cleanupAdvancingDuplicates({ winnerId: winnerFencer && winnerFencer.id, preferCombined: true }); } catch (e) {}
        pairEl.appendChild(advancing);
        try { queueMicrotask(() => cleanupAdvancingDuplicates({ winnerId: winnerFencer && winnerFencer.id, preferCombined: true })); } catch (e) {}
        // Register this winner for propagation into the next-round slot
        try { addWinnerForPropagation(pairEl, winnerFencer, advInput); } catch (e) {}
        // Recompute vertical alignment so advancing card centers on the pair exactly
        try {
          requestAnimationFrame(() => {
            try {
              const wrapperRect = pairEl.getBoundingClientRect();
              const pairRect = pair.getBoundingClientRect();
              const top = (pairRect.top - wrapperRect.top) + (pairRect.height / 2);
              advancing.style.top = top + 'px';
              advancing.style.transform = 'translateY(-50%)';
              // Nudge the advancing input so its visual center matches the card center
              try {
                const advCardRect = advCard.getBoundingClientRect();
                const advInputRect = advInput.getBoundingClientRect();
                const cardCenter = advCardRect.top + advCardRect.height / 2;
                const inputCenter = advInputRect.top + advInputRect.height / 2;
                let inputNudge = Math.round(cardCenter - inputCenter);
                inputNudge = Math.max(-18, Math.min(18, inputNudge));
                advInput.style.transform = `translate(-3px, ${inputNudge}px)`;
              } catch (e) {}
            } catch (e) {}
          });
        } catch (e) {}
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
    // If no decisive winner exists now, remove any previously-registered
    // propagation entries for this pair so leftover advancing cards disappear.
    try { removePropagationEntriesForPair(pairEl); } catch (e) {}
  }

  // Simple HTML escaper
  function escapeHtml(s) { return (s||'').toString().replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]; }); }

  // Build a very basic single-elimination bracket (rounds) while reusing
  // existing `makeFencerCard` and `.score-input` styling. This creates
  // placeholders for future rounds so winners can be advanced into them.
  function makePlaceholderCard() {
    const card = document.createElement('article');
    card.className = 'fencer-card placeholder';
    card.innerHTML = `<div class="fencer-row"><div class="fencer-left"><div class="fencer-name"><span class="fencer-fullname">TBD</span></div><div class="fencer-meta"></div></div></div>`;
    return card;
  }

  // Generate rounds data structure
  const rounds = (function buildRounds(players) {
    const N = players.length;
    const roundsCount = Math.ceil(Math.log2(Math.max(1, N)));
    const size = Math.pow(2, roundsCount);
    const slots = Array.from({ length: size }, (_, i) => players[i] || null);
    const out = [];
    // initial pairs
    const first = [];
    for (let i = 0; i < size; i += 2) first.push({ a: slots[i], b: slots[i + 1], scoreA: null, scoreB: null });
    out.push(first);
    // placeholders for subsequent rounds
    for (let r = 1; r <= roundsCount; r++) {
      const arr = Array.from({ length: Math.max(1, Math.ceil(first.length / Math.pow(2, r))) }, () => ({ a: null, b: null, scoreA: null, scoreB: null }));
      out.push(arr);
    }
    return out;
  })(fencers || []);

  // Render rounds horizontally (columns). Each round becomes a column of
  // stacked pairs so the visual flow reads left-to-right: Round 1 -> 2 -> ...
  const roundsRow = document.createElement('div');
  roundsRow.className = 'de-rounds-row';
  roundsRow.style.display = 'flex';
  roundsRow.style.gap = '28px';
  roundsRow.style.alignItems = 'flex-start';

  rounds.forEach((roundPairs, rIdx) => {
    // hide rounds after the first while we iterate on visuals
    if (rIdx > 0) return;
    const column = document.createElement('div');
    column.className = 'de-round-column';
    column.style.display = 'flex';
    column.style.flexDirection = 'column';
    column.style.gap = '12px';

    const roundHeader = document.createElement('div');
    roundHeader.className = 'de-round-header';
    roundHeader.textContent = rIdx === 0 ? 'Round 1' : `Round ${rIdx + 1}`;
    column.appendChild(roundHeader);

    roundPairs.forEach((pair, pIdx) => {
      const pairWrapper = document.createElement('div');
      pairWrapper.className = 'de-pair-wrapper';
      pairWrapper.dataset.round = String(rIdx);
      pairWrapper.dataset.index = String(pIdx);

      const pairWrap = document.createElement('div');
      pairWrap.className = 'de-pair' + ((pair.b || pair.a) ? '' : ' bye');
      // Make the pair container behave like a check-in `fencer-card` so it
      // inherits the same glass-card visuals while remaining a single DOM node.
      pairWrap.classList.add('fencer-card');

      // Build a single unified pair card composed of two stacked rows.
      const cardsContainer = document.createElement('div');
      cardsContainer.className = 'de-pair-cards';

      const inputA = document.createElement('input');
      inputA.type = 'text'; inputA.className = 'score-input'; inputA.setAttribute('inputmode', 'numeric'); inputA.setAttribute('placeholder', '#'); inputA.dataset.pos = '0'; inputA.dataset.round = String(rIdx); inputA.dataset.index = String(pIdx);
      inputA.setAttribute('maxlength', '2'); inputA.setAttribute('pattern', '\\d*');
      const inputB = document.createElement('input');
      inputB.type = 'text'; inputB.className = 'score-input'; inputB.setAttribute('inputmode', 'numeric'); inputB.setAttribute('placeholder', '#'); inputB.dataset.pos = '1'; inputB.dataset.round = String(rIdx); inputB.dataset.index = String(pIdx);
      inputB.setAttribute('maxlength', '2'); inputB.setAttribute('pattern', '\\d*');

      // Row A
      const rowA = document.createElement('div');
      rowA.className = 'pair-row';
      const cardA = pair.a ? makePairFencerRow(pair.a, 0) : makePairFencerRow(null, 0);
      rowA.appendChild(cardA);
      rowA.appendChild(inputA);

      // Row B
      const rowB = document.createElement('div');
      rowB.className = 'pair-row';
      const cardB = pair.b ? makePairFencerRow(pair.b, 1) : makePairFencerRow(null, 1);
      rowB.appendChild(cardB);
      rowB.appendChild(inputB);

      cardsContainer.appendChild(rowA);
      cardsContainer.appendChild(rowB);

      pairWrap.appendChild(cardsContainer);

      // wire score input handling (same as before)
      // Debounced autosave for scores
      let _autosaveTimer = null;
      function scheduleAutosave() {
        try {
          if (_autosaveTimer) clearTimeout(_autosaveTimer);
          _autosaveTimer = setTimeout(() => {
            try {
              saveCurrentScores();
            } catch (e) {}
            _autosaveTimer = null;
          }, 300);
        } catch (e) {}
      }

      function onScoreChange() {
        try { markDirty(); } catch (e) {}
        const va = parseScore(inputA.value);
        const vb = parseScore(inputB.value);
        if (va === 15 && vb !== 15) {
          inputA.classList.add('score-input-win');
          const nextRound = rIdx + 1;
          const nextIndex = Math.floor(pIdx / 2);
          if (rounds[nextRound]) {
            const target = rounds[nextRound][nextIndex];
            if (!target) return;
            if (!target.a) target.a = pair.a || null; else target.b = pair.a || null;
            const targetWrap = container.querySelector(`[data-round="${nextRound}"][data-index="${nextIndex}"]`);
            if (targetWrap) {
              const cardCol = targetWrap.querySelector('.de-pair-cards');
              if (cardCol) {
                const slot = !cardCol.children[0] || cardCol.children[0].classList.contains('placeholder') ? 0 : (cardCol.children[1] && cardCol.children[1].classList.contains('placeholder') ? 1 : 0);
                const newRow = makePairFencerRow(pair.a, slot);
                if (cardCol.children[slot]) cardCol.replaceChild(newRow, cardCol.children[slot]); else cardCol.appendChild(newRow);
              }
            }
          }
        } else if (vb === 15 && va !== 15) {
          inputB.classList.add('score-input-win');
          const nextRound = rIdx + 1;
          const nextIndex = Math.floor(pIdx / 2);
          if (rounds[nextRound]) {
            const target = rounds[nextRound][nextIndex];
            if (!target) return;
            if (!target.a) target.a = pair.b || null; else target.b = pair.b || null;
            const targetWrap = container.querySelector(`[data-round="${nextRound}"][data-index="${nextIndex}"]`);
            if (targetWrap) {
              const cardCol = targetWrap.querySelector('.de-pair-cards');
              if (cardCol) {
                const slot = !cardCol.children[0] || cardCol.children[0].classList.contains('placeholder') ? 0 : (cardCol.children[1] && cardCol.children[1].classList.contains('placeholder') ? 1 : 0);
                const newRow = makePairFencerRow(pair.b, slot);
                if (cardCol.children[slot]) cardCol.replaceChild(newRow, cardCol.children[slot]); else cardCol.appendChild(newRow);
              }
            }
          }
        }
      }

      inputA.addEventListener('input', (ev) => { onScoreChange(); scheduleAutosave(); });
      inputB.addEventListener('input', (ev) => { onScoreChange(); scheduleAutosave(); });
      // Blur triggers a final validation and save
      inputA.addEventListener('blur', () => { try { updatePairState(pairWrapper); scheduleAutosave(); } catch(e){} });
      inputB.addEventListener('blur', () => { try { updatePairState(pairWrapper); scheduleAutosave(); } catch(e){} });

      // Key handling: Enter moves to next input, arrows increment/decrement
      function handleKeyNavigation(ev, inputEl) {
        try {
          const key = ev.key;
          if (key === 'Enter') {
            ev.preventDefault();
            // move to next input in document order
            const all = Array.from(document.querySelectorAll('.score-input'));
            const idx = all.indexOf(inputEl);
            if (idx >= 0 && idx < all.length - 1) { all[idx + 1].focus(); if (typeof all[idx+1].select === 'function') all[idx+1].select(); }
            return;
          }
          if (key === 'ArrowUp' || key === 'ArrowDown') {
            ev.preventDefault();
            const cur = parseScore(inputEl.value) || 0;
            const delta = key === 'ArrowUp' ? 1 : -1;
            let next = cur + delta;
            if (next < 0) next = 0; if (next > 15) next = 15;
            inputEl.value = String(next);
            onScoreChange(); scheduleAutosave();
          }
        } catch (e) {}
      }
      inputA.addEventListener('keydown', (e) => handleKeyNavigation(e, inputA));
      inputB.addEventListener('keydown', (e) => handleKeyNavigation(e, inputB));
      // Focus and select on hover/touch for quicker typing
      inputA.addEventListener('mouseenter', () => { try { inputA.focus(); if (typeof inputA.select === 'function') inputA.select(); } catch (e) {} });
      inputB.addEventListener('mouseenter', () => { try { inputB.focus(); if (typeof inputB.select === 'function') inputB.select(); } catch (e) {} });
      inputA.addEventListener('touchstart', () => { try { inputA.focus(); if (typeof inputA.select === 'function') inputA.select(); } catch (e) {} }, { passive: true });
      inputB.addEventListener('touchstart', () => { try { inputB.focus(); if (typeof inputB.select === 'function') inputB.select(); } catch (e) {} }, { passive: true });

      pairWrapper.appendChild(pairWrap);
      column.appendChild(pairWrapper);
      const sep = document.createElement('div'); sep.className = 'pair-sep'; column.appendChild(sep);
    });
    roundsRow.appendChild(column);
  });

  const wrapperOuter = document.createElement('div');
  wrapperOuter.className = 'de-rounds-outer';
  // Let the outer container (`#de-cards-stack`) manage horizontal scrolling;
  // avoid adding a second scroll box by keeping this wrapper overflow visible.
  wrapperOuter.style.overflowX = 'visible';
  wrapperOuter.appendChild(roundsRow);
  const frag = document.createDocumentFragment();
  frag.appendChild(wrapperOuter);

  container.appendChild(frag);

  // Position rounds so each next-round pair centers between its two sources
  function positionRounds() {
    try {
      const roundsRowEl = container.querySelector('.de-rounds-row');
      if (!roundsRowEl) return;
      const columns = Array.from(roundsRowEl.querySelectorAll('.de-round-column'));
      if (columns.length < 2) return;
      const rowRect = roundsRowEl.getBoundingClientRect();
      // For each column after the first, center each pair between two sources
      for (let c = 1; c < columns.length; c++) {
        const prevCol = columns[c - 1];
        const col = columns[c];
        const prevPairs = Array.from(prevCol.querySelectorAll('.de-pair-wrapper'));
        const pairs = Array.from(col.querySelectorAll('.de-pair-wrapper'));

        // Clear any inline transforms/margins on the previous column so
        // measurements reflect layout positions (avoid cascading offsets).
        prevPairs.forEach(pp => { try { if (pp && pp.style) { pp.style.transform = ''; pp.style.marginTop = ''; } } catch (e) {} });
        // Also clear inline offsets on current column pairs before measuring
        pairs.forEach(pp => { try { if (pp && pp.style) { pp.style.transform = ''; pp.style.marginTop = ''; } } catch (e) {} });

        pairs.forEach((pairEl, pIdx) => {
          try {
            const srcIdxA = pIdx * 2;
            const srcIdxB = pIdx * 2 + 1;
            const srcA = prevPairs[srcIdxA];
            const srcB = prevPairs[srcIdxB];
            if (!srcA && !srcB) return;
            const aRect = srcA ? srcA.getBoundingClientRect() : null;
            const bRect = srcB ? srcB.getBoundingClientRect() : null;
            let centerY;
            if (aRect && bRect) {
              // center between bottom of A and top of B
              const gapMid = (aRect.top + aRect.height + bRect.top) / 2;
              centerY = gapMid;
            } else {
              const r = aRect || bRect;
              centerY = r.top + r.height / 2;
            }
            const colRect = col.getBoundingClientRect();
            // measure pair after clearing offsets so currentTop is layout-based
            const pairRect = pairEl.getBoundingClientRect();
            const desiredTop = centerY - colRect.top - (pairRect.height / 2);
            // Set an absolute marginTop (not additive) so repeated runs are stable
            pairEl.style.marginTop = Math.round(desiredTop) + 'px';
          } catch (e) { /* ignore per-pair errors */ }
        });
      }
    } catch (e) { console.log('positionRounds error', e); }
  }

  // Initial positioning and responsive updates
  requestAnimationFrame(() => { positionRounds(); });
  window.addEventListener('resize', () => { if (typeof positionRounds === 'function') { setTimeout(positionRounds, 120); } });

  // Align score inputs to the vertical center of their corresponding fencer card
  function alignInputsToCards() {
    try {
      const wrappers = container.querySelectorAll('.de-pair-wrapper');
      wrappers.forEach((wrap) => {
        try {
          const pair = wrap.querySelector('.de-pair');
          if (!pair) return;
          const cards = Array.from(pair.querySelectorAll('.pair-fencer, .fencer-card'));
          const inputs = Array.from(wrap.querySelectorAll('.pair-row .score-input, .pair-controls .score-input'));
          // if inputs exist, match each input to corresponding card by index
          for (let i = 0; i < inputs.length; i++) {
            const inp = inputs[i];
            const card = cards[i];
            if (!card || !inp) continue;
            // reset transform before measuring to avoid compounding
            inp.style.transform = 'translateY(0px)';
            const cardRect = card.getBoundingClientRect();
            // match input height to card height for visual parity
            const targetH = Math.max(36, Math.round(cardRect.height));
            inp.style.height = targetH + 'px';
            // re-measure input after setting height
            const inpRect2 = inp.getBoundingClientRect();
            const cardCenter = cardRect.top + cardRect.height / 2;
            const inputCenter = inpRect2.top + inpRect2.height / 2;
            let nudge = Math.round(cardCenter - inputCenter);
            // clamp nudging to avoid large jumps
            nudge = Math.max(-40, Math.min(40, nudge));
            // set a stable vertical transform so repeated calls don't accumulate
            inp.style.marginTop = '0px';
            inp.style.transform = `translateY(${nudge}px)`;
          }
        } catch (e) {}
      });
    } catch (e) { console.log('alignInputsToCards error', e); }
  }

  // Call alignment after initial layout and on resize
  requestAnimationFrame(() => { alignInputsToCards(); });
  window.addEventListener('resize', () => { setTimeout(alignInputsToCards, 140); });

  // Position per-pair dividers smartly between the centers of the two rows.
  function updatePairDividers() {
    try {
      const pairs = container.querySelectorAll('.de-pair');
      pairs.forEach((pair) => {
        try {
          let divider = pair.querySelector('.pair-divider');
          if (!divider) {
            divider = document.createElement('div');
            divider.className = 'pair-divider';
            divider.style.position = 'absolute';
            divider.style.left = '18px';
            divider.style.right = '18px';
            divider.style.height = '3px';
            divider.style.pointerEvents = 'none';
            divider.style.zIndex = '6';
            divider.style.borderRadius = '2px';
            divider.style.background = 'linear-gradient(to right, rgba(255,255,255,0.06), rgba(255,255,255,0.28), rgba(255,255,255,0.06))';
            divider.style.boxShadow = '0 2px 12px rgba(255,255,255,0.10), inset 0 1px 4px rgba(255,255,255,0.04)';
            pair.appendChild(divider);
          }
          const rows = pair.querySelectorAll('.pair-fencer, .fencer-card');
          const pairRect = pair.getBoundingClientRect();
          if (rows.length >= 2) {
            const r0 = rows[0].getBoundingClientRect();
            const r1 = rows[1].getBoundingClientRect();
            const c0 = r0.top + r0.height / 2;
            const c1 = r1.top + r1.height / 2;
            const center = (c0 + c1) / 2;
            const topWithin = center - pairRect.top;
            divider.style.top = Math.round(topWithin) + 'px';
            divider.style.opacity = '1';
          } else {
            // fallback to exact midpoint of card
            divider.style.top = Math.round(pairRect.height / 2) + 'px';
          }
        } catch (e) { /* ignore per-pair errors */ }
      });
    } catch (e) { console.log('updatePairDividers error', e); }
  }

  // Create and position a middle divider inside an advancing element or
  // any card-like container. If a `.pair-divider` already exists, update
  // its position; otherwise create it.
  function ensureDividerForCard(el) {
    try {
      if (!el) return;
      let divider = el.querySelector('.pair-divider');
      if (!divider) {
        divider = document.createElement('div');
        divider.className = 'pair-divider';
        divider.style.position = 'absolute';
        divider.style.left = '18px';
        divider.style.right = '18px';
        divider.style.height = '3px';
        divider.style.pointerEvents = 'none';
        divider.style.zIndex = '6';
        divider.style.borderRadius = '2px';
        divider.style.background = 'linear-gradient(to right, rgba(255,255,255,0.06), rgba(255,255,255,0.28), rgba(255,255,255,0.06))';
        divider.style.boxShadow = '0 2px 12px rgba(255,255,255,0.10), inset 0 1px 4px rgba(255,255,255,0.04)';
        el.appendChild(divider);
      }
      // Position after layout
      requestAnimationFrame(() => {
        try {
          const rect = el.getBoundingClientRect();
          const topWithin = Math.round(rect.height / 2);
          divider.style.top = topWithin + 'px';
          divider.style.opacity = '1';
        } catch (e) {}
      });
    } catch (e) { console.log('ensureDividerForCard error', e); }
  }

  // ensure dividers are positioned after layout passes
  requestAnimationFrame(() => { updatePairDividers(); });
  window.addEventListener('resize', () => { setTimeout(updatePairDividers, 160); });

  // Initialize save button state as clean/disabled
  try { markClean(); } catch(e) {}

  // After rendering, sync input heights to match the corresponding card heights
  function syncControlHeights() {
    try {
      const wrappers = container.querySelectorAll('.de-pair-wrapper');
      wrappers.forEach((wrap) => {
        const pair = wrap.querySelector('.de-pair');
        const controls = wrap.querySelectorAll('.pair-row .score-input, .pair-controls .score-input, .pair-controls input.score-input');
        // Prefer new .pair-row structure, fall back to legacy .pair-controls
        const controlContainer = wrap.querySelector('.pair-row') || wrap.querySelector('.pair-controls') || wrap.querySelector('div:nth-child(2)');
        const inputs = controlContainer ? Array.from(controlContainer.querySelectorAll('.score-input')) : Array.from(controls);
        const cards = pair ? Array.from(pair.querySelectorAll('.pair-fencer, .fencer-card')) : [];
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
      // Ensure second-round column inputs visually match their cards as well
      try {
        const secondWrappers = container.querySelectorAll('.de-rounds-row .de-round-column:nth-child(2) .de-pair-wrapper');
        secondWrappers.forEach((wrap) => {
          try {
            const pair = wrap.querySelector('.de-pair');
            if (!pair) return;
            const cards = Array.from(pair.querySelectorAll('.pair-fencer, .fencer-card'));
            const controls = wrap.querySelector('.pair-row') || wrap.querySelector('.pair-controls');
            if (!controls) return;
            const inputs = Array.from(controls.querySelectorAll('.score-input'));
            if (inputs.length > 0 && cards.length > 0) {
              const aH = Math.max(36, Math.round(cards[0].getBoundingClientRect().height));
              inputs[0].style.height = aH + 'px';
              // center vertically
              const cardRect = cards[0].getBoundingClientRect();
              const inpRect = inputs[0].getBoundingClientRect();
              const nudge = Math.round((cardRect.top + cardRect.height/2) - (inpRect.top + inpRect.height/2));
              inputs[0].style.marginTop = '0px';
              inputs[0].style.transform = `translateY(${nudge}px)`;
            }
            if (inputs.length > 1 && cards.length > 1) {
              const bH = Math.max(36, Math.round(cards[1].getBoundingClientRect().height));
              inputs[1].style.height = bH + 'px';
              const cardRect = cards[1].getBoundingClientRect();
              const inpRect = inputs[1].getBoundingClientRect();
              const nudge = Math.round((cardRect.top + cardRect.height/2) - (inpRect.top + inpRect.height/2));
              inputs[1].style.marginTop = '0px';
              inputs[1].style.transform = `translateY(${nudge}px)`;
            }
          } catch (e) {}
        });
      } catch (e) {}
      // Additional robust pass: for every round input, match to the corresponding card
      try {
        const roundInputs = container.querySelectorAll('.de-rounds-row .score-input');
        roundInputs.forEach((inp) => {
          try {
            const pos = parseInt(inp.dataset.pos, 10);
            const wrap = inp.closest('.de-pair-wrapper');
            if (!wrap) return;
            const pair = wrap.querySelector('.de-pair');
            if (!pair) return;
            const cards = Array.from(pair.querySelectorAll('.fencer-card'));
            if (!cards || cards.length === 0) return;
            const idx = Number.isFinite(pos) ? pos : 0;
            const card = cards[idx] || cards[0];
            const h = Math.max(36, Math.round(card.getBoundingClientRect().height));
            inp.style.height = h + 'px';
            // vertically center
            const cardRect = card.getBoundingClientRect();
            const inpRect = inp.getBoundingClientRect();
            const nudge = Math.round((cardRect.top + cardRect.height/2) - (inpRect.top + inpRect.height/2));
            inp.style.marginTop = '0px';
            inp.style.transform = `translateY(${nudge}px)`;
          } catch (e) {}
        });
      } catch (e) {}
      // Quick fallback: mirror the first-round input height to second-round inputs
      try {
        const firstInput = container.querySelector('.de-rounds-row .de-round-column:nth-child(1) .pair-controls .score-input');
        if (firstInput) {
          const refH = getComputedStyle(firstInput).height;
          const secondInputs = container.querySelectorAll('.de-rounds-row .de-round-column:nth-child(2) .pair-controls .score-input');
          secondInputs.forEach(inp => { inp.style.height = refH; });
        }
      } catch (e) {}
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

  // Debug helpers exposed to the console for diagnosing propagation issues
  try {
    window.de_debug_dump = function() {
      try { console.log('DE propagationSlots dump:', propagationSlots); } catch (e) { console.log('DE debug dump failed', e); }
    };
    window.de_debug_force_check = function() {
      try {
        console.log('DE force-checking propagationSlots...');
        Object.keys(propagationSlots).forEach((s) => {
          const n = Number(s);
          try { console.debug('force-check slot', n, propagationSlots[n] && propagationSlots[n].entries && propagationSlots[n].entries.map(en => ({ pairIndex: en.pairIndex, winnerId: en.winnerFencer && en.winnerFencer.id }))); } catch (e) {}
          try { if (propagationSlots[n] && propagationSlots[n].entries && propagationSlots[n].entries.length === 2) createCombinedSlot(n); } catch (e) { console.debug('force-check createCombinedSlot failed for', n, e); }
        });
      } catch (e) { console.debug('de_debug_force_check failed', e); }
    };
  } catch (e) {}

});
