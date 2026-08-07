const hre = require("hardhat");
const BASE = "https://consultancy-dogs-integrity-hosts.trycloudflare.com/metadata/";
async function main(){
  const [deployer] = await hre.ethers.getSigners();
  const { address } = JSON.parse(require("fs").readFileSync(__dirname+"/deployed.json","utf8"));
  const bp = await hre.ethers.getContractAt("BitPunks", address);
  const tx = await bp.setBaseURI(BASE);
  await tx.wait();
  console.log("baseURI ->", BASE, "at", address, "tx", tx.hash);
  // verify
  console.log("tokenURI(0):", await bp.tokenURI(0));
}
main().catch(e=>{console.error(e);process.exit(1);});
