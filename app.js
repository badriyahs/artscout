/* ArtScout: shows the art residencies the scout files into the "artscout" collection of the badriyahstasks database
   (Firestore REST). The page writes back one thing only: the reader's reaction to a residency ("mine": up, down or heart),
   which the scout never changes and reads as a hint for what to look for next. */
(function(){
  "use strict";

  var KEY = "AIzaSyD5Enp6XOf64EEBnjDf6A2NsKxG_GTW36M";
  var BASE = "https://firestore.googleapis.com/v1/projects/badriyahstasks/databases/(default)/documents/artscout";
  var PREFS = 'artscout-view-v2';

  var AR = {
    'Algeria': 'الجزائر', 'Bahrain': 'البحرين', 'Comoros': 'جزر القمر', 'Djibouti': 'جيبوتي', 'Egypt': 'مصر', 'Iraq': 'العراق',
    'Jordan': 'الأردن', 'Kuwait': 'الكويت', 'Lebanon': 'لبنان', 'Libya': 'ليبيا', 'Mauritania': 'موريتانيا', 'Morocco': 'المغرب',
    'Oman': 'عُمان', 'Palestine': 'فلسطين', 'Qatar': 'قطر', 'Saudi Arabia': 'السعودية', 'Somalia': 'الصومال', 'Sudan': 'السودان',
    'Syria': 'سوريا', 'Tunisia': 'تونس', 'UAE': 'الإمارات', 'Yemen': 'اليمن'
  };
  // the three reactions, in the order they sit on a card
  var REACT = [['up', '👍', 'Thumbs up'], ['down', '👎', 'Thumbs down'], ['heart', '❤️', 'Love it']];
  var LIKED = {up: 1, heart: 1};
  var FUNDED = {funded: ['yes', 'Yes'], partly: ['partial', 'Partial'], self: ['no', 'No']};
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var SOON = 21;

  var state = {items: [], ok: null, loadedAt: 0, view: 'all'};
  try { var p = JSON.parse(localStorage.getItem(PREFS) || 'null'); if(p && p.view) state.view = p.view; } catch(e){}
  function savePrefs(){ try { localStorage.setItem(PREFS, JSON.stringify({view: state.view})); } catch(e){} }

  // ---------- small helpers ----------
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); }
  function safeURL(s){ return /^https?:\/\//i.test(String(s || '').trim()) ? String(s).trim() : ''; }
  function iso(d){ return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function todayISO(){ return iso(new Date()); }
  function parseISO(s){ return /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? new Date(s + 'T00:00:00') : null; }
  function daysLeft(s){ var d = parseISO(s); if(!d) return null; var t = parseISO(todayISO()); return Math.round((d - t) / 86400000); }
  function pretty(s){ var d = parseISO(s); return d ? MONTHS[d.getMonth()] + ' ' + d.getDate() : ''; }

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
    var out = [];
    function page(token){
      return fetch(BASE + '?pageSize=300&key=' + KEY + (token ? '&pageToken=' + encodeURIComponent(token) : ''))
        .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function(d){
          (d.documents || []).forEach(function(doc){
            var row = {id: doc.name.split('/').pop()};
            Object.keys(doc.fields || {}).forEach(function(k){ row[k] = val(doc.fields[k]); });
            if(row.id !== '_meta') out.push(row);
          });
          return d.nextPageToken ? page(d.nextPageToken) : null;
        });
    }
    return page().then(function(){
      state.items = out; state.ok = true; state.loadedAt = Date.now();
    }, function(){
      state.ok = false;
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
  function live(i){ return !isClosed(i) && i.mine !== 'down'; }
  function closingSoon(i){ var d = daysLeft(i.deadlineISO); return live(i) && i.status === 'open' && d !== null && d <= SOON; }
  function inView(i){
    if(state.view === 'liked') return !!LIKED[i.mine];
    if(state.view === 'disliked') return i.mine === 'down';
    if(state.view === 'soon') return closingSoon(i);
    return live(i);
  }
  function rank(i){
    if(isClosed(i)) return 3;
    if(i.status === 'open' && parseISO(i.deadlineISO)) return 0;
    if(i.status === 'rolling') return 1;
    return 2;
  }
  function sorter(a, b){
    if(state.view === 'liked'){ var h = (b.mine === 'heart') - (a.mine === 'heart'); if(h) return h; }
    return rank(a) - rank(b) || String(a.deadlineISO || '').localeCompare(String(b.deadlineISO || '')) || String(a.title).localeCompare(String(b.title));
  }

  // ---------- drawing ----------
  function render(){
    if(state.ok === false){ renderError(); return; }
    renderViews();
    renderList(state.items.filter(inView).sort(sorter));
  }

  function renderViews(){
    var count = {liked: 0, disliked: 0}, label = {liked: 'Liked', disliked: 'Disliked'};
    state.items.forEach(function(i){ if(LIKED[i.mine]) count.liked++; else if(i.mine === 'down') count.disliked++; });
    Array.prototype.forEach.call($('views').children, function(b){
      var v = b.getAttribute('data-view');
      b.classList.toggle('on', v === state.view);
      if(label[v]) b.innerHTML = label[v] + (count[v] ? '<span class="n">' + count[v] + '</span>' : '');
    });
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

  function cardHTML(i){
    var link = safeURL(i.link), place = [i.city, i.country].filter(Boolean).join(', ');
    var fresh = daysLeft(i.found); fresh = fresh !== null && fresh >= -3 && !i.mine;
    var f = FUNDED[i.funding];
    var facts = [['When', i.dates], ['Costs', i.fundingNote], ['Who', i.eligibility], ['Fields', i.disciplines]]
      .filter(function(x){ return x[1]; })
      .map(function(x){ return '<dt>' + x[0] + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('');
    return '<article class="card' + (i.mine ? ' r-' + esc(i.mine) : '') + (isClosed(i) ? ' is-closed' : '') + '" data-id="' + esc(i.id) + '">' +
      '<div class="card-top"><span class="place">' + esc(place) + (AR[i.country] ? '<span class="ar" lang="ar">' + AR[i.country] + '</span>' : '') + '</span>' + dueHTML(i) + '</div>' +
      '<h2>' + (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">' + esc(i.title) + ' <span class="arrow">↗</span></a>' : esc(i.title)) + '</h2>' +
      (i.host && i.host !== i.title ? '<p class="host">' + esc(i.host) + '</p>' : '') +
      '<div class="badges">' +
        (f ? '<span class="funded f-' + f[0] + '">Funded: <b>' + f[1] + '</b></span>' : '') +
        (i.online === true ? '<span class="tag online">Online</span>' : '') +
        (fresh ? '<span class="tag new">New</span>' : '') +
      '</div>' +
      (i.blurb ? '<p class="blurb">' + esc(i.blurb) + '</p>' : '') +
      (facts ? '<dl class="facts">' + facts + '</dl>' : '') +
      '<div class="react" role="group" aria-label="Your reaction">' + REACT.map(function(r){
        var on = i.mine === r[0];
        return '<button type="button" data-react="' + r[0] + '" class="' + (on ? 'on' : '') + '" aria-pressed="' + on + '" aria-label="' + r[2] + '" title="' + r[2] + '">' + r[1] + '</button>';
      }).join('') + '</div>' +
    '</article>';
  }

  function renderList(items){
    var list = $('list');
    if(!items.length){
      var msg = !state.items.length || state.view === 'all' ? ['No residencies filed yet', 'Badriyah is checking for more.']
              : state.view === 'liked' ? ['Nothing liked yet', 'Give a residency a 👍 or a ❤️ and it will wait here.']
              : state.view === 'disliked' ? ['Nothing disliked', 'Anything with a 👎 goes here. Tap the 👎 again to bring it back.']
              : ['Nothing closes in the next three weeks', ''];
      list.innerHTML = '<p class="empty"><b>' + esc(msg[0]) + '</b>' + esc(msg[1]) + '</p>';
      return;
    }
    list.innerHTML = items.map(cardHTML).join('');
  }

  function renderError(){
    $('list').innerHTML = '<p class="empty"><b>Couldn’t load the residencies</b>Check the connection, then <button type="button" class="again" data-a="reload">try again</button>.</p>';
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

  function setMine(id, mine){
    var item = state.items.find(function(i){ return i.id === id; }); if(!item) return;
    var before = item.mine || '';
    if(before === mine) return;
    item.mine = mine; render();
    saveMine(id, mine).then(function(){
      if(mine === 'down' && state.view !== 'disliked') toast('Moved to Disliked', function(){ setMine(id, before); });
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
  document.addEventListener('click', function(e){
    var r = e.target.closest('button[data-react]');
    if(r){
      var id = r.closest('[data-id]').getAttribute('data-id'), v = r.getAttribute('data-react');
      var item = state.items.find(function(i){ return i.id === id; });
      setMine(id, item && item.mine === v ? '' : v); // tapping the lit one again clears it
      return;
    }
    var b = e.target.closest('button[data-a]'); if(!b) return;
    var a = b.getAttribute('data-a');
    if(a === 'reload'){ $('list').innerHTML = '<p class="empty">Trying again…</p>'; load(); }
  });
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'visible' && Date.now() - state.loadedAt > 10 * 60000) load();
  });

  load();
})();
