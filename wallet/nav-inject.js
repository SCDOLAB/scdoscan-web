(function(){
  function addWallet(){
    var logo = document.querySelector('.logo, .header-logo, img[alt="logo"]');
    if(!logo) return false;
    if(document.getElementById('nav-wallet')) return true;
    var container = logo.closest('div');
    if(!container) return false;
    var a = document.createElement('a');
    a.href = '/wallet/?v=2';
    a.id = 'nav-wallet';
    a.textContent = 'Wallet';
    a.style.cssText = 'margin-left:16px;font-size:16px;font-weight:600;color:#4CAF50;text-decoration:none;vertical-align:middle;';
    container.appendChild(a);
    return true;
  }
  var t = setInterval(function(){ if(addWallet()) clearInterval(t); }, 300);
  setTimeout(function(){ clearInterval(t); }, 15000);
})();
