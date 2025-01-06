import { Data, LucidEvolution, UTxO, Unit, fromHex, fromText, toText, toUnit } from "@lucid-evolution/lucid";
import { TrieDatum, TrieRedeemer } from "./types";
import { trieHash, trieScript } from "./const";
import { UTxOTokenName } from "./utils";
import * as plutus from "../plutus";

export async function createTrie(lucid: LucidEvolution, trieAddress: string, trieRewardAddress: string) {
  const utxos = await lucid.wallet().getUtxos();
  const genesisUtxo = utxos[0];
  const genesisDatum: TrieDatum = { TrieDatum: { key: "", children: [] } };
  const genesisRedeemer: TrieRedeemer = {
    Genesis: {
      inp: {
        transactionId: String(genesisUtxo.txHash),
        outputIndex: BigInt(genesisUtxo.outputIndex),
      },
      oidx: 0n,
    },
  };

  const trieId = UTxOTokenName(genesisUtxo);
  const trieUnit = toUnit(trieHash, trieId);

  const tx = await lucid
    .newTx()
    .collectFrom([genesisUtxo])
    .mintAssets({ [trieUnit]: 2n }, Data.void())
    // .attachMintingPolicy(trieScript)
    .withdraw(trieRewardAddress, (await lucid.delegationAt(trieRewardAddress)).rewards, Data.to(genesisRedeemer, TrieRedeemer))
    .attach.WithdrawalValidator(trieScript)
    .pay.ToContract(trieAddress, { kind: "inline", value: Data.to(genesisDatum, TrieDatum) }, { [trieUnit]: 1n })
    .pay.ToContract(trieAddress, { kind: "inline", value: Data.to({ TrieOriginState: { requiredWithdrawal: "" } }, TrieDatum) }, { [trieUnit]: 1n })
    .complete();

  const txS = await tx.sign.withWallet().complete();
  const txH = await txS.submit();
  console.log("createTrie:", txH);

  return { trieUnit };
}

export async function getUtxoByKey(lucid: LucidEvolution, id: Unit, key: string, trieAddress: string): Promise<UTxO | null> {
  const trieUtxo = await lucid.utxosAtWithUnit(trieAddress, id);
  for (const utxo of trieUtxo) {
    const datum = Data.from(utxo.datum!, TrieDatum);
    if ("TrieDatum" in datum) {
      if (toText(datum.TrieDatum.key) == key) {
        return utxo;
      }
    }
  }

  return null;
}

export async function getTrieOrigin(lucid: LucidEvolution, id: Unit, trieAddress: string): Promise<UTxO | null> {
  const trieUtxo = await lucid.utxosAtWithUnit(trieAddress, id);
  for (const utxo of trieUtxo) {
    const datum = Data.from(utxo.datum!, TrieDatum);
    if ("TrieOrigin" in datum) {
      return utxo;
    }
  }

  return null;
}

export async function appendTrie(
  lucid: LucidEvolution,
  trieUnit: string,
  trieOrigin: UTxO,
  utxo: UTxO,
  child_key: string,
  trieAddress: string,
  trieRewardAddress: string
) {
  const parentDatum = Data.from(utxo.datum!, TrieDatum);
  if (!("TrieDatum" in parentDatum)) {
    return;
  }

  const newParentDatum: TrieDatum = {
    TrieDatum: {
      key: parentDatum.TrieDatum.key,
      children: [...parentDatum.TrieDatum.children, fromText(child_key.slice(parentDatum.TrieDatum.key.length))].sort(),
    },
  };
  const childDatum: TrieDatum = {
    TrieDatum: {
      key: fromText(child_key),
      children: [],
    },
  };

  const appendRedeemer: TrieRedeemer = { Onto: { oidx: 0n } };

  const tx = await lucid
    .newTx()
    .collectFrom([utxo], Data.to({ wrapper: Data.void() }, plutus.TrieSpend["_r"]))
    // .attachSpendingValidator(trieScript)
    .mintAssets({ [trieUnit]: 1n }, Data.void())
    // .attachMintingPolicy(trieScript)
    .withdraw(trieRewardAddress, (await lucid.delegationAt(trieRewardAddress)).rewards, Data.to(appendRedeemer, TrieRedeemer))
    .attach.WithdrawalValidator(trieScript)
    .pay.ToContract(trieAddress, { kind: "inline", value: Data.to(newParentDatum, TrieDatum) }, { [trieUnit]: 1n })
    .pay.ToContract(trieAddress, { kind: "inline", value: Data.to(childDatum, TrieDatum) }, { [trieUnit]: 1n })
    .complete();

  const txS = await tx.sign.withWallet().complete();
  const txH = await txS.submit();
  console.log("appendTrie:", txH);

  return txH;
}

export async function betweenTrie(
  lucid: LucidEvolution,
  trieUnit: string,
  trieOrigin: UTxO,
  utxo: UTxO,
  child_key: string,
  trieAddress: string,
  trieRewardAddress: string
) {
  const parentDatum = Data.from(utxo.datum!, TrieDatum);
  if (!("TrieDatum" in parentDatum)) {
    return;
  }

  const parentKey = toText(parentDatum.TrieDatum.key);

  let replacing: string | undefined;
  for (const child of parentDatum.TrieDatum.children) {
    const key = toText(child);
    if (key.slice(0, 1) == child_key.slice(parentKey.length).slice(0, 1)) {
      replacing = key;
    }
  }
  if (!replacing) {
    throw new Error("Parent did not have conflicting child key");
  }

  const newParentDatum: TrieDatum = {
    TrieDatum: {
      key: fromText(parentDatum.TrieDatum.key),
      children: [...parentDatum.TrieDatum.children.filter((x) => toText(x) != replacing), fromText(child_key.slice(parentDatum.TrieDatum.key.length))].sort(),
    },
  };
  const childDatum: TrieDatum = {
    TrieDatum: {
      key: fromText(child_key),
      children: [fromText((parentKey + replacing).slice(child_key.length))],
    },
  };

  const appendRedeemer: TrieRedeemer = { Between: { oidx: 0n } };

  const tx = await lucid
    .newTx()
    .collectFrom([utxo], Data.to({ wrapper: Data.void() }, plutus.TrieSpend["_r"]))
    // .attachSpendingValidator(trieScript)
    .mintAssets({ [trieUnit]: 1n }, Data.void())
    // .attachMintingPolicy(trieScript)
    .withdraw(trieRewardAddress, (await lucid.delegationAt(trieRewardAddress)).rewards, Data.to(appendRedeemer, TrieRedeemer))
    .attach.WithdrawalValidator(trieScript)
    .pay.ToContract(trieAddress, { kind: "inline", value: Data.to(newParentDatum, TrieDatum) }, { [trieUnit]: 1n })
    .pay.ToContract(trieAddress, { kind: "inline", value: Data.to(childDatum, TrieDatum) }, { [trieUnit]: 1n })
    .complete();

  const txS = await tx.sign.withWallet().complete();
  const txH = await txS.submit();
  console.log("betweenTrie:", txH);

  return txH;
}
