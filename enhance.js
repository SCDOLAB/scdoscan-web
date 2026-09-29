/**
 * scdoscan.io Etherscan-level enhancement v3
 * Features: tx EVM details, account overview, contract info,
 *           network stats bar + chart, search autocomplete
 */
(function(){
  var API = 'https://api.scdoscan.io/api/v1';
  var lastUrl = '';

  function getJSON(url){
    return fetch(url).then(function(r){return r.json();});
  }
  // old chain (shards 1-4): amounts are raw wen, 1 SCDO = 1e8 wen (was /1e9 -> 10x too small)
  if(!window.__scdoWen) window.__scdoWen = function(v,noGroup){
    /* exact old-chain amount: wen (1e-8 SCDO) -> SCDO string, trailing zeros trimmed */
    if(v&&typeof v==='object')v=v.$numberLong||v.$numberInt||v.$numberDouble||0;
    var s=String(v==null||v===''?0:v).trim();
    if(!/^-?\d+$/.test(s)){var n=Number(s);if(!isFinite(n))n=0;s=Math.round(n).toLocaleString('en-US',{useGrouping:false});}
    var neg=s.charAt(0)==='-';if(neg)s=s.slice(1);
    s=s.replace(/^0+/,'');while(s.length<9)s='0'+s;
    var ip=s.slice(0,-8),fp=s.slice(-8).replace(/0+$/,'');
    if(!noGroup)ip=ip.replace(/\B(?=(\d{3})+(?!\d))/g,',');
    return (neg&&(ip!=='0'||fp)?'-':'')+ip+(fp?'.'+fp:'');
  };
  function fmtSCDO(wen,noGroup){ return window.__scdoWen(wen,noGroup); }
  // old-chain gas price is wen per gas (node scdo_getBlockByHeight gasPrice e.g. 4), not gwei
  function fmtGasWen(v){ return Number(v||0).toLocaleString()+' wen'; }
  function fmtTime(ts){ if(!ts) return '-'; return new Date(Number(ts)*1000).toLocaleString(); }
  function short(s){ if(!s||s.length<20) return s||'-'; return s.substring(0,10)+'...'+s.substring(s.length-6); }

  var TAGS = {
    '0S0000000000000000000000000000000000000000': 'Genesis / Coinbase',
    '1S010000e5fc297bdf22a28bd56b742ee8ece043c1': 'Genesis Alloc',
    '1S01dfdbe4d921d507032cb83ee04bb7efc4fd9a51': 'Mining Pool'
  };
  function tag(addr){
    if(TAGS[addr]) return ' <span style="background:#1f6feb;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:6px">'+TAGS[addr]+'</span>';
    if(addr && addr.charAt(0)==='4') return ' <span style="background:#3fb950;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:6px">Contract</span>';
    return '';
  }

  var SELECTORS = {
    '0xa9059cbb':'ERC20: transfer(address,uint256)',
    '0x095ea7b3':'ERC20: approve(address,uint256)',
    '0x23b872dd':'ERC20: transferFrom(address,address,uint256)',
    '0x70a08231':'ERC20: balanceOf(address)',
    '0x18160ddd':'ERC20: totalSupply()',
    '0xdd62ed3e':'ERC20: allowance(address,address)',
    '0x40c10f19':'ERC20: mint(address,uint256)',
    '0x06fdde03':'ERC20: name()',
    '0x95d89b41':'ERC20: symbol()',
    '0x313ce567':'ERC20: decimals()'
  };

  // ===== TX DETAIL =====
  function enhanceTx(){
    var m = location.search.match(/txhash=(0x[a-fA-F0-9]+)/);
    if(!m) return;
    var txhash = m[1];
    var ex = document.getElementById('scdo-evm');
    if(ex && ex.getAttribute('data-tx')===txhash) return;
    if(ex) ex.remove();

    Promise.all([
      getJSON(API+'/tx?txhash='+txhash).catch(function(){return{code:1};}),
      getJSON(API+'/blockcount').catch(function(){return{data:0};})
    ]).then(function(res){
      var resp = res[0], tip = res[1].data||0;
      // Fallback to enhance API if main API fails
      if(!resp || resp.code!==0 || !resp.data){
        return getJSON('/enhance/tx?txhash='+txhash).then(function(d2){
          if(d2 && d2.code===0 && d2.data) return [d2, {data:tip}];
          return null;
        });
      }
      return [resp, {data:tip}];
    }).then(function(res2){
      if(!res2) return;
      var resp = res2[0], tip = res2[1].data||0;
      var tx = resp.data;
      var r = tx.receipt || {};
      var confirms = tx.block ? Math.max(0, tip - tx.block + 1) : 0;
      var status = r.failed ? '<span style="color:#f85149;font-weight:700">Failed (reverted)</span>'
                            : '<span style="color:#3fb950;font-weight:700">Success</span>';

      var inputHtml = '';
      if(tx.payload && tx.payload.length > 2){
        var sel = tx.payload.substring(0,10);
        var type = SELECTORS[sel] || (tx.payload==='0x' ? 'Empty' : 'Contract call');
        inputHtml = '<div style="margin-top:12px"><b style="color:#8b949e">Input Data</b>'+
          '<div style="background:#0d1117;padding:10px;border-radius:6px;margin-top:6px;font-family:monospace;font-size:12px;word-break:break-all">'+
          '<div style="color:#58a6ff;margin-bottom:4px">'+type+'</div>'+tx.payload+'</div></div>';
      }

      var logsHtml = '';
      if(r.logs && typeof r.logs==='string' && r.logs.length>4){
        try {
          var logs = JSON.parse(r.logs);
          if(Array.isArray(logs) && logs.length){
            logsHtml = '<div style="margin-top:12px"><b style="color:#8b949e">Event Logs ('+logs.length+')</b>';
            logs.forEach(function(lg,i){
              logsHtml += '<div style="background:#0d1117;padding:10px;margin:6px 0;border-radius:6px;font-family:monospace;font-size:11px;word-break:break-all">'+
                '<div style="color:#bc8cff">Log #'+i+' &middot; '+short(lg.address||'')+'</div>'+
                '<div style="margin-top:4px">Topics: '+(lg.topics||[]).join(', ')+'</div>'+
                '<div style="margin-top:4px">Data: '+(lg.data||'')+'</div></div>';
            });
            logsHtml += '</div>';
          }
        } catch(e){}
      }

      var panel = document.createElement('div');
      panel.id = 'scdo-evm';
      panel.setAttribute('data-tx', txhash);
      panel.style.cssText = 'margin:16px 0;padding:16px;background:#161b22;border:1px solid #30363d;border-radius:10px';
      panel.innerHTML =
        '<div style="font-weight:700;margin-bottom:12px">EVM Details</div>'+
        '<table style="width:100%;font-size:13px;border-collapse:collapse;color:#e6edf3">'+
          '<tr><td style="padding:4px 0;color:#8b949e;width:150px">Status</td><td>'+status+'</td></tr>'+
          '<tr><td style="padding:4px 0;color:#8b949e">Block</td><td>#'+tx.block+' &middot; Shard '+tx.shardnumber+' &middot; '+confirms+' confirmations</td></tr>'+
          '<tr><td style="padding:4px 0;color:#8b949e">Timestamp</td><td>'+fmtTime(tx.timestamp)+'</td></tr>'+
          '<tr><td style="padding:4px 0;color:#8b949e">From</td><td style="font-family:monospace;font-size:12px">'+tx.from+'</td></tr>'+
          '<tr><td style="padding:4px 0;color:#8b949e">To</td><td style="font-family:monospace;font-size:12px">'+tx.to+'</td></tr>'+
          '<tr><td style="padding:4px 0;color:#8b949e">Value</td><td>'+fmtSCDO(tx.value)+' SCDO</td></tr>'+
          '<tr><td style="padding:4px 0;color:#8b949e">Gas Used</td><td>'+Number(r.usedGas||0).toLocaleString()+'</td></tr>'+
          '<tr><td style="padding:4px 0;color:#8b949e">Gas Price</td><td>'+fmtGasWen(tx.gasprice!=null?tx.gasprice:(r.usedGas?Math.round(Number(r.totalFee||tx.fee||0)/Number(r.usedGas)):0))+'</td></tr>'+
          '<tr><td style="padding:4px 0;color:#8b949e">Tx Fee</td><td>'+fmtSCDO(r.totalFee||tx.fee||0)+' SCDO</td></tr>'+
          '<tr><td style="padding:4px 0;color:#8b949e">Nonce</td><td>'+(tx.accountNonce||'-')+'</td></tr>'+
          (r.contractaddress ? '<tr><td style="padding:4px 0;color:#8b949e">Contract Created</td><td style="font-family:monospace;font-size:12px">'+r.contractaddress+'</td></tr>' : '')+
        '</table>'+ inputHtml + logsHtml;

      var c = document.querySelector('#app') || document.body;
      c.appendChild(panel);
    }).catch(function(){});
  }

  // ===== ACCOUNT =====
  function enhanceAccount(){
    var m = location.search.match(/address=([A-Za-z0-9]+)/);
    if(!m) return;
    var addr = m[1];
    var ex = document.getElementById('scdo-acct');
    if(ex && ex.getAttribute('data-addr')===addr) return;
    if(ex) ex.remove();

    Promise.all([
      getJSON(API+'/account?address='+addr).catch(function(){return{code:1};}),
      getJSON(API+'/accountSrc20Txs?address='+addr+'&page=1&size=10').catch(function(){return{data:[]};})
    ]).then(function(res){
      var resp = res[0], src20 = res[1].data || [];
      // Fallback to enhance API
      if(!resp || resp.code!==0 || !resp.data){
        return getJSON('/enhance/account?address='+addr).then(function(d2){
          if(d2 && d2.code===0 && d2.data){
            return [{code:0,data:{
              balance:0, txcount:d2.data.txcount, percentage:0, accType:0,
              txs: (d2.data.txs||[]).map(function(t){return {
                hash:t.hash, block:t.blockHeight, inorout:1,
                value:Number(t.amount||t.value||0), failed:false
              }})
            }}, {data:[]}];
          }
          return null;
        });
      }
      return [resp, {data:src20}];
    }).then(function(res2){
      if(!res2) return;
      var resp = res2[0], src20 = res2[1].data || [];
      var a = resp.data;
      var rows = (a.txs||[]).slice(0,10).map(function(t){
        var dir = t.inorout ? '<span style="color:#58a6ff">IN</span>' : '<span style="color:#bc8cff">OUT</span>';
        var st = t.failed ? '<span style="color:#f85149">FAIL</span>' : '<span style="color:#3fb950">OK</span>';
        return '<tr style="border-bottom:1px solid #30363d">'+
          '<td style="padding:6px 8px;font-family:monospace;font-size:11px"><a href="/tx?txhash='+t.hash+'" style="color:#58a6ff">'+short(t.hash)+'</a></td>'+
          '<td style="padding:6px 8px">'+t.block+'</td>'+
          '<td style="padding:6px 8px">'+dir+'</td>'+
          '<td style="padding:6px 8px">'+fmtSCDO(t.value)+'</td>'+
          '<td style="padding:6px 8px">'+st+'</td></tr>';
      }).join('');

      var tokenRows = '';
      if(src20 && src20.length){
        tokenRows = '<div style="font-weight:600;margin:16px 0 8px">Token (SRC20) Transfers</div>'+
        '<table style="width:100%;font-size:12px;color:#e6edf3"><thead><tr style="color:#8b949e;text-align:left"><th style="padding:6px 8px">Tx</th><th>Method</th><th>From</th><th>To</th><th>Amount</th><th>Token</th></tr></thead><tbody>';
        src20.slice(0,10).forEach(function(t){
          tokenRows += '<tr style="border-bottom:1px solid #30363d">'+
            '<td style="padding:6px 8px;font-family:monospace;font-size:11px"><a href="/tx?txhash='+t.hash+'" style="color:#58a6ff">'+short(t.hash)+'</a></td>'+
            '<td style="padding:6px 8px"><span style="color:#bc8cff">'+(t.method||'-')+'</span></td>'+
            '<td style="padding:6px 8px;font-family:monospace;font-size:11px">'+short(t.from)+'</td>'+
            '<td style="padding:6px 8px;font-family:monospace;font-size:11px">'+short(t.to)+'</td>'+
            '<td style="padding:6px 8px;color:#3fb950">'+(t.actionAmount||0)+'</td>'+
            '<td style="padding:6px 8px;font-family:monospace;font-size:11px">'+short(t.contract?t.contract.address:'')+'</td></tr>';
        });
        tokenRows += '</tbody></table>';
      }

      var panel = document.createElement('div');
      panel.id = 'scdo-acct';
      panel.setAttribute('data-addr', addr);
      panel.style.cssText = 'margin:16px 0;padding:16px;background:#161b22;border:1px solid #30363d;border-radius:10px';
      panel.innerHTML =
        '<div style="font-weight:700;margin-bottom:12px">Account Overview</div>'+
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px">'+
          '<div><div style="color:#8b949e;font-size:11px">Balance</div><div style="font-size:18px;font-weight:700;color:#3fb950">'+fmtSCDO(a.balance)+'</div></div>'+
          '<div><div style="color:#8b949e;font-size:11px">Tx Count</div><div style="font-size:18px;font-weight:700">'+(a.txcount||0).toLocaleString()+'</div></div>'+
          '<div><div style="color:#8b949e;font-size:11px">% Supply</div><div style="font-size:18px;font-weight:700">'+((a.percentage||0)*100).toFixed(4)+'%</div></div>'+
          '<div><div style="color:#8b949e;font-size:11px">Type</div><div style="font-size:18px;font-weight:700">'+(a.accType===1?'Contract':'Wallet')+'</div></div>'+
        '</div>'+
        (rows ? '<div style="font-weight:600;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">Recent Transactions<button onclick="downloadCSV()" style="background:#238636;color:#fff;border:none;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px">Export CSV</button></div>'+
        '<table style="width:100%;font-size:12px;color:#e6edf3"><thead><tr style="color:#8b949e;text-align:left"><th style="padding:6px 8px">Hash</th><th>Block</th><th>Dir</th><th>Value</th><th>Status</th></tr></thead><tbody>'+rows+'</tbody></table>' : '')+
        tokenRows;

      (document.querySelector('#app')||document.body).appendChild(panel);
    }).catch(function(){});
  }

  // ===== HOME: network bar =====
  // Only creates the #scdo-netbar container; values for the selected shard are rendered by
  // window.__scdoRenderNetbar (index.html) from /api/v1/network/summary (height, avg block time,
  // pending, avg gas, blocks to Pectra). The old inline computation here produced 0 / wrong values.
  var _homeRunning=false;
  function enhanceHome(){
    if(_homeRunning) return;
    _homeRunning=true;
    if(location.pathname !== '/' && location.pathname !== '/index.html') return;
    if(document.getElementById('scdo-netbar')) return;
    var bar = document.createElement('div');
    bar.id = 'scdo-netbar';
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:20px;justify-content:center;padding:14px;margin:12px auto;max-width:1200px;background:#161b22;border:1px solid #30363d;border-radius:10px';
    bar.innerHTML = ['Shard Height','Avg Block Time','Pending','Avg Gas','To Pectra'].map(function(l){
      return '<div style="text-align:center"><div style="font-size:20px;font-weight:700;color:#e6edf3">--</div><div style="font-size:11px;color:#8b949e;text-transform:uppercase">'+l+'</div></div>';
    }).join('');
    (document.querySelector('#app')||document.body).insertBefore(bar, (document.querySelector('#app')||document.body).firstChild);
    if(typeof window.__scdoRenderNetbar==='function'){try{window.__scdoRenderNetbar();}catch(e){}}
  }

  // ===== CONTRACT =====
  function enhanceContract(){
    var m = location.search.match(/address=([A-Za-z0-9]+)/);
    if(!m || location.pathname.indexOf('/contract')<0) return;
    var addr = m[1];
    var ex = document.getElementById('scdo-contract');
    if(ex && ex.getAttribute('data-addr')===addr) return;
    if(ex) ex.remove();
    Promise.all([
      getJSON(API+'/contract?address='+addr),
      getJSON(API+'/accountSrc20Txs?address='+addr+'&page=1&size=10').catch(function(){return{data:[]};}),
      getJSON('/enhance/holders?tokenAddress='+addr+'&size=10').catch(function(){return{code:1,data:{list:[]}};})
    ]).then(function(res){
      var resp = res[0], src20 = res[1].data || [], holders = (res[2].data&&res[2].data.list)||[];
      if(!resp || resp.code!==0 || !resp.data) return;
      var c = resp.data;
      var holdersHtml = '';
      if(holders && holders.length){
        holdersHtml = '<div style="font-weight:600;margin:16px 0 8px">Token Holders ('+(res[2].data.total||holders.length)+')</div>'+
        '<table style="width:100%;font-size:12px;color:#e6edf3"><thead><tr style="color:#8b949e;text-align:left"><th style="padding:6px 8px">Rank</th><th>Holder</th><th>Balance</th><th>%</th></tr></thead><tbody>';
        var total = holders.reduce(function(s,h){return s+Number(h.balance);},0);
        holders.forEach(function(h,i){
          var pct = total>0 ? (Number(h.balance)/total*100).toFixed(2) : 0;
          holdersHtml += '<tr style="border-bottom:1px solid #30363d">'+
            '<td style="padding:6px 8px">'+(i+1)+'</td>'+
            '<td style="padding:6px 8px;font-family:monospace;font-size:11px"><a href="/accounts?address='+h.address+'" style="color:#58a6ff">'+short(h.address)+'</a></td>'+
            '<td style="padding:6px 8px;color:#3fb950">'+Number(h.balance).toLocaleString()+'</td>'+
            '<td style="padding:6px 8px">'+pct+'%</td></tr>';
        });
        holdersHtml += '</tbody></table>';
      }
      var tokenTxRows = '';
      if(src20 && src20.length){
        tokenTxRows = '<div style="font-weight:600;margin:16px 0 8px">Token Transfers ('+src20.length+')</div>'+
        '<table style="width:100%;font-size:12px;color:#e6edf3"><thead><tr style="color:#8b949e;text-align:left"><th style="padding:6px 8px">Tx</th><th>Method</th><th>From</th><th>To</th><th>Amount</th></tr></thead><tbody>';
        src20.slice(0,10).forEach(function(t){
          tokenTxRows += '<tr style="border-bottom:1px solid #30363d">'+
            '<td style="padding:6px 8px;font-family:monospace;font-size:11px"><a href="/tx?txhash='+t.hash+'" style="color:#58a6ff">'+short(t.hash)+'</a></td>'+
            '<td style="padding:6px 8px"><span style="color:#bc8cff">'+(t.method||'-')+'</span></td>'+
            '<td style="padding:6px 8px;font-family:monospace;font-size:11px">'+short(t.from)+'</td>'+
            '<td style="padding:6px 8px;font-family:monospace;font-size:11px">'+short(t.to)+'</td>'+
            '<td style="padding:6px 8px;color:#3fb950">'+(t.actionAmount||0)+'</td></tr>';
        });
        tokenTxRows += '</tbody></table>';
      }
      var panel = document.createElement('div');
      panel.id = 'scdo-contract';
      panel.setAttribute('data-addr', addr);
      panel.style.cssText = 'margin:16px 0;padding:16px;background:#161b22;border:1px solid #30363d;border-radius:10px';
      panel.innerHTML =
        '<div style="font-weight:700;margin-bottom:12px">Contract / Token Info</div>'+
        '<table style="width:100%;font-size:13px;border-collapse:collapse;color:#e6edf3">'+
          '<tr><td style="padding:4px 0;color:#8b949e;width:150px">Address</td><td style="font-family:monospace;font-size:12px">'+addr+tag(addr)+'</td></tr>'+
          '<tr><td style="padding:4px 0;color:#8b949e">Balance</td><td>'+fmtSCDO(c.balance)+' SCDO</td></tr>'+
          '<tr><td style="padding:4px 0;color:#8b949e">Tx Count</td><td>'+(c.txcount||0)+'</td></tr>'+
          '<tr><td style="padding:4px 0;color:#8b949e">Shard</td><td>'+c.shardnumber+'</td></tr>'+
        '</table>'+ holdersHtml + tokenTxRows;
      (document.querySelector('#app')||document.body).appendChild(panel);
    }).catch(function(){});
  }

  // ===== HOME: daily tx chart =====
  function loadECharts(cb){
    if(typeof echarts !== 'undefined'){ cb(); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }
  function enhanceChart(){
    if(location.pathname !== '/' && location.pathname !== '/index.html') return;
    if(document.getElementById('scdo-chart') || window.__scdoChartBusy) return;
    window.__scdoChartBusy=true; // two timers call this; without a guard two charts were appended
    loadECharts(function(){
    getJSON(API+'/Txstat').then(function(resp){
      if(!resp || resp.code!==0 || !resp.data || !resp.data.length){window.__scdoChartBusy=false;return;}
      if(document.getElementById('scdo-chart')) return;
      var data = resp.data.slice(0,14).reverse();
      var days = data.map(function(d){ return new Date(Number(d.stime)*1000).toLocaleDateString(); });
      var counts = data.map(function(d){ return d.txcount; });
      var box = document.createElement('div');
      box.id = 'scdo-chart';
      box.style.cssText = 'margin:16px auto;max-width:1200px;background:#161b22;border:1px solid #30363d;border-radius:10px;padding:16px';
      box.innerHTML = '<div style="font-weight:700;margin-bottom:12px">Daily Transactions (14d)</div><div style="height:250px"></div>';
      (document.querySelector('#app')||document.body).appendChild(box);
      var chart = echarts.init(box.lastChild);
      chart.setOption({
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: days, axisLabel: { color: '#8b949e' } },
        yAxis: { type: 'value', axisLabel: { color: '#8b949e' }, splitLine: { lineStyle: { color: '#30363d' } } },
        series: [{ data: counts, type: 'bar', itemStyle: { color: '#3fb950' } }],
        grid: { left: 60, right: 20, top: 20, bottom: 30 }
      });
    }).catch(function(){window.__scdoChartBusy=false;});
    });
  }

  // ===== SEARCH AUTOCOMPLETE =====
  function enhanceSearch(){
    if(document.getElementById('scdo-search')) return;
    var input = document.querySelector('input[type=text], input[placeholder*="earch" i], input[placeholder*="鎼滅储" i]');
    if(!input) return;
    input.id = 'scdo-search';
    input.addEventListener('input', function(){
      var q = this.value.trim();
      var drop = document.getElementById('scdo-drop');
      if(!drop){
        drop = document.createElement('div');
        drop.id = 'scdo-drop';
        drop.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:#161b22;border:1px solid #30363d;border-radius:8px;z-index:9999;max-height:300px;overflow-y:auto';
        this.parentElement.style.position = 'relative';
        this.parentElement.appendChild(drop);
      }
      if(!q){ drop.style.display='none'; return; }
      drop.style.display='block';
      if(/^0x[a-fA-F0-9]{64}$/.test(q)){
        drop.innerHTML = '<div style="padding:10px;cursor:pointer;color:#e6edf3" onmouseover="this.style.background=\'#30363d\'" onmouseout="this.style.background=\'none\'" onclick="location.href=\'/tx?txhash='+q+'\'">Transaction: '+short(q)+'</div>';
      } else if(/^\d+$/.test(q)){
        drop.innerHTML = '<div style="padding:10px;cursor:pointer;color:#e6edf3" onmouseover="this.style.background=\'#30363d\'" onmouseout="this.style.background=\'none\'" onclick="location.href=\'/block?height='+q+'\'">Block: '+q+'</div>';
      } else if(/^[1-4]S[0-9a-fA-F]{40,}$/.test(q) || /^0x[0-9a-fA-F]{40}$/.test(q)){
        drop.innerHTML = '<div style="padding:10px;cursor:pointer;color:#e6edf3" onmouseover="this.style.background=\'#30363d\'" onmouseout="this.style.background=\'none\'" onclick="location.href=\'/address?address='+q+'\'">Address: '+short(q)+'</div>';
      } else {
        drop.innerHTML = '<div style="padding:10px;color:#8b949e;font-size:12px">Enter tx hash (0x...), block number, or SCDO address</div>';
      }
    });
  }

  // ===== HOME: difficulty + hashrate chart =====
  function enhanceDifficulty(){
    if(location.pathname !== '/' && location.pathname !== '/index.html') return;
    if(document.getElementById('scdo-diff')) return;
    loadECharts(function(){
    Promise.all([
      getJSON(API+'/chart/difficulty').catch(function(){return{data:[]};}),
      getJSON(API+'/chart/hashrate').catch(function(){return{data:[]};})
    ]).then(function(res){
      var diff = (res[0].data||[]).filter(function(d){return d.ShardNumber===0;});
      var hash = (res[1].data||[]).filter(function(d){return d.ShardNumber===0;});
      if(!diff.length && !hash.length) return;
      diff = diff.slice(-30); hash = hash.slice(-30);
      var box = document.createElement('div');
      box.id = 'scdo-diff';
      box.style.cssText = 'margin:16px auto;max-width:1200px;background:#161b22;border:1px solid #30363d;border-radius:10px;padding:16px';
      box.innerHTML = '<div style="font-weight:700;margin-bottom:12px">Network Difficulty & Hashrate (30d)</div><div style="height:280px"></div>';
      (document.querySelector('#app')||document.body).appendChild(box);
      var chart = echarts.init(box.lastChild);
      var days = diff.map(function(d){ return new Date(d.TimeStamp*1000).toLocaleDateString(); });
      chart.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['Difficulty','Hashrate'], textStyle: { color: '#8b949e' } },
        xAxis: { type: 'category', data: days, axisLabel: { color: '#8b949e' } },
        yAxis: [
          { type: 'value', name: 'Diff', axisLabel: { color: '#8b949e' }, splitLine: { lineStyle: { color: '#30363d' } } },
          { type: 'value', name: 'GH/s', axisLabel: { color: '#8b949e' } }
        ],
        series: [
          { name: 'Difficulty', data: diff.map(function(d){return d.Difficulty.toFixed(0);}), type: 'line', smooth: true, itemStyle: { color: '#58a6ff' } },
          { name: 'Hashrate', yAxisIndex: 1, data: hash.map(function(d){return (d.HashRate/1000).toFixed(2);}), type: 'line', smooth: true, itemStyle: { color: '#bc8cff' } }
        ],
        grid: { left: 60, right: 60, top: 40, bottom: 30 }
      });
    });
    });
  }

  // ===== TOKENS / CONTRACTS LIST =====
  function enhanceTokens(){
    if(location.pathname.indexOf('/contract') < 0 || location.search.indexOf('address=') >= 0) return;
    if(document.getElementById('scdo-tokens')) return;
    getJSON(API+'/contracts?page=1&size=58').then(function(resp){
      if(!resp || resp.code!==0 || !resp.data) return;
      var list = resp.data.list || resp.data || [];
      if(!Array.isArray(list) || !list.length) return;
      var box = document.createElement('div');
      box.id = 'scdo-tokens';
      box.style.cssText = 'margin:16px 0;padding:16px;background:#161b22;border:1px solid #30363d;border-radius:10px';
      var rows = list.slice(0,30).map(function(c){
        return '<tr style="border-bottom:1px solid #30363d">'+
          '<td style="padding:6px 8px;font-family:monospace;font-size:11px"><a href="/contract/detail?address='+c.address+'" style="color:#58a6ff">'+short(c.address)+'</a></td>'+
          '<td style="padding:6px 8px">'+(c.txcount||0)+'</td>'+
          '<td style="padding:6px 8px">'+fmtSCDO(c.balance)+'</td>'+
          '<td style="padding:6px 8px">Shard '+(c.shardnumber||'-')+'</td></tr>';
      }).join('');
      box.innerHTML = '<div style="font-weight:700;margin-bottom:12px">Contracts / Tokens ('+list.length+' deployed)</div>'+
        '<table style="width:100%;font-size:12px;color:#e6edf3"><thead><tr style="color:#8b949e;text-align:left"><th style="padding:6px 8px">Address</th><th>Txs</th><th>Balance</th><th>Shard</th></tr></thead><tbody>'+rows+'</tbody></table>';
      (document.querySelector('#app')||document.body).appendChild(box);
    }).catch(function(){});
  }

  // ===== BLOCK DETAIL =====
  function enhanceBlock(){
    if(location.pathname.indexOf('/block')<0) return;
    var m = location.search.match(/height=(\d+)/);
    if(!m) return;
    var height = m[1];
    if(document.getElementById('scdo-block')) return;
    getJSON('/enhance/block?height='+height).then(function(resp){
      if(!resp||resp.code!==0||!resp.data) return;
      var b = resp.data;
      var txs = b.transactions || b.txs || [];
      var txRows = txs.map(function(tx){
        return '<tr style="border-bottom:1px solid #30363d">'+
          '<td style="padding:6px 8px;font-family:monospace;font-size:11px"><a href="/tx?txhash='+tx.hash+'" style="color:#58a6ff">'+short(tx.hash)+'</a></td>'+
          '<td style="padding:6px 8px;font-family:monospace;font-size:11px"><a href="/address?address='+tx.from+'" style="color:#e6edf3">'+short(tx.from)+'</a></td>'+
          '<td style="padding:6px 8px;font-family:monospace;font-size:11px"><a href="/address?address='+tx.to+'" style="color:#e6edf3">'+short(tx.to)+'</a></td>'+
          '<td style="padding:6px 8px;color:#3fb950">'+fmtSCDO(tx.amount||tx.value||0)+'</td></tr>';
      }).join('');
      var box = document.createElement('div');
      box.id = 'scdo-block';
      box.style.cssText = 'margin:16px 0;padding:16px;background:#161b22;border:1px solid #30363d;border-radius:10px';
      box.innerHTML =
        '<div style="font-weight:700;margin-bottom:12px">Block Details</div>'+
        '<table style="width:100%;font-size:13px;border-collapse:collapse;color:#e6edf3">'+
        '<tr><td style="padding:4px 0;color:#8b949e;width:150px">Height</td><td>#'+height+'</td></tr>'+
        '<tr><td style="padding:4px 0;color:#8b949e">Hash</td><td style="font-family:monospace;font-size:11px">'+(b.headHash||b.hash||'')+'</td></tr>'+
        '<tr><td style="padding:4px 0;color:#8b949e">Shard</td><td>1</td></tr>'+
        '<tr><td style="padding:4px 0;color:#8b949e">Miner</td><td style="font-family:monospace;font-size:12px"><a href="/address?address='+b.creator+'" style="color:#58a6ff">'+b.creator+'</a>'+tag(b.creator)+'</td></tr>'+
        '<tr><td style="padding:4px 0;color:#8b949e">Transactions</td><td>'+txs.length+'</td></tr>'+
        '<tr><td style="padding:4px 0;color:#8b949e">Reward</td><td>'+fmtSCDO(b.reward||300000000)+' SCDO</td></tr>'+
        '<tr><td style="padding:4px 0;color:#8b949e">Timestamp</td><td>'+fmtTime(b.timestamp)+'</td></tr>'+
        '</table>'+
        (txRows ? '<div style="margin-top:16px;font-weight:600">Transactions ('+txs.length+')</div>'+
        '<table style="width:100%;font-size:12px;color:#e6edf3;margin-top:8px"><thead><tr style="color:#8b949e;text-align:left"><th style="padding:6px 8px">Tx Hash</th><th>From</th><th>To</th><th>Value</th></tr></thead><tbody>'+txRows+'</tbody></table>' : '');
      (document.querySelector('#app')||document.body).appendChild(box);
    }).catch(function(){});
  }

  // ===== HOME: latest blocks table (with fallback) =====
  function fmtTs(ts){
    if(!ts) return '-';
    if(typeof ts === 'object') ts = ts['$numberLong'] || ts['$numberInt'] || 0;
    return new Date(Number(ts)*1000).toLocaleString();
  }
  function fmtH(h){
    if(typeof h === 'object') return h['$numberLong'] || h['$numberInt'] || h;
    return h;
  }
  // Injected "Latest Blocks - Shard N" table removed (2026-09-28): it duplicated the Vue
  // "Latest Blocks (Shard N)" table, which already follows the selected shard and has Age + SCDO units.
  function enhanceBlocks(){
    var old=document.getElementById('scdo-blocks');
    if(old&&old.parentNode)old.parentNode.removeChild(old);
  }
  window.__scdoRefreshLegacyBlocks=function(){enhanceBlocks();};


  // ===== HOME: latest transactions =====
  // 2026-09-29: follows the selected shard card. Shard 0 (live core-geth chain) lists /enhance/shard0/txs, which hides
  // the tagged 2026-09-28 load-test self-transfers by default (still queryable, see /loadtest.html). Links fixed to
  // the SPA hash routes (the old "/tx?txhash=" links returned 404).
  var _txsRunning=false, _txsShard=null;
  function txsHost(){ return document.querySelector('#app')||document.body; }
  function txsBox(title, extraHtml){
    var box = document.createElement('div');
    box.id = 'scdo-txs';
    box.style.cssText = 'margin:16px auto;max-width:1200px;background:#161b22;border:1px solid #30363d;border-radius:10px;padding:16px';
    box.innerHTML = '<div style="font-weight:700;margin-bottom:12px">'+title+'</div>'+(extraHtml||'');
    return box;
  }
  function hexOnly(v){ return String(v==null?'':v).replace(/[^0-9a-fA-Fx]/g,''); }
  function weiHexToSCDO(h){ try{ var v=BigInt(h||'0x0'), i=(v/10n**18n).toString(), f=(v%10n**18n).toString().padStart(18,'0').replace(/0+$/,''); return (f?i+'.'+f:i)+' SCDO'; }catch(e){ return '-'; } }
  function enhanceTxsShard0(){
    getJSON('/enhance/shard0/txs').then(function(d){
      if(window.__scdoShard!==0 || document.getElementById('scdo-txs')) return;
      var list = (d && d.code===0 && d.data) ? d.data.slice(0,10) : [];
      var rows = list.map(function(t){
        var hash=hexOnly(t.hash), from=hexOnly(t.from), to=hexOnly(t.to), ok=t.status==='0x1';
        return '<tr style="border-bottom:1px solid #30363d">'+
          '<td style="padding:6px 8px;font-family:monospace;font-size:11px"><a href="#/tx?txhash='+hash+'" style="color:#58a6ff">'+short(hash)+'</a>'+(ok?'':' <span style="color:#f85149">(failed)</span>')+'</td>'+
          '<td style="padding:6px 8px"><a href="#/address?address='+from+'" style="color:#e6edf3">'+short(from)+'</a></td>'+
          '<td style="padding:6px 8px">'+(to?'<a href="#/address?address='+to+'" style="color:#e6edf3">'+short(to)+'</a>':'<span style="color:#8b949e">(contract creation)</span>')+'</td>'+
          '<td style="padding:6px 8px;color:#3fb950">'+weiHexToSCDO(t.value)+'</td>'+
          '<td style="padding:6px 8px">#'+(Number(t.blockNumber)||0)+'</td>'+
          '<td style="padding:6px 8px;color:#8b949e;font-size:11px">'+(t.timestamp?new Date(Number(t.timestamp)*1000).toLocaleString():'-')+'</td></tr>';
      }).join('');
      var hidden = Number(d && d.hiddenLoadTest)||0;
      var note = hidden ? '<div id="scdo-loadtest-note" style="margin-top:10px;font-size:12px;color:#8b949e">'+hidden.toLocaleString()+
        ' load-test txs hidden (2026-09-28 TPS test, faucet self-transfers, blocks 3430–3489) · <a href="/loadtest.html" style="color:#58a6ff">see report</a> · '+
        '<a href="/enhance/shard0/txs?loadtest=1" style="color:#58a6ff">raw list incl. load test</a></div>' : '';
      var table = rows ? '<table style="width:100%;font-size:12px;color:#e6edf3"><thead><tr style="color:#8b949e;text-align:left"><th style="padding:6px 8px">Tx Hash</th><th>From</th><th>To</th><th>Value</th><th>Block</th><th>Time</th></tr></thead><tbody>'+rows+'</tbody></table>'
                       : '<div style="color:#8b949e;font-size:12px">No shard0 transactions indexed yet.</div>';
      txsHost().appendChild(txsBox('Latest Transactions · Shard 0 (live, chainId 5680)', table+note));
    }).catch(function(){}).then(function(){ _txsRunning=false; });
  }
  function enhanceTxs(){
    if(location.hash && location.hash !== '#/' && location.hash !== ''){ var o=document.getElementById('scdo-txs'); if(o) o.remove(); return; }
    var sh = (window.__scdoShard===0) ? 0 : 1;
    var cur = document.getElementById('scdo-txs');
    if(cur && _txsShard!==sh){ cur.remove(); cur=null; }
    if(cur || _txsRunning) return;
    _txsRunning=true; _txsShard=sh;
    if(sh===0) return enhanceTxsShard0();
    getJSON('/enhance/txs?size=10').then(function(d){
      if(window.__scdoShard===0 || document.getElementById('scdo-txs')) return;
      if(!d || d.code!==0 || !d.data || !d.data.list || !d.data.list.length) return;
      var rows = d.data.list.map(function(t){
        var hash = String(t.hash||'').replace(/[^0-9a-zA-Z]/g,'');
        var to = String(t.to || '').replace(/[^0-9a-zA-Z]/g,'');
        var val = fmtSCDO(t.amount || t.value || 0);
        var blk = t.blockHeight || '';
        var ts = t.timestamp || 0;
        if(typeof ts === 'object') ts = ts['$numberLong']||ts['$numberInt']||0;
        var tstr = new Date(Number(ts)*1000).toLocaleTimeString();
        return '<tr style="border-bottom:1px solid #30363d">'+
          '<td style="padding:6px 8px;font-family:monospace;font-size:11px"><a href="#/tx?txhash='+hash+'" style="color:#58a6ff">'+short(hash)+'</a></td>'+
          '<td style="padding:6px 8px"><a href="#/address?address='+to+'" style="color:#e6edf3">'+short(to)+'</a></td>'+
          '<td style="padding:6px 8px;color:#3fb950">'+val+'</td>'+
          '<td style="padding:6px 8px">#'+blk+'</td>'+
          '<td style="padding:6px 8px;color:#8b949e;font-size:11px">'+tstr+'</td></tr>';
      }).join('');
      txsHost().appendChild(txsBox('Latest Transactions',
        '<table style="width:100%;font-size:12px;color:#e6edf3"><thead><tr style="color:#8b949e;text-align:left"><th style="padding:6px 8px">Tx Hash</th><th>To</th><th>Value</th><th>Block</th><th>Time</th></tr></thead><tbody>'+rows+'</tbody></table>'));
    }).catch(function(){}).then(function(){ _txsRunning=false; });
  }
  window.addEventListener('scdo-shard-change', function(){ var c=document.getElementById('scdo-txs'); if(c) c.remove(); setTimeout(enhanceTxs, 50); });
  setInterval(function(){ try{ enhanceTxs(); }catch(e){} }, 3000);

  function downloadCSV(){
    var m = location.search.match(/address=([A-Za-z0-9]+)/);
    if(!m) return;
    getJSON(API+'/account?address='+m[1]).then(function(resp){
      if(!resp||resp.code!==0||!resp.data) return;
      var txs = resp.data.txs||[];
      var csv = 'Hash,Block,Direction,Value,Status\n';
      txs.forEach(function(t){
        csv += t.hash+','+t.block+','+(t.inorout?'IN':'OUT')+','+fmtSCDO(t.value,true)+','+(t.failed?'FAIL':'OK')+'\n';
      });
      var blob = new Blob([csv], {type:'text/csv'});
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = m[1]+'_txs.csv';
      a.click();
    });
  }



  // ===== WATCH =====
  function check(){
    var cur = location.pathname + location.search;
    if(cur === lastUrl) return;
    lastUrl = cur;
    setTimeout(enhanceTx, 800);
    setTimeout(enhanceAccount, 800);
    setTimeout(enhanceContract, 800);
    setTimeout(enhanceHome, 1200);
    setTimeout(enhanceChart, 1500);
    setTimeout(enhanceDifficulty, 2000);
    setTimeout(enhanceTokens, 1500);
    setTimeout(enhanceSearch, 1500);
    setTimeout(enhanceBlock, 1000);
    setTimeout(enhanceBlocks, 1800);
  }
  setInterval(check, 500);
  setTimeout(enhanceHome, 1500);
  setTimeout(enhanceChart, 2000);
  setTimeout(enhanceDifficulty, 2500);
  setTimeout(enhanceTokens, 2500);
  setTimeout(enhanceSearch, 2000);
  setTimeout(enhanceBlocks, 2200);
    setTimeout(enhanceTxs, 2500);
})();

