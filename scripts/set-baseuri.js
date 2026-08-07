// Set baseURI + verify tokenURI on deployed BitPunks
const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const DEP = JSON.parse(fs.readFileSync(__dirname + "/deployed.json", "utf8"));
  const addr = DEP.address;
  const [deployer] = await hre.ethers.getSigners();

  const base = process.env.BASE_URI || "";
  const bp = await hre.ethers.getContractAt("BitPunks", addr);
  console.log("contract:", addr);

  if (base) {
    const tx = await bp.setBaseURI(base);
    await tx.wait();
    console.log("baseURI set ->", base);
  }
  console.log("baseURI now:", await bp.baseURI());

  // verify tokenURI (token 0 exists only after mint; use revert check)
  try {
    const uri = await bp.tokenURI(0);
    console.log("tokenURI(0):", uri);
  } catch (e) {
    console.log("tokenURI(0) check:", e.shortMessage || e.message);
  }
  console.log("owner:", await bp.owner());
}

main().catch(e => { console.error(e); process.exit(1); });