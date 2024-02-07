import * as plutus from '../plutus'

export type TrieDatum = plutus.TypesDatum["_trieDatum"]
export const TrieDatum = plutus.TypesDatum["_trieDatum"]
export type TrieRedeemer = plutus.TypesRedeemer["_trieAction"]
export const TrieRedeemer = plutus.TypesRedeemer["_trieAction"]