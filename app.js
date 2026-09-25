/* app.js — Dynastics upload pipeline (issue #2)
 *
 * Responsibilities:
 *   1. Accept a .xlsx file via drag-and-drop or file picker
 *   2. Parse the "Food" sheet into row objects using SheetJS
 *   3. Display the detected date range (earliest / latest "Date & Time")
 *   4. Show inline errors; collapse the upload zone on success
 */

(function () {
  'use strict';

  /* ── DOM refs ────────────────────────────────────────────────── */
  var dropZone      = document.getElementById('drop-zone');
  var fileInput     = document.getElementById('file-input');
  var uploadSection = document.getElementById('upload-section');
  var errorMsg      = document.getElementById('upload-error');
  var resultsSection= document.getElementById('results-section');
  var resultsContainer = document.getElementById('results-container');
  var reuploadBtn   = document.getElementById('reupload-btn');

  /* ── Helpers ─────────────────────────────────────────────────── */

  /**
   * Format a JS Date as "1 Jan 2026" (short locale, en-GB day-first).
   * @param {Date} date
   * @returns {string}
   */
  function formatDate(date) {
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  /** Show an error below the drop zone and clear any previous results. */
  function showError(message) {
    errorMsg.textContent = message;
    errorMsg.hidden = false;
    resultsSection.hidden = true;
    uploadSection.hidden = false;
  }

  /** Clear any visible error. */
  function clearError() {
    errorMsg.hidden = true;
    errorMsg.textContent = '';
  }

  /** Transition from the upload zone to the results view. */
  function showResults(html) {
    resultsContainer.innerHTML = html;
    uploadSection.hidden = true;
    resultsSection.hidden = false;
  }

  /** Return the upload zone to its initial state. */
  function resetToUpload() {
    clearError();
    resultsSection.hidden = true;
    uploadSection.hidden = false;
    fileInput.value = '';
  }

  /* ── Core parsing ────────────────────────────────────────────── */

  /**
   * Read an ArrayBuffer with SheetJS, find the "Food" sheet, and return
   * an object with { rows, minDate, maxDate }.
   *
   * @param {ArrayBuffer} buffer
   * @returns {{ rows: object[], minDate: Date, maxDate: Date }}
   * @throws {Error} with a user-friendly message on failure
   */
  function parseWorkbook(buffer) {
    var workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

    if (!workbook.SheetNames.includes('Food')) {
      throw new Error(
        'No "Food" sheet found in this file. ' +
        'Please export from MyNetDiary and try again.'
      );
    }

    var sheet = workbook.Sheets['Food'];
    // header: true → array of plain objects keyed by the first row
    var rows = XLSX.utils.sheet_to_json(sheet, { header: 0, defval: null });

    if (rows.length === 0) {
      throw new Error('The Food sheet appears to be empty.');
    }

    /* Find the date range from the "Date & Time" column.
     * With cellDates:true SheetJS returns JS Date objects for date cells. */
    var DATE_COL = 'Date & Time';
    var dates = rows
      .map(function (row) { return row[DATE_COL]; })
      .filter(function (v) { return v instanceof Date && !isNaN(v.getTime()); });

    if (dates.length === 0) {
      throw new Error(
        'No valid dates found in the "Date & Time" column of the Food sheet.'
      );
    }

    var timestamps = dates.map(function (d) { return d.getTime(); });
    var minDate = new Date(Math.min.apply(null, timestamps));
    var maxDate = new Date(Math.max.apply(null, timestamps));

    return { rows: rows, minDate: minDate, maxDate: maxDate };
  }

  /**
   * Build the results HTML string for a successful parse.
   * @param {{ rows: object[], minDate: Date, maxDate: Date }} result
   * @returns {string}
   */
  function buildResultsHTML(result) {
    var rowCount = result.rows.length;
    var dateRange = formatDate(result.minDate) + ' – ' + formatDate(result.maxDate);

    return (
      '<p class="result-label">Date range</p>' +
      '<p class="result-value">' + escapeHtml(dateRange) + '</p>' +
      '<p style="margin-top:1rem;font-size:0.875rem;color:#666;">' +
        escapeHtml(String(rowCount)) + ' food entries parsed successfully.' +
      '</p>'
    );
  }

  /** Minimal HTML escaping to prevent XSS from filename/sheet content. */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── File handling ───────────────────────────────────────────── */

  /**
   * Validate that the file has a .xlsx extension (MIME types are unreliable).
   * @param {File} file
   * @returns {boolean}
   */
  function isXlsx(file) {
    return file.name.toLowerCase().endsWith('.xlsx');
  }

  /**
   * Main entry point: read a File, parse it, and update the UI.
   * @param {File} file
   */
  function handleFile(file) {
    clearError();

    if (!isXlsx(file)) {
      showError('Please choose a .xlsx file. Other formats are not supported.');
      return;
    }

    var reader = new FileReader();

    reader.onerror = function () {
      showError('Could not read the file. Please try again.');
    };

    reader.onload = function (event) {
      try {
        var result = parseWorkbook(event.target.result);
        showResults(buildResultsHTML(result));
      } catch (err) {
        showError(err.message || 'An unexpected error occurred while parsing the file.');
      }
    };

    reader.readAsArrayBuffer(file);
  }

  /* ── Event wiring ────────────────────────────────────────────── */

  /* File picker change */
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files.length > 0) {
      handleFile(fileInput.files[0]);
    }
  });

  /* Drag-and-drop visual feedback */
  dropZone.addEventListener('dragenter', function (e) {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragover', function (e) {
    e.preventDefault(); // required to allow drop
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', function (e) {
    /* Only remove the class when leaving the drop zone itself,
     * not when moving between its children. */
    if (!dropZone.contains(e.relatedTarget)) {
      dropZone.classList.remove('drag-over');
    }
  });

  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  });

  /* Keyboard activation of the drop zone (Space / Enter) */
  dropZone.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      fileInput.click();
    }
  });

  /* Re-upload link */
  reuploadBtn.addEventListener('click', resetToUpload);

}());
