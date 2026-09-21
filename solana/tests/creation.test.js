import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import * as anchor from '@coral-xyz/anchor';
import { Keypair, PublicKey, SYSVAR_RENT_PUBKEY, SystemProgram, Transaction } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddress,
  getMint,
} from '@solana/spl-token';

const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const SCALE = 1_000_000n;
const TOTAL = 1_000_000_000n * SCALE;
const CURVE_ALLOCATION = 793_100_000n * SCALE;
const LIQUIDITY_ALLOCATION = 206_900_000n * SCALE;
const VIRTUAL_SOL_RESERVES = 30_000_000_000n;
const GRADUATION_TARGET = 85_000_000_000n;
const NAME = 'Kydos Test Coin';
const SYMBOL = 'KYTEST';
const URI = 'https://example.com/kydos-test.json';

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.KydosLaunchpad;
const mint = Keypair.generate();
const [curve, bump] = PublicKey.findProgramAddressSync([Buffer.from('curve'), mint.publicKey.toBuffer()], program.programId);
const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), mint.publicKey.toBuffer()], program.programId);
const [metadata] = PublicKey.findProgramAddressSync([Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mint.publicKey.toBuffer()], METADATA_PROGRAM_ID);

function readString(data, cursor) {
  const length = data.readUInt32LE(cursor.offset); cursor.offset += 4;
  const value = data.subarray(cursor.offset, cursor.offset + length).toString('utf8').replace(/\0+$/, '');
  cursor.offset += length;
  return value;
}

before(async () => {
  await program.methods.initialize(NAME, SYMBOL, URI).accountsStrict({
    creator: provider.wallet.publicKey,
    mint: mint.publicKey,
    curve,
    vault,
    metadata,
    metadataProgram: METADATA_PROGRAM_ID,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
  }).signers([mint]).rpc();
});

test('creates the deterministic mint, curve and vault with canonical allocations', async () => {
  const mintState = await getMint(provider.connection, mint.publicKey);
  const vaultState = await getAccount(provider.connection, vault);
  const state = await program.account.curve.fetch(curve);
  assert.equal(mintState.decimals, 6);
  assert.equal(mintState.supply, TOTAL);
  assert.equal(vaultState.amount, TOTAL);
  assert.ok(vaultState.owner.equals(curve));
  assert.ok(state.mint.equals(mint.publicKey));
  assert.ok(state.creator.equals(provider.wallet.publicKey));
  assert.equal(state.bump, bump);
  assert.equal(BigInt(state.totalSupply.toString()), TOTAL);
  assert.equal(BigInt(state.curveTokenAllocation.toString()), CURVE_ALLOCATION);
  assert.equal(BigInt(state.liquidityTokenAllocation.toString()), LIQUIDITY_ALLOCATION);
  assert.equal(BigInt(state.virtualTokenReserves.toString()), CURVE_ALLOCATION);
  assert.equal(BigInt(state.virtualSolReserves.toString()), VIRTUAL_SOL_RESERVES);
  assert.equal(BigInt(state.realTokenReserves.toString()), CURVE_ALLOCATION);
  assert.equal(BigInt(state.realSolReserves.toString()), 0n);
  assert.equal(BigInt(state.graduationTarget.toString()), GRADUATION_TARGET);
  assert.equal(vaultState.amount, BigInt(state.realTokenReserves.toString()) + BigInt(state.liquidityTokenAllocation.toString()));
  assert.equal(state.graduated, false);
});

test('creates canonical Metaplex metadata for the mint', async () => {
  const info = await provider.connection.getAccountInfo(metadata, 'confirmed');
  assert.ok(info);
  assert.ok(info.owner.equals(METADATA_PROGRAM_ID));
  const cursor = { offset: 1 + 32 };
  assert.ok(new PublicKey(info.data.subarray(cursor.offset, cursor.offset += 32)).equals(mint.publicKey));
  assert.equal(readString(info.data, cursor), NAME);
  assert.equal(readString(info.data, cursor), SYMBOL);
  assert.equal(readString(info.data, cursor), URI);
});

test('rejects a creator-signed transfer from the Curve PDA vault', async () => {
  const destination = await getAssociatedTokenAddress(mint.publicKey, provider.wallet.publicKey);
  const transaction = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      provider.wallet.publicKey,
      destination,
      provider.wallet.publicKey,
      mint.publicKey,
    ),
    createTransferInstruction(vault, destination, provider.wallet.publicKey, 1n),
  );
  await assert.rejects(provider.sendAndConfirm(transaction), /owner does not match|custom program error|authority/i);
  assert.equal((await getAccount(provider.connection, vault)).amount, TOTAL);
});

test('permanently revokes mint and freeze authorities', async () => {
  const state = await getMint(provider.connection, mint.publicKey);
  assert.equal(state.mintAuthority, null);
  assert.equal(state.freezeAuthority, null);
  const transaction = new Transaction().add(createMintToInstruction(mint.publicKey, vault, provider.wallet.publicKey, TOTAL));
  await assert.rejects(provider.sendAndConfirm(transaction), /owner does not match|custom program error|authority/i);
  assert.equal((await getMint(provider.connection, mint.publicKey)).supply, TOTAL);
});

test('rejects duplicate initialization for the same mint and launch PDAs', async () => {
  await assert.rejects(program.methods.initialize(NAME, SYMBOL, URI).accountsStrict({
    creator: provider.wallet.publicKey,
    mint: mint.publicKey,
    curve,
    vault,
    metadata,
    metadataProgram: METADATA_PROGRAM_ID,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
  }).signers([mint]).rpc(), /already in use|custom program error|Allocate/i);
});