// === Cross-shard Transaction Path Panel ===
(function(){
  function loadCrossShard(){
    var m=location.hash.match(/txhash=(0x[a-fA-F0-9]+)/);
    if(!m) return;
    if(document.getElementById('scdo-crossshard-body')) return;
    var txhash=m[1];
    var card=document.createElement('div');
    card.className='card';
    card.id='scdo-crossshard-card';
    card.innerHTML='<h3 style="color:#3fb950">&#x2194; Cross-Shard Transaction Path</h3><div id="scdo-crossshard-body" style="color:#8b949e;font-size:13px">Checking...</div>';
    var c=document.querySelector('.container');
    if(c)c.appendChild(card);
    fetch('/api/v1/crossshard/tx?txHash='+txhash).then(function(r){return r.json()}).then(function(d){
      var el=document.getElementById('scdo-crossshard-body');
      if(!el)return;
      if(d.code!==0||!d.data){el.textContent='Not a cross-shard transaction';return;}
      var t=d.data;
      if(!t.isCrossShard){
        el.innerHTML='<div style="padding:8px 0;color:#8b949e">This is a single-shard transaction (shard '+t.shard+').</div>';
        return;
      }
      var pathHtml='';
      if(t.path&&t.path.length>=2){
        pathHtml='<div style="display:flex;align-items:center;gap:12px;padding:12px 0;flex-wrap:wrap">';
        t.path.forEach(function(hop,i){
          var shardColor=hop.shard===0?'#3fb950':'#d29922';
          pathHtml+='<div style="background:#0d1117;border:1px solid '+shardColor+';border-radius:8px;padding:10px 14px;min-width:180px">';
          pathHtml+='<div style="font-size:11px;color:#8b949e;margin-bottom:4px">SHARD '+hop.shard+' ('+(hop.type==='source'?'SOURCE':'DESTINATION')+')</div>';
          pathHtml+='<div style="font-size:13px;color:#e6edf3;margin-bottom:4px"><strong>'+hop.amountScdo+' SCDO</strong></div>';
          pathHtml+='<div style="font-size:11px;color:#58a6ff;word-break:break-all">Block #'+hop.block+'</div>';
          pathHtml+='<div style="font-size:10px;color:#8b949e;word-break:break-all;margin-top:2px">'+hop.txHash.substring(0,18)+'...</div>';
          pathHtml+='</div>';
          if(i<t.path.length-1){
            pathHtml+='<div style="font-size:24px;color:#3fb950;font-weight:bold">&rarr;</div>';
          }
        });
        pathHtml+='</div>';
      }
      var badge=t.debtStatus==='included'
        ?'<span style="color:#3fb950;font-weight:700">&#10003; Included on target shard</span>'
        :'<span style="color:#d29922;font-weight:700">&#8987; Pending / not yet indexed</span>';
      el.innerHTML='<div style="margin-bottom:8px">'+badge+'</div>'+pathHtml;
    }).catch(function(){
      var el=document.getElementById('scdo-crossshard-body');
      if(el)el.textContent='Cross-shard info unavailable';
    });
  }
  setInterval(function(){
    try{
      if(location.hash.indexOf('txhash=')>=0 && !document.getElementById('scdo-crossshard-body')){
        loadCrossShard();
      }
    }catch(e){}
  }, 1500);
})();








