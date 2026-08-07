// BitPunks backend — metadata + images + agent-mint (puzzle/solve/submit)
// Serves:
//   GET /info            -> collection stats
//   GET /metadata/{id}   -> ERC721 metadata JSON for token id (0-based)
//   GET /images/{n}.png  -> pixel art image (1..5555)
//   GET /skill.md        -> agent mint instructions
//   GET /check/{wallet}  -> mint status + remaining slots
//   POST /puzzle         -> anti-bot PoW question
//   POST /solve          -> answer -> unsignedTx
//   POST /submit         -> signed tx -> broadcast
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { ethers } = require("ethers");

const PORT = process.env.PORT || 8899;
const CHAIN_ID = 4663;
const RPC = "https://rpc.mainnet.chain.robinhood.com";

// contract config — loaded from deployed.json / .env
const DEPLOY = JSON.parse(fs.readFileSync("/root/bitpunks-contracts/scripts/deployed.json", "utf8"));
const CONTRACT = DEPLOY.address;

const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID);

// metadata
const MANIFEST = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "rb_out5555", "manifest.json"), "utf8"));
const IMG_DIR = path.join(__dirname, "..", "rb_out5555", "png");

const app = express();
app.use(cors());
app.use(express.json());

// ---------- helpers ----------
function baseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function normalizeMeta(m, base) {
  // image served from stable public GitHub raw (permanent); metadata host derived from request
  return {
    name: m.name,
    description: m.description,
    image: `${process.env.PUBLIC_IMG || "https://raw.githubusercontent.com/golputin/bbppp/main/nfts"}/${m.tokenId}.png`,
    properties: { tier: m.tier },
    attributes: m.attributes,
  };
}

// ---------- collection info ----------
app.get("/info", async (req, res) => {
  const bp = new ethers.Contract(CONTRACT, [
    "function isOpen() view returns (bool)",
    "function totalMinted() view returns (uint256)",
    "function MAX_SUPPLY() view returns (uint256)",
    "function mintPrice() view returns (uint256)",
    "function WEB_MINT_MAX() view returns (uint256)",
    "function AGENT_MINT_MAX() view returns (uint256)",
  ], provider);
  const [isOpen, totalMinted, maxSupply, mintPrice, webMax, agentMax] = await Promise.all([
    bp.isOpen(), bp.totalMinted(), bp.MAX_SUPPLY(), bp.mintPrice(), bp.WEB_MINT_MAX(), bp.AGENT_MINT_MAX(),
  ]);
  res.json({
    contract: CONTRACT, chainId: CHAIN_ID,
    isOpen, totalMinted: totalMinted.toString(), maxSupply: maxSupply.toString(),
    mintPrice: ethers.formatEther(mintPrice), mintPriceWei: mintPrice.toString(),
    webMaxPerWallet: webMax.toString(), agentMaxPerWallet: agentMax.toString(),
    revealed: false,
  });
});

// ---------- metadata ----------
app.get("/metadata/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 0 || id >= MANIFEST.length) return res.status(404).json({ error: "not found" });
  res.json(normalizeMeta(MANIFEST[id], baseUrl(req)));
});

// ---------- images ----------
app.get("/images/:n", (req, res) => {
  const n = parseInt(req.params.n, 10);
  if (isNaN(n) || n < 1 || n > MANIFEST.length) return res.status(404).send("not found");
  const f = path.join(IMG_DIR, `${n}.png`);
  if (!fs.existsSync(f)) return res.status(404).send("not found");
  res.sendFile(f);
});

// ---------- agent mint (puzzle / solve / submit) ----------
// simple in-memory puzzle store (single process)
const puzzles = new Map(); // puzzleId -> {answer, expiresAt, wallet, quantity}
const PUZZLE_TTL_MS = 5 * 60 * 1000;
const CAP = 15; // agent cap

app.get("/check/:wallet", async (req, res) => {
  const wallet = req.params.wallet;
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) return res.status(400).json({ error: "invalid_wallet" });
  const bp = new ethers.Contract(CONTRACT, [
    "function agentMintedPerWallet(address) view returns (uint256)",
    "function totalMinted() view returns (uint256)",
    "function MAX_SUPPLY() view returns (uint256)",
  ], provider);
  const [minted, total, max] = await Promise.all([
    bp.agentMintedPerWallet(wallet), bp.totalMinted(), bp.MAX_SUPPLY(),
  ]);
  const remaining = Math.min(CAP - Number(minted), Number(max) - Number(total));
  res.json({ wallet, minted: minted.toString(), remaining: Math.max(remaining, 0), agentMaxPerWallet: CAP });
});

// puzzle: arithmetic anti-bot gate
function makeQuestion() {
  const a = crypto.randomInt(2, 50);
  const b = crypto.randomInt(2, 50);
  const op = crypto.randomInt(0, 4);
  switch (op) {
    case 0: return { q: `${a} + ${b}`, a: a + b };
    case 1: return { q: `${a} * ${b}`, a: a * b };
    case 2: return { q: `${a} - ${b}`, a: a - b };
    default: return { q: `${a * b} / ${a}`, a: b };
  }
}

