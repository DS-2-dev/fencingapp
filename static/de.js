document.addEventListener('DOMContentLoaded', function() {
	// Gray out Add Fencer button if present
	const addFencerBtn = document.querySelector('.add-fencer-btn');
	if (addFencerBtn) {
		addFencerBtn.classList.add('disabled');
		addFencerBtn.setAttribute('aria-disabled', 'true');
		addFencerBtn.setAttribute('tabindex', '-1');
		addFencerBtn.style.pointerEvents = 'none';
	}

	// Get fencers from sessionStorage (from check-in)
	let fencers = [];
	try {
		const raw = sessionStorage.getItem('fencingapp:fencers');
		if (raw) fencers = JSON.parse(raw) || [];
	} catch (e) { fencers = []; }

	// Prepare full names for the bracket and a helper to format them for cards
	function formatNameForCard(fullName) {
		if (!fullName) return { first: '', last: '' };
		const raw = fullName.toString().trim();
		let first = '';
		let last = '';
		if (raw.indexOf(',') !== -1) {
			// Prefer treating as "Last, First"
			const parts = raw.split(',');
			last = (parts[0] || '').trim();
			first = (parts.slice(1).join(',') || '').trim();
		} else {
			const parts = raw.split(/\s+/).filter(Boolean);
			if (parts.length === 1) {
				first = parts[0];
				last = '';
			} else {
				last = parts[parts.length - 1];
				first = parts.slice(0, parts.length - 1).join(' ');
			}
		}
		// Normalize casing: first name title-case, last name uppercase
		const titleCase = (s) => (s||'').toString().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
		return { first: titleCase(first || ''), last: (last || '').toString().toUpperCase() };
	}
	const names = (fencers || []).map(f => (f && f.name) ? f.name.toString().trim() : '').filter(Boolean);

	// Build bracket rounds (single elimination)
	function buildBracket(names) {
		const rounds = [];
		let current = names.slice();
		while (current.length > 1) {
			const round = [];
			for (let i = 0; i < current.length; i += 2) {
				round.push({ a: current[i], b: current[i + 1] || null, winner: null });
			}
			rounds.push(round);
			current = round.map(m => null); // placeholder for next round
		}
		return rounds;
	}
	const bracket = buildBracket(names);

	// Render bracket
	const container = document.getElementById('de-cards-stack');
	if (!container) return;
	container.innerHTML = '';
	// Do not add global `cards-stack` (it shifts layout); rely on `.de-like` on cards
	// Minimal rerender function to update bracket after advancement
	function renderBracket() {
		container.innerHTML = '';
		const bracketRow = document.createElement('div');
		bracketRow.style.display = 'flex';
		bracketRow.style.gap = '32px';
		bracketRow.style.alignItems = 'flex-start';

		bracket.forEach((round, rIdx) => {
			const roundCol = document.createElement('div');
			roundCol.className = 'de-round-col';
			roundCol.style.display = 'flex';
			roundCol.style.flexDirection = 'column';
			roundCol.style.gap = '18px';
			const header = document.createElement('div');
			header.className = 'de-round-header';
			header.textContent = `Round ${rIdx + 1}`;
			roundCol.appendChild(header);
			round.forEach((match, mIdx) => {
				// Always show two slots per match (even if one is a bye)
				const matchRow = document.createElement('div');
				matchRow.className = 'de-match-row';
				matchRow.style.display = 'flex';
				matchRow.style.flexDirection = 'column';
				matchRow.style.gap = '12px';
				matchRow.style.alignItems = 'flex-start';
				// Store references for winner logic
				const scoreInputs = {};
				['a', 'b'].forEach(slot => {
					// Each slot becomes a horizontal row inside the match column
					const slotRow = document.createElement('div');
					slotRow.style.display = 'flex';
					slotRow.style.gap = '8px';
					slotRow.style.alignItems = 'center';
					slotRow.className = 'de-slot-row';

					// Create a standard fencer card (matches check-in structure)
					const card = document.createElement('article');
					card.className = 'fencer-card de-like no-hover';
					card.setAttribute('role', 'group');
					const parsed = formatNameForCard(match[slot] || '');
					const rowEl = document.createElement('div');
					rowEl.className = 'fencer-row';
					const leftEl = document.createElement('div');
					leftEl.className = 'fencer-left';
					const nameDiv = document.createElement('div');
					nameDiv.className = 'fencer-name';
					const firstSpan = document.createElement('span');
					firstSpan.className = 'fencer-firstname';
					firstSpan.textContent = parsed.first;
					const spacer = document.createTextNode(' ');
					const lastSpan = document.createElement('span');
					lastSpan.className = 'fencer-lastname';
					lastSpan.textContent = parsed.last;
					nameDiv.appendChild(firstSpan);
					nameDiv.appendChild(spacer);
					nameDiv.appendChild(lastSpan);
					leftEl.appendChild(nameDiv);
					const metaDiv = document.createElement('div');
					metaDiv.className = 'fencer-meta';
					leftEl.appendChild(metaDiv);
					rowEl.appendChild(leftEl);
					const actionsEl = document.createElement('div');
					actionsEl.className = 'card-actions';
					actionsEl.setAttribute('aria-hidden','true');
					rowEl.appendChild(actionsEl);
					card.appendChild(rowEl);
					// Disable hover animations/transforms by applying inline important styles
					card.style.setProperty('transition', 'none', 'important');
					card.style.setProperty('transform', 'none', 'important');
					card.style.setProperty('box-shadow', 'none', 'important');
					if (!match[slot]) {
						card.style.opacity = '0.3';
						card.style.filter = 'blur(0.5px)';
					}
					slotRow.appendChild(card);

					// Score input (minimal styling)
					const input = document.createElement('input');
					input.type = 'text';
					input.className = 'score-input';
					input.style.width = '42px';
					input.style.textAlign = 'center';
					input.maxLength = 2;
					input.placeholder = '#';
					if (typeof match[slot + 'Score'] !== 'undefined') input.value = match[slot + 'Score'];
					slotRow.appendChild(input);

					matchRow.appendChild(slotRow);
					scoreInputs[slot] = input;
				});

				// Winner selection logic: higher score advances
				function checkWinner() {
					const aVal = parseInt(scoreInputs.a.value, 10);
					const bVal = parseInt(scoreInputs.b.value, 10);
					// Save scores to data for rerender
					match.aScore = scoreInputs.a.value;
					match.bScore = scoreInputs.b.value;
					if (isNaN(aVal) || isNaN(bVal)) return;
					if (aVal === bVal) return; // no ties handled
					let winner = null;
					if (aVal > bVal) winner = match.a;
					else winner = match.b;
					match.winner = winner;
					// Advance winner to next round
					const nextRound = bracket[rIdx + 1];
					if (nextRound) {
						const nextMatchIdx = Math.floor(mIdx / 2);
						const slot = mIdx % 2 === 0 ? 'a' : 'b';
						nextRound[nextMatchIdx][slot] = winner;
						// Clear scores in next round
						nextRound[nextMatchIdx].aScore = '';
						nextRound[nextMatchIdx].bScore = '';
						// Re-render bracket to show advancement
						renderBracket();
					}
				}
				scoreInputs.a.addEventListener('input', checkWinner);
				scoreInputs.b.addEventListener('input', checkWinner);

				matchRow.appendChild(document.createElement('span')); // for spacing
				roundCol.appendChild(matchRow);
			});
			bracketRow.appendChild(roundCol);
		});
		container.appendChild(bracketRow);
	}
	renderBracket();
});


