/* BitPunks site — real mint on Robinhood Chain 4663, dual-path web(5)/agent(15) */
const $ = s => document.querySelector(s);

const CONTRACT = "0x848b7B8BE48eA87368d783D4bA0A60480d9C0052";
const CHAIN_ID = 4663;
const RPC = "https://rpc.mainnet.chain.robinhood.com";

const abi = [
  "function webMint(uint256 qty) payable",
  "function webMintedPerWallet(address) view returns (uint256)",
  "function totalMinted() view returns (uint256)",
  "function MAX_SUPPLY() view returns (uint256)",
  "function mintPrice() view returns (uint256)",
  "function WEB_MINT_MAX() view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address, uint256) view returns (uint256)",
  "function revealed() view returns (bool)",
  "function tokenURI(uint256) view returns (string)",
];

/* ---------- QTY STEPPER ---------- */
const qty = $('#qty');
$('#decBtn').addEventListener('click',()=>qty.value=Math.max(1,+qty.value-1));
$('#incBtn').addEventListener('click',()=>qty.value=Math.min(5,+qty.value+1));
qty.addEventListener('change',()=>{ qty.value=Math.max(1,Math.min(5,+qty.value||1)); });

/* ---------- WALLET ---------- */
let connected=false, account=null, provider=null;
const btn=$('.btn-wallet'), btnMint=$('#mintBtn');
function setConnected(addr){
  connected=!!addr; account=addr||null;
  btn.textContent = connected? `◉ ${addr.slice(0,6)}…${addr.slice(-4)}` : 'CONNECT WALLET';
  btnMint.textContent = connected? 'MINT NOW' : 'CONNECT WALLET TO MINT';
  btnMint.disabled = !connected;
}
async function switchToHood(){
  await provider.request({ method:'wallet_addEthereumChain', params:[{
    chainId:'0x1237', chainName:'Robinhood Chain', nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18},
    rpcUrls:[RPC],
  }]});
}
btn.addEventListener('click', async ()=>{
  if(connected){ setConnected(null); refreshVault(); return; }
  if(window.ethereum){
    try{
      provider = new ethers.BrowserProvider(window.ethereum);
      // ensure RH chain
      const net = await window.ethereum.request({method:'eth_chainId'});
      if(parseInt(net,16)!==CHAIN_ID){ try{await switchToHood();}catch(_){ logTape('⚠ Switch chain ke Robinhood dulu di wallet lo'); } }
      const a=await provider.send('eth_requestAccounts',[]);
      setConnected(a[0]);
      refreshVault();
    }catch(e){ logTape('⚠ '+ (e.message||'wallet error')); }
  } else {
    logTape('⚠ No wallet detected. Mint manual butuh Rabby/MetaMask + chain Robinhood (4663).');
    setConnected(null);
  }
});

/* ---------- MINT (web path, cap 5) ---------- */
$('#mintBtn').addEventListener('click', async ()=>{
  if(!connected){ logTape('⚠ Connect wallet first.'); return; }
  setBusy(true);
  try{
    const n=Math.max(1,Math.min(5,+qty.value||1));
    if(!provider) provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const bp = new ethers.Contract(CONTRACT, abi, signer);
    const price = await bp.mintPrice();
    const value = price * BigInt(n);
    logTape(`⛏ Minting ${n} BitPunk${n>1?'s':''} (${ethers.formatEther(value)} ETH)`);
    const tx = await bp.webMint(n, { value });
    logTape(`⏳ Tx ${tx.hash.slice(0,10)}…`);
    const rc = await tx.wait();
    logTape(rc.status===1 ? '✅ Confirmed!' : '❌ Reverted');
  }catch(e){
    logTape('✗ '+(e.shortMessage||e.message||'mint failed'));
  } finally{ setBusy(false); }
});
btnMint.disabled=true;
function setBusy(b){ btnMint.disabled = b || !connected; btnMint.textContent = b?'MINTING…':(connected?'MINT NOW':'CONNECT WALLET TO MINT'); }
function logTape(m){ const t=$('#tape'); t.insertAdjacentHTML('afterbegin',`<div>${m}</div>`); }

