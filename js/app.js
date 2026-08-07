/* BitPunks site — real mint on Robinhood Chain 4663, dual-path web(5)/agent(15) */
const $ = s => document.querySelector(s);

const CONTRACT = "0x3Af616FeadF3f9F8E90DFFE4f7063c2570b8e0eD";
const CHAIN_ID = 4663;
const RPC = "https://rpc.mainnet.chain.robinhood.com";

const abi = [
  "function webMint(uint256 qty) payable",
  "function webMintedPerWallet(address) view returns (uint256)",
  "function totalMinted() view returns (uint256)",
  "function MAX_SUPPLY() view returns (uint256)",
  "function mintPrice() view returns (uint256)",
  "function WEB_MINT_MAX() view returns (uint256)",
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
  if(connected){ setConnected(null); return; }
  if(window.ethereum){
    try{
      provider = new ethers.BrowserProvider(window.ethereum);
      // ensure RH chain
      const net = await window.ethereum.request({method:'eth_chainId'});
      if(parseInt(net,16)!==CHAIN_ID){ try{await switchToRH();}catch(_){} }
      const a=await provider.send('eth_requestAccounts',[]);
      setConnected(a[0]);
    }catch(e){ logTape('⚠ '+ (e.message||'wallet error')); }
  } else {
    setConnected('0x1b04BEB5');
    logTape('⚠ No wallet injected — demo mode. Use MetaMask / Rabby on Robinhood Chain.');
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

/* ---------- REVEAL GALLERY (demo) ---------- */
const TOTAL=16;
const cards=$('#cards');
cards.innerHTML='';
for(let i=0;i<TOTAL;i++){
  const card=document.createElement('div'); card.className='card';
  card.id='card-'+i;
  const id=(i+4213);
  card.innerHTML=`
    <div class="frame">
      <img src="assets/img/pre-reveal-glitch.gif" alt="Mystery #${id}" data-revealed="0"/>
      <button class="reveal-btn" data-i="${i}">REVEAL ▸</button>
    </div>
    <div class="meta"><span class="id">#${id}</span><span class="tier">MYSTERY</span></div>`;
  cards.appendChild(card);
}
cards.addEventListener('click', e=>{
  const b=e.target.closest('.reveal-btn'); if(!b) return;
  const i=+b.dataset.i;
  const img=document.querySelector(`#card-${i} img`);
  const card=document.getElementById('card-'+i);
  if(card.classList.contains('revealed')) return;
  const tier=getTier(i);
  img.src=`assets/img/punk_${i}.png`;
  card.classList.add('revealed');
  card.querySelector('.tier').textContent=tier.toUpperCase();
  logTape(`◈ REVEALED DEMO PUNK #${(i+4213)}`);
});
function getTier(i){ const r=((i+3)%7); if(r===6)return 'legendary'; if(r>=4)return 'epic'; if(r>=2)return 'rare'; return 'common'; }