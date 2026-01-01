// Summary page: Edit/Save functionality for tournament and event info

(function() {
  'use strict';

  const editBtn = document.querySelector('.edit-btn');
  const saveBtn = document.querySelector('.save-btn');
  let isEditMode = false;

  // Utility to place caret at end of contenteditable element
  function placeCaretAtEnd(el) {
    if (!el) return;
    const range = document.createRange();
    const sel = window.getSelection();
    try {
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
  }

  // Enter edit mode
  function enterEditMode() {
    if (isEditMode) return; // Already in edit mode
    
    isEditMode = true;
    const allValues = document.querySelectorAll('.info-value');
    
    allValues.forEach(val => {
      val.contentEditable = 'true';
      
      // Hover-to-type: focus on mouseenter
      val.addEventListener('mouseenter', () => {
        try {
          val.focus();
          placeCaretAtEnd(val);
        } catch (e) {}
      });
      
      // Also support touch
      val.addEventListener('touchstart', () => {
        try {
          val.focus();
          placeCaretAtEnd(val);
        } catch (e) {}
      }, { passive: true });
    });

    // Update button appearance - disable Edit button, enable Save button
    editBtn.classList.add('disabled');
    editBtn.setAttribute('aria-disabled', 'true');
    editBtn.textContent = 'Editing...';
    saveBtn.classList.remove('disabled');
    saveBtn.removeAttribute('aria-disabled');
  }

  // Exit edit mode
  function exitEditMode() {
    isEditMode = false;
    const allValues = document.querySelectorAll('.info-value');
    
    allValues.forEach(val => {
      val.contentEditable = 'false';
    });

    // Update button appearance - enable Edit button, disable Save button
    editBtn.classList.remove('disabled');
    editBtn.removeAttribute('aria-disabled');
    editBtn.textContent = 'Edit';
    saveBtn.classList.add('disabled');
    saveBtn.setAttribute('aria-disabled', 'true');
  }

  // Save changes to sessionStorage
  function saveChanges() {
    if (!isEditMode) return;

    const data = {
      tournament: {},
      event: {}
    };

    // Get tournament card values (first card)
    const tournamentCard = document.querySelectorAll('.summary-info-card')[0];
    const tournamentRows = tournamentCard.querySelectorAll('.info-row');
    data.tournament.name = tournamentRows[0].querySelector('.info-value').textContent.trim();
    data.tournament.location = tournamentRows[1].querySelector('.info-value').textContent.trim();
    data.tournament.date = tournamentRows[2].querySelector('.info-value').textContent.trim();
    data.tournament.fee = tournamentRows[3].querySelector('.info-value').textContent.trim();
    data.tournament.id = tournamentRows[4].querySelector('.info-value').textContent.trim();

    // Get event card values (second card)
    const eventCard = document.querySelectorAll('.summary-info-card')[1];
    const eventRows = eventCard.querySelectorAll('.info-row');
    data.event.time = eventRows[0].querySelector('.info-value').textContent.trim();
    data.event.weapon = eventRows[1].querySelector('.info-value').textContent.trim();
    data.event.gender_mixed = eventRows[2].querySelector('.info-value').textContent.trim();
    data.event.age_limit = eventRows[3].querySelector('.info-value').textContent.trim();
    data.event.rating_limit = eventRows[4].querySelector('.info-value').textContent.trim();
    data.event.id = eventRows[5].querySelector('.info-value').textContent.trim();

    // Save to sessionStorage
    sessionStorage.setItem('fencingapp:summary-data', JSON.stringify(data));
    
    console.log('Summary data saved:', data);
    
    // Exit edit mode
    exitEditMode();
  }

  // Load saved data from sessionStorage if exists
  function loadSavedData() {
    const saved = sessionStorage.getItem('fencingapp:summary-data');
    if (!saved) return;

    try {
      const data = JSON.parse(saved);
      
      // Update tournament card
      const tournamentCard = document.querySelectorAll('.summary-info-card')[0];
      const tournamentRows = tournamentCard.querySelectorAll('.info-row');
      if (data.tournament.name) tournamentRows[0].querySelector('.info-value').textContent = data.tournament.name;
      if (data.tournament.location) tournamentRows[1].querySelector('.info-value').textContent = data.tournament.location;
      if (data.tournament.date) tournamentRows[2].querySelector('.info-value').textContent = data.tournament.date;
      if (data.tournament.fee) tournamentRows[3].querySelector('.info-value').textContent = data.tournament.fee;
      if (data.tournament.id) tournamentRows[4].querySelector('.info-value').textContent = data.tournament.id;

      // Update event card
      const eventCard = document.querySelectorAll('.summary-info-card')[1];
      const eventRows = eventCard.querySelectorAll('.info-row');
      if (data.event.time) eventRows[0].querySelector('.info-value').textContent = data.event.time;
      if (data.event.weapon) eventRows[1].querySelector('.info-value').textContent = data.event.weapon;
      if (data.event.gender_mixed) eventRows[2].querySelector('.info-value').textContent = data.event.gender_mixed;
      if (data.event.age_limit) eventRows[3].querySelector('.info-value').textContent = data.event.age_limit;
      if (data.event.rating_limit) eventRows[4].querySelector('.info-value').textContent = data.event.rating_limit;
      if (data.event.id) eventRows[5].querySelector('.info-value').textContent = data.event.id;

      console.log('Loaded saved summary data');
    } catch (e) {
      console.error('Error loading saved summary data:', e);
    }
  }

  // Event listeners
  if (editBtn) {
    editBtn.addEventListener('click', enterEditMode);
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', saveChanges);
  }

  // Initialize Save button as disabled
  if (saveBtn) {
    saveBtn.classList.add('disabled');
    saveBtn.setAttribute('aria-disabled', 'true');
  }

  // Load saved data on page load
  loadSavedData();
})();