// === Shard0 v9 ===
(function(){
  var RPC='/rpc/0';
  function rpc(m,p){return fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:m,params:p||[],id:1})}).then(function(r){return r.json()}).then(function(d){return d.result})}
  function h2i(h){return h?parseInt(h,16):0}
  function w2s(wei){
    if(!wei||wei==='0x0')return '0 SCDO';
    var v=BigInt(wei);
    var i=(v/1000000000000000000n).toString();
    var f=(v%1000000000000000000n).toString().padStart(18,'0').replace(/0+$/,'');
    return f? i+'.'+f+' SCDO' : i+' SCDO';
  }
  var txDone=false,addrDone=false,traceTimer=null;

  function hideTrace(){
    var t=document.getElementById('scdo-trace-body');
    if(t&&t.parentElement)t.parentElement.style.display='none';
  }

  function tryTx(){
    if(txDone)return;
    var m=location.hash.match(/txhash=(0x[a-fA-F0-9]+)/);if(!m)return;
    txDone=true;
    var txhash=m[1];
    fetch('/api/v1/tx?txhash='+txhash)
      .then(function(r){return r.ok?r.json():{code:-1}}).catch(function(){return{code:-1}})
      .then(function(d){
        if(d.code===0&&d.data)return;
        return rpc('eth_getTransactionByHash',[txhash]).then(function(tx){
          if(!tx)return;
          return rpc('eth_getTransactionReceipt',[txhash]).then(function(rcpt){
            hideTrace();
            if(traceTimer)clearInterval(traceTimer);
            traceTimer=setInterval(hideTrace,2000);
            var card=document.createElement('div');card.className='card';card.id='scdo-shard0-tx';
            card.innerHTML='<h3 style="color:#3fb950">Shard0 (EVM) Transaction</h3><div style="font-size:13px;color:#c9d1d9;line-height:2">'+
              '<div><strong>Status:</strong> '+(rcpt&&rcpt.status==='0x1'?'<span style="color:#3fb950">Success</span>':'<span style="color:#f85149">Failed</span>')+'</div>'+
              '<div><strong>Block:</strong> #'+h2i(tx.blockNumber)+'</div>'+
              '<div><strong>From:</strong> <a style="color:#58a6ff" href="#/address?address='+tx.from+'">'+tx.from+'</a></div>'+
              '<div><strong>To:</strong> '+(tx.to?'<a style="color:#58a6ff" href="#/address?address='+tx.to+'">'+tx.to+'</a>':'(contract creation)')+'</div>'+
              '<div><strong>Value:</strong> '+w2s(tx.value)+'</div>'+
              '<div><strong>Gas:</strong> '+h2i(tx.gas)+' used: '+(rcpt?h2i(rcpt.gasUsed):'?')+'</div></div>';
            var c=document.querySelector('.container');if(c)c.appendChild(card);
          });
        });
      }).catch(function(){});
  }

  function tryAddr(){
    if(addrDone)return;
    var m=location.hash.match(/address=([0-9A-Za-z]+)/);if(!m)return;
    var addr=m[1];if(addr.indexOf('0x')!==0)return;
    addrDone=true;
    Promise.all([rpc('eth_getBalance',[addr,'latest']),rpc('eth_blockNumber',[]),rpc('eth_getTransactionCount',[addr,'latest'])]).then(function(r){
      var nonce=h2i(r[2]);
      var card=document.createElement('div');card.className='card';card.id='scdo-shard0-addr';
      card.innerHTML='<h3 style="color:#3fb950">Shard0 (EVM) Account</h3><div style="font-size:13px;color:#c9d1d9;line-height:2">'+
        '<div><strong>Balance:</strong> '+w2s(r[0])+'</div>'+
        '<div><strong>Nonce (outgoing txs):</strong> '+nonce+'</div>'+
        '<div><strong>Network:</strong> Shard0 · ChainID 5680 · Block #'+h2i(r[1])+'</div>'+
        '<div style="margin-top:8px;color:#8b949e;font-size:12px">Native and token transactions indexed by scdoscan are listed below.</div>'+
        '</div>';
      var c=document.querySelector('.container');if(c)c.appendChild(card);
    }).catch(function(){});
  }

  window.addEventListener('hashchange',function(){
    txDone=false;addrDone=false;
    if(traceTimer){clearInterval(traceTimer);traceTimer=null;}
  });
  setInterval(function(){try{
    if(location.hash.indexOf('txhash=')>=0&&!txDone)tryTx();
    if(location.hash.indexOf('address=')>=0&&!addrDone)tryAddr();
  }catch(e){}},2000);
})();

