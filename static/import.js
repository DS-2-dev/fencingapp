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

  // Basic CSV parser that handles quoted fields and newlines.
  function parseCSV(text) {
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

  if (usaBtn && usaInput) {
    usaBtn.addEventListener('click', (e) => {
      e.preventDefault();
      usaInput.click();
    });
    handleFileSelection(usaInput, 'USA Fencing');
  }
});
