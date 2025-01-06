import { Emulator, Lucid, LucidEvolution, validatorToAddress, validatorToRewardAddress } from "@lucid-evolution/lucid";
import { defaultProtocolParams } from "./constants";
import { generateAccount } from "./utils";
import { trieScript } from "../src/const";
import { appendTrie, betweenTrie, createTrie, getTrieOrigin, getUtxoByKey } from "../src";

console.log(`Trie Script Size: ${trieScript.script.length / 2}`);

describe("Synthetics", () => {
  let emulator: Emulator;
  let lucid: LucidEvolution;
  let trieAddress: string;
  let trieRewardAddress: string;

  beforeEach(async () => {
    emulator = new Emulator([]);
    lucid = await Lucid(emulator, "Custom");
    trieAddress = validatorToAddress("Custom", trieScript);
    trieRewardAddress = validatorToRewardAddress("Custom", trieScript);

    const TRIE_USER = await generateAccount({ lovelace: 100_000_000_000_000000n });

    emulator = new Emulator([TRIE_USER], defaultProtocolParams);
    emulator.chain[trieRewardAddress] = { registeredStake: true, delegation: { rewards: 0n, poolId: "" } };

    lucid = await Lucid(emulator, "Custom");
    lucid.selectWallet.fromPrivateKey(TRIE_USER.privateKey);
  });

  it("Should pass e2e on creation, two insertions", async () => {
    const trie = await createTrie(lucid, trieAddress, trieRewardAddress);
    emulator.awaitBlock(10);

    const trieOrigin = await getTrieOrigin(lucid, trie.trieUnit, trieAddress);
    const trieUtxo = await getUtxoByKey(lucid, trie.trieUnit, "", trieAddress);
    await appendTrie(lucid, trie.trieUnit, trieOrigin!, trieUtxo!, "hello_world", trieAddress, trieRewardAddress);
    emulator.awaitBlock(20);

    const newTrieUtxo = await getUtxoByKey(lucid, trie.trieUnit, "", trieAddress);
    await betweenTrie(lucid, trie.trieUnit, trieOrigin!, newTrieUtxo!, "hello", trieAddress, trieRewardAddress);
  });

  it("Should fail on duplicate insertion (1)", async () => {
    const trie = await createTrie(lucid, trieAddress, trieRewardAddress);
    emulator.awaitBlock(10);

    const trieOrigin = await getTrieOrigin(lucid, trie.trieUnit, trieAddress);
    const trieUtxo = await getUtxoByKey(lucid, trie.trieUnit, "", trieAddress);
    await appendTrie(lucid, trie.trieUnit, trieOrigin!, trieUtxo!, "hello_world", trieAddress, trieRewardAddress);
    emulator.awaitBlock(20);

    const newTrieUtxo = await getUtxoByKey(lucid, trie.trieUnit, "", trieAddress);
    betweenTrie(lucid, trie.trieUnit, trieOrigin!, newTrieUtxo!, "hello_world", trieAddress, trieRewardAddress)
      .then(() => {
        throw "This should have failed";
      })
      .catch((error) => {
        if (error === "This should have failed") throw error;
        else {
          console.log("betweenTrie:");
          console.error(eval(JSON.parse(JSON.stringify(error)).cause.failure.cause).replaceAll(" Trace ", " \n "));
          console.log("failure successful");
        }
      });
  });

  it("Should fail on duplicate insertion (2)", async () => {
    const trie = await createTrie(lucid, trieAddress, trieRewardAddress);
    emulator.awaitBlock(10);

    const trieOrigin = await getTrieOrigin(lucid, trie.trieUnit, trieAddress);
    const trieUtxo = await getUtxoByKey(lucid, trie.trieUnit, "", trieAddress);
    await appendTrie(lucid, trie.trieUnit, trieOrigin!, trieUtxo!, "hello_world", trieAddress, trieRewardAddress);
    emulator.awaitBlock(20);

    const newTrieUtxo = await getUtxoByKey(lucid, trie.trieUnit, "", trieAddress);
    betweenTrie(lucid, trie.trieUnit, trieOrigin!, newTrieUtxo!, "hello_world", trieAddress, trieRewardAddress)
      .then(() => {
        throw "This should have failed";
      })
      .catch((error) => {
        if (error === "This should have failed") throw error;
        else {
          console.log("betweenTrie:");
          console.error(eval(JSON.parse(JSON.stringify(error)).cause.failure.cause).replaceAll(" Trace ", " \n "));
          console.log("failure successful");
        }
      });
  });
});
