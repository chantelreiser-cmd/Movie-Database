// app.js
// Replace the placeholder with your TMDb API key (v3)
const TMDB_API_KEY = 'YOUR_TMDB_API_KEY_HERE'; // <<--- set this
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';

$(function() {
  // State
  let genresMap = {};        // id -> name
  let lastSearchTimer = null;
  let lastQuery = '';
  let lastResults = [];      // cache of last search results

  // Initialize app
  initNav();
  fetchGenres();             // populate genre filter
  bindUI();

  // --- UI & navigation ---
  function initNav() {
    $('.nav-btn').on('click', function() {
      const view = $(this).data('view');
      showView(view);
    });
    $('.back-btn').on('click', function() { showView('home'); });
  }

  function showView(viewId) {
    $('.view').removeClass('active');
    $('#' + viewId).addClass('active');
    window.scrollTo(0,0);
    if (viewId === 'watchlist') renderWatchlist();
  }

  // --- Fetch TMDb genres and populate dropdown ---
  function fetchGenres() {
    $.getJSON(`${TMDB_BASE}/genre/movie/list`, { api_key: TMDB_API_KEY })
      .done(data => {
        if (data.genres) {
          for (const g of data.genres) {
            genresMap[g.id] = g.name;
            $('#filter-genre').append(`<option value="${g.id}">${g.name}</option>`);
          }
        }
      })
      .fail(() => {
        console.warn('Could not load genres. Check your API key or network.');
      });
  }

  // --- Bind UI interactions ---
  function bindUI() {
    // Live search with debounce
    $('#search-input').on('input', function() {
      const q = $(this).val().trim();
      // debounce
      clearTimeout(lastSearchTimer);
      lastSearchTimer = setTimeout(() => {
        doSearch(q);
      }, 300);
    });

    // Filter changes
    $('#filter-genre, #filter-rating').on('change', applyFiltersToLastResults);
    $('#clear-filters').on('click', () => {
      $('#filter-genre').val('');
      $('#filter-rating').val('');
      $('#search-input').trigger('input'); // re-apply
    });

    // Watchlist controls
    $('#clear-watchlist').on('click', () => {
      if (confirm('Clear your entire watchlist?')) {
        localStorage.removeItem('watchlist_v1');
        renderWatchlist();
      }
    });
    $('#watchlist-search').on('input', renderWatchlist);

    // Delegated events for dynamic content
    $('#movies-grid').on('click', '.card', function(e) {
      // If user clicked an inner button like add-to-watchlist, handle separately
      if ($(e.target).closest('.card-action').length) return;
      const id = $(this).data('id');
      openDetails(id);
    });

    $('#movies-grid').on('click', '.add-watchlist', function(e) {
      e.stopPropagation();
      const card = $(this).closest('.card');
      const movie = card.data('movie');
      addToWatchlist(movie);
      $(this).text('Saved').prop('disabled', true).addClass('secondary');
    });

    $('#watchlist-grid').on('click', '.remove-watchlist', function() {
      const id = $(this).closest('.card').data('id');
      removeFromWatchlist(id);
      renderWatchlist();
    });

    $('#watchlist-grid').on('click', '.mark-watched', function() {
      const id = $(this).closest('.card').data('id');
      toggleWatched(id);
      renderWatchlist();
    });
  }

  // --- Search & results ---
  function doSearch(query) {
    lastQuery = query;
    if (!query) {
      $('#movies-grid').empty();
      $('#results-count').text('No results yet');
      lastResults = [];
      return;
    }
    $('#results-count').text('Searching...');
    $.getJSON(`${TMDB_BASE}/search/movie`, { api_key: TMDB_API_KEY, query: query, include_adult: false })
      .done(data => {
        lastResults = data.results || [];
        renderResults(lastResults);
      })
      .fail(() => {
        $('#results-count').text('Error fetching results. Check API key / network.');
      });
  }

  function renderResults(list) {
    $('#movies-grid').empty();
    const filtered = applyFilters(list);
    $('#results-count').text(`${filtered.length} results`);
    if (filtered.length === 0) {
      $('#movies-grid').append(`<div style="color:#9fb4c9">No movies found.</div>`);
      return;
    }
    for (const m of filtered) {
      const poster = m.poster_path ? `${IMG_BASE}${m.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image';
      const release = m.release_date ? m.release_date.slice(0,4) : '—';
      const rating = (m.vote_average && m.vote_average > 0) ? m.vote_average.toFixed(1) : 'NR';
      const card = $(`
        <div class="card" data-id="${m.id}"></div>
      `);
      const html = `
        <img class="poster" src="${poster}" alt="${escapeHtml(m.title)} poster">
        <div class="meta">
          <h4>${escapeHtml(m.title)}</h4>
          <div class="sub">${release} • ${rating}⭐</div>
          <div class="actions">
            <div>
              <button class="btn add-watchlist card-action">Add</button>
            </div>
            <small style="color:#9fb4c9">${m.genre_ids && m.genre_ids.length ? mapGenreIds(m.genre_ids).join(', ') : ''}</small>
          </div>
        </div>
      `;
      card.html(html);
      card.data('movie', m); // store movie object for watchlist
      $('#movies-grid').append(card.hide().fadeIn(250));
      // disable add button if already in watchlist
      const watch = getWatchlist();
      if (watch.some(w => w.id === m.id)) {
        card.find('.add-watchlist').text('Saved').prop('disabled', true).addClass('secondary');
      }
    }
  }

  // --- Filtering logic (extra credit) ---
  function applyFilters(sourceList) {
    const genre = $('#filter-genre').val();
    const minRating = parseFloat($('#filter-rating').val()) || 0;
    const text = $('#search-input').val().trim().toLowerCase();

    return sourceList.filter(m => {
      // Title must match (already from search), but also check text again in case user typed further
      if (text && !m.title.toLowerCase().includes(text)) return false;
      // rating
      const rating = parseFloat(m.vote_average) || 0;
      if (rating < minRating) return false;
      // genre
      if (genre) {
        if (!m.genre_ids || !m.genre_ids.includes(parseInt(genre))) return false;
      }
      return true;
    });
  }

  function applyFiltersToLastResults() {
    renderResults(lastResults);
  }

  // --- Details view ---
  function openDetails(movieId) {
    $('#details-card').empty();
    showView('details');
    $('#details-card').text('Loading...');

    // fetch movie details
    $.getJSON(`${TMDB_BASE}/movie/${movieId}`, { api_key: TMDB_API_KEY })
      .done(m => {
        const poster = m.poster_path ? `${IMG_BASE}${m.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image';
        const genres = m.genres ? m.genres.map(g => g.name).join(', ') : '';
        const rating = m.vote_average ? m.vote_average.toFixed(1) : 'NR';
        const html = `
          <img class="poster" src="${poster}" alt="${escapeHtml(m.title)} poster" />
          <div class="info">
            <h2>${escapeHtml(m.title)}</h2>
            <div class="meta">${m.release_date || '—'} • ${genres} • ${rating}⭐</div>
            <p>${escapeHtml(m.overview || 'No description available.')}</p>
            <div style="display:flex;gap:0.5rem; margin-top:1rem">
              <button class="btn add-watchlist-details">Add to Watchlist</button>
              <button class="btn secondary back-btn">Back</button>
            </div>
          </div>
        `;
        $('#details-card').html(html);
        // hook add button
        $('#details-card').find('.add-watchlist-details').on('click', function() {
          // create a minimal movie object to store
          const storeObj = {
            id: m.id,
            title: m.title,
            poster_path: m.poster_path,
            release_date: m.release_date,
            vote_average: m.vote_average,
            genres: m.genres ? m.genres.map(g => g.id || g.name) : []
          };
          addToWatchlist(storeObj);
          $(this).text('Saved').prop('disabled', true).addClass('secondary');
        });
        // back button
        $('#details-card').find('.back-btn').on('click', function() { showView('home'); });
      })
      .fail(() => {
        $('#details-card').text('Failed to load details.');
      });
  }

  // --- Watchlist (localStorage) ---
  function getWatchlist() {
    try {
      const raw = localStorage.getItem('watchlist_v1');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Could not parse watchlist', e);
      return [];
    }
  }

  function saveWatchlist(list) {
    localStorage.setItem('watchlist_v1', JSON.stringify(list));
  }

  function addToWatchlist(movie) {
    const list = getWatchlist();
    if (list.some(m => m.id === movie.id)) return;
    // extend movie record with meta watched flag
    const record = Object.assign({}, movie, { savedAt: Date.now(), watched: false });
    list.push(record);
    saveWatchlist(list);
    showToast(`Added "${movie.title}" to watchlist`);
  }

  function removeFromWatchlist(id) {
    const list = getWatchlist().filter(m => m.id !== id);
    saveWatchlist(list);
    showToast('Removed from watchlist');
  }

  function toggleWatched(id) {
    const list = getWatchlist().map(m => {
      if (m.id === id) m.watched = !m.watched;
      return m;
    });
    saveWatchlist(list);
  }

  function renderWatchlist() {
    const grid = $('#watchlist-grid');
    grid.empty();
    const list = getWatchlist();
    const filter = $('#watchlist-search').val().trim().toLowerCase();
    const shown = list.filter(m => !filter || (m.title && m.title.toLowerCase().includes(filter)));
    if (shown.length === 0) {
      grid.append(`<div style="color:#9fb4c9">No movies saved.</div>`);
      return;
    }
    for (const m of shown) {
      const poster = m.poster_path ? `${IMG_BASE}${m.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image';
      const release = m.release_date ? m.release_date.slice(0,4) : '—';
      const rating = (m.vote_average && m.vote_average > 0) ? m.vote_average.toFixed(1) : 'NR';
      const card = $(`
        <div class="card" data-id="${m.id}"></div>
      `);
      const watchedTag = m.watched ? '<span style="font-size:0.8rem;color:#34d399">Watched</span>' : '';
      const html = `
        <img class="poster" src="${poster}" alt="${escapeHtml(m.title)} poster">
        <div class="meta">
          <h4>${escapeHtml(m.title)} ${watchedTag}</h4>
          <div class="sub">${release} • ${rating}⭐</div>
          <div class="actions">
            <div>
              <button class="btn mark-watched">${m.watched ? 'Unwatch' : 'Mark watched'}</button>
              <button class="btn remove-watchlist secondary">Remove</button>
            </div>
          </div>
        </div>
      `;
      card.html(html);
      grid.append(card.hide().fadeIn(200));
    }
  }

  // --- Utilities ---
  function mapGenreIds(ids) {
    return (ids || []).map(i => genresMap[i]).filter(Boolean);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Simple toast messages
  function showToast(msg, ms = 1600) {
    const t = $(`<div class="toast">${escapeHtml(msg)}</div>`);
    t.css({
      position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
      background: '#0b1726', padding: '0.6rem 1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)',
      zIndex: 9999, color: '#dff6ff'
    });
    $('body').append(t);
    t.hide().fadeIn(150).delay(ms).fadeOut(200, () => t.remove());
  }

}); // end ready
