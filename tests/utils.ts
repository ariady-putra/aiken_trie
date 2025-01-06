import { Assets, EmulatorAccount, generateEmulatorAccountFromPrivateKey } from "@lucid-evolution/lucid";

export async function generateAccount(assets: Assets): Promise<EmulatorAccount> {
  return generateEmulatorAccountFromPrivateKey(assets);
}