/* ---------- LIVE SUPPLY + UNIQUE MINTERS (read-only, no wallet needed) ---------- */
const fmt = n => n.toLocaleString('en-US');
async function refreshStats(){
  try{
    const rp = new ethers.JsonRpcProvider(RPC);
    const bp = new ethers.Contract(CONTRACT, abi, rp);
    const [tm, ms, max] = await Promise.all([
      bp.totalMinted(), bp.mintPrice(), bp.MAX_SUPPLY()
    ]);
    const mintedEl = $('#minted'), metM = $('#met-minted'), metR = $('#met-remain');
    const left = Number(max) - Number(tm);
    if(mintedEl) mintedEl.textContent = `${fmt(Number(tm))} / ${fmt(Number(max))}`;
    if(metM) metM.textContent = `${fmt(Number(tm))} / ${fmt(Number(max))}`;
    if(metR) metR.textContent = `${fmt(left)} punks remaining`;
    const totalEl = $('#total');
    if(totalEl) totalEl.textContent = `${ethers.formatEther(ms)} ETH`;
  }catch(e){ /* RPC hiccup — retry next tick */ }
}
async function refreshMinters(){
  try{
    const rp = new ethers.JsonRpcProvider(RPC);
    const bp = new ethers.Contract(CONTRACT, abi, rp);
    const count = Number(await bp.totalMinted());
    const seen = new Set();
    if(count > 0 && count <= 2000){ // loop ownerOf per token (only for manageable supply)
      for(let i=0;i<count;i++){
        try{ seen.add((await bp.ownerOf(i)).toLowerCase()); }catch(_){}
      }
    }
    const el = $('#uniques');
    if(el) el.textContent = seen.size ? fmt(seen.size) : (count>2000?'—':fmt(0));
  }catch(e){ /* retry next tick */ }
}
refreshStats(); setInterval(refreshStats, 15000);
refreshMinters(); setInterval(refreshMinters, 30000);

/* ---------- MYSTERY VAULT (owned NFTs, reveal gated on-chain) ---------- */
const IMG_RAW = "https://raw.githubusercontent.com/golputin/bbppp/main/nfts";
const cards = $('#cards');
const vaultHead = document.querySelector('#vault .vault-head');

function renderVaultEmpty(msg){
  cards.innerHTML = `<div class="vault-empty"><strong>${msg}</strong><span class="dim">Connect Rabby/MetaMask & mint untuk isi vault.</span></div>`;
}
async function refreshVault(){
  if(!connected){
    renderVaultEmpty("VAULT KOSONG — BELUM CONNECT WALLET");
    return;
  }
  try{
    const rp = new ethers.JsonRpcProvider(RPC);
    const bp = new ethers.Contract(CONTRACT, abi, rp);
    const [bal, rev] = await Promise.all([ bp.balanceOf(account), bp.revealed() ]);
    if(Number(bal)===0){
      renderVaultEmpty("VAULT KOSONG — WALLET INI BELUM MINT");
      return;
    }
    cards.innerHTML='';
    const owned = [];
    for(let i=0;i<Number(bal);i++) owned.push(Number(await bp.tokenOfOwnerByIndex(account,i)));
    for(const id of owned){
      const card=document.createElement('div'); card.className='card'; card.id='card-'+id;
      card.innerHTML=`
        <div class="frame">
          <img data-id="${id}" data-rev="${rev?1:0}" src="assets/img/pre-reveal-glitch.gif" alt="BitPunk #${id}"/>
          <button class="reveal-btn" data-id="${id}">${rev?'REVEAL ▸':'LOCKED 🔒'}</button>
        </div>
        <div class="meta"><span class="id">#${id}</span><span class="tier">${rev?'MYSTERY':'NOT REVEALED'}</span></div>`;
      cards.appendChild(card);
    }
  }catch(e){ renderVaultEmpty("GAGAL BACA VAULT"); }
}
cards.addEventListener('click', async e=>{
  const b=e.target.closest('.reveal-btn'); if(!b) return;
  const id=+b.dataset.id; if(isNaN(id)) return;
  const card=document.getElementById('card-'+id); if(!card) return;
  if(card.classList.contains('revealed')) return;
  const rp = new ethers.JsonRpcProvider(RPC);
  const bp = new ethers.Contract(CONTRACT, abi, rp);
  let rev;
  try{ rev = await bp.revealed(); }catch(_){ logTape('✗ Gagal baca state reveal'); return; }
  if(!rev){ logTape('🔒 Reveal belum dibuka — nunggu owner normalize reveal.'); return; }
  if(!card.classList.contains('revealed')){
    const img=card.querySelector('img');
    img.src=`${IMG_RAW}/${id}.png`;
    img.onerror=()=>{ logTape(`✗ #${id} image gagal load`); };
    card.classList.add('revealed');
    let tier='BITPUNK';
    try{ const m=await (await fetch(`https://consultancy-dogs-integrity-hosts.trycloudflare.com/metadata/${id}`)).json(); tier=(m.properties&&m.properties.tier)||tier; }catch(_){}
    card.querySelector('.tier').textContent=tier.toUpperCase();
    b.textContent='REVEALED ✓';
    logTape(`◈ REVEALED #${id} — ${tier.toUpperCase()}`);
  }
});
refreshVault();