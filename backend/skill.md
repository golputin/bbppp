---
name: BitPunks
version: 1.0.0
description: BitPunks — Agentic Pixel-Art NFT on Robinhood Chain. AI solves a single-tier arithmetic puzzle to mint. Dual-path: manual web mint (5/wallet) and agent mint (15/wallet). Every minted punk is a mystery until the owner flips reveal.
homepage: https://bitpunks.vercel.app
metadata: {"category":"nft","emoji":"🧟","api_base":"__BASE__","total_supply":3333,"chain":"robinhood","chain_id":4663,"mint_price":"0.00025 ETH","requires":{"puzzle_response":true,"evm_wallet":true,"min_eth":"0.00025 ETH + gas"}}
---

# BitPunks

BitPunks — An Agentic Pixel-Art NFT on Robinhood Chain. AI solves a single-tier arithmetic puzzle to mint. Dual-path mint: manual web (max 5/wallet) and agent mint (max 15/wallet). Every minted punk is a mystery until the owner flips reveal.

## Key Files

| File | URL |
|------|-----|
| **SKILL.md** (this file) | `__BASE__/skill.md` |
| **Metadata example** | `__BASE__/metadata/1` |
| **Collection info** | `__BASE__/info` |

**Install locally:**
```bash
mkdir -p ~/.openclaw/skills/bitpunks
curl -s __BASE__/skill.md > ~/.openclaw/skills/bitpunks/SKILL.md
```

**Or just read the URL directly!**

**Base URL:** `__BASE__`

## Prerequisites

- An **EVM private key** with **0.00025 ETH** mint price + gas (~0.00001-0.00002 ETH) on Robinhood Chain (chain ID 4663)
- Ability to solve one arithmetic puzzle per mint (add / subtract / multiply / divide)
- Contract: `__CONTRACT__` (chainId 4663)

## Security

- Your EVM private key should **never** leave your local environment — signing happens locally
- This skill makes only HTTP API calls. It does not access your filesystem, run shell commands, or execute arbitrary code
- Never expose the private key in output, logs, or API payloads

## How It Works

The mint flow has four steps: **puzzle → solve → sign locally → submit**.

### Step 1: Request a puzzle

Default is 1 mint per puzzle. To batch mint up to **15 NFTs in one transaction**, pass an optional `quantity` (1..15):

```bash
# Single mint (default)
curl -X POST __BASE__/puzzle \
  -H "Content-Type: application/json" \
  -d '{"wallet": "YOUR_EVM_ADDRESS"}'

# Batch mint 5 in one tx
curl -X POST __BASE__/puzzle \
  -H "Content-Type: application/json" \
  -d '{"wallet": "YOUR_EVM_ADDRESS", "quantity": 5}'
```

Response:
```json
{
  "puzzleId": "fa51b5c4-...",
  "question": "155 / 5",
  "quantity": 1,
  "expiresAt": 1720000000000,
  "agentHint": "Solve the arithmetic question and POST /solve with {wallet, puzzleId, answer}."
}
```

The `question` is plain arithmetic like `23 + 4`, `12 * 7`, `45 - 9`, or `155 / 5`. Solve it and send the numeric answer.

### Step 2: Solve the puzzle and request mint

```bash
curl -X POST __BASE__/solve \
  -H "Content-Type: application/json" \
  -d '{
    "wallet": "YOUR_EVM_ADDRESS",
    "puzzleId": "fa51b5c4-...",
    "answer": "31"
  }'
```

Response:
```json
{
  "unsignedTx": {
    "to": "__CONTRACT__",
    "data": "0x...",
    "value": "0x1c6bf52634000",
    "chainId": 4663,
    "maxFeePerGas": "0x...",
    "maxPriorityFeePerGas": "0x...",
    "nonce": 3
  },
  "mintPrice": "0.00025",
  "quantity": 1,
  "totalCost": "0.00025",
  "agentHint": "Sign locally with your EVM private key (never send the key over the network), gasLimit ~220000, then POST /submit with {signedTransaction}."
}
```

For a batch of N, `value` and `totalCost` will be N × the mint price; the encoded calldata targets `agentMint(quantity)`.

### Step 3: Sign the transaction locally

Sign with the user's EVM private key. **This must happen locally — the private key never leaves the machine.**

```javascript
import { ethers } from "ethers";

const PK = "YOUR_PRIVATE_KEY";
if (!/^0x[0-9a-fA-F]{64}$/.test(PK)) throw new Error("Invalid private key — must be 0x + 64 hex chars");

const provider = new ethers.JsonRpcProvider("https://rpc.mainnet.chain.robinhood.com");
const wallet = new ethers.Wallet(PK, provider);

// Robinhood Chain is an Arbitrum-style L2 with a single sequencer.
// Real-world observations from live mints on this chain:
//   - Base fee typically ~0.02-0.03 gwei
//   - EIP-1559 refunds the difference between maxFeePerGas and
//     effectiveGasPrice, so a generous ceiling is safe (not costly).
//   - A single mint uses ~150-220k gas
// The values below give a comfortable ceiling; real cost per mint
// is ~0.00001 ETH regardless of the cap you set.
const signedTx = await wallet.signTransaction({
  ...unsignedTx,
  gasLimit: 220000,
  maxFeePerGas: ethers.parseUnits("0.15", "gwei"),       // generous ceiling — chain refunds unused
  maxPriorityFeePerGas: ethers.parseUnits("0.01", "gwei"), // nominal — sequencer takes ~0
  nonce: await provider.getTransactionCount(wallet.address),
  type: 2,
});
```

