/**
 * Wojakcoin crypto: WIF, address, tx building/signing
 * Private key only - no mnemonic
 */

import * as bitcoin from "bitcoinjs-lib";
import ecc from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";

const ECPair = ECPairFactory(ecc);
bitcoin.initEccLib(ecc);

// Wojakcoin mainnet (from chainparams.cpp) - no bech32/SegWit
export const WOJAK_NETWORK: bitcoin.Network = {
  messagePrefix: "\x19Wojakcoin Signed Message:\n",
  bech32: "", // ecpair requires string; Wojakcoin uses legacy only
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  pubKeyHash: 0x49, // W prefix
  scriptHash: 0x05,
  wif: 0xc9,
};

/** Generate new random private key, return WIF */
export function generatePrivateKey(): string {
  const keyPair = ECPair.makeRandom({ network: WOJAK_NETWORK });
  return keyPair.toWIF();
}

/** Get P2PKH address from WIF */
export function addressFromWif(wif: string): string {
  const keyPair = ECPair.fromWIF(wif, WOJAK_NETWORK);
  const pubkey = keyPair.publicKey;
  // bitcoinjs-lib expects Buffer; ecpair returns Uint8Array; SES/extensions can break instanceof
  const pubkeyBuf = Buffer.from(Array.from(pubkey));
  const { address } = bitcoin.payments.p2pkh({
    pubkey: pubkeyBuf,
    network: WOJAK_NETWORK,
  });
  if (!address) throw new Error("Failed to derive address");
  return address;
}

/** Validate WIF for Wojakcoin */
export function isValidWif(wif: string): boolean {
  try {
    ECPair.fromWIF(wif, WOJAK_NETWORK);
    return true;
  } catch {
    return false;
  }
}

export interface UtxoInput {
  txid: string;
  vout: number;
  value: number;
  /** Full raw tx hex - required for P2PKH signing */
  prevTxHex: string;
}

/** Ensure value is a Buffer (SES/extensions can produce Uint8Array). */
function toBuffer(v: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(v) ? v : Buffer.from(v);
}

/** Build and sign a transaction. Wojakcoin uses tx version 1. */
export function buildAndSignTx(
  wif: string,
  utxos: UtxoInput[],
  outputs: { address: string; value: number }[],
  feeRate: number,
  opReturn?: string,
  opReturnIsHex?: boolean
): string {
  const keyPair = ECPair.fromWIF(wif, WOJAK_NETWORK);
  const psbt = new bitcoin.Psbt({ network: WOJAK_NETWORK });

  // Signer wrapper: ecpair returns Uint8Array; bitcoinjs/bip174 expect Buffer
  const signer = {
    publicKey: toBuffer(keyPair.publicKey),
    sign: (hash: Buffer) => toBuffer(keyPair.sign(hash)),
  };

  let totalInput = 0;
  for (const utxo of utxos) {
    totalInput += utxo.value;
    const txHash = toBuffer(Buffer.from(utxo.txid, "hex").reverse());
    const prevTx = bitcoin.Transaction.fromHex(utxo.prevTxHex);
    const prevOut = prevTx.outs[utxo.vout];
    if (!prevOut) throw new Error(`Invalid vout ${utxo.vout} for tx ${utxo.txid}`);

    psbt.addInput({
      hash: txHash,
      index: utxo.vout,
      nonWitnessUtxo: toBuffer(prevTx.toBuffer()),
    });
  }

  let totalOutput = 0;
  for (const out of outputs) {
    totalOutput += out.value;
    const script = toBuffer(bitcoin.address.toOutputScript(out.address, WOJAK_NETWORK));
    psbt.addOutput({ script, value: Number(out.value) });
  }

  const opReturnTrim = opReturn?.trim();
  const hasOpReturn = opReturnTrim && opReturnTrim.length > 0;

  const opReturnOutputCount = hasOpReturn ? 1 : 0;
  const estimatedSize = 34 + utxos.length * 148 + (outputs.length + opReturnOutputCount) * 34;
  const fee = Math.ceil((estimatedSize * feeRate) / 4);
  const change = totalInput - totalOutput - fee;

  if (change < 0) throw new Error("Insufficient funds");
  if (change >= 546) {
    const myAddress = addressFromWif(wif);
    const changeScript = toBuffer(bitcoin.address.toOutputScript(myAddress, WOJAK_NETWORK));
    psbt.addOutput({ script: changeScript, value: Number(change) });
  }

  if (hasOpReturn) {
    const opReturnData = opReturnIsHex
      ? Buffer.from(opReturnTrim.replace(/^0x/i, ""), "hex")
      : Buffer.from(opReturnTrim, "utf8");
    const opReturnScript = toBuffer(
      bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, opReturnData])
    );
    psbt.addOutput({ script: opReturnScript, value: 0 });
  }

  // Must set version 1 BEFORE signing; signature covers tx hash which includes version
  psbt.setVersion(1);

  for (let i = 0; i < utxos.length; i++) {
    psbt.signInput(i, signer);
  }
  psbt.finalizeAllInputs();

  const tx = psbt.extractTransaction();
  return tx.toHex();
}
