document.addEventListener('DOMContentLoaded', () => {
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

    // wire live validation on input
    const validate = () => updatePairState(pairWrapper);
    inputA.addEventListener('input', validate);
    inputA.addEventListener('blur', validate);
    if (inputB) {
      inputB.addEventListener('input', validate);
      inputB.addEventListener('blur', validate);
    }

    pairWrapper.appendChild(pairWrap);
    frag.appendChild(pairWrapper);
    // subtle separator between groups
    const sep = document.createElement('div'); sep.className = 'pair-sep'; frag.appendChild(sep);
  }

  container.appendChild(frag);

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
