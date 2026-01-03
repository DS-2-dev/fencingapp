document.addEventListener('DOMContentLoaded', () => {
  const fredBtn = document.getElementById('import-fred');
  const usaBtn = document.getElementById('import-usa');
  const fredInput = document.getElementById('import-fred-input');
  const usaInput = document.getElementById('import-usa-input');

  function handleFileSelection(fileInput, sourceName) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      // Read the file as text and parse CSV client-side, then store results in sessionStorage (ephemeral)
      const reader = new FileReader();
      reader.onload = function(evt) {
        const text = evt.target.result;
        try {
          const rows = parseCSV(text);
          // Debug: expose parsed headers so we can adapt heuristics to real CSVs
          try {
            const headers = rows && rows[0] ? rows[0].map(h => (h||'').toString().trim()) : [];
            console.debug('import.js parsed headers:', headers);
          } catch (e) {}
          const fencers = mapRowsToFencers(rows);
          try { console.debug('import.js mapped sample fencer:', fencers && fencers[0]); } catch (e) {}
          // Save to sessionStorage so imports are ephemeral per browser session
          sessionStorage.setItem('fencingapp:fencers', JSON.stringify(fencers));
          // Ensure any previously-stored persistent copy is removed so imports remain session-only
          try { localStorage.removeItem('fencingapp:fencers'); } catch (e) {}
          console.log(`${sourceName} parsed ${fencers.length} fencers`);
          // Navigate to checkin so user can see the cards
          location.href = '/checkin';
        } catch (err) {
          console.error('Failed to parse CSV', err);
          alert('Failed to parse CSV file. Check the console for details.');
        }
      };
      reader.readAsText(file);
      // Reset the input so selecting the same file again will fire change
      e.target.value = '';
    });
  }

  // Parse ASK Fred XML format (.frd files)
  function parseXML_AskFred(xmlText) {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      
      // Check for parsing errors
      if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
        throw new Error('XML parse error');
      }

      // Build ClubID -> Club Name map from ClubDatabase
      const clubMap = {};
      const clubDivisionIdMap = {};
      const clubElements = xmlDoc.getElementsByTagName('Club');
      for (let i = 0; i < clubElements.length; i++) {
        const clubEl = clubElements[i];
        const clubId = clubEl.getAttribute('ClubID');
        const clubName = clubEl.getAttribute('Name');
        const clubDivisionId = clubEl.getAttribute('DivisionID') || '';
        if (clubId && clubName) {
          clubMap[clubId] = clubName;
        }
        if (clubId && clubDivisionId) {
          clubDivisionIdMap[clubId] = clubDivisionId;
        }
      }

      // Build DivisionID -> Division Name map if Division elements exist
      const divisionMap = {};
      const divisionElements = xmlDoc.getElementsByTagName('Division');
      for (let i = 0; i < divisionElements.length; i++) {
        const dEl = divisionElements[i];
        const dId = dEl.getAttribute('DivisionID') || dEl.getAttribute('ID');
        const dName = dEl.getAttribute('Name') || dEl.textContent.trim();
        if (dId && dName) divisionMap[dId] = dName;
      }
      // If no explicit Division elements, provide friendly names for known IDs
      if (Object.keys(divisionMap).length === 0) {
        const friendlyDivisionNames = {
          '12': 'Utah S.Idaho',
          '69': 'Mountain West',
        };
        // Seed map from any division IDs referenced by clubs
        Object.values(clubDivisionIdMap).forEach(id => {
          if (id && !divisionMap[id]) divisionMap[id] = friendlyDivisionNames[id] || id;
        });
      }

      // Extract all Fencer elements
      const fencerElements = xmlDoc.getElementsByTagName('Fencer');
      let fencers = [];

      for (let i = 0; i < fencerElements.length; i++) {
        const el = fencerElements[i];
        const firstName = el.getAttribute('FirstName') || '';
        const lastName = el.getAttribute('LastName') || '';
        const birthYear = el.getAttribute('BirthYear') || '';
        const fencerId = el.getAttribute('FencerID') || '';
        const clubId1 = el.getAttribute('ClubID1') || '';
        const divisionId = el.getAttribute('DivisionID') || '';
        
        // Extract all weapon-specific ratings and store them
        const ratings = {};
        const ratingElements = el.getElementsByTagName('Rating');
        for (let j = 0; j < ratingElements.length; j++) {
          const ratingEl = ratingElements[j];
          const weapon = ratingEl.getAttribute('Weapon') || '';
          const ratingVal = ratingEl.textContent.trim();
          if (weapon) {
            ratings[weapon] = ratingVal;
          }
        }
        
        // For backward compatibility, also extract best rating across weapons
        let rating = '';
        for (const weapon in ratings) {
          const ratingVal = ratings[weapon];
          if (ratingVal && ratingVal !== 'U') {
            rating = ratingVal;
            break;
          } else if (!rating) {
            rating = ratingVal;
          }
        }

        // Look up club name from ClubID1
        const clubName = clubMap[clubId1] || '';

        // Extract membership ID
        let membershipId = '';
        const membershipEl = el.getElementsByTagName('Membership')[0];
        if (membershipEl) {
          membershipId = membershipEl.textContent.trim();
        }

        const fullName = `${lastName}, ${firstName}`.trim();
        // Prefer division from the club's DivisionID when available
        const clubDivisionId = clubDivisionIdMap[clubId1] || '';
        const divisionName = divisionMap[clubDivisionId] || divisionMap[divisionId] || divisionId || '';
        
        fencers.push({
          id: `f-${fencerId}`,
          name: fullName,
          born: birthYear,
          rank: rating || '',
          ratings: ratings,
          club: clubName,
          division: divisionName,
          category: '',
          membershipId: membershipId,
          raw: {
            FirstName: firstName,
            LastName: lastName,
            BirthYear: birthYear,
            FencerID: fencerId,
            Rating: rating,
            Ratings: ratings,
            ClubID: clubId1,
            ClubName: clubName,
            MembershipID: membershipId
          }
        });
      }

      // Filter out empty names and sort by last name
      fencers = fencers.filter(f => f.name && f.name.trim().length > 0);
      
      function lastNameKey(fullName) {
        if (!fullName) return '';
        const s = fullName.trim();
        if (s.indexOf(',') !== -1) return s.split(',')[0].trim().toLowerCase();
        const parts = s.split(/\s+/);
        return parts.length ? parts[parts.length - 1].toLowerCase() : s.toLowerCase();
      }

      fencers.sort((a, b) => {
        const la = lastNameKey(a.name || '');
        const lb = lastNameKey(b.name || '');
        if (la < lb) return -1;
        if (la > lb) return 1;
        return 0;
      });

      // Extract event weapon from first Event element for tournament-wide weapon filtering
      try {
        const eventElement = xmlDoc.getElementsByTagName('Event')[0];
        if (eventElement) {
          const eventWeapon = eventElement.getAttribute('Weapon') || '';
          if (eventWeapon) {
            sessionStorage.setItem('fencingapp:event-weapon', eventWeapon);
          }
        }
      } catch (e) {
        console.error('Failed to parse event weapon:', e);
      }

      // Extract tournament and first-event metadata and save to sessionStorage
      try {
        const tournEl = xmlDoc.getElementsByTagName('Tournament')[0];
        const eventEl = xmlDoc.getElementsByTagName('Event')[0];
        const tournament = {};
        const event = {};
        if (tournEl) {
          const fee_amount = tournEl.getAttribute('Fee') || '0.00';
          const fee_currency = tournEl.getAttribute('FeeCurrency') || 'USD';
          const currency_symbols = {
            'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥', 'CAD': 'C$', 'AUD': 'A$'
          };
          const symbol = currency_symbols[fee_currency] || (fee_currency + ' ');
          const formatted_fee = `${symbol}${fee_amount}`;
          tournament.name = tournEl.getAttribute('Name') || '';
          tournament.location = tournEl.getAttribute('Location') || '';
          tournament.date = tournEl.getAttribute('StartDate') || '';
          tournament.fee = formatted_fee;
          tournament.id = tournEl.getAttribute('TournamentID') || '';
        }
        if (eventEl) {
          const event_time_raw = eventEl.getAttribute('EventDateTime') || '';
          let event_time = event_time_raw;
          if (event_time_raw && event_time_raw.indexOf(' ') !== -1) {
            event_time = event_time_raw.split(' ', 2)[1];
          }
          const weapon = eventEl.getAttribute('Weapon') || '';
          const gender = eventEl.getAttribute('Gender') || '';
          const gender_mixed = (gender === 'Mixed') ? 'Yes' : 'No';
          const age_min = eventEl.getAttribute('AgeLimitMin') || '';
          const age_max = eventEl.getAttribute('AgeLimitMax') || '';
          const enforce_age = eventEl.getAttribute('EnforceAge') || 'False';
          let age_limit = '';
          if (enforce_age === 'False' || !age_min) age_limit = 'None';
          else if (age_min === age_max) age_limit = age_min;
          else age_limit = `${age_min} - ${age_max}`;
          let rating_limit = eventEl.getAttribute('RatingLimit') || 'Open';
          const enforce_rating = eventEl.getAttribute('EnforceRating') || 'False';
          if (enforce_rating === 'False' || rating_limit === 'Open') rating_limit = 'None';
          const event_id = eventEl.getAttribute('EventID') || '';
          event.time = event_time;
          event.weapon = weapon;
          event.gender_mixed = gender_mixed;
          event.age_limit = age_limit;
          event.rating_limit = rating_limit;
          event.id = event_id;
        }
        // Save summary data for the summary page to pick up
        const summaryData = { tournament: tournament, event: event };
        sessionStorage.setItem('fencingapp:summary-data', JSON.stringify(summaryData));
      } catch (e) {
        console.error('Failed to extract tournament/event metadata:', e);
      }

      // Return in CSV row format for compatibility with existing flow
      // (headers + data rows) - include membershipId and division columns
      const headers = ['name', 'born', 'rank', 'club', 'division', 'membershipId'];
      const rows = [headers];
      fencers.forEach(f => {
        rows.push([f.name, f.born, f.rank, f.club, f.division || '', f.membershipId]);
      });
      return rows;
    } catch (err) {
      console.error('parseXML_AskFred failed:', err);
      throw new Error('Failed to parse ASK Fred XML file');
    }
  }

  // Basic CSV parser that handles quoted fields and newlines.
  function parseCSV(text) {
    // Try to detect if this is actually an XML file (ASK Fred .frd format)
    const trimmed = text.trim();
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<FencingData')) {
      return parseXML_AskFred(text);
    }

    const rows = [];
    let cur = '';
    let row = [];
    let i = 0;
    let inQuotes = false;
    while (i < text.length) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i+1] === '"') { cur += '"'; i += 1; } else { inQuotes = false; }
        } else { cur += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { row.push(cur); cur = ''; }
        else if (ch === '\r') { /* skip */ }
        else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else { cur += ch; }
      }
      i += 1;
    }
    // push last
    if (cur !== '' || inQuotes || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  // Map CSV rows to fencer objects using header heuristics
  function mapRowsToFencers(rows) {
    if (!rows || rows.length === 0) return [];
    const headers = rows[0].map(h => (h||'').toString().trim());
    const data = rows.slice(1);
    const fencers = data.map((cols, i) => {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = (cols[idx]||'').toString().trim(); });
      // Normalize into known fields
      const lowerKeys = Object.keys(obj).reduce((acc,k)=>{ acc[k.toLowerCase().trim()]=obj[k]; return acc; }, {});
      // heuristics (search common header aliases)
      const headerGet = (keys) => {
        for (let k of keys) {
          if (Object.prototype.hasOwnProperty.call(lowerKeys, k) && lowerKeys[k]) return lowerKeys[k];
        }
        return '';
      };

      const name = headerGet(['name','full name','fencer','fencer name','last name, first name','last, first','lastname','first name']) || '';
      const born = headerGet(['born','birthyear','year','born year','birth year','year of birth','yob','birth_date','dob']) || '';
      const club = headerGet(['club','club name','affiliation','team','organization','org','club/organization','club_name','association','home club','affiliation name']) || '';
      const division = headerGet(['division','weapon','event']) || '';
      const rank = headerGet(['rank','rating','usa rating','seed','ranking','classification','class','rating (usa)','usa_rating']) || '';
      // class/category headers (many exports call this 'class' or 'category' or 'classification')
      const category = headerGet(['class','category','classification','fencer class']) || '';
      // membership ID field
      const membershipId = headerGet(['membershipid','membership id','membership','member id','usfa id','member number']) || '';
      // best effort: if name empty, try first+last
      let finalName = '';
      if (name) finalName = name;
      else if (lowerKeys['first name'] || lowerKeys['last name']) finalName = ((lowerKeys['first name']||'') + ' ' + (lowerKeys['last name']||'')).trim();
      else finalName = Object.values(obj).join(' ').trim();

      return {
        // stable-ish id so we can FLIP animate between renders. Use timestamp + index
        id: `f-${Date.now()}-${i}-${Math.floor(Math.random()*9000)}`,
        name: finalName,
        born: (born||'').trim(),
        club: (club||'').trim(),
        division: (division||'').trim(),
        rank: (rank||'').trim(),
        category: (category||'').trim(),
        membershipId: (membershipId||'').trim(),
        raw: obj
      };
    }).filter(f => f.name && f.name.length>0);

    // Helper to extract a reasonable last name for sorting
    function lastNameKey(fullName) {
      if (!fullName) return '';
      const s = fullName.trim();
      // If name is "Last, First" use the portion before the comma
      if (s.indexOf(',') !== -1) return s.split(',')[0].trim().toLowerCase();
      // Otherwise take the last token as last name
      const parts = s.split(/\s+/);
      return parts.length ? parts[parts.length - 1].toLowerCase() : s.toLowerCase();
    }

    // Sort fencers alphabetically by last name for a consistent initial order
    fencers.sort((a, b) => {
      const la = lastNameKey(a.name || '');
      const lb = lastNameKey(b.name || '');
      if (la < lb) return -1;
      if (la > lb) return 1;
      return 0;
    });

    return fencers;
  }

  if (fredBtn && fredInput) {
    fredBtn.addEventListener('click', (e) => {
      e.preventDefault();
      fredInput.click();
    });
    handleFileSelection(fredInput, 'Ask FRED');
  }

  // Update Home page button states based on whether a tournament (imported fencers)
  // exists in sessionStorage. If fencers are present, enable "Continue Tournament"
  // and disable "New Tournament"; otherwise do the opposite.
  function updateHomeButtons() {
    try {
      const newBtn = document.querySelector('.new-tournament-btn');
      const contBtn = document.querySelector('.continue-btn');
      const raw = sessionStorage.getItem('fencingapp:fencers');
      let hasFencers = false;
      try { const arr = raw ? JSON.parse(raw) : []; hasFencers = Array.isArray(arr) && arr.length > 0; } catch (e) { hasFencers = false; }

      if (hasFencers) {
        // Tournament in play: Continue enabled, New disabled
        if (contBtn) { contBtn.classList.remove('disabled'); contBtn.setAttribute('aria-disabled', 'false'); }
        if (newBtn) { newBtn.classList.add('disabled'); newBtn.setAttribute('aria-disabled', 'true'); }
      } else {
        // No tournament: Continue disabled, New enabled
        if (contBtn) { contBtn.classList.add('disabled'); contBtn.setAttribute('aria-disabled', 'true'); }
        if (newBtn) { newBtn.classList.remove('disabled'); newBtn.setAttribute('aria-disabled', 'false'); }
      }
    } catch (e) { /* ignore UI update errors */ }
  }

  // Call once on load so the home page reflects session state immediately.
  try { updateHomeButtons(); } catch (e) {}

  if (usaBtn && usaInput) {
    usaBtn.addEventListener('click', (e) => {
      e.preventDefault();
      usaInput.click();
    });
    handleFileSelection(usaInput, 'USA Fencing');
  }
});
