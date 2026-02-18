import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const RPC_URL = import.meta.env.VITE_HELIUS_RPC_URL;
const connection = new Connection(RPC_URL);

export async function getSolanaBalances(
  addresses: string[]
): Promise<Record<string, number>> {
  const balances: Record<string, number> = {};

  const pubkeys = addresses.map((a) => new PublicKey(a));
  const results = await connection.getMultipleAccountsInfo(pubkeys);

  for (let i = 0; i < addresses.length; i++) {
    const info = results[i];
    balances[addresses[i]] = info ? info.lamports / LAMPORTS_PER_SOL : 0;
  }

  return balances;
}

export function formatSol(amount: number): string {
  if (amount === 0) return "0 SOL";
  if (amount < 0.001) return "<0.001 SOL";
  return `${amount.toFixed(4)} SOL`;
}
