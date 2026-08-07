// BitPunks v3 backend — burn-to-mint collection metadata + images (clean, no agent-mint)
//   GET /info            -> collection stats (contract, burn, token, supply)
//   GET /metadata/{id}   -> ERC721 metadata JSON for token id (0-based)
//   GET /images/{n}.png  -> pixel art image (1..3333)
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const { ethers } = require("ethers");

const PORT = process.env.PORT || 8900;
const CHAIN_ID = 4663;
const RPC = "https://rpc.mainnet.chain.robinhood.com";
const PUBLIC_IMG = "https://raw.githubusercontent.com/golputin/bbppp/main/nfts";

// contract config — auto-loaded from deployed.json
const DEPLOY = JSON.parse(fs.readFileSync("/root/bitpunks-contracts/scripts/deployed.json", "utf8"));
const CONTRACT = DEPLOY.address;

const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID);

const MANIFEST = JSON.parse(fs.readFileSync("/root/bitpunks/rb_out3333/manifest.json", "utf8"));
const IMG_DIR = "/root/bitpunks/rb_out3333/png";

const app = express();
app.use(cors());
app.use(express.json());

// ---------- collection info ----------
app.get("/info", async (req, res) => {
  const bp = new ethers.Contract(CONTRACT, [
    "function isOpen() view returns (bool)",
    "function totalMinted() view returns (uint256)",
    "function MAX_SUPPLY() view returns (uint256)",
    "function burnAmount() view returns (uint256)",
    "function pendingCount() view returns (uint256)",
    "function paymentToken() view returns (address)",
  ], provider);
  const [isOpen, totalMinted, maxSupply, burnAmt, pending, tok] = await Promise.all([
    bp.isOpen(), bp.totalMinted(), bp.MAX_SUPPLY(), bp.burnAmount(), bp.pendingCount(), bp.paymentToken(),
  ]);
  let tokMeta = { symbol: "KLANKO", name: "Klanko Fun", decimals: 18 };
  try {
    const tokC = new ethers.Contract(tok, ["function symbol() view returns(string)","function name() view returns(string)","function decimals() view returns(uint8)"], provider);
    tokMeta.symbol = await tokC.symbol(); tokMeta.name = await tokC.name(); tokMeta.decimals = Number(await tokC.decimals());
  } catch (_) {}
  res.json({
    contract: CONTRACT, chainId: CHAIN_ID,
    isOpen, totalMinted: totalMinted.toString(), maxSupply: maxSupply.toString(),
    pending: pending.toString(),
    burn: burnAmt.toString(),
    burnHuman: ethers.formatUnits(burnAmt, tokMeta.decimals),
    token: tok, tokenName: tokMeta.name, tokenSymbol: tokMeta.symbol, tokenDecimals: tokMeta.decimals,
    revealed: false,
  });
});

// ---------- metadata ----------
app.get("/metadata/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 0 || id >= MANIFEST.length) return res.status(404).json({ error: "not found" });
  const m = MANIFEST[id];
  const n = id + 1;
  res.json({
    name: m.name,
    description: m.description,
    image: `${PUBLIC_IMG}/${n}.png`,
    attributes: m.attributes,
    properties: { tier: m.tier, id },
  });
});

// ---------- images ----------
app.get("/images/:n", (req, res) => {
  const n = parseInt(req.params.n, 10);
  if (isNaN(n) || n < 1 || n > MANIFEST.length) return res.status(404).send("not found");
  const f = path.join(IMG_DIR, `${n}.png`);
  if (!fs.existsSync(f)) return res.status(404).send("not found");
  res.sendFile(f);
});

app.listen(PORT, () => console.log(`BitPunks backend on :${PORT}`));