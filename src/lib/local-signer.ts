import { VersionedTransaction, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { getCachedKey } from "./wallet-cache";

interface UnsignedTx {
  base58: string;
  signers: string[]; // base58-encoded secret keys (e.g. mint keypair)
}

/**
 * Sign an array of unsigned transactions locally.
 *
 * For each transaction:
 * 1. Deserialize the unsigned VersionedTransaction from base58
 * 2. Sign with the user's wallet key (decrypted from wallet-cache)
 * 3. Sign with any additional signers provided (e.g. mint keypair)
 * 4. Return the signed transaction as base58
 *
 * @param transactions - Array of unsigned transactions with their required signers
 * @param walletAddress - The user's deployer wallet address (to look up in wallet-cache)
 * @returns Array of base58-encoded signed transactions
 */
export async function signAndSerializeTransactions(
  transactions: UnsignedTx[],
  walletAddress: string,
): Promise<string[]> {
  const privateKeyBase58 = await getCachedKey(walletAddress);
  if (!privateKeyBase58) {
    throw new Error(`No cached key found for wallet ${walletAddress.slice(0, 8)}...`);
  }

  const payerKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
  const signed: string[] = [];

  for (const { base58: txBase58, signers } of transactions) {
    const tx = VersionedTransaction.deserialize(bs58.decode(txBase58));

    const allSigners: Keypair[] = [payerKeypair];
    for (const signerSecret of signers) {
      const keypair = Keypair.fromSecretKey(bs58.decode(signerSecret));
      if (!allSigners.some((s) => s.publicKey.equals(keypair.publicKey))) {
        allSigners.push(keypair);
      }
    }

    tx.sign(allSigners);
    signed.push(bs58.encode(tx.serialize()));
  }

  return signed;
}