// === Shard0 Address Tx List (Doubao, reviewed by Grok Bot 20260928p) ===
(function(){
  function getAddr(){ var m = location.hash.match(/address=(0x[0-9a-fA-F]{40})/); return m ? m[1] : null; }
  function esc(s){ return String(s==null?'':s).replace(/[^0-9a-zA-Zx.]/g,''); }
  function weiToStr(weiHex){
    try { var v = BigInt(weiHex); var i = (v / 10n**18n).toString();
      var f = (v % 10n**18n).toString().padStart(18,'0').replace(/0+$/,''); return f ? i + '.' + f : i;
    } catch(e){ return esc(weiHex); }
  }
  function fmtTime(ts){ return new Date(ts*1000).toLocaleString(); }
  var showLoadTest = false;   // 2026-09-29: load-test txs (tag "loadtest") hidden by default, toggle below the table
  function loadTxs(){
    var old = document.getElementById('s0-txlist'); if(old) old.remove();
    var addr = getAddr(); if(!addr) return;
    fetch('/enhance/shard0/address_txs?addr='+addr+(showLoadTest?'&loadtest=1':''))
      .then(function(r){ return r.ok ? r.json() : {data:[]}; })
      .then(function(d){
        var hidden = Number(d.hiddenLoadTest)||0;
        if(!d.data || (!d.data.length && !hidden) || getAddr()!==addr) return;
        if(document.getElementById('s0-txlist')) return;
        var panel = document.createElement('div'); panel.id='s0-txlist';
        panel.style.cssText='margin:20px 0;padding:16px;background:#1a1d2e;border-radius:8px;border:1px solid #2a2d3e;overflow-x:auto';
        var h='<h3 style="margin:0 0 12px;color:#e0e0e0;font-size:16px">Shard0 Transactions ('+d.data.length+')</h3>';
        h+='<table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="color:#888;text-align:left"><th style="padding:6px">Tx Hash</th><th>Block</th><th>From</th><th>To</th><th>Value</th><th>Time</th></tr>';
        d.data.forEach(function(tx){
          var hash=esc(tx.hash), from=esc(tx.from), to=esc(tx.to);
          h+='<tr style="border-top:1px solid #2a2d3e">';
          h+='<td style="padding:6px"><a href="#/tx?txhash='+hash+'" style="color:#4a9eff">'+hash.substring(0,18)+'...</a>'+(tx.tag==='loadtest'?' <span title="2026-09-28 TPS load test" style="padding:1px 6px;background:#6e40c9;color:#fff;border-radius:3px;font-size:11px">Load test</span>':'')+'</td>';
          h+='<td style="padding:6px;color:#aaa">'+esc(tx.blockNumber)+'</td>';
          h+='<td style="padding:6px"><a href="#/address?address='+from+'" style="color:#aaa">'+from.substring(0,10)+'...</a></td>';
          h+='<td style="padding:6px">'+(to?'<a href="#/address?address='+to+'" style="color:#aaa">'+to.substring(0,10)+'...</a>':'<span style="color:#aaa">Contract</span>')+'</td>';
          h+='<td style="padding:6px;color:#4caf50">'+weiToStr(tx.value)+' SCDO</td>';
          h+='<td style="padding:6px;color:#888">'+fmtTime(tx.timestamp)+'</td></tr>';
        });
        h+='</table>';
        if(hidden) h+='<div style="margin-top:10px;font-size:12px;color:#8b949e">'+hidden.toLocaleString()+' load-test txs hidden (2026-09-28 TPS test, blocks 3430–3489) · <a href="/loadtest.html" style="color:#4a9eff">see report</a> · <a href="javascript:void 0" id="s0-lt-toggle" style="color:#4a9eff">show them</a></div>';
        else if(showLoadTest) h+='<div style="margin-top:10px;font-size:12px;color:#8b949e">Showing load-test txs (latest 50) · <a href="javascript:void 0" id="s0-lt-toggle" style="color:#4a9eff">hide them</a></div>';
        panel.innerHTML=h;
        var tg=panel.querySelector('#s0-lt-toggle'); if(tg) tg.addEventListener('click', function(){ showLoadTest=!showLoadTest; loadTxs(); });
        (document.querySelector('main') || document.querySelector('.container') || document.body).appendChild(panel);
      }).catch(function(){});
  }
  setTimeout(loadTxs, 2000);
  window.addEventListener('hashchange', function(){ showLoadTest=false; setTimeout(loadTxs, 1500); });
})();

