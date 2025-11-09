document.addEventListener('DOMContentLoaded', () => {
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
