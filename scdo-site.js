/* scdo-site.js (2026-09-29) - site-wide additions for scdoscan.io, served from .88 /usr/share/nginx/sitefix and
   injected by nginx sub_filter into explorer pages (proxied from .44) and the web wallet.
   1) footer links row: Verify Contract / 合约验证 · GitHub · X · Facebook (adds a standard compliance footer if a page has none)
   2) explorer top nav: "Verify & Publish" (replaces the legacy "Verify" router link)
   3) shard0 contract address page: prominent "Verify & Publish" button when the source is not verified yet (opens the automatic form)
   4) verified-source panel: "Verified automatically · submitted by … (KYC-verified)" line
   Idempotent; DOM built with textContent only. */
(function(){
  if(window.__scdoSite)return;window.__scdoSite=true;
  var VERIFY='/verify-contract.html';
  var LINKS=[[VERIFY,'Verify Contract / 合约验证',false],['https://github.com/SCDOLAB','GitHub',true],['https://x.com/SCDOLabor','X',true],['https://www.facebook.com/profile.php?id=61594957349207','Facebook',true]];
  function el(t,css,txt){var e=document.createElement(t);if(css)e.style.cssText=css;if(txt!=null)e.textContent=txt;return e;}
  function linksRow(){
    var d=el('div');d.className='scdo-foot-links';
    LINKS.forEach(function(l,i){if(i)d.appendChild(document.createTextNode(' \u00b7 '));var a=el('a',null,l[1]);a.href=l[0];if(l[2]){a.target='_blank';a.rel='noopener';}d.appendChild(a);});
    return d;
  }
  function complianceLines(){
    var f=document.createDocumentFragment();
    var d1=el('div'),a=el('a',null,'AUSTRAC DCE100714503-001 \u00b7 AFCA 124589');a.href='/compliance.html';d1.appendChild(a);f.appendChild(d1);
    f.appendChild(el('div',null,'Registration with AUSTRAC does not mean AUSTRAC endorses or approves 9Y9 PTY LTD, SCDO, or any product or service.'));
    return f;
  }
  function ensureFooter(){
    if(!document.body)return;
    var sel=document.getElementById('scdo-compliance-foot')?'#scdo-compliance-foot':(/^\/wallet\//.test(location.pathname)&&document.querySelector('.home-foot,.about-foot')?'.home-foot, .about-foot':'footer');
    var hosts=[].slice.call(document.querySelectorAll(sel));
    if(!hosts.length){ // e.g. downloads/shard0: last <p> with the AUSTRAC line and a top border
      var ps=[].slice.call(document.querySelectorAll('p[style*="border-top"]')).filter(function(p){return /DCE100714503-001/.test(p.textContent);});
      if(ps.length)hosts=[ps[ps.length-1]];
    }
    if(!hosts.length){
      if(document.getElementById('scdo-site-foot'))return;
      var f=el('footer','text-align:center;padding:22px 16px 26px;margin-top:30px;border-top:1px solid #30363d;font-size:12px;color:#8b949e;line-height:1.8;font-family:-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif');
      f.id='scdo-site-foot';f.appendChild(complianceLines());f.appendChild(linksRow());document.body.appendChild(f);styleLinks(f);return;
    }
    hosts.forEach(function(h){
      var isP=h.tagName==='P', box=h;
      if(isP){ if(h.nextElementSibling&&h.nextElementSibling.classList.contains('scdo-foot-box'))return;
        box=el('div','font-size:12px;color:#6e7681;line-height:1.8;margin-top:-16px;padding-bottom:12px');box.className='scdo-foot-box';h.parentNode.insertBefore(box,h.nextSibling); }
      else if(h.querySelector('.scdo-foot-links'))return;
      if(!/DCE100714503-001/.test(h.textContent)&&h.tagName==='FOOTER')box.appendChild(complianceLines());
      else if(!/124589/.test(h.textContent)){var af=el('div');af.className='scdo-foot-afca';var aa=el('a',null,'AFCA 124589');aa.href='/compliance.html';af.appendChild(aa);box.appendChild(af);}
      box.appendChild(linksRow());styleLinks(box);
    });
  }
  function styleLinks(h){[].forEach.call(h.querySelectorAll('.scdo-foot-links'),function(d){d.style.marginTop=d.style.marginTop||'2px';});}
  function ensureNav(){
    var nav=document.querySelector('header.topbar nav');if(!nav||document.getElementById('nav-verify'))return;
    var old=nav.querySelector('a[href="#/verify"]');
    var a=el('a',null,'Verify & Publish');a.id='nav-verify';a.href=VERIFY;a.title='Verify & Publish contract source code / 合约验证';
    if(old){old.style.display='none';old.parentNode.insertBefore(a,old.nextSibling);}else nav.appendChild(a);
  }
  // legacy SPA route #/verify (old shards 1-4 form): point Shard 0 users to the automatic Verify & Publish form
  function ensureLegacyNote(){
    if(!/^#\/verify(\?|$)/.test(location.hash)){var o=document.getElementById('scdo-verify-legacy-note');if(o)o.remove();return;}
    if(document.getElementById('scdo-verify-legacy-note'))return;
    var h3=[].slice.call(document.querySelectorAll('#app h3')).filter(function(h){return h.textContent.trim()==='Verify Contract Source';})[0];if(!h3)return;
    var n=el('div','margin:0 0 14px;padding:14px 16px;border:1px solid #238636;border-radius:8px;background:#0f2417;font-size:13px;color:#c9d1d9;line-height:1.6');n.id='scdo-verify-legacy-note';
    n.appendChild(el('b','color:#e6edf3','SCDO Mainnet (Shard 0, chainId 5680) contracts / Shard 0 合约'));n.appendChild(el('br'));
    n.appendChild(document.createTextNode('Use Verify & Publish: paste the source and settings, sign with a KYC-verified address, and it is compiled and compared with the on-chain code automatically. The form below is the legacy tool for archived shards 1\u20134. / 请使用"合约验证"：填写源码和编译参数，用已通过 KYC 的地址签名，系统自动编译并与链上代码比对。下方表单仅用于已归档的旧分片 1\u20134。 '));
    var b=el('a','display:inline-block;margin-top:8px;padding:8px 16px;background:#238636;color:#fff;border-radius:6px;font-weight:700;text-decoration:none','Verify & Publish \u2192');b.href=VERIFY;n.appendChild(el('br'));n.appendChild(b);
    h3.parentNode.insertBefore(n,h3.nextSibling);
  }
  // shard0 contract address page button
  var cSeq=0,cAddr=null,cState=null; // cState: 'contract' | 'eoa' | 'verified'
  function rpc(m,p){return fetch('/rpc/0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:m,params:p})}).then(function(r){return r.json();}).then(function(d){if(d.error)throw new Error(d.error.message);return d.result;});}
  function curAddr(){var m=location.hash.match(/^#\/address\?(?:.*&)?address=(0x[0-9a-fA-F]{40})/);return m?m[1].toLowerCase():null;}
  function checkContract(){
    var a=curAddr();
    if(a!==cAddr){cAddr=a;cState=null;var o=document.getElementById('scdo-verify-cta');if(o)o.remove();
      if(a){var my=++cSeq;
        Promise.all([rpc('eth_getCode',[a,'latest']),fetch('/verified/'+a+'.json',{cache:'no-cache'}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;})]).then(function(x){
          if(my!==cSeq)return;var code=x[0]||'0x';
          cState=(x[1]&&String(x[1].address).toLowerCase()===a)?'verified':((code==='0x'||code==='0x0')?'eoa':'contract');
          placeCta();
        }).catch(function(){});
      }
    } else placeCta();
  }
  function placeCta(){
    if(cState!=='contract'||!cAddr||document.getElementById('scdo-verify-cta'))return;
    var card=document.getElementById('scdo-shard0-addr');if(!card)return;
    var box=el('div','margin:14px 0 4px;padding:14px 16px;border:1px solid #1f6feb;border-radius:8px;background:#0c1d33;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap');box.id='scdo-verify-cta';
    var t=el('div','font-size:13px;color:#c9d1d9;line-height:1.55');
    t.appendChild(el('b','color:#e6edf3;font-size:14px','Contract source code not verified / 合约源码未验证'));t.appendChild(el('br'));
    t.appendChild(document.createTextNode('Have the source code? Verify and publish it automatically (a signature from a KYC-verified address is needed). / 有源码？可自动验证并公开（需已通过 KYC 的地址签名）。'));
    var b=el('a','display:inline-block;padding:10px 18px;background:#238636;color:#fff;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;white-space:nowrap','\u2713 Verify & Publish');b.href=VERIFY+'?address='+cAddr;b.id='scdo-verify-btn';
    box.appendChild(t);box.appendChild(b);
    var h3=card.querySelector('h3');if(h3&&h3.nextSibling)card.insertBefore(box,h3.nextSibling);else card.appendChild(box);
  }

  // verified-source panel (rendered by enhance.js): show how it was verified and by whom (automatic, KYC-verified submitter)
  var vvDone=null;
  function ensureVerifiedVia(){
    var p=document.getElementById('s0-verified-panel');if(!p||p.getAttribute('data-vv'))return;
    var m=location.hash.match(/address=(0x[0-9a-fA-F]{40})/);if(!m)return;var a=m[1].toLowerCase();p.setAttribute('data-vv','1');
    fetch('/verified/'+a+'.json',{cache:'no-cache'}).then(function(r){return r.ok?r.json():null;}).then(function(v){
      if(!v||!v.verifiedVia)return;var d=el('div','font-size:12px;color:#8b949e;margin:-4px 0 10px');
      var who=v.submitter&&v.submitter.address?' \u00b7 submitted by '+v.submitter.address+' (KYC-verified'+(v.submitter.kyc&&v.submitter.kyc.tier?', tier '+v.submitter.kyc.tier:'')+')':'';
      d.textContent='Verified automatically'+who+' / 自动验证'+(who?'，提交人已通过 KYC':'');
      var h=p.querySelector('h3');if(h&&h.nextSibling)p.insertBefore(d,h.nextSibling);else p.appendChild(d);
    }).catch(function(){});
  }
  function tick(){try{ensureFooter();}catch(e){}try{ensureNav();}catch(e){}try{ensureLegacyNote();}catch(e){}try{checkContract();}catch(e){}try{ensureVerifiedVia();}catch(e){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',tick);else tick();
  window.addEventListener('hashchange',function(){setTimeout(tick,50);});
  setInterval(tick,1000);
})();
