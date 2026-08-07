require("@nomicfoundation/hardhat-toolbox");
const fs = require("fs");

function loadPk() {
  // prefer .env DEPLOYER_PRIVATE_KEY, fallback to pons pk.txt
  try {
    const env = fs.readFileSync(__dirname + "/.env", "utf8");
    const m = env.match(/DEPLOYER_PRIVATE_KEY=(\S+)/);
    if (m && m[1]) return m[1].startsWith("0x") ? m[1] : "0x" + m[1];
  } catch {}
  try {
    const lines = fs.readFileSync("/root/pons-direct-launch/pk.txt", "utf8")
      .split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
    return lines[0].startsWith("0x") ? lines[0] : "0x" + lines[0];
  } catch { return "0x" + "11".repeat(32); }
}

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 500 } },
  },
  networks: {
    hardhat: {},
    robinhood: {
      url: "https://rpc.mainnet.chain.robinhood.com",
      chainId: 4663,
      accounts: [loadPk()],
      gasPrice: 100_000_000, // 0.1 gwei — above RH base fee (~0.03 gwei); EIP-1559 refunds unused
    },
  },
  mocha: { timeout: 120000 },
};