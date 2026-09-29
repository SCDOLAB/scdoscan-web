/* scdo-addnet.js - "Add SCDO to MetaMask" (shard0, EIP-3085 wallet_addEthereumChain) + small homepage hooks.
   Standalone file (2026-09-28). Does not modify enhance.js or the Vue app; only appends its own nodes. */
(function(){
  if(window.SCDO_NET&&window.SCDO_NET.__loaded)return;
  var PARAMS={
    chainId:'0x1630', // 5680
    chainName:'SCDO Mainnet (Shard 0)',
    nativeCurrency:{name:'SCDO',symbol:'SCDO',decimals:18},
    rpcUrls:['https://scdoscan.io/rpc/0'],
    blockExplorerUrls:['https://scdoscan.io'],
    iconUrls:['https://scdoscan.io/brand/scdo-shard0-icon-512.png','https://scdoscan.io/brand/scdo-shard0-icon.svg'] // shard0 icon (2026-09-29)
  };
  function provider(){
    var e=window.ethereum;if(!e)return null;
    if(e.providers&&e.providers.length){ // several injected wallets: prefer MetaMask
      for(var i=0;i<e.providers.length;i++)if(e.providers[i]&&e.providers[i].isMetaMask)return e.providers[i];
      return e.providers[0];
    }
    return e;
  }
  function isMobile(){return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent||'');}
  function mmDeepLink(){return 'https://metamask.app.link/dapp/'+location.host+'/start.html';}
  function errMsg(e){
    if(!e)return 'Unknown error';
    if(e.code===4001)return 'Request rejected in wallet.';
    if(e.code===-32002)return 'A wallet request is already pending - open your wallet.';
    return (e.message||String(e)).slice(0,200);
  }
  /* Adds (or switches to) SCDO shard0. Resolves {status:'added'|'switched', chainId}; rejects Error with .code */
  function addNetwork(){
    var eth=provider();
    if(!eth){var ne=new Error('No browser wallet detected');ne.code='NO_WALLET';return Promise.reject(ne);}
    return eth.request({method:'wallet_addEthereumChain',params:[PARAMS]}).then(function(){return 'added';},function(err){
      if(err&&err.code===4001)throw err;
      // some wallets refuse to re-add a known chain: fall back to switching
      return eth.request({method:'wallet_switchEthereumChain',params:[{chainId:PARAMS.chainId}]}).then(function(){return 'switched';},function(){throw err;});
    }).then(function(status){
      return eth.request({method:'eth_chainId'}).then(function(cid){return {status:status,chainId:cid};},function(){return {status:status,chainId:null};});
    });
  }
  function connect(){
    var eth=provider();
    if(!eth){var ne=new Error('No browser wallet detected');ne.code='NO_WALLET';return Promise.reject(ne);}
    return eth.request({method:'eth_requestAccounts'}).then(function(a){return (a&&a[0])||null;});
  }
  /* Button handler: el = button, out = status element (optional) */
  function onClick(el,out){
    function say(html,color){if(out){out.innerHTML=html;out.style.color=color||'#8b949e';}}
    if(!provider()){
      if(isMobile())say('No wallet in this browser. <a href="'+mmDeepLink()+'">Open this page in the MetaMask app</a>, or add the network manually (<a href="/start.html#params">parameters</a>).','#d29922');
      else say('No browser wallet detected. Install <a href="https://metamask.io/download/" target="_blank" rel="noopener">MetaMask</a>, reload, and click again - or add the network manually (<a href="/start.html#params">parameters</a>).','#d29922');
      return Promise.resolve(null);
    }
    if(el)el.disabled=true;
    say('Confirm in your wallet...','#8b949e');
    return addNetwork().then(function(r){
      var ok=r.chainId&&r.chainId.toLowerCase()===PARAMS.chainId;
      say(ok?'&#10003; SCDO (chain 5680) is added and selected in your wallet.':'&#10003; Network added. Select "'+PARAMS.chainName+'" in your wallet.','#3fb950');
      try{window.dispatchEvent(new CustomEvent('scdo-net-added',{detail:r}));}catch(e){}
      return r;
    }).catch(function(e){say('&#10007; '+errMsg(e).replace(/[<>&]/g,''),'#f85149');return null;})
      .then(function(r){if(el)el.disabled=false;return r;});
  }
  window.SCDO_NET={__loaded:true,params:PARAMS,provider:provider,addNetwork:addNetwork,connect:connect,onClick:onClick,deepLink:mmDeepLink};

  /* ---- homepage hooks (only on the explorer SPA: needs #scdo-hero / header.topbar) ---- */
  var CSS='#scdo-addnet-row{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:8px 10px;margin-top:12px}'+
    '.scdo-addnet-btn{display:inline-flex;align-items:center;gap:7px;background:#f6851b;color:#fff;border:0;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:700;cursor:pointer;line-height:1.2;font-family:inherit}'+
    '.scdo-addnet-btn:hover{background:#e2761b}.scdo-addnet-btn:disabled{opacity:.6;cursor:wait}'+
    '#scdo-addnet-row a.gs{font-size:13px;font-weight:600;color:#58a6ff;border:1px solid #30363d;border-radius:8px;padding:6px 12px;text-decoration:none;background:#161b22}'+
    '#scdo-addnet-row a.gs:hover{border-color:#58a6ff}'+
    '#scdo-addnet-msg{flex-basis:100%;font-size:12px;min-height:0;text-align:center}#scdo-addnet-msg:empty{display:none}#scdo-addnet-msg a{color:#58a6ff}'+
    '@media(max-width:640px){.scdo-addnet-btn,#scdo-addnet-row a.gs{font-size:12px;padding:6px 10px}}';
  var FOX='<span aria-hidden="true" style="font-size:15px;line-height:1">&#129418;</span>';
  function injectCss(){if(document.getElementById('scdo-addnet-css'))return;var s=document.createElement('style');s.id='scdo-addnet-css';s.textContent=CSS;(document.head||document.documentElement).appendChild(s);}
  function ensureHome(){
    try{
      var hero=document.getElementById('scdo-hero');
      if(hero&&!document.getElementById('scdo-addnet-row')){
        injectCss();
        var row=document.createElement('div');row.id='scdo-addnet-row';
        row.innerHTML='<button type="button" class="scdo-addnet-btn" id="scdo-addnet-btn" title="Add SCDO shard0 (chain ID 5680) to MetaMask">'+FOX+'Add SCDO to MetaMask</button>'+
          '<a class="gs" href="/start.html">Get Started &rarr;</a><div id="scdo-addnet-msg" role="status" aria-live="polite"></div>';
        hero.appendChild(row);
        document.getElementById('scdo-addnet-btn').addEventListener('click',function(){onClick(this,document.getElementById('scdo-addnet-msg'));});
      }
      var nav=document.querySelector('header.topbar nav');
      if(nav&&!document.getElementById('nav-start')){
        var a=document.createElement('a');a.id='nav-start';a.href='/start.html';a.textContent='Get Started';
        var c=document.getElementById('nav-compliance');nav.insertBefore(a,c||null);
      }
    }catch(e){}
  }
  if(document.getElementById('scdo-hero')||document.querySelector('#app')){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureHome);else ensureHome();
    setInterval(ensureHome,1500); // Vue re-renders the topbar; cheap idempotent check
  }
})();
