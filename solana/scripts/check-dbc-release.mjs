/** Read-only deployment verification. No wallet, keypair, signing or send API. */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Buffer } from 'buffer';
import { Connection, PublicKey } from '@solana/web3.js';
import { KYDOS, UPGRADEABLE_LOADER, verifyDbcRelease, sha256 } from '../../src/lib/solana/dbcBrowser.js';
import { dbcNetwork } from '../../src/lib/solana/dbcLinks.js';

export function assertApprovedBinary(programData, approvedBinary) {
  const bytes=Buffer.from(programData), binary=Buffer.from(approvedBinary);
  if (binary.length < 4 || !binary.subarray(0,4).equals(Buffer.from([127,69,76,70]))) throw new Error('Approved SBF binary must be an ELF file');
  if (bytes.length < 45+binary.length || bytes.readUInt32LE(0)!==3 ||
      !bytes.subarray(45,45+binary.length).equals(binary) || bytes.subarray(45+binary.length).some(Boolean)) {
    throw new Error('Deployed Kydos bytecode does not match the approved SBF binary');
  }
}
export async function checkDbcDeployment({connection,release,binary}) {
  const verified=await verifyDbcRelease(connection,release);
  const pd=PublicKey.findProgramAddressSync([KYDOS.toBuffer()],UPGRADEABLE_LOADER)[0];
  const info=await connection.getAccountInfo(pd,'confirmed');
  if (!info || info.executable || !info.owner.equals(UPGRADEABLE_LOADER) ||
      await sha256(info.data)!==verified.programDataHashes[KYDOS.toBase58()]) throw new Error('ProgramData changed during deployment verification');
  assertApprovedBinary(info.data,binary);
  if (await connection.getGenesisHash()!==verified.genesisHash) throw new Error('Network changed during deployment verification');
  return {network:dbcNetwork(verified.genesisHash).name,program:KYDOS.toBase58(),config:verified.config,
    approvedBinarySha256:await sha256(binary),approvedBinaryBytes:binary.length,readOnly:true,transactionsSubmitted:0};
}
async function main() {
  const args=process.argv.slice(2);
  if (args.length!==4 || args[0]!=='--manifest' || args[2]!=='--program') throw new Error('Use: node solana/scripts/check-dbc-release.mjs --manifest release.json --program approved.so');
  const rpc=process.env.HELIUS_RPC_URL;
  const endpoint=new URL(rpc);
  if (endpoint.protocol!=='https:' || endpoint.username || endpoint.password) throw new Error('Set HELIUS_RPC_URL to a trusted HTTPS RPC');
  const release=JSON.parse(await readFile(args[1],'utf8')), binary=await readFile(args[3]);
  const result=await checkDbcDeployment({connection:new Connection(rpc,'confirmed'),release,binary});
  console.log(JSON.stringify(result,null,2));
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(()=>{
    // Transport errors can include credential-bearing RPC URLs; never echo them.
    console.error('Release verification failed. Check the reviewed manifest, approved SBF file and HTTPS HELIUS_RPC_URL. No transaction was sent.');
    process.exitCode=1;
  });
}
