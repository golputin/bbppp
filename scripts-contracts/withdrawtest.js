const hre = require("hardhat");
async function main(){
  const [deployer] = await hre.ethers.getSigners();
  const { address } = JSON.parse(require("fs").readFileSync(__dirname+"/deployed.json","utf8"));
  const bp = await hre.ethers.getContractAt("BitPunks", address);
  const before = await hre.ethers.provider.getBalance(deployer.address);
  console.log("owner before:", hre.ethers.formatEther(before));
  // deposit 0.0001 ETH via receive()
  const dep = await deployer.sendTransaction({ to: address, value: hre.ethers.parseEther("0.0001") });
  await dep.wait();
  console.log("deposit tx:", dep.hash);
  const bal2 = await hre.ethers.provider.getBalance(address);
  console.log("contract balance:", hre.ethers.formatEther(bal2));
  // withdraw
  const w = await bp.withdraw();
  await w.wait();
  const bal3 = await hre.ethers.provider.getBalance(address);
  const ownerAfter = await hre.ethers.provider.getBalance(deployer.address);
  console.log("contract after withdraw:", hre.ethers.formatEther(bal3));
  console.log("owner after:", hre.ethers.formatEther(ownerAfter));
  console.log(bal3===0n ? "✅ WITHDRAW OK — 0 stuck in contract" : "⚠ leftover");
}
main().catch(e=>{console.error(e);process.exit(1);});