// === Shard0 EVM Token Events (Doubao v2, reviewed/fixed by Grok Bot 20260929) ===
// Tx page: token events of the tx (/enhance/shard0/token_txs?hash=). Address page: token transfers
// touching the address or emitted by the contract (?addr= / ?contract=), plus label badge from /labels.json.
(function(){
  function tokenVal(v, dec){
    try { dec = (dec==null||isNaN(dec)) ? 18 : Number(dec); var x = BigInt(v), d = 10n ** BigInt(dec);
      var i = (x / d).toString(), f = dec ? (x % d).toString().padStart(dec,'0').replace(/0+$/,'') : '';
      i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return f ? i + '.' + f : i;
    } catch(e){ return '?'; }
  }
  function safe(v){ var d=document.createElement('div'); d.textContent=(v==null?'':String(v)); return d.innerHTML; }
  function hx(v){ return String(v==null?'':v).replace(/[^0-9a-fA-Fx]/g,''); }
  function alink(a){ a=hx(a); if(!a) return '-'; return '<a href="#/address?address='+a+'" style="color:#58a6ff">'+a.substring(0,10)+'…'+a.substring(38)+'</a>'; }
  var ZERO='0x0000000000000000000000000000000000000000';
  var EVCOL={Transfer:'#4a9eff',Mint:'#3fb950',Burn:'#f0883e',Frozen:'#f85149',Unfrozen:'#a371f7'};
  function row(ev, showTx){
    var sym = safe(ev.symbol || ''), h = '<tr style="border-top:1px solid #2a2d3e">';
    if(showTx) h += '<td style="padding:6px"><a href="#/tx?txhash='+hx(ev.hash)+'" style="color:#58a6ff">'+hx(ev.hash).substring(0,14)+'…</a></td><td style="padding:6px;color:#aaa">'+(Number(ev.blockNumber)||0)+'</td>';
    h += '<td style="padding:6px;color:'+(EVCOL[ev.event]||'#ccc')+'">'+safe(ev.event)+'</td>';
    h += '<td style="padding:6px">'+alink(ev.contract)+(sym?' <span style="color:#8b949e">'+sym+'</span>':'')+'</td>';
    if(ev.event==='Transfer') h += '<td style="padding:6px">'+(ev.from===ZERO?'<span style="color:#8b949e">(mint)</span>':alink(ev.from))+' → '+(ev.to===ZERO?'<span style="color:#8b949e">(burn)</span>':alink(ev.to))+'</td>';
    else h += '<td style="padding:6px">'+alink(ev.account)+'</td>';
    h += '<td style="padding:6px;color:#4caf50;text-align:right">'+(ev.value!=null?safe(tokenVal(ev.value, ev.decimals))+' '+sym:'')+'</td></tr>';
    return h;
  }
  function panel(id, title, evs, showTx){
    var old=document.getElementById(id); if(old) old.remove();
    if(!evs || !evs.length) return;
    var p=document.createElement('div'); p.id=id;
    p.style.cssText='margin:20px 0;padding:16px;background:#1a1d2e;border-radius:8px;border:1px solid #2a2d3e;overflow-x:auto';
    var h='<h3 style="margin:0 0 12px;color:#e0e0e0;font-size:16px">'+safe(title)+' ('+evs.length+')</h3><table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="color:#888;text-align:left">'+
      (showTx?'<th style="padding:6px">Tx</th><th>Block</th>':'')+'<th style="padding:6px">Event</th><th>Token</th><th>From → To / Account</th><th style="text-align:right">Amount</th></tr>';
    evs.forEach(function(ev){ h+=row(ev, showTx); });
    p.innerHTML=h+'</table>';
    (document.querySelector('main') || document.querySelector('.container') || document.body).appendChild(p);
  }
  function getJ(u){ return fetch(u).then(function(r){ return r.ok ? r.json() : {data:[]}; }).catch(function(){ return {data:[]}; }); }
  function loadTx(){
    var m = location.hash.match(/txhash=(0x[0-9a-fA-F]{64})/);
    var old=document.getElementById('s0-token-events'); if(old) old.remove();
    if(!m) return; var t=m[1].toLowerCase();
    getJ('/enhance/shard0/token_txs?hash='+t).then(function(d){ if(location.hash.toLowerCase().indexOf(t)<0) return; panel('s0-token-events','Shard0 Token Events', d.data, false); });
  }
  function loadAddr(){
    var m = location.hash.match(/address=(0x[0-9a-fA-F]{40})/);
    var old=document.getElementById('s0-token-txs'); if(old) old.remove();
    if(!m) return; var a=m[1].toLowerCase();
    Promise.all([getJ('/enhance/shard0/token_txs?addr='+a), getJ('/enhance/shard0/token_txs?contract='+a)]).then(function(r){
      if(location.hash.toLowerCase().indexOf(a)<0) return;
      var seen={}, all=[];
      (r[0].data||[]).concat(r[1].data||[]).forEach(function(e){ var k=e.hash+':'+e.logIndex; if(!seen[k]){ seen[k]=1; all.push(e); } });
      all.sort(function(x,y){ return (y.blockNumber-x.blockNumber)||(x.logIndex-y.logIndex); });
      panel('s0-token-txs','Shard0 Token Transfers & Events', all.slice(0,100), true);
    });
  }
  function loadLabel(){
    document.querySelectorAll('.scdo-label-badge').forEach(function(b){ b.remove(); });
    var m = location.hash.match(/address=(0x[0-9a-fA-F]{40})/); if(!m) return; var a=m[1].toLowerCase();
    getJ('/labels.json').then(function(d){
      var info=(d.labels||{})[a]; if(!info||!info.label) return;
      var card=document.getElementById('scdo-shard0-addr'); var h=card&&card.querySelector('h3');
      var b=document.createElement('span'); b.className='scdo-label-badge'; b.textContent=info.label; if(info.note) b.title=info.note;
      b.style.cssText='margin-left:8px;padding:2px 10px;background:#e65100;color:#fff;border-radius:3px;font-size:12px;vertical-align:middle';
      if(h) h.appendChild(b);
    });
  }
  function run(){ loadTx(); loadAddr(); setTimeout(loadLabel, 2500); }
  setTimeout(run, 2000);
  window.addEventListener('hashchange', function(){ setTimeout(run, 1500); });
})();

