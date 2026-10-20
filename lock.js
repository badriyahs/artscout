/* A password screen for the whole site, so casual visitors and anyone who finds the link meet a locked door.
   It runs in the browser, so it is a deterrent, not strong security: the database itself is still open.
   Only a salted, slow hash of the password is stored here, never the password. It remembers this device for 60 days.
   ArtScout has its own password and its own remembered unlock, separate from Badriyah's Tasks. */
(function(){
  var SALT = "5b7f7515d826929d7c11522b2e8461c4", ITER = 200000, HASH = "e97d1d6f10eeac0fb1e99563164bcc25253cadc1bda23d371cd986fe61390508", KEY = 'artscout-unlock-v1', DAYS = 60;
  function unlocked(){ try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); return !!v && v.h === HASH && v.until > Date.now(); } catch(e){ return false; } }
  if(unlocked()) return;
  document.documentElement.classList.add('locked');
  var st = document.createElement('style');
  st.textContent = 'html.locked body > *:not(#lock){display:none !important}' +
    'html.locked,html.locked body{background:#17113a !important;}' +
    '#lock{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(120% 50% at 50% 0%,rgba(150,110,255,.3),transparent 70%),linear-gradient(170deg,#17113a 0%,#241a58 55%,#33205f 100%);z-index:99999;font-family:"IBM Plex Sans",system-ui,sans-serif;color:#F2EEFF;}' +
    '#lock form{width:100%;max-width:340px;text-align:center;}' +
    '#lock h1{font-family:"IBM Plex Serif",Georgia,serif;font-weight:500;font-size:26px;margin:0 0 22px;}' +
    '#lock input{width:100%;box-sizing:border-box;font:inherit;font-size:17px;color:#F2EEFF;background:rgba(255,255,255,.08);border:1px solid rgba(201,184,255,.4);border-radius:26px;padding:13px 20px;text-align:center;outline:none;}' +
    '#lock input:focus{border-color:#C9B8FF;box-shadow:0 0 0 3px rgba(201,184,255,.2);}' +
    '#lock button{margin-top:14px;font:inherit;font-size:16px;font-weight:600;color:#17113a;background:linear-gradient(135deg,#C9B8FF,#FFB6D2);border:0;border-radius:26px;padding:12px 34px;cursor:pointer;}' +
    '#lock button:disabled{opacity:.6;cursor:default;}' +
    '#lock p{min-height:20px;margin:12px 0 0;font-size:14px;color:#FFB6D2;}';
  document.head.appendChild(st);
  function hex(buf){ return Array.prototype.map.call(new Uint8Array(buf), function(b){ return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function unhex(h){ var a = new Uint8Array(h.length / 2); for(var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; }
  function derive(pw){
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits'])
      .then(function(k){ return crypto.subtle.deriveBits({name: 'PBKDF2', salt: unhex(SALT), iterations: ITER, hash: 'SHA-256'}, k, 256); })
      .then(hex);
  }
  function build(){
    var box = document.createElement('div'); box.id = 'lock';
    box.innerHTML = '<form autocomplete="off"><h1>Enter ArtScout</h1><input type="password" id="lockpw" placeholder="Password" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Password"><br><button type="submit">Open</button><p id="lockmsg" role="status"></p></form>';
    document.body.appendChild(box);
    var form = box.querySelector('form'), input = box.querySelector('input'), msg = box.querySelector('#lockmsg'), btn = box.querySelector('button');
    setTimeout(function(){ try { input.focus(); } catch(e){} }, 50);
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var pw = input.value.trim().toLowerCase().replace(/\s+/g, ' '); if(!pw) return;
      if(!(window.crypto && crypto.subtle)){ msg.textContent = 'Open this page over https.'; return; }
      btn.disabled = true; msg.textContent = '';
      derive(pw).then(function(h){
        if(h === HASH){
          try { localStorage.setItem(KEY, JSON.stringify({h: HASH, until: Date.now() + DAYS * 86400000})); } catch(err){}
          location.reload();
        } else { msg.textContent = 'Not quite.'; input.value = ''; btn.disabled = false; input.focus(); }
      }).catch(function(){ msg.textContent = 'Couldn\u2019t check that. Try again.'; btn.disabled = false; });
    });
  }
  if(document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