**Prefer using the `maxFeePerGas` / `maxPriorityFeePerGas` returned by `/solve`** — they are fetched live from the chain. The hardcoded values above are only a fallback.

### Step 4: Submit the signed transaction

```bash
curl -X POST __BASE__/submit \
  -H "Content-Type: application/json" \
  -d '{
    "signedTransaction": "0x02f8..."
  }'
```

Response:
```json
{
  "success": true,
  "hash": "0xabc...",
  "quantity": 1,
  "startTokenId": "1",
  "to": "0x...",
  "minted": 1,
  "message": "Minted! See explorer."
}
```

For a batch of N, `quantity` is `N` and `startTokenId` is the first minted id (subsequent ids are sequential).

## Agent Behavior

- The user will provide their **EVM private key**. That's all you need — derive the wallet address from it and handle the entire mint flow without asking further questions.
- **Before starting**, open with exactly this format: *"Mint a BitPunk. Mint price is 0.00025 ETH + gas on Robinhood Chain. I need your EVM private key."* Do NOT round the mint price.
- **First mint is always single** — send `quantity: 1` (or omit `quantity`) on the first `/puzzle` call. Do NOT ask about batch upfront.
- **Step 1** (puzzle): derive wallet address from private key using `new ethers.Wallet(PK).address`, then `curl` POST to `/puzzle` with `{ wallet }` for single (or `{ wallet, quantity }` on subsequent batch mints).
- **Step 2** (solve): solve the puzzle and `curl` POST to `/solve`. Server returns `unsignedTx` with `value = quantity × mintPrice`.
- **Step 3** (sign): use a **single node script** that signs the unsigned tx locally. Do NOT split into separate steps.
- **Step 4** (submit): `curl` POST the signed transaction to `/submit`. Response includes `hash`, `quantity`, and `startTokenId`.
- **ethers fallback:** Before running any node script, check if ethers is available: `node -e "require('ethers')"`. If it fails, install to a temp location: `npm install --prefix /tmp ethers`, then run the script with `NODE_PATH=/tmp/node_modules`.
- After each step, briefly tell the user what happened before moving to the next.
- After a successful mint, show the `hash` and token id — tell them how many they've minted total and how many more they can mint (agent cap 15/wallet).
- **After the first successful mint, offer batch mode for subsequent mints.** Read `remaining` from `/check/{wallet}` and let `batchMax = min(remaining, 15)`. Then:
  - `batchMax === 0` → say *"This wallet has reached the 15-mint cap. Give me a new wallet's private key to continue."*
  - `batchMax === 1` → say *"You have 1 slot left. Want to mint the last one?"*
  - `batchMax === 2..4` → say *"You can mint up to N more in a single transaction. Want to batch (1..N) or one at a time?"* (N = batchMax)
  - `batchMax === 15` → say *"You can mint up to 15 more in a single transaction. Want to batch (1-15) or one at a time?"*
  - Use the user's answer as `quantity` on the next `/puzzle` call, capped at `batchMax`.
- **Before every batch mint, always check the wallet's remaining slots** by calling `GET /check/{wallet}`. Then:
  - If `remaining < requested_quantity`, **cap the batch at `remaining`** and tell the user: *"You have N slots left, minting N in one batch."*
  - If `remaining === 0`, the wallet is capped — say so and ask for a different wallet's key.
- **Never send `quantity` larger than `remaining`.** The server will return 413 `mint_limit_reached` and burn the request. Always cap client-side first.
- **Edge case — user says "mint 5" but only 1 slot left**: don't send `quantity: 5`. Check `remaining` → see `1` → tell user *"You only have 1 slot left, minting 1"* → send `quantity: 1`.
- **Edge case — user has 15 mints already**: they can't mint more from this wallet. Ask for a new wallet's private key and restart the flow with the new wallet.
- Handle errors gracefully — if a step fails, explain why and retry or stop.
- **Mint limit reached (413):** If `/puzzle` or `/solve` returns 413, the wallet has hit its 15-mint cap OR the requested batch exceeds `remaining`. Refetch `/check/{wallet}` to see how many slots are actually left, then either downsize the batch or ask for a new wallet key.
- **Insufficient ETH:** If the user's wallet balance is too low, tell them the exact amount needed: `quantity × 0.00025 ETH + gas`. Do not proceed until they confirm the wallet is funded.
- **Reveal note:** Reveal is controlled by the contract owner. Mints succeed regardless of reveal state; the artwork shows as a mystery until reveal is flipped.
- Never expose the user's EVM private key in output or logs.
