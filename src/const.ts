import { Lucid } from "lucid-cardano";
import * as plutus from "../plutus";

export const trieScript = new plutus.TrieMain();
const lucid = await Lucid.new(undefined, "Mainnet");
export const trieHash = lucid.utils.validatorToScriptHash(trieScript);
