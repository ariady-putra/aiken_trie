import { validatorToScriptHash } from "@lucid-evolution/lucid";
import * as plutus from "../plutus";

export const trieScript = new plutus.TrieMain();
export const trieHash = validatorToScriptHash(trieScript);
