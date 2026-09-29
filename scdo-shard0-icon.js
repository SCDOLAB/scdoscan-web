/* scdo-shard0-icon.js - SCDO Shard 0 icon (blue-to-green hexagon, /brand/scdo-shard0-icon.svg) next to
   shard0-specific titles in the explorer SPA: shard0 card, "Latest Blocks/Transactions - Shard 0", and the
   Shard0 (EVM) Transaction / Account / Block cards. Standalone (2026-09-29); the site-wide favicon stays the
   old blue SCDO icon (the explorer covers all shards). Only inserts/removes its own <img class="s0-ico">.
   Disable: remove the <script> tag from index.html. */
(function(){
  if(window.__scdoS0Icon)return; window.__scdoS0Icon=1;
  var SRC='/brand/scdo-shard0-icon.svg';
  function ico(px){
    var i=document.createElement('img'); i.className='s0-ico'; i.src=SRC; i.alt=''; i.setAttribute('aria-hidden','true');
    i.width=px; i.height=px; i.title='SCDO Shard 0 (chainId 5680)';
    i.style.cssText='width:'+px+'px;height:'+px+'px;display:inline-block;vertical-align:-0.2em;margin:0 6px 0 0;flex:none;border:0';
    return i;
  }
  function own(el){ for(var c=el.firstChild;c;c=c.nextSibling) if(c.nodeType===1&&c.classList&&c.classList.contains('s0-ico')) return c; return null; }
  // on=true: make sure el has the icon (after `after` if given, else first); on=false: remove it
  function set(el,on,px,after){
    if(!el) return; var cur=own(el);
    if(!on){ if(cur) cur.remove(); return; }
    if(cur) return;
    var i=ico(px);
    if(after&&after.parentNode===el) el.insertBefore(i,after.nextSibling); else el.insertBefore(i,el.firstChild);
  }
  var S0=/\bShard ?0\b/i;
  function run(){
    try{
      var n=document.querySelector('.shard-card[data-shard="0"] .shard-name'); if(n) set(n,true,16,n.querySelector('.shard-dot'));
      var s0=document.querySelector('#scdo-hero .hero-sub .s0'); if(s0) set(s0,true,14);
      ['scdo-shard0-tx','scdo-shard0-addr','s0-block-card'].forEach(function(id){ var c=document.getElementById(id); if(c) set(c.querySelector('h3'),true,20); });
      var sb=document.querySelector('#scdo-shard-blocks .sb-head h3'); if(sb) set(sb,S0.test(sb.textContent),18);
      var tx=document.querySelector('#scdo-txs > div:first-child'); if(tx) set(tx,S0.test(tx.textContent),18);
      var hs=document.querySelectorAll('#app .card > h3'); // Vue "Latest Blocks (Shard N)"
      for(var k=0;k<hs.length;k++){ var h=hs[k]; if(/^\s*Latest Blocks \(Shard \d+\)\s*$/.test(h.textContent)) set(h,/\(Shard 0\)/.test(h.textContent),18); }
    }catch(e){}
  }
  var q=0; function soon(){ if(q) return; q=setTimeout(function(){ q=0; run(); },120); }
  function start(){
    run();
    try{ new MutationObserver(soon).observe(document.body,{childList:true,subtree:true,characterData:true}); }catch(e){}
    setInterval(run,2000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
