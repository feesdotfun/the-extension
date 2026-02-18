import { Turnkey } from "@turnkey/sdk-server";
import {
  encryptPrivateKeyToBundle,
  encryptWalletToBundle,
  generateP256KeyPair,
  decryptExportBundle,
} from "@turnkey/crypto";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import type { TurnkeySession, Wallet } from "./types";
import { cacheWallet } from "./wallet-cache";

export function getTurnkeyClient(session: TurnkeySession) {
  const turnkey = new Turnkey({
    apiBaseUrl: "https://api.turnkey.com",
    apiPublicKey: session.apiPublicKey,
    apiPrivateKey: session.apiPrivateKey,
    defaultOrganizationId: session.organizationId,
  });
  return turnkey.apiClient();
}

export async function listWallets(
  client: ReturnType<typeof getTurnkeyClient>
): Promise<Wallet[]> {
  const { wallets } = await client.getWallets({});

  const result: Wallet[] = [];
  for (const w of wallets) {
    const { accounts } = await client.getWalletAccounts({
      walletId: w.walletId,
    });

    result.push({
      walletId: w.walletId,
      walletName: w.walletName,
      createdAt: (w as any).createdAt?.seconds ?? (w as any).createdAt ?? undefined,
      accounts: accounts.map((a) => ({
        address: a.address,
        addressFormat: a.addressFormat,
        path: a.path,
      })),
    });
  }

  return result;
}

export async function createWallet(
  client: ReturnType<typeof getTurnkeyClient>,
  name: string,
  chains: ("solana" | "evm")[]
): Promise<Wallet> {
  const accounts = [];

  if (chains.includes("solana")) {
    accounts.push({
      curve: "CURVE_ED25519" as const,
      pathFormat: "PATH_FORMAT_BIP32" as const,
      path: "m/44'/501'/0'/0'",
      addressFormat: "ADDRESS_FORMAT_SOLANA" as const,
    });
  }

  if (chains.includes("evm")) {
    accounts.push({
      curve: "CURVE_SECP256K1" as const,
      pathFormat: "PATH_FORMAT_BIP32" as const,
      path: "m/44'/60'/0'/0/0",
      addressFormat: "ADDRESS_FORMAT_ETHEREUM" as const,
    });
  }

  const result = await client.createWallet({
    walletName: name,
    accounts,
  });

  const walletId = result.walletId;
  const { accounts: walletAccounts } = await client.getWalletAccounts({
    walletId,
  });

  return {
    walletId,
    walletName: name,
    accounts: walletAccounts.map((a) => ({
      address: a.address,
      addressFormat: a.addressFormat,
      path: a.path,
    })),
  };
}

export async function importPrivateKey(
  client: ReturnType<typeof getTurnkeyClient>,
  session: TurnkeySession,
  name: string,
  privateKey: string,
  keyFormat: "solana" | "evm"
): Promise<{ privateKeyId: string; addresses: { address: string; format: string }[] }> {
  // Step 1: Init import — get enclave's public key bundle
  const initResult = await client.initImportPrivateKey({
    userId: session.userId,
  });

  // Step 2: Encrypt the private key client-side using @turnkey/crypto
  const tkKeyFormat = keyFormat === "solana" ? "SOLANA" : "HEXADECIMAL";
  const encryptedBundle = await encryptPrivateKeyToBundle({
    privateKey,
    keyFormat: tkKeyFormat,
    importBundle: initResult.importBundle,
    userId: session.userId,
    organizationId: session.organizationId,
  });

  // Step 3: Submit encrypted key to Turnkey
  const addressFormat =
    keyFormat === "solana"
      ? "ADDRESS_FORMAT_SOLANA"
      : "ADDRESS_FORMAT_ETHEREUM";
  const curve =
    keyFormat === "solana" ? "CURVE_ED25519" : "CURVE_SECP256K1";

  const result = await client.importPrivateKey({
    userId: session.userId,
    privateKeyName: name,
    encryptedBundle,
    curve,
    addressFormats: [addressFormat],
  });

  const importResult = {
    privateKeyId: result.privateKeyId,
    addresses: result.addresses.map((a) => ({
      address: a.address ?? "",
      format: a.format ?? "",
    })),
  };

  // Cache the private key for each returned address
  for (const addr of importResult.addresses) {
    if (addr.address) {
      const chain = addr.format === "ADDRESS_FORMAT_SOLANA" ? "solana" : "evm";
      cacheWallet(addr.address, privateKey, {
        walletId: result.privateKeyId,
        walletName: name,
        chain,
      }).catch(() => {});
    }
  }

  return importResult;
}

export async function importSeedPhrase(
  client: ReturnType<typeof getTurnkeyClient>,
  session: TurnkeySession,
  name: string,
  mnemonic: string,
  chains: ("solana" | "evm")[]
): Promise<{ walletId: string; addresses: string[] }> {
  // Step 1: Init import
  const initResult = await client.initImportWallet({
    userId: session.userId,
  });

  // Step 2: Encrypt the mnemonic client-side
  const encryptedBundle = await encryptWalletToBundle({
    mnemonic,
    importBundle: initResult.importBundle,
    userId: session.userId,
    organizationId: session.organizationId,
  });

  // Step 3: Build account configs
  const accounts = [];
  if (chains.includes("solana")) {
    accounts.push({
      curve: "CURVE_ED25519" as const,
      pathFormat: "PATH_FORMAT_BIP32" as const,
      path: "m/44'/501'/0'/0'",
      addressFormat: "ADDRESS_FORMAT_SOLANA" as const,
    });
  }
  if (chains.includes("evm")) {
    accounts.push({
      curve: "CURVE_SECP256K1" as const,
      pathFormat: "PATH_FORMAT_BIP32" as const,
      path: "m/44'/60'/0'/0/0",
      addressFormat: "ADDRESS_FORMAT_ETHEREUM" as const,
    });
  }

  const result = await client.importWallet({
    userId: session.userId,
    walletName: name,
    encryptedBundle,
    accounts,
  });

  return {
    walletId: result.walletId,
    addresses: result.addresses,
  };
}

export async function exportAccountKey(
  client: ReturnType<typeof getTurnkeyClient>,
  session: TurnkeySession,
  address: string,
  meta?: { walletId: string; walletName: string; chain: "solana" | "evm" },
): Promise<string> {
  const keyPair = generateP256KeyPair();

  const result = await client.exportWalletAccount({
    address,
    targetPublicKey: keyPair.publicKeyUncompressed,
  });

  const rawKey = await decryptExportBundle({
    exportBundle: result.exportBundle,
    embeddedKey: keyPair.privateKey,
    organizationId: session.organizationId,
    returnMnemonic: false,
  });

  // Convert hex seed to base58 full secret key for Solana
  const chain = meta?.chain ?? "solana";
  let privateKey = rawKey;
  if (chain === "solana") {
    const seed = new Uint8Array(rawKey.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
    const kp = Keypair.fromSeed(seed);
    privateKey = bs58.encode(kp.secretKey as unknown as number[]);
  }

  // Cache the exported key
  cacheWallet(address, privateKey, meta ?? {
    walletId: "",
    walletName: "",
    chain: "solana",
  }).catch(() => {});

  return privateKey;
}

export async function renameWallet(
  client: ReturnType<typeof getTurnkeyClient>,
  walletId: string,
  newName: string
): Promise<void> {
  await client.updateWallet({
    walletId,
    walletName: newName,
  });
}
