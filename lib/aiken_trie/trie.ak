use aiken/builtin
use aiken/bytearray
use aiken/dict
use aiken/list
use aiken/transaction.{InlineDatum, Input, Output, Transaction}
use aiken/transaction/credential.{Inline, ScriptCredential, StakeCredential}
use aiken/transaction/value
use aiken_trie/types
use aiken_trie/utils

// in a distributed trie, every bytearray:
// - corresponds to some UTXO, or
// - may be inserted between two UTxOs, or
// - may be inserted on a node
// We initialise always with the empty bytestring, then validate based off the following rules:
// when you are inserting to a node, that node must prefix the new element, and none of it's existing children must prefix the new element
// when you insert between a node and a subnode, the node prefixes the new element, and the new element prefixes the subnode

// Some basic cardano-isms:
// We can have a limitless class of tries at the same script by assigning uniqueness to each trie.
// We can allow validation rules to be attached to a trie, by attaching a script to it's genesis.
// We can reliably put 
// We should prevent dust attacks by ensuring only ada and whatever lock token exist at the trie.
pub fn trie_handler(
  this: StakeCredential,
  redeemer: types.TrieAction,
  transaction: Transaction,
) -> Bool {
  expect Inline(this_cred) = this
  expect ScriptCredential(this_policy) = this_cred
  let Transaction { inputs, outputs, mint, .. } = transaction
  let trie_inputs =
    inputs
      |> list.filter(
           fn(inp) { inp.output.address.payment_credential == this_cred },
         )
  when redeemer is {
    types.Genesis { inp: genesis_inp, oidx } -> {
      expect [] = trie_inputs
      let trie_id = builtin.blake2b_256(builtin.serialise_data(genesis_inp))
      expect [
        Output { value: new_value, datum: InlineDatum(new_raw_datum), .. },
        Output {
          value: ostate_value,
          datum: InlineDatum(origin_state_raw_datum),
          ..
        },
        ..
      ] = outputs |> list.drop(oidx)
      expect types.TrieDatum { key: new_key, children: new_children }: types.TrieDatum =
        new_raw_datum
      expect types.TrieOriginState { .. }: types.TrieDatum =
        origin_state_raw_datum
      let new_id = utils.get_trieid(new_value, this_policy)
      let ostate_id = utils.get_trieid(ostate_value, this_policy)
      and {
        // ids are correct
        (new_id == trie_id)?,
        (ostate_id == trie_id)?,
        // input is in
        ((
          inputs
            |> list.find(
                 fn(inp: Input) -> Bool { inp.output_reference == genesis_inp },
               )
        ) != None)?,
        // hash of input is minted
        (dict.to_list(
          value.tokens(mint |> value.from_minted_value, this_policy),
        ) == [(trie_id, 2)])?,
        // no children
        (new_children == [])?,
        // empty key
        (new_key == "")?,
      }
    }
    types.Onto { oidx } -> {
      expect [
        Input {
          output: Output {
            datum: InlineDatum(raw_datum),
            value: head_value,
            ..
          },
          ..
        },
      ] = trie_inputs
      let trie_id = utils.get_trieid(head_value, this_policy)
      expect types.TrieDatum { key: raw_head_key, children: head_children }: types.TrieDatum =
        raw_datum
      let head_key = utils.to_hex(raw_head_key)
      let head_key_length = head_key |> bytearray.length
      expect [
        Output {
          datum: InlineDatum(continuing_raw_datum),
          value: cont_value,
          ..
        },
        Output { datum: InlineDatum(new_raw_datum), value: new_value, .. },
        ..
      ]: List<Output> = list.drop(outputs, oidx)
      expect types.TrieDatum { key: raw_cont_key, children: cont_children }: types.TrieDatum =
        continuing_raw_datum
      let cont_key = utils.to_hex(raw_cont_key)
      expect types.TrieDatum { key: raw_new_key, children: new_children }: types.TrieDatum =
        new_raw_datum
      let new_key = utils.to_hex(raw_new_key)
      let new_key_suffix = new_key |> bytearray.drop(head_key_length)
      let new_key_suffix_first_char = new_key_suffix |> bytearray.slice(0, 1)
      let cont_id = utils.get_trieid(cont_value, this_policy)
      let new_id = utils.get_trieid(new_value, this_policy)
      and {
        // minted is correct (1 lock)
        (dict.to_list(
          value.tokens(mint |> value.from_minted_value, this_policy),
        ) == [(trie_id, 1)])?,
        // ids are correct
        (cont_id == trie_id)?,
        (new_id == trie_id)?,
        // head prefixes new_key
        (new_key_suffix != "")?,
        (head_key == ( new_key |> bytearray.take(head_key_length) ))?,
        // cont key == head key
        (cont_key == head_key)?,
        // continuing utxo has 1 single new child
        (( head_children |> utils.insert(new_key_suffix, bytearray.compare) ) == (
          cont_children |> list.map(utils.to_hex)
        ))?,
        // no existing children share a first char with this new child
        !list.any(
          head_children,
          fn(child_key) {
            (
              child_key
                |> bytearray.slice(0, 1)
            ) == new_key_suffix_first_char
          },
        )?,
        // new utxo has 0 children
        (new_children == [])?,
      }
    }
    types.Between { oidx } -> {
      expect [
        Input {
          output: Output {
            datum: InlineDatum(parent_raw_datum),
            value: parent_value,
            ..
          },
          ..
        },
      ] = trie_inputs
      expect types.TrieDatum { key: raw_parent_key, children: parents_children }: types.TrieDatum =
        parent_raw_datum
      let parent_key = utils.to_hex(raw_parent_key)
      expect [
        Output {
          datum: InlineDatum(continuing_raw_datum),
          value: cont_value,
          ..
        },
        Output { datum: InlineDatum(new_raw_datum), value: new_value, .. },
        ..
      ]: List<Output> = list.drop(outputs, oidx)
      expect types.TrieDatum {
        key: raw_continuing_key,
        children: continuing_children,
      }: types.TrieDatum = continuing_raw_datum
      let continuing_key = utils.to_hex(raw_continuing_key)
      expect types.TrieDatum { key: raw_new_key, children: new_children }: types.TrieDatum =
        new_raw_datum
      let new_key = utils.to_hex(raw_new_key)
      let trie_id_cont = utils.get_trieid(cont_value, this_policy)
      let parent_key_length = parent_key |> bytearray.length
      let new_key_suffix = new_key |> bytearray.drop(parent_key_length)
      let new_key_suffix_first_char = new_key_suffix |> bytearray.slice(0, 1)
      expect Some(raw_child_key_suffix) =
        parents_children
          |> list.find(
               fn(c_key) {
                 bytearray.slice(c_key |> utils.to_hex, 0, 1) == new_key_suffix_first_char
               },
             )
      let child_key_suffix = utils.to_hex(raw_child_key_suffix)
      let new_child_key_suffix =
        child_key_suffix |> bytearray.drop(new_key_suffix |> bytearray.length)
      and {
        // new_key prefixes child_key
        ((
          child_key_suffix
            |> bytearray.take(new_key_suffix |> bytearray.length)
        ) == new_key_suffix)?,
        // child_key isn't exactly new_key
        (new_child_key_suffix != "")?,
        // new_key isn't exactly parent_key
        (new_key_suffix != "")?,
        // parent prefixes new_Key
        (parent_key == ( new_key |> bytearray.take(parent_key_length) ))?,
        // parent key is unchanged
        (continuing_key == parent_key)?,
        // all values are in same trie_id
        (trie_id_cont == utils.get_trieid(new_value, this_policy))?,
        (trie_id_cont == utils.get_trieid(parent_value, this_policy))?,
        // parent children updated sensibly
        (( continuing_children |> list.map(utils.to_hex) ) == utils.list_replace(
          parents_children |> list.map(utils.to_hex),
          child_key_suffix,
          new_key_suffix,
        ))?,
        // child_key is in new_key's children
        (( new_children |> list.map(utils.to_hex) ) == [new_child_key_suffix])?,
      }
    }
  }
}
