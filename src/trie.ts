import {
  Data,
  Lucid,
  UTxO,
  Unit,
  fromText,
  toText,
  toUnit,
} from 'lucid-cardano'
import { TrieDatum, TrieRedeemer } from './types'
import { trieHash, trieScript } from './const'
import { UTxOTokenName } from './utils'
import * as plutus from '../plutus'

export async function createTrie(lucid: Lucid, trieAddress: string, trieRewardAddress: string) {
  let utxos = await lucid.wallet.getUtxos()
  let genesisUtxo = utxos[0]
  let genesisDatum: TrieDatum = {
    TrieDatum: {
      key: '',
      children: [],
    },
  }
  let genesisRedeemer: TrieRedeemer = {
    Genesis: {
      inp: {
        transactionId: {
          hash: genesisUtxo.txHash,
        },
        outputIndex: BigInt(genesisUtxo.outputIndex),
      },
      oidx: 0n,
    },
  }
  let trieId = UTxOTokenName(genesisUtxo)
  let trieUnit = toUnit(trieHash, trieId)
  let tx = lucid
    .newTx()
    .collectFrom([genesisUtxo])
    .withdraw(trieRewardAddress, 0n, Data.to(genesisRedeemer, TrieRedeemer))
    .mintAssets({ [trieUnit]: 2n }, Data.void())
    .attachWithdrawalValidator(trieScript)
    .payToContract(
      trieAddress,
      { inline: Data.to(genesisDatum, TrieDatum) },
      { [trieUnit]: 1n },
    )
    .payToContract(
      trieAddress,
      {
        inline: Data.to(
          { TrieOriginState: { requiredWithdrawal: '' } },
          TrieDatum,
        ),
      },
      { [trieUnit]: 1n },
    )
  let txc = await tx.complete()
  let txS = await txc.sign().complete()
  await txS.submit()
  return {
    trieUnit,
  }
}

export async function getUtxoByKey(
  lucid: Lucid,
  id: Unit,
  key: string,
  trieAddress: string,
): Promise<UTxO | null> {
  let trieUtxo = await lucid.utxosAtWithUnit(trieAddress, id)
  for (let utxo of trieUtxo) {
    let datum = Data.from(utxo.datum!, TrieDatum)
    if ('TrieDatum' in datum) {
      if (datum.TrieDatum.key == fromText(key)) {
        return utxo
      }
    }
  }
  return null
}

export async function getTrieOrigin(
  lucid: Lucid,
  id: Unit,
  trieAddress: string,
): Promise<UTxO | null> {
  let trieUtxo = await lucid.utxosAtWithUnit(trieAddress, id)
  for (let utxo of trieUtxo) {
    let datum = Data.from(utxo.datum!, TrieDatum)
    if ('TrieOrigin' in datum) {
      return utxo
    }
  }
  return null
}

export async function appendTrie(
  lucid: Lucid,
  trieUnit: string,
  trieOrigin: UTxO,
  utxo: UTxO,
  child_key: string,
  trieAddress: string,
  trieRewardAddress: string
) {
  let parentDatum = Data.from(utxo.datum!, TrieDatum)
  if (!('TrieDatum' in parentDatum)) {
    return
  }
  let appendRedeemer: TrieRedeemer = {
    Onto: { oidx: 0n },
  }
  let newParentDatum: TrieDatum = {
    TrieDatum: {
      key: parentDatum.TrieDatum.key,
      children: [
        ...parentDatum.TrieDatum.children,
        fromText(child_key.slice(parentDatum.TrieDatum.key.length)),
      ].sort(),
    },
  }
  let childDatum: TrieDatum = {
    TrieDatum: {
      key: fromText(child_key),
      children: [],
    },
  }
  let tx = lucid
    .newTx()
    .collectFrom(
      [utxo],
      Data.to({ wrapper: Data.void() }, plutus.TrieSpend['_r']),
    )
    .withdraw(trieRewardAddress, 0n, Data.to(appendRedeemer, TrieRedeemer))
    .mintAssets({ [trieUnit]: 1n }, Data.void())
    .attachSpendingValidator(trieScript)
    .payToContract(
      trieAddress,
      { inline: Data.to(newParentDatum, TrieDatum) },
      { [trieUnit]: 1n },
    )
    .payToContract(
      trieAddress,
      { inline: Data.to(childDatum, TrieDatum) },
      { [trieUnit]: 1n },
    )
  let txc = await tx.complete()
  let txS = await txc.sign().complete()
  await txS.submit()
}

export async function betweenTrie(
  lucid: Lucid,
  trieUnit: string,
  trieOrigin: UTxO,
  utxo: UTxO,
  child_key: string,
  trieAddress: string,
  trieRewardAddress: string,
) {
  let parentDatum = Data.from(utxo.datum!, TrieDatum)
  if (!('TrieDatum' in parentDatum)) {
    return
  }
  let appendRedeemer: TrieRedeemer = {
    Between: { oidx: 0n },
  }
  let parentKey = toText(parentDatum.TrieDatum.key)
  let replacing: string | undefined
  for (let child of parentDatum.TrieDatum.children) {
    let key = toText(child)
    if (key.slice(0, 1) == child_key.slice(parentKey.length).slice(0, 1)) {
      replacing = key
    }
  }
  if (!replacing) {
    throw 'parent did not have conflicting child key'
  }
  let newParentDatum: TrieDatum = {
    TrieDatum: {
      key: fromText(parentDatum.TrieDatum.key),
      children: [
        ...parentDatum.TrieDatum.children.filter((x) => toText(x) != replacing),
        fromText(child_key.slice(parentDatum.TrieDatum.key.length)),
      ].sort(),
    },
  }
  let childDatum: TrieDatum = {
    TrieDatum: {
      key: fromText(child_key),
      children: [fromText((parentKey + replacing).slice(child_key.length))],
    },
  }
  let tx = lucid
    .newTx()
    .collectFrom(
      [utxo],
      Data.to({ wrapper: Data.void() }, plutus.TrieSpend['_r']),
    )
    .withdraw(trieRewardAddress, 0n, Data.to(appendRedeemer, TrieRedeemer))
    .mintAssets({ [trieUnit]: 1n }, Data.void())
    .attachSpendingValidator(trieScript)
    .payToContract(
      trieAddress,
      { inline: Data.to(newParentDatum, TrieDatum) },
      { [trieUnit]: 1n },
    )
    .payToContract(
      trieAddress,
      { inline: Data.to(childDatum, TrieDatum) },
      { [trieUnit]: 1n },
    )
  let txc = await tx.complete()
  console.log('EXUNITS insertion', txc.exUnits)
  console.log('SIZE', txc.toString().length / 2)
  let txS = await txc.sign().complete()
  await txS.submit()
}
