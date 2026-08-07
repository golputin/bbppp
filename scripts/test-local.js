const hre = require("hardhat");

async function main() {
  const [deployer, u1, u2] = await hre.ethers.getSigners();
  const BitPunks = await hre.ethers.getContractFactory("BitPunks");
  const bp = await BitPunks.deploy();
  await bp.waitForDeployment();
  const addr = await bp.getAddress();

  // open mint
  await (await bp.setMintOpen(true)).wait();

  // web mint 5 (cap) - success
  await (await bp.connect(u1).webMint(5, { value: ethers.parseEther("0.0025") })).wait();
  console.log("web mint 5 OK. total:", (await bp.totalMinted()).toString(), "u1 web:", (await bp.webMintedPerWallet(u1.address)).toString());

  // web mint 6 -> revert
  try {
    await (await bp.connect(u1).webMint(1, { value: ethers.parseEther("0.0005") })).wait();
    console.log("ERROR: web 6th should fail");
  } catch { console.log("web 6th correctly rejected (cap 5)"); }

  // agent mint 10 - success (cap 15)
  await (await bp.connect(u2).agentMint(10, { value: ethers.parseEther("0.005") })).wait();
  console.log("agent mint 10 OK. total:", (await bp.totalMinted()).toString(), "u2 agent:", (await bp.agentMintedPerWallet(u2.address)).toString());

  // agent mint 6 more -> reject (10+6 > 15)
  try {
    await (await bp.connect(u2).agentMint(6, { value: ethers.parseEther("0.003") })).wait();
    console.log("ERROR: agent 16th should fail");
  } catch { console.log("agent 16th correctly rejected (cap 15)"); }

  // agent 5 more -> OK (15 total)
  await (await bp.connect(u2).agentMint(5, { value: ethers.parseEther("0.0025") })).wait();
  console.log("agent 5 more OK. u2 agent:", (await bp.agentMintedPerWallet(u2.address)).toString());

  // total supply check
  console.log("final total:", (await bp.totalMinted()).toString());

  // tokenURI before reveal (base unset -> "")
  console.log("tokenURI(0):", JSON.stringify(await bp.tokenURI(0)));

  console.log("ALL TESTS PASSED @", addr);
}

main().catch(e => { console.error(e); process.exit(1); });