// === Shard0 Contract Read/Write + Token Holders (Doubao v3 idea, rewritten by Grok Bot 20260929) ===
// Known shard0 contracts only. Reads: eth_call via /rpc/0 (no wallet needed). Writes: only on an explicit
// button click, signed and sent by the user's own MetaMask (chainId 0x1630); nothing is ever sent automatically.
(function(){
  var KNOWN_CONTRACTS = {"0xb042c1833687d05cba414f04ec4013744ddeadcc":{"name":"SCDOTestUSD","symbol":"tUSDT","decimals":6,"fns":[{"n":"acceptOwnership","s":"0x79ba5097","m":"nonpayable","i":[],"o":[]},{"n":"allowance","s":"0xdd62ed3e","m":"view","i":[["address","arg0"],["address","arg1"]],"o":["uint256"]},{"n":"approve","s":"0x095ea7b3","m":"nonpayable","i":[["address","spender"],["uint256","value"]],"o":["bool"]},{"n":"balanceOf","s":"0x70a08231","m":"view","i":[["address","arg0"]],"o":["uint256"]},{"n":"burn","s":"0xbcf64e05","m":"nonpayable","i":[["uint256","value"],["bytes32","ref"]],"o":[]},{"n":"burnFrom","s":"0x95b809bd","m":"nonpayable","i":[["address","from"],["uint256","value"],["bytes32","ref"]],"o":[]},{"n":"decimals","s":"0x313ce567","m":"view","i":[],"o":["uint8"]},{"n":"disclaimer","s":"0x4214f62a","m":"view","i":[],"o":["string"]},{"n":"freeze","s":"0x4a12e253","m":"nonpayable","i":[["address","account"],["bytes32","ref"]],"o":[]},{"n":"isFrozen","s":"0xe5839836","m":"view","i":[["address","arg0"]],"o":["bool"]},{"n":"mint","s":"0x1e458bee","m":"nonpayable","i":[["address","to"],["uint256","value"],["bytes32","ref"]],"o":[]},{"n":"name","s":"0x06fdde03","m":"view","i":[],"o":["string"]},{"n":"owner","s":"0x8da5cb5b","m":"view","i":[],"o":["address"]},{"n":"pause","s":"0x8456cb59","m":"nonpayable","i":[],"o":[]},{"n":"paused","s":"0x5c975abb","m":"view","i":[],"o":["bool"]},{"n":"pendingOwner","s":"0xe30c3978","m":"view","i":[],"o":["address"]},{"n":"symbol","s":"0x95d89b41","m":"view","i":[],"o":["string"]},{"n":"totalSupply","s":"0x18160ddd","m":"view","i":[],"o":["uint256"]},{"n":"transfer","s":"0xa9059cbb","m":"nonpayable","i":[["address","to"],["uint256","value"]],"o":["bool"]},{"n":"transferFrom","s":"0x23b872dd","m":"nonpayable","i":[["address","from"],["address","to"],["uint256","value"]],"o":["bool"]},{"n":"transferOwnership","s":"0xf2fde38b","m":"nonpayable","i":[["address","newOwner"]],"o":[]},{"n":"unfreeze","s":"0x84ebcb41","m":"nonpayable","i":[["address","account"],["bytes32","ref"]],"o":[]},{"n":"unpause","s":"0x3f4ba83a","m":"nonpayable","i":[],"o":[]}]},"0x13c22e6944eeeca58768dcaaa03dd485fb8c9ad0":{"name":"SCDOTestAUD","symbol":"tAUD","decimals":2,"fns":[{"n":"acceptOwnership","s":"0x79ba5097","m":"nonpayable","i":[],"o":[]},{"n":"allowance","s":"0xdd62ed3e","m":"view","i":[["address","arg0"],["address","arg1"]],"o":["uint256"]},{"n":"approve","s":"0x095ea7b3","m":"nonpayable","i":[["address","spender"],["uint256","value"]],"o":["bool"]},{"n":"balanceOf","s":"0x70a08231","m":"view","i":[["address","arg0"]],"o":["uint256"]},{"n":"burn","s":"0xbcf64e05","m":"nonpayable","i":[["uint256","value"],["bytes32","ref"]],"o":[]},{"n":"burnFrom","s":"0x95b809bd","m":"nonpayable","i":[["address","from"],["uint256","value"],["bytes32","ref"]],"o":[]},{"n":"decimals","s":"0x313ce567","m":"view","i":[],"o":["uint8"]},{"n":"disclaimer","s":"0x4214f62a","m":"view","i":[],"o":["string"]},{"n":"mint","s":"0x1e458bee","m":"nonpayable","i":[["address","to"],["uint256","value"],["bytes32","ref"]],"o":[]},{"n":"name","s":"0x06fdde03","m":"view","i":[],"o":["string"]},{"n":"owner","s":"0x8da5cb5b","m":"view","i":[],"o":["address"]},{"n":"pause","s":"0x8456cb59","m":"nonpayable","i":[],"o":[]},{"n":"paused","s":"0x5c975abb","m":"view","i":[],"o":["bool"]},{"n":"pendingOwner","s":"0xe30c3978","m":"view","i":[],"o":["address"]},{"n":"symbol","s":"0x95d89b41","m":"view","i":[],"o":["string"]},{"n":"totalSupply","s":"0x18160ddd","m":"view","i":[],"o":["uint256"]},{"n":"transfer","s":"0xa9059cbb","m":"nonpayable","i":[["address","to"],["uint256","value"]],"o":["bool"]},{"n":"transferFrom","s":"0x23b872dd","m":"nonpayable","i":[["address","from"],["address","to"],["uint256","value"]],"o":["bool"]},{"n":"transferOwnership","s":"0xf2fde38b","m":"nonpayable","i":[["address","newOwner"]],"o":[]},{"n":"unpause","s":"0x3f4ba83a","m":"nonpayable","i":[],"o":[]}]}};
  var CHAIN_HEX = '0x1630';
  function el(tag, css, text){ var e=document.createElement(tag); if(css) e.style.cssText=css; if(text!=null) e.textContent=text; return e; }
  function rpc(m,p){ return fetch('/rpc/0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:m,params:p})}).then(function(r){return r.json();}).then(function(d){ if(d.error) throw new Error(d.error.message||'rpc error'); return d.result; }); }
  function pad(h){ return h.padStart(64,'0'); }
  function encArg(t, v){
    v=String(v==null?'':v).trim();
    if(t==='address'){ if(!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error('invalid address: '+v); return pad(v.slice(2).toLowerCase()); }
    if(/^uint\d*$/.test(t)){ if(!/^\d+$/.test(v)) throw new Error('uint must be a whole number (raw units): '+v); var b=BigInt(v); if(b>=(1n<<256n)) throw new Error('uint too large'); return pad(b.toString(16)); }
    if(t==='bool'){ return pad(v==='true'||v==='1'?'1':'0'); }
    if(t==='bytes32'){
      if(/^0x[0-9a-fA-F]{64}$/.test(v)) return v.slice(2).toLowerCase();
      var bytes=new TextEncoder().encode(v); if(bytes.length>32) throw new Error('bytes32 text longer than 32 bytes');
      var h=''; bytes.forEach(function(x){ h+=x.toString(16).padStart(2,'0'); }); return h.padEnd(64,'0');
    }
    throw new Error('unsupported type '+t);
  }
  function encode(fn, vals){ var d=fn.s; fn.i.forEach(function(inp,k){ d+=encArg(inp[0], vals[k]); }); return d; }
  function fmtUnits(b, dec){ var d=10n**BigInt(dec), i=(b/d).toString().replace(/\B(?=(\d{3})+(?!\d))/g,','), f=dec?(b%d).toString().padStart(dec,'0').replace(/0+$/,''):''; return f?i+'.'+f:i; }
  function decode(types, hex, c, fnName){
    var h=(hex||'0x').slice(2); if(!h) return '(empty)';
    return types.map(function(t,k){
      var w=h.substr(k*64,64);
      if(t==='string'){ var off=parseInt(w,16)*2, len=parseInt(h.substr(off,64),16), s=h.substr(off+64,len*2), a=new Uint8Array(len); for(var j=0;j<len;j++) a[j]=parseInt(s.substr(j*2,2),16); return new TextDecoder().decode(a); }
      if(t==='address') return '0x'+w.slice(24);
      if(t==='bool') return BigInt('0x'+w)!==0n ? 'true' : 'false';
      if(/^uint/.test(t)){ var b=BigInt('0x'+w); return (/^(balanceOf|totalSupply|allowance)$/.test(fnName)) ? b.toString()+'  ('+fmtUnits(b,c.decimals)+' '+c.symbol+')' : b.toString(); }
      return '0x'+w;
    }).join(', ');
  }
  function ensureWallet(){
    if(!window.ethereum) return Promise.reject(new Error('No browser wallet found. Install MetaMask to use write functions.'));
    var acct;
    return window.ethereum.request({method:'eth_requestAccounts'}).then(function(a){ acct=a&&a[0]; if(!acct) throw new Error('no account'); return window.ethereum.request({method:'eth_chainId'}); })
    .then(function(cid){ if(String(cid).toLowerCase()===CHAIN_HEX) return;
      return window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN_HEX}]}).catch(function(e){
        if(e&&(e.code===4902||(e.data&&e.data.originalError&&e.data.originalError.code===4902)))
          return window.ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:CHAIN_HEX,chainName:'SCDO Shard0',nativeCurrency:{name:'SCDO',symbol:'SCDO',decimals:18},rpcUrls:['https://scdoscan.io/rpc/0'],blockExplorerUrls:['https://scdoscan.io/'],iconUrls:['https://scdoscan.io/brand/scdo-shard0-icon-512.png','https://scdoscan.io/brand/scdo-shard0-icon.svg']}]});
        throw e; }); })
    .then(function(){ return acct; });
  }
  function fnBox(c, addr, fn, isWrite){
    var box=el('div','margin:8px 0;padding:10px;background:#12152a;border-radius:4px');
    box.appendChild(el('div','color:'+(isWrite?'#ff9800':'#4a9eff')+';font-size:13px;margin-bottom:6px;font-family:monospace', fn.n+'('+fn.i.map(function(x){return x[0]+' '+x[1];}).join(', ')+')'+(fn.o.length?' → '+fn.o.join(', '):'')));
    var inputs=fn.i.map(function(inp){
      var ph=inp[0]+' '+inp[1]+(/^uint/.test(inp[0])?' (raw units, '+c.decimals+' decimals)':'')+(inp[0]==='bytes32'?' (0x…64 hex or short text)':'');
      var x=el('input','width:100%;box-sizing:border-box;margin:3px 0;padding:6px;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;font-size:12px'); x.placeholder=ph; box.appendChild(x); return x; });
    var out=el('div','color:#4caf50;font-size:12px;margin-top:6px;word-break:break-all;font-family:monospace');
    function run(){
      out.style.color='#4caf50'; out.textContent='…';
      var data; try{ data=encode(fn, inputs.map(function(x){return x.value;})); }catch(e){ out.style.color='#f85149'; out.textContent=e.message; return; }
      if(!isWrite){ rpc('eth_call',[{to:addr,data:data},'latest']).then(function(r){ out.textContent='→ '+decode(fn.o,r,c,fn.n); }).catch(function(e){ out.style.color='#f85149'; out.textContent='reverted / error: '+e.message; }); return; }
      ensureWallet().then(function(from){ out.textContent='Confirm the transaction in your wallet…';
        return window.ethereum.request({method:'eth_sendTransaction',params:[{from:from,to:addr,data:data}]}); })
      .then(function(h){ out.textContent=''; out.appendChild(document.createTextNode('Sent: ')); var a=el('a','color:#58a6ff',String(h)); a.href='#/tx?txhash='+String(h).replace(/[^0-9a-fA-Fx]/g,''); out.appendChild(a); })
      .catch(function(e){ out.style.color='#f85149'; out.textContent=(e&&e.message)||String(e); });
    }
    if(!isWrite && !fn.i.length){ run(); }
    else { var b=el('button','margin-top:4px;padding:5px 14px;background:'+(isWrite?'#9a4d00':'#1f6feb')+';color:#fff;border:0;border-radius:4px;cursor:pointer;font-size:12px', isWrite?'Write (MetaMask)':'Query'); b.type='button'; b.addEventListener('click', run); box.appendChild(b); }
    box.appendChild(out); return box;
  }
  function holders(c, addr, host){
    fetch('/enhance/shard0/token_holders?contract='+addr).then(function(r){return r.ok?r.json():{data:[]};}).catch(function(){return {data:[]};}).then(function(d){
      var list=(d&&d.data)||[]; var sec=el('div','margin-bottom:14px');
      sec.appendChild(el('div','color:#e0e0e0;font-size:14px;font-weight:600;margin:4px 0 8px','Token Holders ('+list.length+')'+(d.totalSupply!=null?' · totalSupply '+fmtUnits(BigInt(d.totalSupply),c.decimals)+' '+c.symbol:'')));
      if(!list.length){ sec.appendChild(el('div','color:#8b949e;font-size:12px','No holders with a non-zero balance (all demo tokens were burned at the end of the demos).')); }
      list.forEach(function(h){ var row=el('div','font-size:12px;padding:3px 0;border-top:1px solid #2a2d3e;font-family:monospace');
        var a=el('a','color:#58a6ff',String(h.address)); a.href='#/address?address='+String(h.address).replace(/[^0-9a-fA-Fx]/g,''); row.appendChild(a);
        row.appendChild(document.createTextNode('  '+fmtUnits(BigInt(h.balance),c.decimals)+' '+c.symbol)); sec.appendChild(row); });
      host.insertBefore(sec, host.children[1]||null);
    });
  }
  function load(){
    var old=document.getElementById('s0-contract-panel'); if(old) old.remove();
    var m=location.hash.match(/address=(0x[0-9a-fA-F]{40})/); if(!m) return;
    var addr=m[1].toLowerCase(), c=KNOWN_CONTRACTS[addr];
    if(!c){   // 2026-09-29: any contract verified via /verified/<addr>.json gets the same read/write panel
      fetch('/verified/'+addr+'.json').then(function(r){ return r.ok?r.json():null; }).catch(function(){ return null; }).then(function(v){
        if(!v||!v.panel||!v.panel.fns||(location.hash.toLowerCase().indexOf(addr)<0)||document.getElementById('s0-contract-panel')) return;
        KNOWN_CONTRACTS[addr]=v.panel; load();
      });
      return;
    }
    var p=el('div','margin:20px 0;padding:16px;background:#1a1d2e;border-radius:8px;border:1px solid #2a2d3e'); p.id='s0-contract-panel';
    p.appendChild(el('h3','margin:0 0 12px;color:#e0e0e0;font-size:16px','Contract · '+c.name+(c.symbol?' ('+c.symbol+', '+c.decimals+' decimals)':'')+(c.fns.some(function(f){return f.n==='disclaimer';})?' · TEST ONLY - NO VALUE':'')));
    if(c.symbol) holders(c, addr, p);
    var rd=el('details','margin:8px 0'); rd.open=true; rd.appendChild(el('summary','color:#8b949e;cursor:pointer;font-size:13px','Read contract'));
    c.fns.filter(function(f){return f.m==='view'||f.m==='pure';}).forEach(function(f){ rd.appendChild(fnBox(c,addr,f,false)); });
    var wr=el('details','margin:8px 0'); wr.appendChild(el('summary','color:#8b949e;cursor:pointer;font-size:13px','Write contract (your MetaMask signs; owner-only functions revert for other accounts)'));
    c.fns.filter(function(f){return f.m!=='view'&&f.m!=='pure';}).forEach(function(f){ wr.appendChild(fnBox(c,addr,f,true)); });
    p.appendChild(rd); p.appendChild(wr);
    (document.querySelector('main')||document.querySelector('.container')||document.body).appendChild(p);
  }
  setTimeout(load, 2200);
  window.addEventListener('hashchange', function(){ setTimeout(load, 1600); });
})();

