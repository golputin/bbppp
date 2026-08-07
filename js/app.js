/* BitPunks site — mint qty, wallet connect, REVEAL logic */
const $ = s => document.querySelector(s);

/* ---------- QTY STEpper ---------- */
const qty = $('#qty');
$('#decBtn').addEventListener('click',()=>qty.value=Math.max(1,+qty.value-1));
$('#incBtn').addEventListener('click',()=>qty.value=Math.min(5,+qty.value+1));
qty.addEventListener('change',()=>{ qty.value=Math.max(1,Math.min(5,+qty.value||1)); });

/* ---------- WALLET (lightweight mock w/ real connector hook) ---------- */
let connected=false, account=null;
const btn=$('.btn-wallet'), btnMint=$('#mintBtn');
function setConnected(addr){
  connected=!!addr; btn.textContent = connected? `◉ ${addr.slice(0,6)}…${addr.slice(-4)}` : 'CONNECT WALLET';
  btnMint.textContent = connected? 'MINT NOW' : 'CONNECT WALLET TO MINT';
  btnMint.disabled = !connected;
}
btn.addEventListener('click', async ()=>{
  if(connected){ setConnected(null); return; }
  if(window.ethereum){
    try{ const a=await ethereum.request({method:'eth_requestAccounts'}); setConnected(a[0]); }
    catch(e){ setConnected('0x1b04BEB5'); }
  } else {
    // demo fallback
    setConnected('0x1b04BEB5');
    logTape('⚠ No wallet injected — demo mode. Connect MetaMask/connecting to Robinhood RPC.');
  }
});

/* ---------- KIND OF MINT ---------- */
$('#mintBtn').addEventListener('click',()=>{
  if(!connected){ connect(); return; }
  logTape(`⛏ Mint ${qty.value} BITPUNDKS queued… connect RPC to finalize.`);
});

/* ---------- REMOVE demo tape + show ---------- */
function logTape(m){ const t=$('#tape'); t.insertAdjacentHTML('afterbegin',`<div>${m}</div>`); }

/* ---------- REVEAL GALLERY ---------- */
const TOTAL=16;
const cards=$('#cards');
cards.innerHTML='';
for(let i=0;i<TOTAL;i++){
  const card=document.createElement('div'); card.className='card';
  card.id='card-'+i;
  const id=(i+4213); // arbitrary mint ids
  card.innerHTML=`
    <div class="frame">
      <img src="assets/img/pre-reveal-glitch.gif" alt="Mystery #${id}" data-idx="${i}" data-revealed="0"/>
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
  logTape(`◈ REVEALED PUNK #${id}`);
});

function getTier(i){
  const r=((i+3)%7);
  if(r===6) return 'legendary'; if(r>=4)return 'epic'; if(r>=2)return 'rare';
  return 'common';
}

/* hero subtle glitch cycle between pre-reveal shades */