app.post("/puzzle", async (req, res) => {
  const { wallet, quantity = 1 } = req.body || {};
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet || "")) return res.status(400).json({ error: "invalid_wallet" });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > CAP) return res.status(413).json({ error: "mint_limit_reached" });

  const bp = new ethers.Contract(CONTRACT, [
    "function isOpen() view returns (bool)",
    "function agentMintedPerWallet(address) view returns (uint256)",
    "function totalMinted() view returns (uint256)",
    "function MAX_SUPPLY() view returns (uint256)",
  ], provider);
  const [isOpen, minted, total, max] = await Promise.all([
    bp.isOpen(), bp.agentMintedPerWallet(wallet), bp.totalMinted(), bp.MAX_SUPPLY(),
  ]);
  if (!isOpen) return res.status(403).json({ error: "mint_not_active" });
  const remaining = Math.min(CAP - Number(minted), Number(max) - Number(total));
  if (remaining <= 0) return res.status(410).json({ error: "sold_out" });
  if (quantity > remaining) return res.status(413).json({ error: "mint_limit_reached", remaining });

  const { q, a } = makeQuestion();
  const puzzleId = crypto.randomUUID();
  puzzles.set(puzzleId, { answer: a, expiresAt: Date.now() + PUZZLE_TTL_MS, wallet, quantity });
  setTimeout(() => puzzles.delete(puzzleId), PUZZLE_TTL_MS + 1000);

  res.json({
    puzzleId, question: q, quantity, expiresAt: Date.now() + PUZZLE_TTL_MS,
    agentHint: "Solve the arithmetic question and POST /solve with {wallet, puzzleId, answer}.",
  });
});

app.post("/solve", async (req, res) => {
  const { wallet, puzzleId, answer } = req.body || {};
  const pz = puzzles.get(puzzleId);
  if (!pz) return res.status(400).json({ error: "puzzle_expired" });
  if (pz.wallet !== wallet) return res.status(400).json({ error: "invalid_wallet" });
  if (pz.expiresAt < Date.now()) { puzzles.delete(puzzleId); return res.status(400).json({ error: "puzzle_expired" }); }
  if (Number(answer) !== pz.answer) return res.status(400).json({ error: "wrong_answer" });
  puzzles.delete(puzzleId);

  const bp = new ethers.Contract(CONTRACT, [
    "function mintPrice() view returns (uint256)",
  ], provider);
  const price = await bp.mintPrice();
  const qty = pz.quantity;
  const value = price * BigInt(qty);

  // unsigned tx data: agentMint(uint256)
  const iface = new ethers.Interface([
    "function agentMint(uint256 qty) payable",
  ]);
  const data = iface.encodeFunctionData("agentMint", [qty]);
  const nonce = await provider.getTransactionCount(wallet);
  const feeData = await provider.getFeeData();
  const maxFee = feeData.maxFeePerGas ? feeData.maxFeePerGas * 2n : ethers.parseUnits("0.2", "gwei");
  const maxPriority = feeData.maxPriorityFeePerGas ?? ethers.parseUnits("0.01", "gwei");

  res.json({
    unsignedTx: {
      to: CONTRACT, data, value: "0x" + value.toString(16), chainId: CHAIN_ID,
      maxFeePerGas: "0x" + maxFee.toString(16),
      maxPriorityFeePerGas: "0x" + maxPriority.toString(16),
      nonce,
    },
    mintPrice: ethers.formatEther(price),
    quantity: qty,
    totalCost: ethers.formatEther(value),
    agentHint: "Sign locally with your EVM private key (never send the key over the network), gasLimit ~220000, then POST /submit with {signedTransaction}.",
  });
});

app.post("/submit", async (req, res) => {
  const { signedTransaction } = req.body || {};
  if (!signedTransaction) return res.status(400).json({ error: "missing_tx" });
  try {
    const parsed = ethers.Transaction.from(signedTransaction);
    const tx = await provider.broadcastTransaction(signedTransaction);
    const receipt = await tx.wait();
    // find Minted event
    const iface = new ethers.Interface(["event Minted(address indexed to, uint256 indexed path, uint256 qty, uint256 startTokenId)"]);
    let startTokenId = null, qty = 0;
    for (const log of receipt.logs) {
      try {
        const ev = iface.parseLog(log);
        if (ev) { qty = ev.args.qty.toString(); startTokenId = ev.args.startTokenId.toString(); }
      } catch {}
    }
    res.json({
      success: true, hash: receipt.hash, quantity: qty, startTokenId,
      to: parsed.from, minted: qty, message: "Minted! See explorer.",
    });
  } catch (e) {
    res.status(400).json({ error: "mint_reverted", detail: e.shortMessage || e.message });
  }
});

// ---------- skill.md (agent instructions) ----------
app.get("/skill.md", (req, res) => {
  res.type("text/markdown").send(`# BitPunks Agent Mint (skill.md)

Mint price is **0.0005 ETH + gas** on Robinhood Chain (chainId 4663).
You need the user's EVM private key to sign locally. **Never send the key over the network; never log it.**

## Flow
1. Ask the user for their EVM private key (or load from env) and wallet address.
2. \`GET ${baseUrl(req)}/check/{wallet}\` — confirm remaining slots (agent cap 15/wallet).
3. \`POST ${baseUrl(req)}/puzzle\` {\"wallet\": \"0x...\", \"quantity\": 1..min(remaining,15)} — get puzzleId + question.
4. Solve the arithmetic question, then \`POST ${baseUrl(req)}/solve\` {\"wallet\", \"puzzleId\", \"answer\"} — returns an unsigned tx.
5. **Sign locally** with ethers: gasLimit ~220000, maxFeePerGas / maxPriorityFeePerGas from the response.
6. \`POST ${baseUrl(req)}/submit\` {\"signedTransaction\": \"0x...\"} — broadcast.

## Rules
- First mint always single; offer batch (max 5) only AFTER first success.
- Check \`remaining\` before EVERY batch; never request more than remaining.
- Never expose the private key in output/logs.
- Contract: ${CONTRACT} (chainId 4663).
`);
});

app.listen(PORT, () => console.log(`BitPunks backend on :${PORT}`));
