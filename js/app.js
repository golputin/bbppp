/* BitPunks v3 — burn-to-mint claim (2-tx: approve -> commit -> reveal) */
const $ = s => document.querySelector(s);

const CONTRACT = "0xcf9c6940859D8D1Dc10eC7c652Abb0E5d5CAA689";
const CHAIN_ID = 4663;
const RPC = "https://rpc.mainnet.chain.robinhood.com";
const EXPLORER = "https://explorer.robinhood.com/address/" + CONTRACT;

const bpAbi = [
  "function commit() external",
  "function reveal() external",
  "function reAnchor() external",
  "function commits(address) view returns (uint256 blockNum, bool drawn)",
  "function pendingCount() view returns (uint256)",
  "function totalMinted() view returns (uint256)",
  "function MAX_SUPPLY() view returns (uint256)",
  "function burnAmount() view returns (uint256)",
  "function isOpen() view returns (bool)",
  "function paymentToken() view returns (address)",
  "function ownerOf(uint256) view returns (address)",
  "function tokenOfOwnerByIndex(address,uint256) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];
const tAbi = [
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

let provider=null, signer=null, account=null, connected=false;
let tokenAddr=null, sym="TOKEN", decimals=18, burnWei=0n;
let commitBlock=0n, isOpen=false;

const stateEl=$("#claimState"), loadEl=$("#claimLoad");
const apprBtn=$("#approveBtn"), commBtn=$("#commitBtn"), revBtn=$("#revealBtn");
const emptyC=$("#emptyConnect"), tapeEl=$("#tape");
const connectBtn=$("#connectBtn");

function logTape(m){ const t=document.getElementById('tape'); if(!t){console.log(m);return;} t.innerHTML=m; }
function setState(html){ if(stateEl) stateEl.innerHTML = html; }
function fmt(n){ return Number(n).toLocaleString('en-US'); }
function show(btn,on){ if(btn) btn.hidden = !on; }
const short = a => a.slice(0,6)+"…"+a.slice(-4);

async function refreshStats(){
  try{
    const rp = new ethers.JsonRpcProvider(RPC);
    const bp = new ethers.Contract(CONTRACT, bpAbi, rp);
    const [total, max, pending, open, tokenA] = await Promise.all([
      bp.totalMinted(), bp.MAX_SUPPLY(), bp.pendingCount(), bp.isOpen(), bp.paymentToken(),
    ]);
    isOpen = open;
    tokenAddr = tokenA;
    const left = Number(pending);
    setState(`<div class="claim-status"><span class="pill ${open?'ok':'off'}">${open?'Claim open':'Paused'}</span><span class="meta">${fmt(Number(total))} / ${fmt(Number(max))}<span class="dim"> claimed</span></span></div>`);
    if(tokenAddr){
      const tok = new ethers.Contract(tokenAddr, tAbi, rp);
      try{ sym = await tok.symbol(); decimals = Number(await tok.decimals()); }catch(_){}
      burnWei = await bp.burnAmount();
      commBtn.innerHTML = `Burn ${ethers.formatUnits(burnWei, decimals)} $${sym}`;
      setRef(tokenAddr);
    }
    await renderActions();
  }catch(e){ loadEl.textContent="…"; }
}
function setRef(tok){
  document.querySelectorAll('.ref-addr').forEach(b=>{
    const li=b.closest('li');
    const label=li?.querySelector('.dim')?.textContent||'';
    const addr=(label.includes('KL')||label.includes('$')) ? tok : CONTRACT;
    b.textContent=short(addr); b.dataset.copy=addr;
  });
}

/* ---------- connect ---------- */
async function switchToRH(){
  await provider.request({ method:'wallet_addEthereumChain', params:[{
    chainId:'0x1237', chainName:'Robinhood Chain', nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18},
    rpcUrls:[RPC],
  }]});
}
connectBtn.addEventListener('click', async ()=>{
  if(connected){ connected=false; account=null; connectBtn.textContent='Connect'; show(emptyC,true); renderActions(); return; }
  if(!window.ethereum){ logTape('No wallet detected — use Rabby / MetaMask + Robinhood Chain.'); return; }
  try{
    provider = new ethers.BrowserProvider(window.ethereum);
    const net = await window.ethereum.request({method:'eth_chainId'});
    if(parseInt(net,16)!==CHAIN_ID){ try{ await switchToRH(); }catch(_){ logTape('Switch to Robinhood Chain (4663) in your wallet.'); } }
    const accs = await provider.send('eth_requestAccounts',[]);
    account = accs[0]; connected=true; signer = await provider.getSigner();
    connectBtn.textContent = short(account);
    show(emptyC,false);
    await refreshStats();
    await renderActions();
  }catch(e){ logTape('Connect failed: '+(e.shortMessage||e.message)); }
});

/* ---------- approve ---------- */
async function refreshAllowance(){
  if(!connected||!tokenAddr) return 0n;
  const tok = new ethers.Contract(tokenAddr, tAbi, signer);
  return await tok.allowance(account, CONTRACT);
}
apprBtn.addEventListener('click', async ()=>{
  setBusy(true);
  try{
    const tok = new ethers.Contract(tokenAddr, tAbi, signer);
    logTape(`Approve $${sym}…`);
    const tx = await tok.approve(CONTRACT, ethers.MaxUint256);
    logTape(`Tx ${tx.hash.slice(0,10)}… waiting`);
    await tx.wait();
    logTape('✓ Approved. You can now burn.');
    await renderActions();
  }catch(e){ logTape('✗ '+(e.shortMessage||e.message)); }
  finally{ setBusy(false); }
});

/* ---------- commit (burn) ---------- */
commBtn.addEventListener('click', async ()=>{
  setBusy(true);
  try{
    const bp = new ethers.Contract(CONTRACT, bpAbi, signer);
    logTape(`Burning ${ethers.formatUnits(burnWei, decimals)} $${sym}…`);
    const tx = await bp.commit();
    logTape(`Commit tx ${tx.hash.slice(0,10)}…`);
    const rc = await tx.wait();
    const c = await bp.commits(account);
    commitBlock = c.blockNum;
    logTape(`✓ Committed at block ${commitBlock.toString()}. Wait one block, then reveal.`);
    await renderActions();
    pollRevealReady();
  }catch(e){ logTape('✗ '+(e.shortMessage||e.message)); }
  finally{ setBusy(false); }
});

/* ---------- reveal ---------- */
revBtn.addEventListener('click', async ()=>{
  setBusy(true);
  try{
    const bp = new ethers.Contract(CONTRACT, bpAbi, signer);
    const tx = await bp.reveal();
    const rc = await tx.wait();
    logTape('✅ ' + (rc.status===1 ? 'Revealed! See your punk below.' : 'Reverted'));
    await renderActions();
    await renderVault();
  }catch(e){ logTape('✗ '+(e.shortMessage||e.message)); }
  finally{ setBusy(false); }
});

/* ---------- reveal readiness poll ---------- */
async function pollRevealReady(){
  const bp = new ethers.Contract(CONTRACT, bpAbi, provider);
  for(let i=0;i<60;i++){
    const c = await bp.commits(account);
    if(c.drawn){ renderActions(); renderVault(); return; }
    const cur = await provider.getBlockNumber();
    if(Number(c.blockNum)>0 && cur >= Number(c.blockNum)+1){
      show(revBtn,true); revBtn.disabled=false; revBtn.textContent='Reveal now';
      logTape('Block ready — click REVEAL.');
      return;
    }
    await new Promise(r=>setTimeout(r,3000));
  }
}

/* ---------- actions ---------- */
async function renderActions(){
  if(!connected){ show(apprBtn,false); show(commBtn,false); show(revBtn,false); show(emptyC,true); return; }
  const bp = new ethers.Contract(CONTRACT, bpAbi, signer);
  const c = await bp.commits(account);
  if(c.drawn){
    show(apprBtn,false); show(commBtn,false); show(revBtn,false); show(emptyC,false);
    setState(`<div class="claim-status"><span class="pill ok">Drawn</span><span class="meta">You already own your BitPunk.</span></div>`);
    renderVault();
    return;
  }
  if(Number(c.blockNum)>0){
    show(apprBtn,false); show(commBtn,false); show(emptyC,false);
    const cur = await provider.getBlockNumber();
    if(cur >= Number(c.blockNum)+1){ show(revBtn,true); revBtn.disabled=false; revBtn.textContent='Reveal now'; }
    else { show(revBtn,true); revBtn.disabled=true; revBtn.textContent='Waiting for next block…'; pollRevealReady(); }
    return;
  }
  show(revBtn,false);
  const alw = await refreshAllowance();
  if(alw < burnWei){ show(apprBtn,true); show(commBtn,false); }
  else { show(apprBtn,false); show(commBtn,true); }
  show(emptyC,false);
}

/* ---------- vault ---------- */
async function renderVault(){
  if(!connected) return;
  const bp = new ethers.Contract(CONTRACT, bpAbi, provider);
  const bal = Number(await bp.balanceOf(account));
  if(bal===0) return;
  const ids=[];
  for(let i=0;i<bal;i++) ids.push(Number(await bp.tokenOfOwnerByIndex(account,i)));
  setState(`<div class="claim-status"><span class="pill ok">You own</span><span class="meta">${ids.map(id=>'#'+id).join(', ')}</span></div>`);
}

/* ---------- copy ---------- */
document.querySelectorAll('.ref-addr').forEach(b=>{
  b.addEventListener('click', async ()=>{
    try{ await navigator.clipboard.writeText(b.dataset.copy||b.textContent); b.textContent='COPIED'; setTimeout(()=>setRef(tokenAddr),1200); }
    catch(e){}
  });
});

/* ---------- boot ---------- */
refreshStats();
setInterval(refreshStats, 15000);
setTimeout(()=>{ if(connected) renderActions(); }, 3000);