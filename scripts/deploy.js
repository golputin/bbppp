const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const BitPunks = await hre.ethers.getContractFactory("BitPunks");
  const bp = await BitPunks.deploy();
  await bp.waitForDeployment();
  const addr = await bp.getAddress();

  console.log("BitPunks deployed at:", addr);
  console.log("MAX_SUPPLY :", (await bp.MAX_SUPPLY()).toString());
  console.log("WEB_MINT_MAX:", (await bp.WEB_MINT_MAX()).toString());
  console.log("AGENT_MINT_MAX:", (await bp.AGENT_MINT_MAX()).toString());
  console.log("mintPrice:", (await bp.mintPrice()).toString());

  // open mint + set base URI host (placeholder, update after IPFS/static host ready)
  const tx1 = await bp.setMintOpen(true);
  await tx1.wait();
  console.log("mintOpen -> true at", addr);

  require("fs").writeFileSync(__dirname + "/deployed.json",
    JSON.stringify({ address: addr, chainId: 4663, deployer: deployer.address }, null, 2));
  console.log("saved deployed.json");
}

main().catch(e => { console.error(e); process.exit(1); });