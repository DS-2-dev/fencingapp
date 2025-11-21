document.addEventListener('DOMContentLoaded', () => {
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
  const removeBtn = document.querySelector('.checkin-bar .frutiger-aero-button:first-child');
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
      addArea.style.width = `${Math.max(220, Math.round(br.width))}px`;
      addArea.style.maxWidth = `${Math.min(Math.round(br.width), 620)}px`;
      addArea.style.zIndex = '995';
    } catch (e) {
      // ignore positioning errors
    }
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
        addArea.style.width = 'auto';
        addArea.style.maxWidth = `${Math.min(br.width || 9999, 620)}px`;
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
    card.innerHTML = `
      <div class="add-fencer-inner">
        <div class="fencer-row">
          <div class="fencer-left">
            <div class="fencer-name">
              <span class="fencer-fullname" contenteditable="true" role="textbox" aria-label="Fencer full name" data-placeholder="Enter Full Name"></span>
            </div>
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
      </div>
    `;

    // The add-fencer card is persistent by design and contains two editable
    // fields: the full name (Lastname, Firstname) and a single-line meta field
    // for "Year Rank Club". Focus the fullname field on show.

    addArea.appendChild(card);
    addArea.setAttribute('aria-hidden', 'false');
    // Focus the fullname editable specifically and wire hover/touch to focus
    const fullname = card.querySelector('.fencer-fullname');
    const metaYear = card.querySelector('.meta-year');
    const metaRank = card.querySelector('.meta-rank');
    const metaClub = card.querySelector('.meta-club');
    const focusEditable = (el) => { if (!el) return; try { el.focus(); placeCaretAtEnd(el); } catch (e) {} };
    if (fullname) {
      focusEditable(fullname);
      fullname.addEventListener('mouseenter', () => focusEditable(fullname));
      fullname.addEventListener('touchstart', () => focusEditable(fullname), { passive: true });
    }
    // (Check-in All removed) - no-op
    // Wire hover/touch focus for each meta part so the user can start typing by hovering
    [metaYear, metaRank, metaClub].forEach((el) => {
      if (!el) return;
      el.addEventListener('mouseenter', () => focusEditable(el));
      el.addEventListener('touchstart', () => focusEditable(el), { passive: true });
    });
    // Ensure placeholders return on blur when the user didn't enter any text.
    const clearIfEmpty = (el) => {
      if (!el) return;
      setTimeout(() => {
        try {
          const txt = (el.innerText || '').toString().trim();
          if (!txt) {
            // remove any stray nodes (e.g. <br>) so :empty selector works
            el.textContent = '';
          }
        } catch (e) {}
      }, 50);
    };
    [fullname, metaYear, metaRank, metaClub].forEach((el) => {
      if (!el) return;
      el.addEventListener('blur', () => clearIfEmpty(el));
    });

    // Wire Confirm button to persist the entered data into sessionStorage
    const confirmBtn = card.querySelector('.confirm-btn');
    if (confirmBtn) {
      // Helper to sanitize an editable that's visually empty but contains
      // stray nodes (like <br>) so the :empty placeholder can appear.
      const sanitizeEmpty = (el) => {
        if (!el) return;
        try {
          // Remove a range of invisible / zero-width characters so that an
          // element which only contains those characters is treated as empty.
          const INVISIBLE_CHARS = /[\u200B-\u200F\uFEFF\u00A0]/g;
          const raw = (el.innerText || '').toString();
          const cleaned = raw.replace(INVISIBLE_CHARS, '').trim();
          if (!cleaned) {
            // remove any child nodes so :empty works and placeholder shows
            el.textContent = '';
          }
        } catch (e) {}
      };

      // Helper to mark an element invalid (turn red). Sanitize first so the
      // placeholder will be visible when element is empty.
      const markInvalid = (el) => { if (!el) return; sanitizeEmpty(el); el.classList.add('input-invalid'); };
      const clearInvalid = (el) => { if (!el) return; el.classList.remove('input-invalid'); };

      // Remove invalid state as user types or focuses
      [fullname, metaYear, metaRank, metaClub].forEach((el) => {
        if (!el) return;
        el.addEventListener('input', () => clearInvalid(el));
        el.addEventListener('focus', () => clearInvalid(el));
      });

      // Helper to get a cleaned text value from a contenteditable
      const cleanedValue = (el) => {
        if (!el) return '';
        try {
          // Remove a range of invisible / zero-width characters and NBSP,
          // then normalize whitespace. This ensures values that look empty
          // (but contain invisible chars) are treated as empty.
          const INVISIBLE_CHARS = /[\u200B-\u200F\uFEFF\u00A0]/g;
          return (el.innerText || '').toString().replace(INVISIBLE_CHARS, ' ').replace(/\s+/g, ' ').trim();
        } catch (e) { return '' }
      };

      confirmBtn.addEventListener('click', (e) => {
        e.preventDefault();
        try {
          const nameVal = cleanedValue(fullname);
          const yearVal = cleanedValue(metaYear);
          const rankVal = cleanedValue(metaRank);
          const clubVal = cleanedValue(metaClub);

          // Validate required fields: fullname, year, rank, club
          const fields = [ {el: fullname, val: nameVal}, {el: metaYear, val: yearVal}, {el: metaRank, val: rankVal}, {el: metaClub, val: clubVal} ];
          let firstInvalid = null;
          fields.forEach(({el, val}) => {
            if (!el) return;
            if (!val) {
              markInvalid(el);
              if (!firstInvalid) firstInvalid = el;
            } else {
              clearInvalid(el);
            }
          });
          if (firstInvalid) {
            // focus the first missing field to prompt user
            firstInvalid.focus();
            placeCaretAtEnd(firstInvalid);
            return; // don't submit until all fields are filled
          }

          // Build fencer object; keep raw mapping for future normalization
          const newF = { id: `f-auto-${Date.now()}-${Math.floor(Math.random()*9000)}`, name: nameVal, born: yearVal || '', rank: rankVal || '', club: clubVal || '', raw: { name: nameVal, born: yearVal, rank: rankVal, club: clubVal } };
          let raw = sessionStorage.getItem('fencingapp:fencers');
          let fencers = raw ? JSON.parse(raw) : [];
          fencers.unshift(newF);
          sessionStorage.setItem('fencingapp:fencers', JSON.stringify(fencers));
          // Re-render keeping the new item on top
          renderFencerCards(true);

          // For now: disable the add-card shrink animation. Clear inputs
          // immediately and clean up any temporary styling. We'll revisit
          // animation later when we can test across target runtimes.
          try {
            [fullname, metaYear, metaRank, metaClub].forEach((el) => { if (el) el.textContent = ''; });
            try {
              const cardEl = card;
              if (cardEl) {
                cardEl.style.width = '';
                cardEl.style.overflow = '';
                const inner = cardEl.querySelector('.add-fencer-inner');
                if (inner) inner.style.transform = '';
              }
            } catch (e) {}
            if (fullname) { fullname.focus(); placeCaretAtEnd(fullname); }
          } catch (e) {
            [fullname, metaYear, metaRank, metaClub].forEach((el) => { if (el) el.textContent = ''; });
            if (fullname) { fullname.focus(); placeCaretAtEnd(fullname); }
          }
        } catch (err) {
          console.error('Failed to confirm new fencer', err);
        }
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
        club: find(['club','club name','affiliation','team','organization','org','club/organization','club_name','association','home club','affiliation name']),
        rank: find(['rank','rating','usa rating','seed','ranking','classification','class','rating (usa)','usa_rating']),
        born: find(['born','birthyear','year','born year','birth year','year of birth','yob','birth_date','dob'])
      };
    };

    let mutatedForNorm = false;
    fencers = (fencers || []).map((f) => {
      const rawObj = f.raw || {};
      const norm = normalizeAliases(rawObj);
      if ((!f.club || f.club.toString().trim()==='') && norm.club) { f.club = norm.club; mutatedForNorm = true; }
      if ((!f.rank || f.rank.toString().trim()==='') && norm.rank) { f.rank = norm.rank; mutatedForNorm = true; }
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

        const metaText = [birthYear, rankVal, displayClub].filter(Boolean).join(' · ');
        try { console.debug('fencer meta', { id: f.id, name: f.name, metaText, born: f.born, rank: f.rank, club: f.club, raw: f.raw }); } catch (e) {}

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
              <div class="fencer-meta">${escapeHtml(metaText)}</div>
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
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"'`]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',"`":'&#96;'})[c]);
  }

  renderFencerCards();

  // Keep Seeding nav state accurate initially
  try { updateSeedingButtonState(); } catch (e) {}
  // (Check-in All removed) - no-op

  function setRemoveMode(on) {
    removeMode = !!on;
    if (removeMode) {
      // visually indicate mode
      cardsContainer.classList.add('removal-mode');
      if (removeBtn) removeBtn.classList.add('remove-active');
      // also add a global body class so the visual state survives focus changes
      document.body.classList.add('removal-mode-active');
      // update aria
      if (removeBtn) removeBtn.setAttribute('aria-pressed', 'true');
    } else {
      cardsContainer.classList.remove('removal-mode');
      if (removeBtn) removeBtn.classList.remove('remove-active');
      document.body.classList.remove('removal-mode-active');
      if (removeBtn) removeBtn.setAttribute('aria-pressed', 'false');
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

  // Block navigation when Seeding is disabled
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('.seeding-btn');
    if (!a) return;
    if (a.getAttribute('aria-disabled') === 'true') {
      ev.preventDefault();
      try { alert('All fencers must be checked in before seeding.'); } catch (e) {}
    }
  });

  // Toggle removal mode when Remove Fencer button is clicked
  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      setRemoveMode(!removeMode);
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
    showAddFencerCard();
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
