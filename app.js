/* ArtScout: shows the art residencies the scout files into the "artscout" collection of the badriyahstasks database
   (Firestore REST, the same database as Badriyah's Tasks). The page writes back one thing only: your own status
   on a residency ("mine"), which the scout never touches. The doc "_meta" holds the scout's last run. */
(function(){
  "use strict";

  var KEY = "AIzaSyD5Enp6XOf64EEBnjDf6A2NsKxG_GTW36M";
  var BASE = "https://firestore.googleapis.com/v1/projects/badriyahstasks/databases/(default)/documents/artscout";
  var PREFS = 'artscout-view-v1';

  var REGIONS = [
    {id: 'gulf', name: 'Gulf & Yemen', countries: ['Kuwait', 'UAE', 'Qatar', 'Saudi Arabia', 'Bahrain', 'Oman', 'Yemen']},
    {id: 'levant', name: 'Levant & Iraq', countries: ['Jordan', 'Lebanon', 'Palestine', 'Syria', 'Iraq']},
    {id: 'africa', name: 'Nile & Maghreb', countries: ['Egypt', 'Sudan', 'Libya', 'Tunisia', 'Algeria', 'Morocco', 'Mauritania']},
    {id: 'horn', name: 'Horn & Comoros', countries: ['Somalia', 'Djibouti', 'Comoros']}
  ];
  var AR = {
    'Algeria': 'الجزائر', 'Bahrain': 'البحرين', 'Comoros': 'جزر القمر', 'Djibouti': 'جيبوتي', 'Egypt': 'مصر', 'Iraq': 'العراق',
    'Jordan': 'الأردن', 'Kuwait': 'الكويت', 'Lebanon': 'لبنان', 'Libya': 'ليبيا', 'Mauritania': 'موريتانيا', 'Morocco': 'المغرب',
    'Oman': 'عُمان', 'Palestine': 'فلسطين', 'Qatar': 'قطر', 'Saudi Arabia': 'السعودية', 'Somalia': 'الصومال', 'Sudan': 'السودان',
    'Syria': 'سوريا', 'Tunisia': 'تونس', 'UAE': 'الإمارات', 'Yemen': 'اليمن'
  };
  var MINE = [['', 'Not started'], ['saved', 'Saved'], ['applying', 'Applying'], ['applied', 'Applied'], ['accepted', 'Accepted'], ['skip', 'Not for me']];
  var ON_LIST = {saved: 1, applying: 1, applied: 1, accepted: 1};
  var FUNDING = {funded: 'Funded', partly: 'Some support', self: 'Artist pays a fee'};
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var SOON = 21;

  var state = {items: [], meta: null, ok: null, code: 0, loadedAt: 0, view: 'all', region: '', country: '', q: '', sort: 'deadline', showHidden: false};
  try { var p = JSON.parse(localStorage.getItem(PREFS) || 'null'); if(p){ state.view = p.view || 'all'; state.region = p.region || ''; state.sort = p.sort || 'deadline'; } } catch(e){}
  function savePrefs(){ try { localStorage.setItem(PREFS, JSON.stringify({view: state.view, region: state.region, sort: state.sort})); } catch(e){} }

  // ---------- small helpers ----------
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); }
  function safeURL(s){ return /^https?:\/\//i.test(String(s || '').trim()) ? String(s).trim() : ''; }
  function iso(d){ return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function todayISO(){ return iso(new Date()); }
  function parseISO(s){ return /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? new Date(s + 'T00:00:00') : null; }
  function daysLeft(s){ var d = parseISO(s); if(!d) return null; var t = parseISO(todayISO()); return Math.round((d - t) / 86400000); }
  function pretty(s){ var d = parseISO(s); return d ? MONTHS[d.getMonth()] + ' ' + d.getDate() : ''; }
  function prettyLong(s){ var d = parseISO(s); return d ? DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] : ''; }
  function regionOf(country){ for(var i = 0; i < REGIONS.length; i++){ if(REGIONS[i].countries.indexOf(country) >= 0) return REGIONS[i].id; } return ''; }

  function val(v){
    if(!v) return '';
    if('stringValue' in v) return v.stringValue;
    if('booleanValue' in v) return v.booleanValue;
    if('integerValue' in v) return Number(v.integerValue);
    if('doubleValue' in v) return v.doubleValue;
    if('arrayValue' in v) return (v.arrayValue.values || []).map(val);
    return '';
  }

  // ---------- database ----------
  function load(){
    var out = [], meta = null;
    function page(token){
      return fetch(BASE + '?pageSize=300&key=' + KEY + (token ? '&pageToken=' + encodeURIComponent(token) : ''))
        .then(function(r){ if(!r.ok){ var e = new Error('HTTP ' + r.status); e.code = r.status; throw e; } return r.json(); })
        .then(function(d){
          (d.documents || []).forEach(function(doc){
            var row = {id: doc.name.split('/').pop()};
            Object.keys(doc.fields || {}).forEach(function(k){ row[k] = val(doc.fields[k]); });
            if(row.id === '_meta') meta = row; else out.push(row);
          });
          return d.nextPageToken ? page(d.nextPageToken) : null;
        });
    }
    return page().then(function(){
      state.items = out; state.meta = meta; state.ok = true; state.loadedAt = Date.now();
    }, function(e){
      state.ok = false; state.code = e.code || 0;
    }).then(render);
  }

  function saveMine(id, mine){
    return fetch(BASE + '/' + encodeURIComponent(id) + '?updateMask.fieldPaths=mine&updateMask.fieldPaths=mineUpdated&currentDocument.exists=true&key=' + KEY, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({fields: {mine: {stringValue: mine}, mineUpdated: {stringValue: todayISO()}}})
    }).then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); });
  }

  // ---------- which residencies show ----------
  function isClosed(i){
    if(i.status === 'closed') return true;
    var d = daysLeft(i.deadlineISO);
    return i.status === 'open' && d !== null && d < 0;
  }
  function live(i){ return !isClosed(i) && i.mine !== 'skip'; }
  function inView(i, view){
    if(view === 'mine') return !!ON_LIST[i.mine];
    if(!live(i)) return false;
    if(view === 'soon'){ var d = daysLeft(i.deadlineISO); return i.status === 'open' && d !== null && d <= SOON; }
    if(view === 'funded') return i.funding === 'funded';
    if(view === 'rolling') return i.status === 'rolling';
    return true;
  }
  function matches(i){
    if(!state.q) return true;
    var hay = [i.title, i.host, i.city, i.country, AR[i.country], i.blurb, i.disciplines, i.eligibility, i.dates, i.fundingNote].join(' ').toLowerCase();
    return state.q.toLowerCase().split(/\s+/).every(function(w){ return hay.indexOf(w) >= 0; });
  }
  function rank(i){
    if(isClosed(i)) return 3;
    if(i.status === 'open' && parseISO(i.deadlineISO)) return 0;
    if(i.status === 'rolling') return 1;
    return 2;
  }
  function sorter(a, b){
    if(state.sort === 'new') return String(b.found || '').localeCompare(String(a.found || '')) || (b.order || 0) - (a.order || 0);
    return rank(a) - rank(b) || String(a.deadlineISO || '').localeCompare(String(b.deadlineISO || '')) || String(a.title).localeCompare(String(b.title));
  }

  // ---------- drawing ----------
  function render(){
    renderRun();
    if(state.ok === false){ renderError(); return; }
    var viewItems = state.items.filter(function(i){ return inView(i, state.view) && matches(i); });
    renderSummary();
    renderRegions(viewItems);
    var regionItems = viewItems.filter(function(i){ return !state.region || regionOf(i.country) === state.region; });
    renderCountries(regionItems);
    var shown = regionItems.filter(function(i){ return !state.country || i.country === state.country; }).sort(sorter);
    renderList(shown);
    renderHiddenNote();
    Array.prototype.forEach.call($('views').children, function(b){ b.classList.toggle('on', b.getAttribute('data-view') === state.view); });
    $('sort').value = state.sort;
  }

  function renderRun(){
    var el = $('lastrun'), last = state.meta && state.meta.lastRun;
    if(!last && state.items.length) last = state.items.map(function(i){ return i.updated || i.found || ''; }).sort().pop();
    el.textContent = last ? 'Scout last checked ' + prettyLong(last) : ' ';
  }

  function renderSummary(){
    var open = state.items.filter(live), soon = open.filter(function(i){ return inView(i, 'soon'); });
    var funded = open.filter(function(i){ return i.funding === 'funded'; });
    var mine = state.items.filter(function(i){ return ON_LIST[i.mine]; });
    var countries = {}; open.forEach(function(i){ if(i.country) countries[i.country] = 1; });
    var n = Object.keys(countries).length;
    if(!state.items.length){ $('summary').innerHTML = ''; return; }
    $('summary').innerHTML =
      '<span><b>' + open.length + '</b> ' + (open.length === 1 ? 'residency' : 'residencies') + ' in <b>' + n + '</b> ' + (n === 1 ? 'country' : 'countries') + '</span>' +
      (soon.length ? '<span><b>' + soon.length + '</b> closing within 3 weeks</span>' : '') +
      (funded.length ? '<span><b>' + funded.length + '</b> funded</span>' : '') +
      (mine.length ? '<span><b>' + mine.length + '</b> on your list</span>' : '');
  }

  function renderRegions(items){
    var counts = {}; items.forEach(function(i){ var r = regionOf(i.country); counts[r] = (counts[r] || 0) + 1; });
    if(state.region && !counts[state.region]) state.region = '';
    var html = '<button type="button" data-region=""' + (state.region ? '' : ' class="on"') + '>All regions</button>';
    REGIONS.forEach(function(r){
      if(!counts[r.id]) return;
      html += '<button type="button" data-region="' + r.id + '"' + (state.region === r.id ? ' class="on"' : '') + '>' + esc(r.name) + '<span class="n">' + counts[r.id] + '</span></button>';
    });
    $('regions').innerHTML = html;
  }

  function renderCountries(items){
    var counts = {}; items.forEach(function(i){ if(i.country) counts[i.country] = (counts[i.country] || 0) + 1; });
    var names = Object.keys(counts).sort();
    if(state.country && !counts[state.country]) state.country = '';
    $('country').innerHTML = '<option value="">All countries</option>' + names.map(function(c){
      return '<option value="' + esc(c) + '"' + (state.country === c ? ' selected' : '') + '>' + esc(c) + ' (' + counts[c] + ')</option>';
    }).join('');
  }

  function dueHTML(i){
    if(isClosed(i)) return '<span class="due closed">Closed</span>';
    if(i.status === 'rolling') return '<span class="due rolling">Rolling</span>';
    if(i.status === 'upcoming') return '<span class="due upcoming">' + esc(i.deadlineLabel || 'Call coming') + '</span>';
    var d = daysLeft(i.deadlineISO);
    if(d === null) return i.deadlineLabel ? '<span class="due">' + esc(i.deadlineLabel) + '</span>' : '';
    if(d === 0) return '<span class="due soon">Closes today</span>';
    if(d === 1) return '<span class="due soon">Closes tomorrow</span>';
    if(d <= SOON) return '<span class="due' + (d <= 14 ? ' soon' : '') + '" title="Deadline ' + esc(pretty(i.deadlineISO)) + '">' + d + ' days left</span>';
    return '<span class="due">Deadline ' + esc(pretty(i.deadlineISO)) + '</span>';
  }

  function gcalURL(i){
    var d = parseISO(i.deadlineISO); if(!d || isClosed(i)) return '';
    var next = new Date(d.getTime() + 86400000);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + encodeURIComponent('Deadline: ' + i.title) +
      '&dates=' + iso(d).replace(/-/g, '') + '/' + iso(next).replace(/-/g, '') +
      '&details=' + encodeURIComponent((i.blurb ? i.blurb + '\n\n' : '') + (i.link || '')) +
      '&location=' + encodeURIComponent([i.city, i.country].filter(Boolean).join(', '));
  }

  function cardHTML(i){
    var link = safeURL(i.link), place = [i.city, i.country].filter(Boolean).join(', ');
    var fresh = daysLeft(i.found); fresh = fresh !== null && fresh >= -3;
    var facts = [['When', i.dates], ['Support', i.fundingNote], ['Who', i.eligibility], ['Fields', i.disciplines]]
      .filter(function(f){ return f[1]; })
      .map(function(f){ return '<dt>' + f[0] + '</dt><dd>' + esc(f[1]) + '</dd>'; }).join('');
    var tags = [];
    if(FUNDING[i.funding]) tags.push('<span class="tag ' + esc(i.funding) + '">' + FUNDING[i.funding] + '</span>');
    if(i.online === true) tags.push('<span class="tag online">Online</span>');
    if(fresh && !ON_LIST[i.mine]) tags.push('<span class="tag new">New</span>');
    var g = gcalURL(i);
    var seen = ['Found ' + pretty(i.found), i.updated && i.updated !== i.found ? 'checked ' + pretty(i.updated) : '', i.source ? 'via ' + i.source : '']
      .filter(function(s){ return s && s !== 'Found '; }).join(' · ');
    return '<article class="card' + (ON_LIST[i.mine] ? ' is-mine' : '') + (isClosed(i) ? ' is-closed' : '') + '" data-id="' + esc(i.id) + '">' +
      '<div class="card-top"><span class="place">' + esc(place) + (AR[i.country] ? '<span class="ar" lang="ar">' + AR[i.country] + '</span>' : '') + '</span>' + dueHTML(i) + '</div>' +
      '<h2>' + (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">' + esc(i.title) + ' <span class="arrow">↗</span></a>' : esc(i.title)) + '</h2>' +
      (i.host && i.host !== i.title ? '<p class="host">' + esc(i.host) + '</p>' : '') +
      (i.blurb ? '<p class="blurb">' + esc(i.blurb) + '</p>' : '') +
      (facts ? '<dl class="facts">' + facts + '</dl>' : '') +
      (tags.length ? '<div class="tags">' + tags.join('') + '</div>' : '') +
      '<div class="card-foot">' +
        '<label class="sel mine-sel"><span>Me</span><select data-a="mine" aria-label="My status for ' + esc(i.title) + '">' +
          MINE.map(function(m){ return '<option value="' + m[0] + '"' + ((i.mine || '') === m[0] ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('') +
        '</select></label>' +
        '<span class="links">' + (g ? '<a href="' + esc(g) + '" target="_blank" rel="noopener noreferrer">Deadline to Google Calendar ↗</a>' : '') +
          (i.mine !== 'skip' ? '<button type="button" data-a="skip">Not for me</button>' : '') + '</span>' +
      '</div>' +
      (seen ? '<span class="found">' + esc(seen) + '</span>' : '') +
    '</article>';
  }

  function renderList(items){
    var list = $('list');
    if(!state.items.length){
      list.innerHTML = '<p class="empty"><b>No residencies filed yet</b>Badriyah is checking for more.</p>';
      return;
    }
    if(!items.length){
      var msg = state.view === 'mine' ? 'Nothing on your list yet. Pick a status on any residency to keep it here.' : 'Nothing matches that.';
      list.innerHTML = '<p class="empty"><b>' + esc(msg) + '</b><button type="button" class="chips-reset" data-a="reset">Show everything open</button></p>';
      return;
    }
    list.innerHTML = items.map(cardHTML).join('');
  }

  function renderHiddenNote(){
    var hidden = state.items.filter(function(i){ return i.mine === 'skip'; });
    var el = $('hiddennote');
    if(!hidden.length){ el.innerHTML = ''; state.showHidden = false; return; }
    if(state.showHidden){
      el.innerHTML = '<span>Marked Not for me:</span> ' + hidden.map(function(i){
        return '<button type="button" data-a="unskip" data-id="' + esc(i.id) + '">' + esc(i.title) + ' (bring back)</button>';
      }).join(' ') + ' <button type="button" data-a="hidehidden">Done</button>';
    } else {
      el.innerHTML = hidden.length + ' marked Not for me · <button type="button" data-a="showhidden">See them</button>';
    }
  }

  function renderError(){
    $('summary').innerHTML = '';
    $('regions').innerHTML = '';
    $('list').innerHTML = '<p class="empty"><b>Couldn’t load the residencies</b>Check the connection, then <button type="button" class="chips-reset" data-a="reload">try again</button>.</p>';
  }

  // ---------- toast ----------
  var toastTimer;
  function toast(text, undo){
    var t = $('toast');
    t.innerHTML = esc(text) + (undo ? ' <button type="button">Undo</button>' : '');
    if(undo) t.querySelector('button').onclick = function(){ t.classList.remove('show'); undo(); };
    t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function(){ t.classList.remove('show'); }, undo ? 6000 : 3500);
  }

  function setMine(id, mine, quiet){
    var item = state.items.find(function(i){ return i.id === id; }); if(!item) return;
    var before = item.mine || '';
    if(before === mine) return;
    item.mine = mine; render();
    saveMine(id, mine).then(function(){
      if(quiet) return;
      var label = MINE.filter(function(m){ return m[0] === mine; })[0][1];
      toast(mine === 'skip' ? 'Hidden: ' + item.title : mine ? 'Marked ' + label.toLowerCase() : 'Status cleared', function(){ setMine(id, before, true); });
    }, function(){
      item.mine = before; render();
      toast('Couldn’t save that. Try again in a moment.');
    });
  }

  // ---------- events ----------
  $('views').addEventListener('click', function(e){
    var b = e.target.closest('button[data-view]'); if(!b) return;
    state.view = b.getAttribute('data-view'); savePrefs(); render();
  });
  $('regions').addEventListener('click', function(e){
    var b = e.target.closest('button[data-region]'); if(!b) return;
    state.region = b.getAttribute('data-region'); state.country = ''; savePrefs(); render();
  });
  $('country').addEventListener('change', function(){ state.country = this.value; render(); });
  $('sort').addEventListener('change', function(){ state.sort = this.value; savePrefs(); render(); });
  var qTimer;
  $('q').addEventListener('input', function(){ var v = this.value; clearTimeout(qTimer); qTimer = setTimeout(function(){ state.q = v.trim(); render(); }, 120); });

  document.addEventListener('change', function(e){
    var s = e.target.closest('select[data-a="mine"]'); if(!s) return;
    setMine(s.closest('[data-id]').getAttribute('data-id'), s.value);
  });
  document.addEventListener('click', function(e){
    var b = e.target.closest('button[data-a]'); if(!b) return;
    var a = b.getAttribute('data-a');
    if(a === 'skip') setMine(b.closest('[data-id]').getAttribute('data-id'), 'skip');
    else if(a === 'unskip') setMine(b.getAttribute('data-id'), '');
    else if(a === 'showhidden'){ state.showHidden = true; renderHiddenNote(); }
    else if(a === 'hidehidden'){ state.showHidden = false; renderHiddenNote(); }
    else if(a === 'reset'){ state.view = 'all'; state.region = ''; state.country = ''; state.q = ''; $('q').value = ''; savePrefs(); render(); }
    else if(a === 'reload'){ $('list').innerHTML = '<p class="empty">Trying again…</p>'; load(); }
  });
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'visible' && Date.now() - state.loadedAt > 10 * 60000) load();
  });

  load();
})();
