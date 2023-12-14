import {
  Assets,
  C,
  Data,
  Emulator,
  fromHex,
  fromText,
  generatePrivateKey,
  Lucid,
  toHex,
  toText,
  toUnit,
  Unit,
  UTxO,
} from 'lucid-cardano'
import * as plutus from '../plutus'
import { defaultProtocolParams } from './constants'

export async function generateAccount(assets: Assets) {
  const privateKey = generatePrivateKey()
  return {
    privateKey,
    address: await (await Lucid.new(undefined, 'Custom'))
      .selectWalletFromPrivateKey(privateKey)
      .wallet.address(),
    assets,
  }
}

export function UTxOTokenName(utxo: UTxO) {
  const the_output_reference = Data.to(
    {
      transactionId: { hash: utxo.txHash },
      outputIndex: BigInt(utxo.outputIndex),
    },
    Object.assign({
      title: 'OutputReference',
      dataType: 'constructor',
      index: 0,
      fields: [
        {
          title: 'transactionId',
          description:
            "A unique transaction identifier, as the hash of a transaction body. Note that the transaction id\n isn't a direct hash of the `Transaction` as visible on-chain. Rather, they correspond to hash\n digests of transaction body as they are serialized on the network.",
          anyOf: [
            {
              title: 'TransactionId',
              dataType: 'constructor',
              index: 0,
              fields: [{ dataType: 'bytes', title: 'hash' }],
            },
          ],
        },
        { dataType: 'integer', title: 'outputIndex' },
      ],
    }),
  )
  const assetName = toHex(C.hash_blake2b256(fromHex(the_output_reference)))
  return assetName
}

export type GeneratedAccount = Awaited<ReturnType<typeof generateAccount>>
export type TrieDatum = plutus.TrieTypesDatum['_t']
let TrieDatum = plutus.TrieTypesDatum['_t']
export type TrieRedeemer = plutus.TrieTypesRedeemer['_t']
let TrieRedeemer = plutus.TrieTypesRedeemer['_t']

let trieScript = new plutus.TrieMain()
let emulator = new Emulator([])
let lucid = await Lucid.new(emulator)
let trieHash = lucid.utils.validatorToScriptHash(trieScript)
let trieAddress = lucid.utils.validatorToAddress(trieScript)
let trieRewardAddress = lucid.utils.validatorToRewardAddress(trieScript)

const TRIE_USER = await generateAccount({
  lovelace: BigInt(100000000000000000),
})

emulator = new Emulator([TRIE_USER], defaultProtocolParams)
emulator.chain[trieRewardAddress] = {
  registeredStake: true,
  delegation: { rewards: BigInt(0), poolId: '' },
}
lucid = await Lucid.new(emulator)
lucid.selectWalletFromPrivateKey(TRIE_USER.privateKey)
// genesis
async function createTrie() {
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

async function getUtxoByKey(id: Unit, key: string): Promise<UTxO | null> {
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

async function getTrieOrigin(id: Unit): Promise<UTxO | null> {
  let trieUtxo = await lucid.utxosAtWithUnit(trieAddress, id)
  for (let utxo of trieUtxo) {
    let datum = Data.from(utxo.datum!, TrieDatum)
    if ('TrieOrigin' in datum) {
      return utxo
    }
  }
  return null
}

async function appendTrie(
  trieUnit: string,
  trieOrigin: UTxO,
  utxo: UTxO,
  child_key: string,
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

async function betweenTrie(
  trieUnit: string,
  trieOrigin: UTxO,
  utxo: UTxO,
  child_key: string,
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
      children: [fromText((parentKey+replacing).slice(child_key.length))],
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

let trie = await createTrie()
emulator.awaitBlock(1)
let trieOrigin = await getTrieOrigin(trie.trieUnit)
let trieUtxo = await getUtxoByKey(trie.trieUnit, '')
await appendTrie(trie.trieUnit, trieOrigin!, trieUtxo!, 'hello_world')
emulator.awaitBlock(1)
let newTrieUtxo = await getUtxoByKey(trie.trieUnit, '')
betweenTrie(trie.trieUnit, trieOrigin!, newTrieUtxo!, "hello")