// === Shard0 Verified Contract Source (Grok Bot 20260929) ===
// Address page: if /verified/<addr>.json exists (published by verify_contract.py after an exact eth_getCode match),
// show a "Contract: Verified" badge + source code, compiler settings and ABI. The browser also re-checks live that
// sha256(eth_getCode) still equals the published codeSha256. Everything is rendered with textContent (no innerHTML).
(function(){
  function el(tag, css, text){ var e=document.createElement(tag); if(css) e.style.cssText=css; if(text!=null) e.textContent=text; return e; }
  function hx(v){ return String(v==null?'':v).replace(/[^0-9a-fA-Fx]/g,''); }
  function badge(txt, bg, title){ var b=el('span','margin-left:8px;padding:2px 10px;background:'+bg+';color:#fff;border-radius:3px;font-size:12px;vertical-align:middle;font-weight:600',txt); b.className='s0-verified-badge'; if(title) b.title=title; return b; }
  function sha256hex(hex){
    var h=hex.replace(/^0x/,''), a=new Uint8Array(h.length/2); for(var i=0;i<a.length;i++) a[i]=parseInt(h.substr(i*2,2),16);
    return crypto.subtle.digest('SHA-256', a).then(function(d){ return Array.prototype.map.call(new Uint8Array(d), function(x){ return x.toString(16).padStart(2,'0'); }).join(''); });
  }
  function rpc(m,p){ return fetch('/rpc/0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:m,params:p})}).then(function(r){return r.json();}).then(function(d){ if(d.error) throw new Error(d.error.message); return d.result; }); }
  function copyBtn(getText){ var b=el('button','margin:6px 0;padding:3px 10px;background:#21262d;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;cursor:pointer;font-size:11px','Copy'); b.type='button';
    b.addEventListener('click', function(){ try{ navigator.clipboard.writeText(getText()).then(function(){ b.textContent='Copied'; setTimeout(function(){ b.textContent='Copy'; },1500); }); }catch(e){} }); return b; }
  function pre(text, maxh){ var p=el('pre','margin:0;padding:10px;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;font-size:12px;line-height:1.45;overflow:auto;max-height:'+(maxh||520)+'px;white-space:pre;font-family:ui-monospace,SFMono-Regular,Menlo,monospace', text); return p; }
  function section(title, open){ var d=el('details','margin:10px 0'); d.open=!!open; d.appendChild(el('summary','color:#8b949e;cursor:pointer;font-size:13px;font-weight:600',title)); return d; }
  function render(v, addr){
    var old=document.getElementById('s0-verified-panel'); if(old) old.remove();
    var p=el('div','margin:20px 0;padding:16px;background:#1a1d2e;border-radius:8px;border:1px solid #238636'); p.id='s0-verified-panel';
    var h=el('h3','margin:0 0 12px;color:#e0e0e0;font-size:16px','Contract Source Code'); h.appendChild(badge('\u2713 Contract: Verified','#238636','Exact bytecode match ('+v.match+')')); p.appendChild(h);
    var live=el('div','font-size:12px;color:#8b949e;margin:-4px 0 10px','Checking on-chain bytecode live…'); p.appendChild(live);
    var grid=el('div','display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;font-size:13px;color:#c9d1d9;margin-bottom:6px');
    function kv(k, val, link){ grid.appendChild(el('div','color:#8b949e',k)); var d=el('div','word-break:break-all'); if(link){ var a=el('a','color:#58a6ff',val); a.href=link; d.appendChild(a); } else d.textContent=val; grid.appendChild(d); }
    kv('Contract name', v.contractName+'  ('+v.sourceFile+')');
    kv('Compiler', v.compilerVersion||v.compiler);
    kv('Optimizer', v.optimizer&&v.optimizer.enabled ? 'enabled, '+v.optimizer.runs+' runs' : 'disabled');
    kv('EVM version', v.evmVersion);
    kv('License', v.license||'-');
    kv('Match', v.match==='full' ? 'Full match: compiled runtime bytecode = eth_getCode byte-for-byte (incl. metadata hash)' : 'Partial match (metadata hash differs)');
    kv('Code size / sha256', v.codeBytes+' bytes · '+v.codeSha256);
    if(v.creationTx) kv('Creation tx', v.creationTx+'  (block '+v.creationBlock+')', '#/tx?txhash='+hx(v.creationTx));
    if(v.deployer) kv('Deployer', v.deployer, '#/address?address='+hx(v.deployer));
    kv('Constructor args', (v.constructorArgs&&v.constructorArgs!=='0x')?v.constructorArgs:'none');
    kv('Verified', v.verifiedAt+' (block '+v.verifiedAtBlock+')');
    p.appendChild(grid);
    var src=section('Source code · '+v.sourceFile+' ('+String(v.source||'').split('\n').length+' lines)', true); src.appendChild(copyBtn(function(){ return v.source; })); src.appendChild(pre(v.source)); p.appendChild(src);
    var abiTxt=JSON.stringify(v.abi,null,1);
    var abi=section('Contract ABI ('+(v.abi||[]).length+' entries)', false); abi.appendChild(copyBtn(function(){ return JSON.stringify(v.abi); })); abi.appendChild(pre(abiTxt, 360)); p.appendChild(abi);
    var cs=section('Compiler settings (solc standard-JSON)', false); cs.appendChild(pre(JSON.stringify(v.compilerSettings,null,2), 200)); p.appendChild(cs);
    var dl=el('div','font-size:12px;color:#8b949e;margin-top:8px'); dl.appendChild(document.createTextNode('Downloads: '));
    [['standard-JSON input', v.standardJsonInput], ['verification record (JSON)', '/verified/'+addr+'.json'], ['how contracts are verified', '/verified/METHOD.txt']].forEach(function(x,i){
      if(i) dl.appendChild(document.createTextNode(' · ')); var a=el('a','color:#58a6ff',x[0]); a.href=x[1]; a.target='_blank'; a.rel='noopener'; dl.appendChild(a); });
    p.appendChild(dl);
    var anchor=document.getElementById('s0-contract-panel'), host=document.querySelector('main')||document.querySelector('.container')||document.body;
    if(anchor&&anchor.parentNode) anchor.parentNode.insertBefore(p, anchor); else host.appendChild(p);
    rpc('eth_getCode',[addr,'latest']).then(sha256hex).then(function(hh){
      if(hh===v.codeSha256){ live.style.color='#3fb950'; live.textContent='\u2713 Live check: sha256(eth_getCode) at latest block = published codeSha256 (checked in your browser just now).'; }
      else { live.style.color='#f85149'; live.textContent='\u2717 Live check FAILED: on-chain code hash '+hh+' differs from the verified record.'; }
    }).catch(function(e){ live.textContent='Live check unavailable ('+((e&&e.message)||e)+').'; });
    // badge next to the account card title as well
    var tries=0, t=setInterval(function(){ var card=document.getElementById('scdo-shard0-addr'), h3=card&&card.querySelector('h3');
      if(h3&&!h3.querySelector('.s0-verified-badge')) h3.appendChild(badge('\u2713 Contract: Verified','#238636','Source code verified - see "Contract Source Code" below'));
      if((h3&&h3.querySelector('.s0-verified-badge'))||++tries>15) clearInterval(t); }, 700);
  }
  var seq=0;
  function load(){
    var my=++seq; var old=document.getElementById('s0-verified-panel'); if(old) old.remove();
    var m=location.hash.match(/address=(0x[0-9a-fA-F]{40})/); if(!m) return; var addr=m[1].toLowerCase();
    fetch('/verified/'+addr+'.json',{cache:'no-cache'}).then(function(r){ return r.ok?r.json():null; }).catch(function(){ return null; }).then(function(v){
      if(!v||my!==seq||String(v.address).toLowerCase()!==addr||location.hash.toLowerCase().indexOf(addr)<0) return;
      var go=function(){ if(my===seq) render(v, addr); };
      setTimeout(go, document.getElementById('s0-contract-panel')?0:900);
    });
  }
  setTimeout(load, 2600);
  window.addEventListener('hashchange', function(){ setTimeout(load, 2000); });
})();

// === Shard0 tx page: "Load test" tag (Grok Bot 20260929) ===
(function(){
  var seq=0;
  function run(){
    var my=++seq; document.querySelectorAll('.s0-loadtest-badge').forEach(function(b){ b.remove(); });
    var m=location.hash.match(/txhash=(0x[0-9a-fA-F]{64})/); if(!m) return; var h=m[1].toLowerCase();
    fetch('/enhance/shard0/tx?hash='+h).then(function(r){ return r.ok?r.json():null; }).catch(function(){ return null; }).then(function(d){
      if(!d||!d.data||d.data.tag!=='loadtest'||my!==seq) return;
      var tries=0, t=setInterval(function(){
        var card=document.getElementById('scdo-shard0-tx'), h3=card&&card.querySelector('h3');
        if(my!==seq||++tries>20){ clearInterval(t); return; }
        if(!h3||h3.querySelector('.s0-loadtest-badge')) return;
        var b=document.createElement('a'); b.className='s0-loadtest-badge'; b.href='/loadtest.html'; b.textContent='Load test';
        b.title='Part of the 2026-09-28 TPS load test (faucet self-transfer, 1 wei). Hidden from default lists - click for the report.';
        b.style.cssText='margin-left:8px;padding:2px 10px;background:#6e40c9;color:#fff;border-radius:3px;font-size:12px;vertical-align:middle;text-decoration:none';
        h3.appendChild(b); clearInterval(t);
      }, 700);
    });
  }
  setTimeout(run, 2200);
  window.addEventListener('hashchange', function(){ setTimeout(run, 1500); });
})();

// === Shard0 block page (Grok Bot 20260929) ===
// #/block?height=<n>&shard=0 or #/block?hash=<0x..>&shard=0 (target of the EIP-3091 path /block/<n|hash>, nginx redirect).
// The legacy Vue block page only knows the archive shards, so shard0 blocks are rendered from /rpc/0 here (textContent only).
(function(){
  function el(tag, css, text){ var e=document.createElement(tag); if(css) e.style.cssText=css; if(text!=null) e.textContent=text; return e; }
  function rpc(m,p){ return fetch('/rpc/0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:m,params:p})}).then(function(r){return r.json();}).then(function(d){ if(d.error) throw new Error(d.error.message); return d.result; }); }
  function h2i(h){ return h?parseInt(h,16):0; }
  function wei(h){ try{ var v=BigInt(h||'0x0'), i=(v/10n**18n).toString(), f=(v%10n**18n).toString().padStart(18,'0').replace(/0+$/,''); return (f?i+'.'+f:i)+' SCDO'; }catch(e){ return '-'; } }
  var shown=null;
  function target(){
    var h=location.hash; if(h.indexOf('#/block?')!==0||!/[?&]shard=0(&|$)/.test(h)) return null;
    var m=h.match(/[?&]height=(\d+)/); if(m) return {tag:'0x'+Number(m[1]).toString(16), key:'n'+m[1]};
    m=h.match(/[?&]hash=(0x[0-9a-fA-F]{64})/); if(m) return {hash:m[1].toLowerCase(), key:m[1].toLowerCase()};
    return null;
  }
  function hideLegacy(){ document.querySelectorAll('.container *').forEach(function(e){ if(e.children.length===0&&/^Loading block\.\.\.$/.test(e.textContent.trim())) e.style.display='none'; }); }
  function tick(){
    var t=target(), old=document.getElementById('s0-block-card');
    if(!t){ if(old) old.remove(); shown=null; return; }
    hideLegacy();
    if(old&&shown===t.key) return;
    var c=document.querySelector('.container'); if(!c) return;
    if(old) old.remove(); shown=t.key;
    var card=el('div','margin:16px 0;padding:16px;background:#161b22;border:1px solid #30363d;border-radius:10px'); card.id='s0-block-card'; card.className='card';
    card.appendChild(el('h3','color:#3fb950;margin:0 0 10px','Shard0 (EVM) Block'));
    var body=el('div','font-size:13px;color:#c9d1d9','Loading from /rpc/0…'); card.appendChild(body);
    c.insertBefore(card, c.firstChild);
    (t.hash ? rpc('eth_getBlockByHash',[t.hash,true]) : rpc('eth_getBlockByNumber',[t.tag,true])).then(function(b){
      if(shown!==t.key) return; body.textContent='';
      if(!b){ body.textContent='Block not found on shard0 (chainId 5680).'; return; }
      var n=h2i(b.number), g=el('div','display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;line-height:1.7');
      function kv(k,v,href){ g.appendChild(el('div','color:#8b949e',k)); var d=el('div','word-break:break-all;font-family:'+(/^0x/.test(v)?'monospace':'inherit')); if(href){ var a=el('a','color:#58a6ff',v); a.href=href; d.appendChild(a);} else d.textContent=v; g.appendChild(d); }
      kv('Height', '#'+n); kv('Hash', b.hash); kv('Parent', b.parentHash, n>0?'#/block?height='+(n-1)+'&shard=0':null);
      kv('Timestamp', new Date(h2i(b.timestamp)*1000).toLocaleString()+' (unix '+h2i(b.timestamp)+')');
      kv('Miner', String(b.miner).toLowerCase(), '#/address?address='+String(b.miner).replace(/[^0-9a-fA-Fx]/g,''));
      kv('Transactions', String((b.transactions||[]).length));
      kv('Gas used / limit', h2i(b.gasUsed).toLocaleString()+' / '+h2i(b.gasLimit).toLocaleString()+' ('+(h2i(b.gasLimit)?(100*h2i(b.gasUsed)/h2i(b.gasLimit)).toFixed(1):0)+'%)');
      if(b.baseFeePerGas) kv('Base fee', (h2i(b.baseFeePerGas)/1e9).toFixed(9).replace(/0+$/,'').replace(/\.$/,'')+' gwei');
      kv('Difficulty', h2i(b.difficulty).toLocaleString()); kv('Size', h2i(b.size).toLocaleString()+' bytes');
      var nav=el('div','margin-top:6px'); [['← prev', n-1], ['next →', n+1]].forEach(function(x){ if(x[1]<0) return; var a=el('a','color:#58a6ff;margin-right:14px',x[0]); a.href='#/block?height='+x[1]+'&shard=0'; nav.appendChild(a); });
      body.appendChild(g); body.appendChild(nav);
      var txs=b.transactions||[];
      if(txs.length){
        var lt=txs.filter(function(x){ return String(x.from).toLowerCase()==='0x42c4854a51127f2d9d770f0d4aeca0683f72c0e4'&&String(x.to).toLowerCase()==='0x42c4854a51127f2d9d770f0d4aeca0683f72c0e4'&&x.value==='0x1'&&n>=3400&&n<=3500; }).length;
        body.appendChild(el('div','margin:14px 0 6px;font-weight:600','Transactions ('+txs.length+(txs.length>100?', first 100 shown':'')+')'+(lt?' · '+lt+' are load-test self-transfers':'')));
        if(lt){ var a=el('a','color:#58a6ff;font-size:12px','Load test report'); a.href='/loadtest.html'; body.appendChild(a); }
        var tb=el('table','width:100%;font-size:12px;border-collapse:collapse;margin-top:6px'); var hr=el('tr','color:#8b949e;text-align:left'); ['Tx Hash','From','To','Value'].forEach(function(x){ hr.appendChild(el('th','padding:4px 6px',x)); }); tb.appendChild(hr);
        txs.slice(0,100).forEach(function(x){ var tr=el('tr','border-top:1px solid #30363d');
          var td=el('td','padding:4px 6px;font-family:monospace'); var a=el('a','color:#58a6ff',x.hash.slice(0,18)+'…'); a.href='#/tx?txhash='+x.hash.replace(/[^0-9a-fA-Fx]/g,''); td.appendChild(a); tr.appendChild(td);
          [x.from, x.to].forEach(function(ad){ var td=el('td','padding:4px 6px;font-family:monospace'); if(ad){ var a=el('a','color:#e6edf3',String(ad).slice(0,10)+'…'+String(ad).slice(-6)); a.href='#/address?address='+String(ad).replace(/[^0-9a-fA-Fx]/g,''); td.appendChild(a);} else td.textContent='(contract creation)'; tr.appendChild(td); });
          tr.appendChild(el('td','padding:4px 6px;color:#3fb950',wei(x.value))); tb.appendChild(tr); });
        body.appendChild(tb);
      }
    }).catch(function(e){ if(shown===t.key) body.textContent='RPC error: '+((e&&e.message)||e); });
  }
  setInterval(function(){ try{ tick(); }catch(e){} }, 1000);
})();
