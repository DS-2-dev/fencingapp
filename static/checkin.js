document.addEventListener('DOMContentLoaded', () => {
  // mark body so nav styles can be adjusted specifically for the Check-in view
  try { document.body.classList.add('checkin-nav-disabled'); } catch (e) {}
  // Debug: indicate this script was loaded (helpful when browser caching makes it unclear)
  try { console.debug('checkin.js loaded at', new Date().toISOString()); } catch (e) {}
  // Use sessionStorage only for imported fencers (ephemeral per browser session).
  // Do NOT read from or migrate data from localStorage here — that would persist
  // imported data across browser sessions, which we intentionally avoid.
  // Don't clear stored fencers on load. Persisted/session data must remain.
  // (Per-stack scrolling is enabled via CSS; do not modify body overflow here.)
  // Render imported fencer cards from sessionStorage (ephemeral per browser session)
  const cardsContainer = document.getElementById('cards-stack');
  // Track removal mode and the Remove button early so render can re-apply visual state
  let removeMode = false;
  // In-bar remove control has been replaced by a Check-in All button; the
  // universal nav `.remove-copy-btn` is now the sole remove-mode toggle.
  const removeBtn = null;
  // Button copy in the universal nav that matches the Events button styling
  const removeCopyBtn = document.querySelector('.remove-copy-btn');
  // Button in the checkin bar that checks in all fencers at once
  const checkinAllBtn = document.querySelector('.checkin-all-btn');
  // Dedicated area where a transient add-fencer card will be shown
  let addArea = document.getElementById('add-fencer-area');

  // Positioning helper: always compute coordinates relative to the viewport
  // so `position: fixed` keeps the add-card directly beneath the checkin bar.
  const positionAddArea = () => {
    try {
      const barEl = document.querySelector('.checkin-bar');
      if (!barEl) return;
      if (!addArea) {
        // If template included the element but DOM didn't find it earlier,
        // create it now and append to body so it's outside any transformed
        // ancestor and fixed positioning is viewport-relative.
        addArea = document.getElementById('add-fencer-area');
        if (!addArea) {
          addArea = document.createElement('div');
          addArea.id = 'add-fencer-area';
          addArea.className = 'add-fencer-area';
          addArea.setAttribute('aria-hidden', 'true');
          document.body.appendChild(addArea);
        }
      }

      const br = barEl.getBoundingClientRect();
      // Compute a small gap between bar and add-card; prefer nav gap if available
      let gap = 10;
      const navEl = document.querySelector('.glass-menu-bar');
      if (navEl) {
        try { gap = Math.max(0, br.top - navEl.getBoundingClientRect().bottom); } catch (err) { gap = 10; }
      }
      // Apply fixed viewport coordinates and align width to the checkin bar so
      // the add-card visually lines up exactly beneath it.
      addArea.style.position = 'fixed';
      addArea.style.left = `${Math.max(0, Math.round(br.left))}px`;
      addArea.style.top = `${Math.max(0, Math.round(br.bottom + gap))}px`;
      // Compute a sensible starting/floor width that is smaller than the
      // maximum. This ensures the add-card can visibly expand later when
      // content grows instead of immediately being at the max width.
      // Prefer a compact start width (~220px). If the checkin bar is smaller,
      // use its width; otherwise cap the start at 220px so the add-card begins
      // compact instead of immediately large on wide viewports.
      const startFloor = Math.min(Math.round(br.width), 160);
      // Use CSS variables for sizing so CSS handles transitions.
      addArea.style.setProperty('--start-w', `${Math.round(startFloor)}px`);
      // also set inline width/maxWidth to the var so the start width is
      // enforced immediately (helps when other rules try to expand the card)
      try { addArea.style.width = 'var(--start-w)'; addArea.style.maxWidth = 'var(--start-w)'; } catch (e) {}
      // Keep a hard max so the add card never exceeds this width
      // Allow the add-area to expand larger than the checkin bar by using
      // available viewport space to the right of the bar. Cap to 1200px to
      // avoid uncontrolled overflow on very wide screens.
      const availableSpace = Math.max(160, Math.round(window.innerWidth - Math.max(0, Math.round(br.left)) - 24));
      const computedMax = Math.min(1200, availableSpace);
      addArea.style.setProperty('--max-w', `${Math.round(computedMax)}px`);
      // persist the computed max so hover can read it later
      addArea.dataset.maxWidth = String(computedMax);
      if (!addArea.dataset.startWidth) addArea.dataset.startWidth = String(startFloor);
      addArea.style.zIndex = '995';
    } catch (e) {
      // ignore positioning errors
    }
  };

  // Measure text width using canvas to compute precise pixel widths for labels/placeholders
  function measureTextWidth(text, font) {
    try {
      const ctx = measureTextWidth._ctx || (measureTextWidth._ctx = document.createElement('canvas').getContext('2d'));
      if (!font) font = getComputedStyle(document.body).font || '14px system-ui';
      ctx.font = font;
      const metrics = ctx.measureText(text || '');
      return metrics.width || 0;
    } catch (e) { return (text||'').length * 8; }
  }

  // Inline fallback removed: rely on CSS for hover/transition parity

  // Set a fixed width on an element based on a sample string. Width is set
  // as inline style and also assigned to minWidth and maxWidth to prevent
  // the element from changing size. Respects element padding/border by adding
  // computed padding values to the measured text width.
  function setFixedWidthForElement(el, sampleText) {
    if (!el) return;
    try {
      const cs = getComputedStyle(el);
      const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const textW = measureTextWidth(sampleText || '', font);
      const padLeft = parseFloat(cs.paddingLeft || 0);
      const padRight = parseFloat(cs.paddingRight || 0);
      const borderLeft = parseFloat(cs.borderLeftWidth || 0);
      const borderRight = parseFloat(cs.borderRightWidth || 0);
      const extra = padLeft + padRight + borderLeft + borderRight + 6; // small slack
      const finalW = Math.ceil(textW + extra);
      el.style.width = `${finalW}px`;
      el.style.minWidth = `${finalW}px`;
      el.style.maxWidth = `${finalW}px`;
      // prevent wrapping and enforce ellipsis when content overflows
      el.style.whiteSpace = 'nowrap';
      el.style.overflow = 'hidden';
      el.style.textOverflow = 'ellipsis';
      // keep caret visible when focused
      el.style.boxSizing = 'border-box';
    } catch (e) {}
  }

  // Canonical CSV header aliases used throughout the checkin logic.
  // Left side is the internal field name, right side lists common CSV header variants.
  const CSV_ALIASES = {
    born: ['born','birthyear','year','yob','birth year','birth_date','dob','year born'],
    club: ['club','club(s)','club name','affiliation','team','organization','org','club/organization','club_name','association','home club','affiliation name','attending club'],
    rank: ['rank','rating','usa rating','seed','ranking','classification','class','rating (usa)','usa_rating','current rank'],
    division: ['division','category','age group','div'],
    country: ['country','nationality','nat','nation'],
    member: ['member','member id','membership','membership number','member#','license','licence','license number']
  };

  // Ensure positioning runs initially and on resize/scroll so the add card tracks
  // the checkin bar even if the page layout changes or the user scrolls.
  positionAddArea();
  // (Check-in All removed) - no-op
  window.addEventListener('resize', positionAddArea);
  window.addEventListener('scroll', positionAddArea, { passive: true });

  // Create and show a transient add-fencer card in the addArea. This UI is ephemeral
  // and will only persist when the user clicks Save.
  function showAddFencerCard() {
    if (!addArea) return;
    // ensure addArea is aligned with the checkin bar before showing
    try {
      const barEl = document.querySelector('.checkin-bar');
      if (barEl) {
        const br = barEl.getBoundingClientRect();
        let gap = 10;
        const navEl = document.querySelector('.glass-menu-bar');
        if (navEl) {
          try { gap = Math.max(0, br.top - navEl.getBoundingClientRect().bottom); } catch (err) { gap = 10; }
        }
        addArea.style.left = `${Math.max(0, br.left)}px`;
        addArea.style.top = `${br.bottom + gap}px`;
        // Start the add area at a sensible computed width that is slightly
        // smaller than the full checkin bar so it can visibly expand later.
        const computedWidth = Math.min(Math.round(br.width || 320), 220);
        addArea.style.setProperty('--start-w', `${Math.round(computedWidth)}px`);
        try { addArea.style.width = 'var(--start-w)'; addArea.style.maxWidth = 'var(--start-w)'; } catch (e) {}
        const available2 = Math.max(160, Math.round(window.innerWidth - Math.max(0, Math.round(br.left)) - 24));
        const computedMax2 = Math.min(1200, available2);
        addArea.style.setProperty('--max-w', `${Math.round(computedMax2)}px`);
        addArea.dataset.maxWidth = String(computedMax2);
        // Record a stable starting width (floor) so the add-area won't shrink
        // below this value even if content later causes expansion.
        if (!addArea.dataset.startWidth) addArea.dataset.startWidth = String(computedWidth);
      }
    } catch (e) {}
    // If already shown, focus the editable field
    const existing = addArea.querySelector('.add-fencer-card');
    if (existing) {
      const ed = existing.querySelector('[contenteditable]');
      if (ed) { ed.focus(); placeCaretAtEnd(ed); }
      return;
    }

    const card = document.createElement('article');
    card.className = 'fencer-card add-fencer-card';
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', 'Add new fencer');
    // Render the exact same DOM structure as a normal fencer card but
    // replace text spans with contenteditable inputs so styling matches.
    card.innerHTML = `
      <div class="fencer-row">
        <div class="fencer-left">
          <div class="fencer-name"><span class="fencer-fullname" contenteditable="true" role="textbox" aria-label="Full name" data-placeholder="Enter Name"></span></div>
          <div class="fencer-meta meta-rows">
            <div class="meta-row"><span class="meta-part meta-year" contenteditable="true" role="textbox" aria-label="Year of birth" data-placeholder="Enter Year"></span></div>
            <div class="meta-row"><span class="meta-part meta-rank" contenteditable="true" role="textbox" aria-label="Rank" data-placeholder="Enter Rank"></span></div>
            <div class="meta-row"><span class="meta-part meta-club" contenteditable="true" role="textbox" aria-label="Club" data-placeholder="Enter Club"></span></div>
          </div>
          <div class="meta-actions" style="margin-top:12px; display:flex; gap:8px;">
            <button class="frutiger-aero-button confirm-btn" type="button" aria-label="Confirm add fencer">Confirm</button>
          </div>
        </div>
      </div>
    `;

    // The add-fencer card is persistent by design and contains two editable
    // fields: the full name (Lastname, Firstname) and a single-line meta field
    // for "Year Rank Club". Focus the fullname field on show.

    addArea.appendChild(card);
    addArea.setAttribute('aria-hidden', 'false');
    // Keep the add-area visually small by default using a CSS class and
    // CSS variables. Avoid inline !important manipulations which can cause
    // layout flicker and conflicting transitions. We set `--start-w` and
              // Inline hover fallback for this modal's Cancel button
                // No inline hover fallback: let CSS handle hover transitions
    // `--max-w` here so CSS can control the narrow starting width until
    // the user explicitly hovers to expand.
    try {
      addArea.classList.add('add-init');
      const floor = parseFloat(addArea.dataset.startWidth) || null;
      const computedMax = parseFloat(addArea.dataset.maxWidth) || 620;
      if (floor) {
        addArea.style.setProperty('--start-w', `${Math.round(floor)}px`);
      }
      addArea.style.setProperty('--max-w', `${Math.round(computedMax)}px`);
      // Ensure card doesn't collapse too small for accessibility
      try {
        const areaW = addArea.getBoundingClientRect().width || Math.max(160, Math.round((document.querySelector('.checkin-bar')||{}).getBoundingClientRect().width || 320));
        card.style.minWidth = `${Math.max(160, Math.round(areaW))}px`;
        card.style.boxSizing = 'border-box';
      } catch (e) {}
    } catch (e) {}
    // Start the add-card hidden and then trigger a CSS fade-in for visual appeal
    try {
      card.classList.add('fade-enter');
      // Use a double RAF to ensure the initial class is applied before activating transition
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          card.classList.add('fade-enter-active');
          // cleanup classes after transition ends
          const onEnd = (ev) => {
            if (ev && ev.propertyName && ev.propertyName !== 'opacity') return;
            card.classList.remove('fade-enter', 'fade-enter-active');
            card.removeEventListener('transitionend', onEnd);
          };
          card.addEventListener('transitionend', onEnd);
        });
      });
    } catch (e) {}
    // Focus the fullname editable specifically and wire hover/touch to focus
    const fullnameEl = card.querySelector('.fencer-fullname');
    const metaYear = card.querySelector('.meta-year');
    const metaRank = card.querySelector('.meta-rank');
    const metaClub = card.querySelector('.meta-club');
    const focusEditable = (el) => { if (!el) return; try { el.focus(); placeCaretAtEnd(el); } catch (e) {} };
    if (fullnameEl) { focusEditable(fullnameEl); fullnameEl.addEventListener('mouseenter', () => focusEditable(fullnameEl)); fullnameEl.addEventListener('touchstart', () => focusEditable(fullnameEl), { passive: true }); }
    [metaYear, metaRank, metaClub].forEach((el) => { if (!el) return; el.addEventListener('mouseenter', () => focusEditable(el)); el.addEventListener('touchstart', () => focusEditable(el), { passive: true }); });
    // Ensure placeholders return on blur when the user didn't enter any text.
    const clearIfEmpty = (el) => {
      if (!el) return;
      setTimeout(() => {
        try {
          const txt = (el.innerText || '').toString().trim();
          if (!txt) el.textContent = '';
        } catch (e) {}
      }, 50);
    };
    [fullnameEl, metaYear, metaRank, metaClub].forEach((el) => { if (!el) return; el.addEventListener('blur', () => clearIfEmpty(el)); });

    // For the inline add-area fields, set fixed widths to match modal behavior
    try {
      setFixedWidthForElement(metaYear, 'Enter Year Born');
      setFixedWidthForElement(metaRank, 'Enter Current Rank');
      setFixedWidthForElement(metaClub, 'Salt City Swords Fencing Club' + 'W');
    } catch (e) {}

    // Helper sanitizers and validators used for input validation and placeholders
    const sanitizeEmpty = (el) => {
      if (!el) return;
      try {
        const INVISIBLE_CHARS = /[\u200B-\u200F\uFEFF\u00A0]/g;
        const raw = (el.innerText || '').toString();
        const cleaned = raw.replace(INVISIBLE_CHARS, '').trim();
        if (!cleaned) el.textContent = '';
      } catch (e) {}
    };
    const markInvalid = (el) => { if (!el) return; sanitizeEmpty(el); el.classList.add('input-invalid'); };
    const clearInvalid = (el) => { if (!el) return; el.classList.remove('input-invalid'); };
    const cleanedValue = (el) => { if (!el) return ''; try { const INVISIBLE_CHARS = /[\u200B-\u200F\uFEFF\u00A0]/g; return (el.innerText || '').toString().replace(INVISIBLE_CHARS, ' ').replace(/\s+/g, ' ').trim(); } catch (e) { return ''; } };

    const onAutoPlaceholderInput = (el) => {
      if (!el) return;
      try {
        const v = cleanedValue(el) || '';
        if (!v) {
          // If the user cleared the field while still focused, ensure the
          // element is truly empty so the CSS placeholder (::before) will
          // appear immediately. Keep focus and caret so the user can type.
          el.textContent = '';
          try { placeCaretAtEnd(el); } catch (e) {}
        }
      } catch (e) {}
    };
    [fullnameEl, metaYear, metaRank, metaClub].forEach((el) => {
      if (!el) return;
      el.addEventListener('input', () => { clearInvalid(el); onAutoPlaceholderInput(el); });
      el.addEventListener('focus', () => clearInvalid(el));
    });

    // Adjust add-area when the user hovers. We avoid changing inline widths
    // during fade; instead we toggle classes and update CSS variables. This
    // prevents automatic expansion after the fade completes and removes
    // conflicting !important manipulations that caused flicker.
    try {
      const paddingExtra = 24; // px slack so text isn't not flush to edge
      const startW = parseFloat(addArea.dataset.startWidth) || 0;
      const maxWcfg = parseFloat(addArea.dataset.maxWidth) || 1200;

      const measureAndSetMax = (force = false) => {
        try {
          // measure the card's natural width and set the CSS variable
          const measured = card.scrollWidth || card.getBoundingClientRect().width || 0;
          const desired = Math.min(maxWcfg, Math.max(startW || 0, Math.ceil(measured + paddingExtra)));
          addArea.style.setProperty('--max-w', `${Math.round(desired)}px`);
          return Math.round(desired);
        } catch (e) { return null; }
      };

      const ADD_LEAVE_DELAY = 150; // ms - match search bar behavior
      let addLeaveTimer = null;

      const cancelAddLeave = () => {
        if (addLeaveTimer) {
          clearTimeout(addLeaveTimer);
          addLeaveTimer = null;
        }
      };

      const onHoverExpand = (ev) => {
        try {
          // Cancel any scheduled collapse so the area stays open while interacting
          cancelAddLeave();
          // Measure content-driven width first
          const measured = measureAndSetMax(true) || 0;
          // Prefer expanding to a value noticeably larger than the current
          // size but avoid expanding all the way to the ceiling which can
          // feel too wide. Compute a hover target that's the greater of
          // measured+padding and a fraction of the available growth from
          // `startW` towards `maxWcfg` (use HOVER_FRACTION to tune).
          const HOVER_FRACTION = 0.08; // 0..1 fraction of growth toward max (reduced)
          const hoverCandidate = Math.max(measured + paddingExtra, Math.round(startW + (maxWcfg - startW) * HOVER_FRACTION));
          const hoverGoal = Math.min(maxWcfg, Math.max(startW || 0, Math.ceil(hoverCandidate)));
          // Apply class and inline width in a single RAF to ensure simultaneous transitions
          requestAnimationFrame(() => {
            try {
              addArea.classList.remove('add-init');
              addArea.classList.add('add-hover');
              // set CSS var to our hover goal and apply it as inline width so
              // the visual expansion goes to the larger target (but still
              // respects the ceiling/max we've computed earlier).
              addArea.style.setProperty('--max-w', `${Math.round(hoverGoal)}px`);
              addArea.style.width = 'var(--max-w)';
              addArea.style.maxWidth = 'var(--max-w)';
              // increase confirm button width slightly when expanded
              addArea.style.setProperty('--confirm-w', '200px');
            } catch (e) {}
          });
        } catch (e) {}
      };

      const collapseToBestWidth = () => {
        try {
          // Measure the card's natural width and clamp between start and max
          const measured = card.scrollWidth || card.getBoundingClientRect().width || 0;
          const desired = Math.min(maxWcfg, Math.max(startW || 0, Math.ceil(measured + paddingExtra)));
          // Apply the collapsed width inline and toggle classes in a RAF so transitions start together
          requestAnimationFrame(() => {
            try {
              addArea.style.setProperty('--max-w', `${Math.round(desired)}px`);
              addArea.style.width = `${Math.round(desired)}px`;
              addArea.style.maxWidth = `${Math.round(desired)}px`;
              addArea.classList.remove('add-hover');
              addArea.classList.add('add-init');
              // No left restore needed since we don't shift on expand anymore.
              // set confirm width var back to compact
              addArea.style.setProperty('--confirm-w', '160px');
            } catch (e) {}
          });
        } catch (e) {}
      };

      const onHoverCollapse = (ev) => {
        try {
          // Debounce collapse so small pointer slips don't immediately close the area
          if (addLeaveTimer) clearTimeout(addLeaveTimer);
          addLeaveTimer = setTimeout(() => {
            try {
              collapseToBestWidth();
            } catch (e) {}
            addLeaveTimer = null;
          }, ADD_LEAVE_DELAY);
        } catch (e) {}
      };

      if (addArea) {
        // Hover expansion intentionally disabled: keep add-area at its
        // computed, content-fit width and do not attach pointer hover handlers.
        try {
          // Measure once to set an appropriate starting width variable
          const measured = measureAndSetMax(true) || 0;
          // Apply the collapsed width inline so the area is stable.
          const desired = Math.min(maxWcfg, Math.max(startW || 0, Math.ceil(measured + paddingExtra)));
          addArea.style.setProperty('--max-w', `${Math.round(desired)}px`);
          addArea.style.width = `${Math.round(desired)}px`;
          addArea.style.maxWidth = `${Math.round(desired)}px`;
          addArea.classList.add('add-init');
        } catch (e) {}
      }

      // When individual fields blur (user leaves the editable), collapse the
      // add-area to fit the content horizontally so long values don't wrap.
      try {
        [fullnameEl, metaYear, metaRank, metaClub].forEach((el) => {
          if (!el) return;
          el.addEventListener('blur', () => {
            setTimeout(() => {
              try {
                // If focus moved to another element inside the addArea, do not collapse.
                // This prevents blur when moving between fields from triggering collapse.
                const ae = document.activeElement;
                if (ae && addArea && addArea.contains(ae)) return;
                const v = cleanedValue(el) || '';
                if (v) {
                  collapseToBestWidth();
                } else {
                  // if the field is empty, collapse to the defined start width
                  try { addArea.style.width = 'var(--start-w)'; addArea.style.maxWidth = 'var(--start-w)'; } catch (e) {}
                }
              } catch (e) {}
            }, 60);
          });
        });
      } catch (e) {}

      // Wire the checkin bar to collapse the add area when pointer leaves the bar,
      // matching the search bar behavior. Only attach these handlers once.
      try {
        const barEl = document.querySelector('.checkin-bar');
        if (barEl && !addArea.dataset.leaveWired) {
          barEl.addEventListener('mouseleave', () => {
            if (addLeaveTimer) clearTimeout(addLeaveTimer);
            addLeaveTimer = setTimeout(() => {
              try { collapseToBestWidth(); } catch (e) {}
              addLeaveTimer = null;
            }, ADD_LEAVE_DELAY);
          });
          barEl.addEventListener('mouseenter', () => { if (addLeaveTimer) { clearTimeout(addLeaveTimer); addLeaveTimer = null; } });
          addArea.dataset.leaveWired = '1';
        }
      } catch (e) {}
    } catch (e) {}

    // Add Confirm button handler: saves the fencer, clears the inputs, but
    // keeps the add-card visible so the user can add more entries quickly.
    if (metaYear) {
      metaYear.addEventListener('keydown', (e) => {
        try {
          const navKeys = ['Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab','Home','End'];
          if (navKeys.includes(e.key)) return;
          // allow meta/ctrl combos (copy/paste/select etc.)
          if (e.ctrlKey || e.metaKey) return;
          const cur = cleanedValue(metaYear) || '';
          // If there's a selection, allow replacement; otherwise block when at max
          let selLen = 0;
          const sel = window.getSelection && window.getSelection();
          if (sel && sel.rangeCount) selLen = sel.getRangeAt(0).toString().length || 0;
          if ((cur.length - selLen) >= 4) {
            e.preventDefault();
          }
        } catch (err) {}
      });

      metaYear.addEventListener('input', () => {
        try {
          const v = cleanedValue(metaYear) || '';
          if (v.length > 4) {
            metaYear.textContent = v.slice(0,4);
            placeCaretAtEnd(metaYear);
          }
        } catch (err) {}
      });

      metaYear.addEventListener('paste', (e) => {
        try {
          e.preventDefault();
          const text = ((e.clipboardData && e.clipboardData.getData('text')) || '').toString();
          const cur = cleanedValue(metaYear) || '';
          let selLen = 0;
          const sel = window.getSelection && window.getSelection();
          if (sel && sel.rangeCount) selLen = sel.getRangeAt(0).toString().length || 0;
          const space = Math.max(0, 4 - (cur.length - selLen));
          const insert = text.replace(/\s+/g, '').slice(0, space);
          if (insert.length) document.execCommand('insertText', false, insert);
        } catch (err) {}
      });
    }

    // Restrict the Rank field to at most 3 characters for visual compactness
    if (metaRank) {
      metaRank.addEventListener('keydown', (e) => {
        try {
          const navKeys = ['Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab','Home','End'];
          if (navKeys.includes(e.key)) return;
          if (e.ctrlKey || e.metaKey) return;
          const cur = cleanedValue(metaRank) || '';
          let selLen = 0;
          const sel = window.getSelection && window.getSelection();
          if (sel && sel.rangeCount) selLen = sel.getRangeAt(0).toString().length || 0;
          if ((cur.length - selLen) >= 3) {
            e.preventDefault();
          }
        } catch (err) {}
      });

      metaRank.addEventListener('input', () => {
        try {
          const v = cleanedValue(metaRank) || '';
          if (v.length > 3) {
            metaRank.textContent = v.slice(0,3);
            placeCaretAtEnd(metaRank);
          }
        } catch (err) {}
      });

      metaRank.addEventListener('paste', (e) => {
        try {
          e.preventDefault();
          const text = ((e.clipboardData && e.clipboardData.getData('text')) || '').toString();
          const cur = cleanedValue(metaRank) || '';
          let selLen = 0;
          const sel = window.getSelection && window.getSelection();
          if (sel && sel.rangeCount) selLen = sel.getRangeAt(0).toString().length || 0;
          const space = Math.max(0, 3 - (cur.length - selLen));
          const insert = text.replace(/\s+/g, '').slice(0, space);
          if (insert.length) document.execCommand('insertText', false, insert);
        } catch (err) {}
      });
    }

    // Wire Confirm button (below the Club input). The Confirm button adds the
    // fencer to storage and clears the inputs but keeps the add card visible.
    const confirmBtn = card.querySelector('.confirm-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', (e) => {
        e.preventDefault();
        try {
          const nameVal = cleanedValue(fullnameEl);
          const yearVal = cleanedValue(metaYear);
          const rankVal = cleanedValue(metaRank);
          const clubVal = cleanedValue(metaClub);

          // Validate required fields: full name and each meta field
          let firstInvalid = null;
          if (!nameVal) { markInvalid(fullnameEl); firstInvalid = fullnameEl; }
          if (!yearVal) { markInvalid(metaYear); if (!firstInvalid) firstInvalid = metaYear; }
          if (!rankVal) { markInvalid(metaRank); if (!firstInvalid) firstInvalid = metaRank; }
          if (!clubVal) { markInvalid(metaClub); if (!firstInvalid) firstInvalid = metaClub; }
          if (firstInvalid) { firstInvalid.focus(); placeCaretAtEnd(firstInvalid); return; }

          const newF = { id: `f-auto-${Date.now()}-${Math.floor(Math.random()*9000)}`, name: nameVal, born: yearVal || '', rank: rankVal || '', club: clubVal || '', raw: { name: nameVal, born: yearVal, rank: rankVal, club: clubVal } };
          let raw = sessionStorage.getItem('fencingapp:fencers');
          let fencers = raw ? JSON.parse(raw) : [];
          fencers.unshift(newF);
          sessionStorage.setItem('fencingapp:fencers', JSON.stringify(fencers));
          renderFencerCards(true);

          // Clear the inputs but keep the add card visible for another entry
          try {
            [fullnameEl, metaYear, metaRank, metaClub].forEach((el) => { if (el) el.textContent = ''; });
            if (fullnameEl) { fullnameEl.focus(); placeCaretAtEnd(fullnameEl); }
          } catch (e) {}
        } catch (err) { console.error('Failed to confirm new fencer', err); }
      });
    }
    

    if (removeCopyBtn) {
      removeCopyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        try { if (addArea) { addArea.setAttribute('aria-hidden', 'true'); while (addArea.firstChild) addArea.removeChild(addArea.firstChild); } } catch (err) {}
      });
    }
  }
  function renderFencerCards(preserveOrder = false) {
    if (!cardsContainer) return;
    let raw = sessionStorage.getItem('fencingapp:fencers');
    let fencers = [];
    try { fencers = raw ? JSON.parse(raw) : []; } catch (e) { fencers = []; }
    try { console.debug('renderFencerCards - loaded fencers count:', (fencers && fencers.length) || 0, 'source=sessionStorage'); } catch (e) {}

    // Ensure each fencer has normalized fields (club, rank, born) derived from raw when missing.
    const normalizeAliases = (rawObj) => {
      const rl = {};
      Object.keys(rawObj || {}).forEach(k => { rl[(k||'').toLowerCase().trim()] = rawObj[k]; });
      const find = (cands) => {
        for (let k of cands) if (rl[k] && rl[k].toString().trim()) return rl[k].toString().trim();
        return '';
      };
      return {
        club: find(CSV_ALIASES.club),
        rank: find(CSV_ALIASES.rank),
        born: find(CSV_ALIASES.born)
      };
    };

    let mutatedForNorm = false;
    fencers = (fencers || []).map((f) => {
      const rawObj = f.raw || {};
      const norm = normalizeAliases(rawObj);
      if ((!f.club || f.club.toString().trim()==='') && norm.club) { f.club = norm.club; mutatedForNorm = true; }
      // Prefer the normalized rank from CSV aliases when available. This
      // avoids cases where an earlier parse set `f.rank` to a "Place"/finish
      // value. If `norm.rank` exists, overwrite the stored `f.rank` so both
      // the card and detail view show the canonical classification.
      if (norm.rank) { if (f.rank !== norm.rank) { f.rank = norm.rank; mutatedForNorm = true; } }
      if ((!f.born || f.born.toString().trim()==='') && norm.born) { f.born = norm.born; mutatedForNorm = true; }
      return f;
    });
    if (mutatedForNorm) {
      try { sessionStorage.setItem('fencingapp:fencers', JSON.stringify(fencers)); console.debug('Normalized and persisted fencers to sessionStorage'); } catch (e) {}
    }
    // Ensure every fencer has a stable id so we can FLIP animate between renders
    let mutated = false;
    fencers = (fencers || []).map((f, i) => {
      if (!f.id) {
        f.id = `f-auto-${Date.now()}-${i}-${Math.floor(Math.random()*9000)}`;
        mutated = true;
      }
      return f;
    });
    if (mutated) sessionStorage.setItem('fencingapp:fencers', JSON.stringify(fencers));

    // Sort fencers alphabetically by last name for consistent display, unless
    // caller asked us to preserve the current order (e.g. when promoting a card)
    function lastNameKey(fullName) {
      if (!fullName) return '';
      const s = fullName.trim();
      if (s.indexOf(',') !== -1) return s.split(',')[0].trim().toLowerCase();
      const parts = s.split(/\s+/);
      return parts.length ? parts[parts.length - 1].toLowerCase() : s.toLowerCase();
    }
    if (!preserveOrder) {
      try { fencers.sort((a,b) => { const la = lastNameKey(a.name||''); const lb = lastNameKey(b.name||''); if (la < lb) return -1; if (la > lb) return 1; return 0; }); } catch (e) {}
    }

    cardsContainer.innerHTML = '';
    if (!fencers || fencers.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'cards-empty';
      hint.textContent = 'No fencers imported yet. Use Import on the home page.';
      cardsContainer.appendChild(hint);
        try { updateNavigationButtonStates(); } catch (e) {}
        return;
    }
    fencers.forEach((f, idx) => {
      const card = document.createElement('article');
      card.className = 'fencer-card';
      // use stable id as the DOM key for FLIP
      card.setAttribute('data-id', f.id || (`f-${idx}`));
      card.setAttribute('data-index', idx);
      // (we will attach inferred club/rank attributes after we compute them below)

  // (class/category value will be computed after splitting the name)

      // Original simple layout: Name on the left, compact details on the right
        // Split the name into LASTNAME and FIRSTNAME for the requested layout.
        let firstName = '';
        let lastName = '';
        const rawName = (f.name || '').toString().trim();
        if (rawName.indexOf(',') !== -1) {
          const parts = rawName.split(',');
          let left = parts[0].trim();
          let right = (parts.slice(1).join(',') || '').trim();

          // If CSV used commas, try to detect whether it was "Last, First" or
          // "First, Last" by comparing tokens against a small list of common
          // given names. This handles cases like "ABIGAIL, Whitesides".
          const COMMON_FIRST_NAMES = new Set(['abigail','ava','sophia','emma','olivia','isabella','mia','amelia','charlotte','evelyn','harper','eli','ethan','liam','noah','oliver','elijah','lucas','mason','logan','james','alexander','benjamin','jacob','michael','daniel','henry','jack','sebastian','samuel','abigail','ethan','amelia','ethan','ethan','ethan','ethan','ethan']);
          const normalizeToken = (s) => (s||'').toString().trim().toLowerCase().replace(/[^a-z]/g,'');
          const leftNorm = normalizeToken(left);
          const rightNorm = normalizeToken(right);

          if (COMMON_FIRST_NAMES.has(leftNorm) && !COMMON_FIRST_NAMES.has(rightNorm)) {
            // left looks like a given name -> treat as First, Last
            firstName = left;
            lastName = right;
          } else if (COMMON_FIRST_NAMES.has(rightNorm) && !COMMON_FIRST_NAMES.has(leftNorm)) {
            // right looks like a given name -> treat as First, Last (swap)
            firstName = right;
            lastName = left;
          } else {
            // default: treat as Last, First
            lastName = parts[0].trim();
            firstName = (parts.slice(1).join(',') || '').trim();
          }
        } else {
          const parts = rawName.split(/\s+/).filter(Boolean);
          if (parts.length === 1) { lastName = parts[0]; }
          else {
            // Heuristic: some CSVs provide `LASTNAME Firstname` without a comma
            // (e.g. "ASHBY Ethan"). Detect when the first token is ALL CAPS
            // and the second token is not, and treat that as LASTNAME followed
            // by Firstname. Otherwise fall back to treating the last token as
            // the surname (common "First Last" format).
            const isAllUpper = (s) => !!s && s === s.toUpperCase();
            if (parts.length >= 2 && isAllUpper(parts[0]) && !isAllUpper(parts[1])) {
              lastName = parts[0];
              firstName = parts.slice(1).join(' ');
            } else {
              lastName = parts[parts.length - 1];
              firstName = parts.slice(0, parts.length - 1).join(' ');
            }
          }
        }

        const clazz = (f.category || f.class || '').toString().trim();

        // Provide robust fallbacks for club and rank by checking the original raw CSV

        // Build a lower-cased raw map from the original CSV row for fallback heuristics
        const rawObj = f.raw || {};
        const rawLower = {};
        Object.keys(rawObj).forEach(k => { rawLower[(k||'').toLowerCase().trim()] = rawObj[k]; });

        // Primary fallbacks from common header names
        let clubVal = (f.club || '').toString().trim() || rawLower['club'] || rawLower['club name'] || rawLower['affiliation'] || rawLower['team'] || rawLower['organization'] || rawLower['org'] || '';
        let rankVal = (f.rank || '').toString().trim() || rawLower['rank'] || rawLower['rating'] || rawLower['usa rating'] || rawLower['seed'] || rawLower['ranking'] || '';

        // Heuristic fallback: if still missing, try to infer from raw values
        const isLikelyClub = (v) => {
          if (!v || typeof v !== 'string') return false;
          const s = v.trim();
          if (!s) return false;
          // Exclude obvious name / date / numeric-only values
          if (/^\d{2,4}(-|\/)\d{1,2}/.test(s)) return false; // dates
          if (/^[\d\s.,-]+$/.test(s)) return false; // numbers
          if (s.toLowerCase().includes('@')) return false; // emails
          // club names commonly contain letters and may have hyphens/slashes/periods
          if (/[A-Za-z].*[A-Za-z]/.test(s) && s.length >= 2 && s.length <= 60) return true;
          return false;
        };

        const isLikelyRank = (key, v) => {
          if (!v || typeof v !== 'string') return false;
          const s = v.trim();
          if (!s) return false;
          // If the header name explicitly mentions rank/seed/rating, accept many formats
          const hk = (key||'').toLowerCase();
          const headerSuggestsRank = /rank|rating|usa rating|seed|ranking|classification|class/.test(hk);

          // Short letter ranks (A/B/C) or textual ranks
          if (/^[ABCabc]$/.test(s)) return true;
          if (/^(Sr|Jr|Senior|Junior|Vet)\b/i.test(s)) return true;

          // If header suggests rank, accept numeric or Uxx formats as rank
          if (headerSuggestsRank) {
            if (/^[0-9]{1,4}$/.test(s)) return true;
            if (/^U?\d{2,4}$/.test(s)) return true;
            return true;
          }

          // Otherwise, be conservative: reject plain numeric values (likely age)
          if (/^[0-9]{1,3}$/.test(s)) return false;

          // Accept formatted seeds like '#12' or 'seed 12' only if header suggests
          if (/^#\d+$/.test(s) && headerSuggestsRank) return true;

          // Accept if contains rank-like words
          if (/seed/i.test(s) || /ranking|rank|rating/i.test(s)) return true;
          return false;
        };

        if (!clubVal || clubVal === '') {
          for (const k of Object.keys(rawLower)) {
            const v = (rawLower[k]||'').toString().trim();
            if (!v) continue;
            // Skip fields that are obviously the name or born year
            if (v === f.name) continue;
            if (v === f.born) continue;
            if (isLikelyClub(v)) { clubVal = v; break; }
          }
        }

        if (!rankVal || rankVal === '') {
          for (const k of Object.keys(rawLower)) {
            const v = (rawLower[k]||'').toString().trim();
            if (!v) continue;
            if (v === f.name) continue;
            if (v === f.born) continue;
            // Skip obvious age fields (header includes 'age')
            if ((k||'').toLowerCase().includes('age')) continue;
            if (isLikelyRank(k, v)) { rankVal = v; break; }
          }
        }

        // Attach data attributes for easier inspection in the DOM
        try { card.setAttribute('data-club', clubVal || ''); card.setAttribute('data-rank', rankVal || ''); } catch (e) {}

        // Compose meta text: Year Born (only), then Rank, then Club separated by a dot
        // Prefer a 4-digit year from `f.born`; do not fall back to age.
        let birthYear = '';
        try {
          const byRaw = (f.born || '').toString().trim();
          if (/^\d{4}$/.test(byRaw)) birthYear = byRaw;
          else if (byRaw) {
            const p = Date.parse(byRaw);
            if (!Number.isNaN(p)) birthYear = (new Date(p)).getFullYear().toString();
          }
        } catch (e) { birthYear = ''; }
        // If the fencer lists multiple clubs, display only the first club and
        // indicate truncation with "/..." (e.g. "FirstClub /..."). This keeps
        // cards compact when someone belongs to multiple clubs.
        let displayClub = '';
        try {
          if (clubVal && typeof clubVal === 'string') {
            const parts = clubVal.split(/[\/;,|]+/).map(s => (s||'').toString().trim()).filter(Boolean);
            if (parts.length > 1) displayClub = parts[0] + ' /...';
            else displayClub = clubVal;
          }
        } catch (e) { displayClub = clubVal; }

        // Compose meta: Club · Rank only (membershipId shown in info modal)
        const metaText = [displayClub, rankVal].filter(Boolean).join(' · ');
        try { console.debug('fencer meta', { id: f.id, name: f.name, metaText, born: f.born, rank: f.rank, club: f.club, membershipId: f.membershipId, raw: f.raw }); } catch (e) {}

        // Format names: LASTNAME uppercase followed by Firstname (capitalized)
        // on the same line. The JS formatter ensures first name capitalization.
        const formatFirst = (s) => s.toString().split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        const lastNameDisplay = (lastName || '').toString().toUpperCase();
        const firstNameDisplay = formatFirst(firstName || '');

        // Debug: if the parsed tokens look suspicious (e.g. first name is ALL CAPS
        // or last name is not all caps), log an example to help diagnose swapping
        try {
          const looksLikeAllCaps = (s) => !!s && s === s.toUpperCase();
          if (looksLikeAllCaps(firstName) && !looksLikeAllCaps(lastName)) {
            console.warn('Name-parse suspicious: firstName looks ALL CAPS while lastName does not', { rawName: f.name, parsed: { firstName, lastName }, raw: f.raw });
          }
          // Also log when parsed lastName is unexpectedly short (single char) or empty
          if (!lastName || lastName.length <= 1) {
            console.warn('Name-parse suspicious: lastName empty/short', { rawName: f.name, parsed: { firstName, lastName }, raw: f.raw });
          }
        } catch (e) {}

        card.innerHTML = `
          <div class="fencer-row">
            <div class="fencer-left">
              <div class="fencer-name"><span class="fencer-lastname">${escapeHtml(lastNameDisplay)}</span> <span class="fencer-firstname">${escapeHtml(firstNameDisplay)}</span></div>
              <div class="fencer-meta">${metaText}</div>
            </div>
            <div class="card-actions" aria-hidden="false">
              <button class="frutiger-aero-button card-action info-btn" type="button" aria-label="Information" data-action="info" data-id="${escapeHtml(f.id || '')}">📋</button>
              <button class="frutiger-aero-button card-action remove-btn" type="button" aria-label="${f && f.checked ? 'Checked in' : 'Check in fencer'}" data-action="remove" data-id="${escapeHtml(f.id || '')}">${f && f.checked ? '✔' : 'X'}</button>
            </div>
          </div>
        `;
      // Reflect checked state in the DOM so the remove button shows ✔ and green
      try {
        const removeBtnEl = card.querySelector('.card-action.remove-btn');
        if (f.checked) {
          card.classList.add('checked');
          if (removeBtnEl) {
            removeBtnEl.classList.add('checked');
            removeBtnEl.textContent = '✔';
            removeBtnEl.setAttribute('aria-pressed', 'true');
          }
        } else {
          card.classList.remove('checked');
          if (removeBtnEl) {
            removeBtnEl.classList.remove('checked');
            removeBtnEl.textContent = 'X';
            removeBtnEl.setAttribute('aria-pressed', 'false');
          }
        }
      } catch (e) {}

      cardsContainer.appendChild(card);
    });

    // If removal mode is active, re-apply the visual state (useful after re-renders)
    if (removeMode) {
      cardsContainer.classList.add('removal-mode');
      if (removeBtn) removeBtn.classList.add('remove-active');
      if (removeBtn) removeBtn.setAttribute('aria-pressed', 'true');
    } else {
      cardsContainer.classList.remove('removal-mode');
      if (removeBtn) removeBtn.classList.remove('remove-active');
      if (removeBtn) removeBtn.setAttribute('aria-pressed', 'false');
    }
    try { updateNavigationButtonStates(); } catch (e) {}
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"'`]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',"`":'&#96;'})[c]);
  }

  renderFencerCards();

  // Keep Seeding nav state accurate initially
  try { updateSeedingButtonState(); } catch (e) {}
  try { updateNavigationButtonStates(); } catch (e) {}
  // (Check-in All removed) - no-op

  function setRemoveMode(on) {
    removeMode = !!on;
    if (removeMode) {
      // visually indicate mode
      cardsContainer.classList.add('removal-mode');
      if (removeBtn) removeBtn.classList.add('remove-active');
      if (removeCopyBtn) removeCopyBtn.classList.add('remove-active');
      // also add a global body class so the visual state survives focus changes
      document.body.classList.add('removal-mode-active');
      // update aria
      if (removeBtn) removeBtn.setAttribute('aria-pressed', 'true');
      if (removeCopyBtn) removeCopyBtn.setAttribute('aria-pressed', 'true');
    } else {
      cardsContainer.classList.remove('removal-mode');
      if (removeBtn) removeBtn.classList.remove('remove-active');
      if (removeCopyBtn) removeCopyBtn.classList.remove('remove-active');
      document.body.classList.remove('removal-mode-active');
      if (removeBtn) removeBtn.setAttribute('aria-pressed', 'false');
      if (removeCopyBtn) removeCopyBtn.setAttribute('aria-pressed', 'false');
    }
  }

  // Check-in all fencers: mark every fencer as checked, persist and re-render.
  function checkInAll() {
    try {
      let raw = sessionStorage.getItem('fencingapp:fencers');
      let fencers = raw ? JSON.parse(raw) : [];
      if (!fencers || fencers.length === 0) return;
      fencers = fencers.map(f => Object.assign({}, f, { checked: true }));
      sessionStorage.setItem('fencingapp:fencers', JSON.stringify(fencers));
      renderFencerCards();
      try { updateSeedingButtonState(); } catch (e) {}
      // brief visual feedback on the button
      if (checkinAllBtn) {
        checkinAllBtn.classList.add('active');
        setTimeout(() => { if (checkinAllBtn) checkinAllBtn.classList.remove('active'); }, 360);
      }
    } catch (err) {
      console.error('checkInAll failed', err);
    }
  }

  // (Check-in All removed) - no helper required

  // Enable/disable the Seeding nav button depending on whether all fencers
  // are checked in. When there are no fencers, keep Seeding disabled.
  function updateSeedingButtonState() {
    try {
      let raw = sessionStorage.getItem('fencingapp:fencers');
      let fencers = raw ? JSON.parse(raw) : [];
      const seedingBtn = document.querySelector('.seeding-btn');
      const allChecked = (fencers && fencers.length > 0) && fencers.every(f => !!f.checked);
      if (seedingBtn) {
        if (allChecked) {
          seedingBtn.classList.remove('disabled');
          seedingBtn.removeAttribute('aria-disabled');
        } else {
          seedingBtn.classList.add('disabled');
          seedingBtn.setAttribute('aria-disabled', 'true');
        }
      }
    } catch (e) { console.error('updateSeedingButtonState failed', e); }
  }

  // Intercept clicks on the Seeding button. If not all fencers are checked in,
  // show a confirmation modal (blur overlay + card) allowing the user to
  // "Continue Anyways" or cancel. If all fencers are checked, follow link.
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('.seeding-btn');
    if (!a) return;
    const isDisabled = a.getAttribute('aria-disabled') === 'true';
    if (!isDisabled) return; // allow normal navigation
    ev.preventDefault();
    try {
      showSeedingProceedModal(a);
    } catch (e) { console.error('Failed to show seeding proceed modal', e); }
  });

  // Update Pools/DE navigation buttons state and intercept clicks when disabled.
  function showInfoModal(message) {
    try {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.style.zIndex = 1210;
      const card = document.createElement('article');
      card.className = 'fencer-card modal-card';
      card.innerHTML = `
        <div class="fencer-row">
          <div class="fencer-left">
            <div class="fencer-name"><span style="font-size:1.02rem;">${escapeHtml(message)}</span></div>
            <div class="meta-actions" style="margin-top:14px; display:flex; gap:10px; justify-content:flex-end;">
              <button class="frutiger-aero-button modal-ok">OK</button>
            </div>
          </div>
        </div>`;
      overlay.appendChild(card);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => { overlay.classList.add('modal-active'); card.classList.add('fade-enter-active'); });
      document.body.classList.add('modal-open');
      const cleanup = () => {
        overlay.classList.remove('modal-active'); card.classList.remove('fade-enter-active'); document.body.classList.remove('modal-open');
        try {
          const rootStyle = getComputedStyle(document.documentElement);
          let dur = (rootStyle.getPropertyValue('--card-duration') || '520ms').trim();
          let ms = 520; if (dur.endsWith('ms')) ms = parseFloat(dur); else if (dur.endsWith('s')) ms = parseFloat(dur) * 1000;
          setTimeout(() => { try { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) {} }, Math.max(0, Math.round(ms)));
        } catch (e) { setTimeout(() => { try { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) {} }, 520); }
      };
      // Attach temporary inline hover fallback so Cancel shows confirm glow
        // Rely on CSS hover/transition for modal cancel/close glow (no inline fallback)
      const ok = card.querySelector('.modal-ok'); if (ok) ok.addEventListener('click', (e) => { e.preventDefault(); cleanup(); });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
    } catch (e) { console.error('showInfoModal error', e); }
  }

  function updateNavigationButtonStates() {
    try {
      let raw = sessionStorage.getItem('fencingapp:fencers');
      let fencers = raw ? JSON.parse(raw) : [];
      const hasFencers = Array.isArray(fencers) && fencers.length > 0;
      const poolsBtn = document.querySelector('.pools-btn');
      const deBtn = document.querySelector('.de-btn');
      [poolsBtn, deBtn].forEach((btn) => {
        if (!btn) return;
        if (!hasFencers) {
          // visually disable
          btn.classList.add('disabled');
          btn.setAttribute('aria-disabled', 'true');
          // remove from keyboard navigation
          try { btn.setAttribute('tabindex', '-1'); } catch (err) {}
          // force visual disabled appearance via inline CSS variables and styles
          try {
            btn.style.setProperty('--sat', '0');
            btn.style.setProperty('--hue', '0deg');
            btn.style.setProperty('--fg', 'rgba(255,255,255,0.85)');
            btn.style.setProperty('--bg', 'oklch(68% 0 0 / 0.92)');
            btn.style.setProperty('--bg-dark', 'oklch(48% 0 0 / 0.9)');
            btn.style.setProperty('opacity', '0.95');
            btn.style.setProperty('cursor', 'not-allowed');
            btn.style.setProperty('box-shadow', 'none');
            btn.style.setProperty('border-color', 'rgba(255,255,255,0.06)');
            // also set concrete background + border + shadow inline with !important to beat competing rules
            try {
              btn.style.setProperty('background', 'linear-gradient(to bottom, rgba(60,60,60,0.98), rgba(96,96,96,0.95))', 'important');
              btn.style.setProperty('border-color', 'rgba(255,255,255,0.06)', 'important');
              btn.style.setProperty('box-shadow', 'none', 'important');
            } catch (err) {}
          } catch (err) {}
        } else {
          // restore
          btn.classList.remove('disabled');
          btn.removeAttribute('aria-disabled');
          // restore keyboard navigation
          try { btn.removeAttribute('tabindex'); } catch (err) {}
          try {
            btn.style.removeProperty('--sat');
            btn.style.removeProperty('--hue');
            btn.style.removeProperty('--fg');
            btn.style.removeProperty('--bg');
            btn.style.removeProperty('--bg-dark');
            btn.style.removeProperty('opacity');
            btn.style.removeProperty('cursor');
            btn.style.removeProperty('box-shadow');
            btn.style.removeProperty('border-color');
            // remove concrete inline overrides as well
            try {
              btn.style.removeProperty('background');
              btn.style.removeProperty('border-color');
              btn.style.removeProperty('box-shadow');
            } catch (err) {}
          } catch (err) {}
        }
      });
    } catch (e) { console.error('updateNavigationButtonStates failed', e); }
  }

  // Intercept clicks on Pools/DE when disabled and show info modal
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('.pools-btn, .de-btn');
    if (!a) return;
    const isDisabled = a.getAttribute('aria-disabled') === 'true';
    if (!isDisabled) return; // allow navigation
    ev.preventDefault();
    try { showInfoModal('Please import at least one fencer before visiting Pools or DE.'); } catch (e) { try { alert('Please import at least one fencer before visiting Pools or DE.'); } catch (err) {} }
  });

  // Create and show the seeding confirmation modal overlay
  function showSeedingProceedModal(anchor) {
    try {
      // overlay
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.style.zIndex = 1205;

      // modal card (reuse fencer-card visuals)
      const card = document.createElement('article');
      card.className = 'fencer-card modal-card';
      card.innerHTML = `
        <div class="fencer-row">
          <div class="fencer-left">
            <div class="fencer-name"><span style="font-size:1.12rem;">Not all fencers are checked in!</span></div>
            <div class="fencer-meta" style="margin-top:8px; font-size:0.95rem; opacity:0.95;">You can continue to seeding now, but some fencers are not checked in. Do you want to continue anyway?</div>
            <div class="meta-actions" style="margin-top:14px; display:flex; gap:10px; justify-content:flex-end;">
              <button class="frutiger-aero-button modal-cancel confirm-btn" style="--hue:0deg; --sat:0;">Cancel</button>
              <button class="frutiger-aero-button modal-continue" style="--hue:140deg;">Continue Anyways</button>
            </div>
          </div>
        </div>
      `;

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      // trigger fade-in by adding active class next frame
      requestAnimationFrame(() => { overlay.classList.add('modal-active'); card.classList.add('fade-enter-active'); });

      // prevent background interactions
      document.body.classList.add('modal-open');

      const cleanup = () => {
        try {
          overlay.classList.remove('modal-active');
          card.classList.remove('fade-enter-active');
          document.body.classList.remove('modal-open');
          // allow CSS transition (same --card-duration used by CSS) to finish then remove DOM
          try {
            const rootStyle = getComputedStyle(document.documentElement);
            let dur = (rootStyle.getPropertyValue('--card-duration') || '520ms').trim();
            let ms = 520;
            if (dur.endsWith('ms')) ms = parseFloat(dur);
            else if (dur.endsWith('s')) ms = parseFloat(dur) * 1000;
            setTimeout(() => { try { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) {} }, Math.max(0, Math.round(ms)));
          } catch (e) {
            setTimeout(() => { try { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) {} }, 520);
          }
        } catch (e) {}
      };

      // Cancel button
      const cancelBtn = card.querySelector('.modal-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); cleanup(); });

      // Continue anyways button -> navigate to anchor href
      const contBtn = card.querySelector('.modal-continue');
      if (contBtn) contBtn.addEventListener('click', (e) => {
        e.preventDefault();
        try {
          // Ensure any transient add-area or add-modal data is saved before navigating
          try {
            const toPersist = [];
            // Inline add-area card (transient dropdown)
            try {
              const inlineCard = document.querySelector('#add-fencer-area .add-fencer-card');
              if (inlineCard) {
                const name = (inlineCard.querySelector('.fencer-fullname')?.innerText || '').toString().trim();
                const born = (inlineCard.querySelector('.meta-year')?.innerText || '').toString().trim();
                const rank = (inlineCard.querySelector('.meta-rank')?.innerText || '').toString().trim();
                const club = (inlineCard.querySelector('.meta-club')?.innerText || '').toString().trim();
                if (name) toPersist.push({ name, born, rank, club });
              }
            } catch (e) {}
            // Add-fencer modal (if open)
            try {
              const modalAdd = document.querySelector('.add-fencer-modal');
              if (modalAdd) {
                const name = (modalAdd.querySelector('.fencer-fullname')?.innerText || '').toString().trim();
                const born = (modalAdd.querySelector('.meta-year')?.innerText || '').toString().trim();
                const rank = (modalAdd.querySelector('.meta-rank')?.innerText || '').toString().trim();
                const club = (modalAdd.querySelector('.meta-club')?.innerText || '').toString().trim();
                if (name) toPersist.push({ name, born, rank, club });
              }
            } catch (e) {}

            if (toPersist.length) {
              try {
                let raw = sessionStorage.getItem('fencingapp:fencers');
                let fencers = raw ? JSON.parse(raw) : [];
                for (const d of toPersist) {
                  const newF = { id: `f-auto-${Date.now()}-${Math.floor(Math.random()*9000)}`, name: d.name, born: d.born||'', rank: d.rank||'', club: d.club||'', raw: { name: d.name, born: d.born, rank: d.rank, club: d.club } };
                  fencers.unshift(newF);
                }
                sessionStorage.setItem('fencingapp:fencers', JSON.stringify(fencers));
              } catch (e) { console.warn('Failed to persist transient add-area/modal entries', e); }
            }

            // Always normalize and persist the current fencer list so Seeding sees latest
            try { renderFencerCards(true); } catch (e) {}
          } catch (e) {}

          cleanup();
          // small delay to let overlay fade then navigate
          try {
            const rootStyle = getComputedStyle(document.documentElement);
            let dur = (rootStyle.getPropertyValue('--card-duration') || '520ms').trim();
            let ms = 520;
            if (dur.endsWith('ms')) ms = parseFloat(dur);
            else if (dur.endsWith('s')) ms = parseFloat(dur) * 1000;
            setTimeout(() => { try { window.location.href = anchor.getAttribute('href') || '/seeding'; } catch (err) { window.location.href = '/seeding'; } }, Math.max(0, Math.round(ms)));
          } catch (err) {
            setTimeout(() => { try { window.location.href = anchor.getAttribute('href') || '/seeding'; } catch (err) { window.location.href = '/seeding'; } }, 520);
          }
        } catch (err) { console.error(err); }
      });

      // clicking overlay outside card cancels
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
    } catch (e) { console.error('showSeedingProceedModal error', e); }
  }

  // Toggle removal mode when Remove Fencer button is clicked
  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      setRemoveMode(!removeMode);
    });
  }

  // Also bind the duplicated 'Remove' button in the universal nav to the same action
  if (removeCopyBtn) {
    removeCopyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      setRemoveMode(!removeMode);
    });
  }

  // Bind the in-bar "Check-in All" control to check in every fencer
  if (checkinAllBtn) {
    checkinAllBtn.addEventListener('click', (e) => {
      e.preventDefault();
      checkInAll();
    });
  }

  // Intercept clicks on the top-nav Add Fencer button when we're on the Check-in page
  // so the nav button opens the transient add-card instead of navigating away.
  document.addEventListener('click', (e) => {
    const target = e.target.closest && e.target.closest('.add-fencer-btn');
    if (!target) return;
    // Only intercept when this page has a checkin bar (we're on the checkin view)
    if (!document.querySelector('.checkin-bar')) return;
    e.preventDefault();
    // Show modal-style add-fencer (dropdown) instead of inline add-area
    try { showAddFencerModal(target); } catch (err) { showAddFencerCard(); }
  });

  // Create and show Add Fencer modal (similar to seeding modal but editable)
  function showAddFencerModal(anchor) {
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
            <div class="meta-actions">
              <button class="frutiger-aero-button modal-cancel confirm-btn" style="--hue:0deg; --sat:0;">Cancel</button>
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
      const fields = Array.from(card.querySelectorAll('.fencer-fullname, .meta-year, .meta-rank, .meta-club'));
      const fullnameEl = card.querySelector('.fencer-fullname');
      const metaYear = card.querySelector('.meta-year');
      const metaRank = card.querySelector('.meta-rank');
      const metaClub = card.querySelector('.meta-club');
      // Set fixed widths based on placeholder/sample strings per user request
      try {
        // Year width based on 'Enter Year Born'
        setFixedWidthForElement(metaYear, 'Enter Year Born');
        // Rank width based on 'Enter Current Rank'
        setFixedWidthForElement(metaRank, 'Enter Current Rank');
        // Club width based on 'Salt City Swords Fencing Club' + one character
        setFixedWidthForElement(metaClub, 'Salt City Swords Fencing Club' + 'W');
      } catch (e) {}
      const focusFirst = () => { try { if (fullnameEl) { fullnameEl.focus(); placeCaretAtEnd(fullnameEl); } else { fields[0] && fields[0].focus(); placeCaretAtEnd(fields[0]); } } catch (e) {} };
      focusFirst();

      // Hover/touch to focus (hover-to-type) for modal fields
      const focusEditable = (el) => { if (!el) return; try { el.addEventListener('mouseenter', () => { try { el.focus(); placeCaretAtEnd(el); } catch (e) {} }); el.addEventListener('touchstart', () => { try { el.focus(); placeCaretAtEnd(el); } catch (e) {} }, { passive: true }); } catch (e) {} };
      [fullnameEl, metaYear, metaRank, metaClub].forEach(focusEditable);

      const cleanup = () => {
        try { overlay.classList.remove('modal-active'); card.classList.remove('fade-enter-active'); document.body.classList.remove('modal-open');
          const rootStyle = getComputedStyle(document.documentElement);
          let dur = (rootStyle.getPropertyValue('--card-duration') || '520ms').trim();
          let ms = 520; if (dur.endsWith('ms')) ms = parseFloat(dur); else if (dur.endsWith('s')) ms = parseFloat(dur)*1000;
          setTimeout(() => { try { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch(e) {} }, Math.max(0, Math.round(ms))); } catch(e){}
      };

      // Cancel
      const cancelBtn = card.querySelector('.modal-cancel'); if (cancelBtn) cancelBtn.addEventListener('click', (ev) => { ev.preventDefault(); cleanup(); });

      // Confirm: validate and persist
      const confirmBtn = card.querySelector('.modal-confirm');
      if (confirmBtn) confirmBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        try {
          const name = (card.querySelector('.fencer-fullname')?.innerText || '').toString().trim();
          const born = (card.querySelector('.meta-year')?.innerText || '').toString().trim();
          const rank = (card.querySelector('.meta-rank')?.innerText || '').toString().trim();
          const club = (card.querySelector('.meta-club')?.innerText || '').toString().trim();
          // basic validation
          if (!name) { const el = card.querySelector('.fencer-fullname'); el && el.classList.add('input-invalid'); el && el.focus(); el && placeCaretAtEnd(el); return; }
          // clamp year to 4 chars numeric if present
          let bornVal = born; if (bornVal && bornVal.length>4) bornVal = bornVal.slice(0,4);

          const newF = { id: `f-auto-${Date.now()}-${Math.floor(Math.random()*9000)}`, name: name, born: bornVal||'', rank: rank||'', club: club||'', raw:{ name, born: bornVal, rank, club } };
          let raw = sessionStorage.getItem('fencingapp:fencers'); let fencers = raw ? JSON.parse(raw) : [];
          fencers.unshift(newF);
          sessionStorage.setItem('fencingapp:fencers', JSON.stringify(fencers));
          renderFencerCards(true);
          cleanup();
        } catch (err) { console.error('confirm add fencer failed', err); }
      });

      // overlay click to cancel
      overlay.addEventListener('click', (ev) => { if (ev.target === overlay) cleanup(); });

    } catch (e) { console.error('showAddFencerModal error', e); }
  }

  // Show a detailed info card for a specific fencer. The card fades in from
  // the left and is positioned under the checkin bar near the right side
  // (under the Check-in All / Search area) so it aligns with the top controls.
  let _detailCardEl = null;
  function showFencerDetail(id) {
    try {
      // If an existing detail card is shown, fade it out then show the
      // requested one. This ensures clicking another fencer's info button
      // produces a smooth transition. We schedule a re-call after the
      // fade duration and return early.
      if (_detailCardEl && _detailCardEl.parentNode) {
        try { _detailCardEl.classList.remove('fade-enter-active'); } catch (e) {}
        try {
          const rootStyle = getComputedStyle(document.documentElement);
          let dur = (rootStyle.getPropertyValue('--card-duration') || '520ms').trim();
          let ms = 520; if (dur.endsWith('ms')) ms = parseFloat(dur); else if (dur.endsWith('s')) ms = parseFloat(dur) * 1000;
          const old = _detailCardEl;
          setTimeout(() => { try { if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) {} }, Math.max(0, Math.round(ms)));
        } catch (e) {}
        _detailCardEl = null;
        // Re-open the requested id after the fade completes
        try {
          const rootStyle2 = getComputedStyle(document.documentElement);
          let dur2 = (rootStyle2.getPropertyValue('--card-duration') || '520ms').trim();
          let ms2 = 520; if (dur2.endsWith('ms')) ms2 = parseFloat(dur2); else if (dur2.endsWith('s')) ms2 = parseFloat(dur2) * 1000;
          setTimeout(() => { try { showFencerDetail(id); } catch (e) {} }, Math.max(0, Math.round(ms2)));
        } catch (e) {}
        return;
      }

      let raw = sessionStorage.getItem('fencingapp:fencers');
      let fencers = raw ? JSON.parse(raw) : [];
      const f = (fencers || []).find(x => (x.id||'') === (id||''));
      if (!f) return;

      const barEl = document.querySelector('.checkin-bar');
      const br = barEl ? barEl.getBoundingClientRect() : { left: 40, right: window.innerWidth - 40, bottom: 80 };
      // Determine gap below top nav (mirror positionAddArea logic)
      let gap = 10;
      const navEl = document.querySelector('.glass-menu-bar');
      if (navEl && barEl) {
        try { gap = Math.max(0, br.top - navEl.getBoundingClientRect().bottom); } catch (err) { gap = 10; }
      }

      const el = document.createElement('div');
      el.className = 'fencer-detail-card fade-enter';
      // Compose detail lines with dot separators where appropriate
      const rawObj = f.raw || {};
      const rawLower = {};
      Object.keys(rawObj).forEach(k => { rawLower[(k||'').toLowerCase().trim()] = (rawObj[k]||'').toString().trim(); });
      const find = (cands) => { for (let k of cands) if (rawLower[k] && rawLower[k].toString().trim()) return rawLower[k].toString().trim(); return ''; };

      // Primary fields from object properties or fallbacks from raw map
      let born = (f.born || f.birthyear || '').toString().trim() || find(CSV_ALIASES.born);
      // Prefer the displayed rank from the rendered fencer card (if present)
      // to guarantee the detail view matches the card. Fall back to stored f.rank.
      let rank = '';
      try {
        const cardEl = document.querySelector(`.fencer-card[data-id="${(f.id||'')}"]`);
        const metaEl = cardEl && cardEl.querySelector && cardEl.querySelector('.fencer-meta');
        const metaText = metaEl && (metaEl.innerText || metaEl.textContent);
        if (metaText) {
          const parts = metaText.split('·').map(s => (s||'').toString().trim()).filter(Boolean);
          // parts[0] = birthYear, parts[1] = rank, parts[2] = club
          if (parts.length >= 2 && parts[1]) rank = parts[1];
        }
      } catch (e) { rank = ''; }
      if (!rank) rank = (f.rank || f.rating || f.seed || '').toString().trim();
      let club = (f.club || f.affiliation || f.team || '').toString().trim() || find(CSV_ALIASES.club);
      let division = (f.division || f.category || '').toString().trim() || find(CSV_ALIASES.division);
      let country = (f.country || f.nationality || f.nat || '').toString().trim() || find(CSV_ALIASES.country);
      let member = (f.membershipId || f.member || f.memberId || f['member #'] || f['membership'] || '').toString().trim() || find(CSV_ALIASES.member);

      // If rank/club/member still missing, scan raw values (not only headers)
      // and pick the most plausible candidate using lightweight heuristics.
      const valueCandidates = Object.keys(rawLower).map(k => ({ key: k, value: rawLower[k] }));

      const looksLikeYear = (s) => !!s && (/^\d{4}$/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s));
      const looksLikeMemberId = (s) => !!s && (/^\d{4,12}$/.test(s) || /license|licence|member|lic\b/i.test(s));
      const looksLikeClubValue = (s) => {
        if (!s || typeof s !== 'string') return false;
        if (/^[\d\s.,-]+$/.test(s)) return false; // numeric only
        if (s.includes('@')) return false; // email
        // club names often contain words, may include Club/HC/FC/etc
        if (/\bclub\b|\bfc\b|\bfencing\b|\bfencers\b|\bteam\b|\bacademy\b|\bsc\b/i.test(s)) return true;
        // fallback: multi-word values of reasonable length
        const parts = s.split(/\s+/).filter(Boolean);
        return parts.length >= 2 && s.length >= 4 && s.length <= 80;
      };
      const looksLikeRankValue = (k, s) => {
        if (!s || typeof s !== 'string') return false;
        const ss = s.trim();
        if (/^[ABCabc]$/.test(ss)) return true;
        if (/^U?\d{1,3}$/.test(ss)) return true; // U20, 35, 120
        if (/^#?\d{1,4}$/.test(ss) && /rank|seed|rating|classification|class|seed/i.test(k)) return true;
        if (/seed|rank|rating|ranking|classification|class/i.test(ss)) return true;
        // avoid pure years
        if (/^\d{4}$/.test(ss)) return false;
        return ss.length <= 6; // short token likely rank-like
      };

      if (!rank) {
        for (const c of valueCandidates) {
          if (!c.value) continue;
          if (looksLikeRankValue(c.key, c.value)) { rank = c.value; break; }
        }
      }
      if (!club) {
        for (const c of valueCandidates) {
          if (!c.value) continue;
          if (looksLikeClubValue(c.value)) { club = c.value; break; }
        }
      }
      if (!member) {
        for (const c of valueCandidates) {
          if (!c.value) continue;
          if (looksLikeMemberId(c.value) || /member|license|licence|licence number|membership|member id/i.test(c.key)) { member = c.value; break; }
        }
      }

      // Prefer 4-digit year formatting when possible
      try {
        const byRaw = (born || '').toString().trim();
        if (/^\d{4}$/.test(byRaw)) born = byRaw;
        else if (byRaw) {
          const p = Date.parse(byRaw);
          if (!Number.isNaN(p)) born = (new Date(p)).getFullYear().toString();
        }
      } catch (e) {}

      // Parse name into LASTNAME and Firstname display similar to renderFencerCards
      const rawName = (f.name || f.fullname || '').toString().trim();
      let firstName = '';
      let lastName = '';
      if (rawName.indexOf(',') !== -1) {
        const parts = rawName.split(',');
        let left = parts[0].trim();
        let right = (parts.slice(1).join(',') || '').trim();
        const COMMON_FIRST_NAMES = new Set(['abigail','ava','sophia','emma','olivia','isabella','mia','amelia','charlotte','evelyn','harper','eli','ethan','liam','noah','oliver','elijah','lucas','mason','logan','james','alexander','benjamin','jacob','michael','daniel','henry','jack','sebastian','samuel','olivia','ethan']);
        const normalizeToken = (s) => (s||'').toString().trim().toLowerCase().replace(/[^a-z]/g,'');
        const leftNorm = normalizeToken(left);
        const rightNorm = normalizeToken(right);
        if (COMMON_FIRST_NAMES.has(leftNorm) && !COMMON_FIRST_NAMES.has(rightNorm)) { firstName = left; lastName = right; }
        else if (COMMON_FIRST_NAMES.has(rightNorm) && !COMMON_FIRST_NAMES.has(leftNorm)) { firstName = right; lastName = left; }
        else { lastName = parts[0].trim(); firstName = (parts.slice(1).join(',') || '').trim(); }
      } else {
        const parts = rawName.split(/\s+/).filter(Boolean);
        if (parts.length === 1) { lastName = parts[0]; }
        else {
          const isAllUpper = (s) => !!s && s === s.toUpperCase();
          if (parts.length >= 2 && isAllUpper(parts[0]) && !isAllUpper(parts[1])) { lastName = parts[0]; firstName = parts.slice(1).join(' '); }
          else { lastName = parts[parts.length - 1]; firstName = parts.slice(0, parts.length - 1).join(' '); }
        }
      }

      const formatFirst = (s) => s.toString().split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      const lastNameDisplay = (lastName || '').toString().toUpperCase();
      const firstNameDisplay = formatFirst(firstName || '');
      const lastFirst = `${lastNameDisplay}${firstNameDisplay ? ' ' + firstNameDisplay : ''}`;

      // Detail card layout (per user spec):
      // Line 1: LASTNAME Firstname
      // Line 2: Year Born · Current Rank
      // Line 3: Attending Club · Division
      // Line 4: Country · Member #
      const meta1 = [born, rank].filter(Boolean).join(' · ');
      const meta2 = [club, division].filter(Boolean).join(' · ');
      const meta3 = [country, member].filter(Boolean).join(' · ');

      el.innerHTML = `
        <div class="detail-row detail-name"><span class="detail-last">${escapeHtml(lastNameDisplay)}</span> <span class="detail-first">${escapeHtml(firstNameDisplay)}</span></div>
        ${meta1 ? `<div class="detail-row detail-meta">${escapeHtml(meta1)}</div>` : ''}
        ${meta2 ? `<div class="detail-row detail-meta">${escapeHtml(meta2)}</div>` : ''}
        ${meta3 ? `<div class="detail-row detail-meta">${escapeHtml(meta3)}</div>` : ''}
      `;

      document.body.appendChild(el);
      _detailCardEl = el;

      // Align and size the detail card to match the fully-extended checkin bar
      // (the area that contains Check-in All and Search). Prefer the bar's
      // width so the detail card lines up visually; clamp to viewport with
      // small margins to avoid overflow.
      let barWidth = (br && br.width) ? Math.round(br.width) : Math.min(520, Math.max(320, Math.round(Math.min(window.innerWidth - 160, 520))));
      // Ensure barWidth is not absurdly wide compared to viewport
      barWidth = Math.min(barWidth, Math.max(320, Math.round(window.innerWidth - 48)));
      const desiredW = barWidth;
      let left = Math.max(12, Math.round(br.left));
      // If this would overflow the viewport on the right, shift left accordingly
      if ((left + desiredW + 24) > window.innerWidth) {
        left = Math.max(12, window.innerWidth - desiredW - 24);
      }
      el.style.left = `${left}px`;
      el.style.top = `${Math.max(8, Math.round(br.bottom + gap))}px`;
      el.style.width = `${desiredW}px`;

      requestAnimationFrame(() => { el.classList.add('fade-enter-active'); });

      // Do NOT close the detail card on outside clicks and do NOT render a
      // close button. The only way to switch/remove the card is by clicking
      // another fencer's info button which triggers this function again
      // (the top of this function handles fading out the previous card).
    } catch (e) { console.error('showFencerDetail error', e); }
  }

  // Delegate clicks on the info/clipboard icon to open the detail panel
  document.addEventListener('click', (ev) => {
    try {
      const btn = ev.target.closest && ev.target.closest('.card-action.info-btn');
      if (!btn) return;
      ev.preventDefault();
      const id = btn.getAttribute('data-id');
      if (!id) return;
      showFencerDetail(id);
    } catch (e) {}
  });

  // Delegate clicks on cards: when in removal mode, clicking a card marks it for removal
  // and animates a fade, then actually removes it from storage after the fade.
  if (cardsContainer) {
    cardsContainer.addEventListener('click', (e) => {
      if (!removeMode) return;
      const card = e.target.closest('.fencer-card');
      if (!card) return;
      const id = card.getAttribute('data-id');
      if (!id) return;

      // If already animating removal, ignore further clicks
      if (card.classList.contains('removing')) return;

      // Start fade-out animation (CSS handles opacity transition for .removing)
      card.classList.add('removing');

      const finishRemoval = () => {
        try {
          let raw = sessionStorage.getItem('fencingapp:fencers');
          let fencers = raw ? JSON.parse(raw) : [];
          const newList = fencers.filter(f => (f.id || '').toString() !== id.toString());
          sessionStorage.setItem('fencingapp:fencers', JSON.stringify(newList));
        } catch (err) {
          console.error('Failed to remove fencer', err);
        }
        // Re-render to update the UI
        renderFencerCards();
      };

      // Listen for transitionend on opacity; fallback to timeout
      let handled = false;
      const onEnd = (ev) => {
        if (ev && ev.propertyName && ev.propertyName !== 'opacity') return;
        if (handled) return; handled = true;
        card.removeEventListener('transitionend', onEnd);
        finishRemoval();
      };
      card.addEventListener('transitionend', onEnd);
      // fallback in 420ms
      setTimeout(() => onEnd(), 420);
    });
    // Toggle check-in when clicking the remove/check button (only when not in removal mode)
    cardsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('.card-action.remove-btn');
      if (!btn) return;
      if (removeMode) return; // removal-mode handled above
      e.preventDefault();
      const id = btn.getAttribute('data-id');
      if (!id) return;
      try {
        let raw = sessionStorage.getItem('fencingapp:fencers');
        let fencers = raw ? JSON.parse(raw) : [];
        const idx = fencers.findIndex(f => (f.id||'').toString() === id.toString());
        if (idx === -1) return;
        fencers[idx] = Object.assign({}, fencers[idx], { checked: !fencers[idx].checked });
        sessionStorage.setItem('fencingapp:fencers', JSON.stringify(fencers));

        // Update DOM state for this card/button
        const card = cardsContainer.querySelector(`.fencer-card[data-id="${id}"]`);
        if (card) {
          const btnEl = card.querySelector('.card-action.remove-btn');
          if (fencers[idx].checked) {
              card.classList.add('checked');
              if (btnEl) { btnEl.classList.add('checked'); btnEl.textContent = '✔'; btnEl.setAttribute('aria-pressed','true'); btnEl.setAttribute('aria-label','Checked in'); }
            } else {
              card.classList.remove('checked');
              if (btnEl) { btnEl.classList.remove('checked'); btnEl.textContent = 'X'; btnEl.setAttribute('aria-pressed','false'); btnEl.setAttribute('aria-label','Check in fencer'); }
            }
        }
        // Update seeding button enable/disable state
        try { updateSeedingButtonState(); } catch (e) {}
      } catch (err) { console.error('Failed to toggle checked state', err); }
    });
  }

  const searchEl = document.querySelector('.checkin-bar .frutiger-aero-button:last-child[contenteditable]');
  if (!searchEl) return;

  // On hover (mouseenter) or touchstart focus the element so the user can start typing
  let leaveTimer = null;
  const LEAVE_DELAY = 150; // ms - short debounce so small pointer slips don't blur immediately

  searchEl.addEventListener('mouseenter', () => {
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
    searchEl.focus();
    placeCaretAtEnd(searchEl);
  });

  // When pointer leaves, blur after a short delay so user can move around without accidental close
  searchEl.addEventListener('mouseleave', () => {
    if (leaveTimer) clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      // only blur if element still has focus (user didn't click into it)
      if (document.activeElement === searchEl) {
        searchEl.blur();
      }
      leaveTimer = null;
    }, LEAVE_DELAY);
  });

  // For touch devices
  searchEl.addEventListener('touchstart', () => {
    searchEl.focus();
    placeCaretAtEnd(searchEl);
  }, { passive: true });

  // Also collapse when leaving the whole checkin bar (in case user moves away quickly)
  const bar = document.querySelector('.checkin-bar');
  if (bar) {
    bar.addEventListener('mouseleave', () => {
      if (leaveTimer) clearTimeout(leaveTimer);
      // small delay to match behavior above
      leaveTimer = setTimeout(() => {
        if (document.activeElement === searchEl) searchEl.blur();
        leaveTimer = null;
      }, LEAVE_DELAY);
    });

    // Cancel collapse if pointer re-enters the bar
    bar.addEventListener('mouseenter', () => {
      if (leaveTimer) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
      }
    });
  }

  // Keep Enter from inserting a newline; treat it as submit (custom event)
  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // dispatch a custom event with the entered text
      const ev = new CustomEvent('search-enter', { detail: { value: searchEl.innerText } });
      searchEl.dispatchEvent(ev);
      // optionally blur to hide the virtual keyboard on mobile
      searchEl.blur();
    }
  });

  // When a search is submitted (Enter), find the first matching fencer by
  // name (first or last or substring) and promote that card to the top.
  searchEl.addEventListener('search-enter', (ev) => {
    const q = (ev.detail && ev.detail.value || '').toString().trim();
    if (!q) return;

    // Respect reduced motion preference
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Capture first (pre-change) bounding rects keyed by data-id
    const firstRects = new Map();
    Array.from(cardsContainer.children).forEach(el => {
      if (el.classList && el.classList.contains('fencer-card')) {
        const id = el.getAttribute('data-id');
        if (id) firstRects.set(id, el.getBoundingClientRect());
      }
    });

    let raw = sessionStorage.getItem('fencingapp:fencers');
    let fencers = [];
    try { fencers = raw ? JSON.parse(raw) : []; } catch (e) { fencers = []; }
    const ql = q.toLowerCase();
    // find first index where any part of the name contains the query
    let idx = fencers.findIndex(f => (f.name||'').toLowerCase().includes(ql));
    if (idx === -1) {
      // fallback: split query into tokens and require every token to appear
      const tokens = ql.split(/\s+/).filter(Boolean);
      idx = fencers.findIndex(f => {
        const nl = (f.name||'').toLowerCase();
        return tokens.every(t => nl.includes(t));
      });
    }
    if (idx === -1) return; // no match

    // ID of the item to promote (used after re-render)
    const promoteId = fencers[idx] && fencers[idx].id;

    // Perform the reorder (promote selected to front)
    const item = fencers.splice(idx, 1)[0];
    fencers.unshift(item);
    sessionStorage.setItem('fencingapp:fencers', JSON.stringify(fencers));

    // Re-render the list (this will change DOM order). Pass `true` to preserve
    // the caller's promoted order and avoid the default alphabetical sort.
    renderFencerCards(true);

    // If reduced motion is preferred, skip FLIP and only highlight + scroll
    if (reduceMotion) {
      requestAnimationFrame(() => {
        const promoted = cardsContainer.querySelector(`.fencer-card[data-id="${promoteId}"]`);
        if (promoted) {
          // Smooth-scroll the cards container so the promoted card sits at the
          // top of the visible stack. Use `cardsContainer.scrollTo` instead
          // of `scrollIntoView` so fixed headers (checkin bar) don't cover it.
          try {
            if (cardsContainer && cardsContainer.scrollHeight > cardsContainer.clientHeight) {
              cardsContainer.scrollTo({ top: Math.max(0, promoted.offsetTop - 8), behavior: 'smooth' });
            } else {
              promoted.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          } catch (e) { promoted.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
          promoted.classList.add('promote');
          setTimeout(() => promoted.classList.remove('promote'), 1400);
        }
      });
      return;
    }

    // Capture last (post-change) rects keyed by data-id
    const lastRects = new Map();
    Array.from(cardsContainer.children).forEach(el => {
      if (el.classList && el.classList.contains('fencer-card')) {
        const id = el.getAttribute('data-id');
        if (id) lastRects.set(id, el.getBoundingClientRect());
      }
    });

    // Apply FLIP: for each element, invert the delta and animate to 0
    Array.from(cardsContainer.children).forEach(el => {
      if (!el.classList || !el.classList.contains('fencer-card')) return;
      const id = el.getAttribute('data-id');
      const first = firstRects.get(id);
      const last = lastRects.get(id);
      if (!first || !last) return;
      const dx = first.left - last.left;
      let dy = first.top - last.top;
      // If this element is the promoted item, exaggerate the vertical delta so
      // it visually slides/"drags" into the top position.
      const isPromoted = (id === promoteId);
      if (isPromoted) dy += 28; // extra upward travel during animation
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return; // negligible

      // apply inverse transform to start at old position
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.style.transition = 'transform 0s';
    });

    // force reflow
    // eslint-disable-next-line no-unused-expressions
    cardsContainer.getBoundingClientRect();

  // animate to natural position
  // Slightly longer duration and softer easing for a smoother, fresher feel
  const FLIP_DURATION = 1100; // ms (slower movement)
  const easing = 'cubic-bezier(.16,1,.3,1)';
    Array.from(cardsContainer.children).forEach(el => {
      if (!el.classList || !el.classList.contains('fencer-card')) return;
      // skip if no inline transform applied
      if (!el.style.transform) return;
      el.style.transition = `transform ${FLIP_DURATION}ms ${easing}`;
      // If this is the promoted element, also add a temporary class for scale+glow
      const id = el.getAttribute('data-id');
      const isPromoted = (id === promoteId);
      if (isPromoted) {
        el.classList.add('promote-drag');
      }
      // animate to natural position
      requestAnimationFrame(() => { el.style.transform = 'none'; });
      // cleanup after animation
      const cleanup = () => {
        el.style.transition = '';
        el.style.transform = '';
        if (el.classList && el.classList.contains('promote-drag')) el.classList.remove('promote-drag');
        el.removeEventListener('transitionend', cleanup);
      };
      el.addEventListener('transitionend', cleanup);
    });

    // Finally, scroll and highlight the promoted card when animation finishes
    requestAnimationFrame(() => {
      const promoted = cardsContainer.querySelector(`.fencer-card[data-id="${promoteId}"]`);
      if (promoted) {
        // scroll after animation so it's visible at top. Use the cards
        // container scrollTop to avoid the fixed checkin bar overlapping.
        setTimeout(() => {
          try {
            if (cardsContainer && cardsContainer.scrollHeight > cardsContainer.clientHeight) {
              cardsContainer.scrollTo({ top: Math.max(0, promoted.offsetTop - 8), behavior: 'smooth' });
            } else {
              promoted.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          } catch (e) { promoted.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        }, 20);
        promoted.classList.add('promote');
        setTimeout(() => promoted.classList.remove('promote'), 1400);
      }
    });
  });

  // When the control loses focus, clear any typed text so the placeholder "Search"
  // is shown again. Use textContent to avoid leaving empty <br> nodes that break :empty.
  searchEl.addEventListener('blur', () => {
    // small timeout to allow any related click handlers (promote, etc.) to run first
    setTimeout(() => {
      // Clear visible content and ensure placeholder styling applies
      searchEl.textContent = '';
      // Also remove any lingering HTML children just in case
      while (searchEl.firstChild) searchEl.removeChild(searchEl.firstChild);
    }, 50);
  });

  function placeCaretAtEnd(el) {
    // If element is empty, selection APIs need at least a text node; collapse will work
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Optional: you can listen for the custom 'search-enter' on this element from other scripts
});
