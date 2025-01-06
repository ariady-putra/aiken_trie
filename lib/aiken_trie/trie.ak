use aiken/builtin
use aiken/collection/dict
use aiken/collection/list
use aiken/primitive/bytearray
use aiken_trie/types
use aiken_trie/utils
use cardano/address.{Address}
use cardano/assets
use cardano/transaction.{InlineDatum, Transaction}

/// In a distributed trie, every bytearray:
/// - corresponds to some UTXO, or
/// - may be inserted between two UTxOs, or
/// - may be inserted on a node
///
/// We initialise always with the empty bytestring, then validate based off the following rules:
/// - when you are inserting to a node, that node must prefix the new element, and none of it's existing children must prefix the new element
/// - when you insert between a node and a subnode, the node prefixes the new element, and the new element prefixes the subnode
///
/// Some basic Cardano-isms:
/// - We can have a limitless class of tries at the same script by assigning uniqueness to each trie.
/// - We can allow validation rules to be attached to a trie, by attaching a script to it's genesis.
/// - We can reliably put 
/// - We should prevent dust attacks by ensuring only ada and whatever lock token exist at the trie.
pub fn trie_handler(
  this_cred: address.Credential,
  redeemer: types.TrieAction,
  transaction: Transaction,
) -> Bool {
  expect address.Script(this_policy) = this_cred

  let Transaction { inputs, outputs, mint, .. } = transaction
  let trie_inputs = {
    let transaction.Input {
      output: transaction.Output {
        address: Address { payment_credential, .. },
        ..
      },
      ..
    } <- list.filter(inputs)

    payment_credential == this_cred
  }

  when redeemer is {
    types.Genesis { inp: genesis_inp, oidx } -> {
      expect [] = trie_inputs
      let trie_id = genesis_inp |> builtin.serialise_data |> builtin.blake2b_256

      expect [
        transaction.Output {
          value: new_value,
          datum: InlineDatum(new_raw_datum),
          ..
        },
        transaction.Output {
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

      let empty_key =
        fn() { new_key == "" }

      let no_children =
        fn() { new_children == [] }

      let ids_are_correct =
        fn() { (new_id == trie_id)? && (ostate_id == trie_id)? }

      let input_is_in =
        fn() {
          let maybe_genesis_inp = {
            let transaction.Input { output_reference, .. } <- list.find(inputs)
            output_reference == genesis_inp
          }

          maybe_genesis_inp != None
        }

      let hash_of_input_is_minted =
        fn() {
          let minted_hash = mint |> assets.tokens(this_policy) |> dict.to_pairs
          minted_hash == [Pair(trie_id, 2)]
        }

      and {
        empty_key()?,
        no_children()?,
        ids_are_correct()?,
        input_is_in()?,
        hash_of_input_is_minted()?,
      }
    }

    types.Onto { oidx } -> {
      expect [
        transaction.Input {
          output: transaction.Output {
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

      let head_key = raw_head_key |> utils.to_hex
      let head_key_length = head_key |> bytearray.length

      let expected_outputs = outputs |> list.drop(oidx)
      expect [
        transaction.Output {
          datum: InlineDatum(continuing_raw_datum),
          value: cont_value,
          ..
        },
        transaction.Output {
          datum: InlineDatum(new_raw_datum),
          value: new_value,
          ..
        },
        ..
      ]: List<transaction.Output> = expected_outputs

      expect types.TrieDatum { key: raw_cont_key, children: cont_children }: types.TrieDatum =
        continuing_raw_datum

      let cont_key = raw_cont_key |> utils.to_hex

      expect types.TrieDatum { key: raw_new_key, children: new_children }: types.TrieDatum =
        new_raw_datum

      let new_key = raw_new_key |> utils.to_hex
      let new_key_suffix = new_key |> bytearray.drop(head_key_length)
      let new_key_suffix_first_char = new_key_suffix |> bytearray.slice(0, 1)

      let cont_id = utils.get_trieid(cont_value, this_policy)
      let new_id = utils.get_trieid(new_value, this_policy)

      let new_utxo_has_no_children =
        fn() { new_children == [] }

      let is_cont_key_the_same_as_head_key =
        fn() { cont_key == head_key }

      let ids_are_correct =
        fn() { (cont_id == trie_id)? && (new_id == trie_id)? }

      let no_existing_children_share_a_first_char_with_this_new_child =
        fn() {
          let child_key <- list.all(head_children)
          ( child_key |> bytearray.slice(0, 1) ) != new_key_suffix_first_char
        }

      let continuing_utxo_has_a_single_new_child =
        fn() {
          ( head_children |> utils.insert(new_key_suffix, bytearray.compare) ) == (
            cont_children |> list.map(utils.to_hex)
          )
        }

      let head_prefixes_new_key =
        fn() {
          and {
            (new_key_suffix != "")?,
            (head_key == ( new_key |> bytearray.take(head_key_length) ))?,
          }
        }

      // 1 lock
      let minted_lock_is_correct =
        fn() {
          let minted_lock = mint |> assets.tokens(this_policy) |> dict.to_pairs
          let minted_1_lock = minted_lock == [Pair(trie_id, 1)]

          minted_1_lock?
        }

      and {
        new_utxo_has_no_children()?,
        is_cont_key_the_same_as_head_key()?,
        ids_are_correct()?,
        no_existing_children_share_a_first_char_with_this_new_child()?,
        continuing_utxo_has_a_single_new_child()?,
        head_prefixes_new_key()?,
        minted_lock_is_correct()?,
      }
    }

    types.Between { oidx } -> {
      expect [
        transaction.Input {
          output: transaction.Output {
            datum: InlineDatum(parent_raw_datum),
            value: parent_value,
            ..
          },
          ..
        },
      ] = trie_inputs

      expect types.TrieDatum { key: raw_parent_key, children: parents_children }: types.TrieDatum =
        parent_raw_datum

      let parent_key = raw_parent_key |> utils.to_hex

      let expected_outputs = outputs |> list.drop(oidx)
      expect [
        transaction.Output {
          datum: InlineDatum(continuing_raw_datum),
          value: cont_value,
          ..
        },
        transaction.Output {
          datum: InlineDatum(new_raw_datum),
          value: new_value,
          ..
        },
        ..
      ]: List<transaction.Output> = expected_outputs

      expect types.TrieDatum {
        key: raw_continuing_key,
        children: continuing_children,
      }: types.TrieDatum = continuing_raw_datum

      let continuing_key = raw_continuing_key |> utils.to_hex

      expect types.TrieDatum { key: raw_new_key, children: new_children }: types.TrieDatum =
        new_raw_datum
      let new_key = raw_new_key |> utils.to_hex

      let trie_id_cont = utils.get_trieid(cont_value, this_policy)
      let parent_key_length = parent_key |> bytearray.length

      let new_key_suffix = new_key |> bytearray.drop(parent_key_length)
      let new_key_suffix_first_char = new_key_suffix |> bytearray.slice(0, 1)

      expect Some(raw_child_key_suffix) = {
        let c_key <- list.find(parents_children)
        ( c_key |> utils.to_hex |> bytearray.slice(0, 1) ) == new_key_suffix_first_char
      }

      let child_key_suffix = raw_child_key_suffix |> utils.to_hex
      let new_child_key_suffix =
        child_key_suffix |> bytearray.drop(new_key_suffix |> bytearray.length)

      let new_key_prefixes_child_key =
        fn() {
          let new_key_suffix_length = new_key_suffix |> bytearray.length
          ( child_key_suffix |> bytearray.take(new_key_suffix_length) ) == new_key_suffix
        }

      let child_key_is_not_exactly_new_key =
        fn() { new_child_key_suffix != "" }

      let new_key_is_not_exactly_parent_key =
        fn() { new_key_suffix != "" }

      let parent_prefixes_new_key =
        fn() { parent_key == ( new_key |> bytearray.take(parent_key_length) ) }

      let parent_key_is_unchanged =
        fn() { continuing_key == parent_key }

      let all_values_are_in_same_trie_id =
        fn() {
          and {
            (trie_id_cont == utils.get_trieid(new_value, this_policy))?,
            (trie_id_cont == utils.get_trieid(parent_value, this_policy))?,
          }
        }

      let parent_children_updated_sensibly =
        fn() {
          ( continuing_children |> list.map(utils.to_hex) ) == (
            parents_children
              |> list.map(utils.to_hex)
              |> utils.list_replace(child_key_suffix, new_key_suffix)
          )
        }

      let child_key_is_in_children_of_new_key =
        fn() {
          ( new_children |> list.map(utils.to_hex) ) == [new_child_key_suffix]
        }

      and {
        new_key_prefixes_child_key()?,
        child_key_is_not_exactly_new_key()?,
        new_key_is_not_exactly_parent_key()?,
        parent_prefixes_new_key()?,
        parent_key_is_unchanged()?,
        all_values_are_in_same_trie_id()?,
        parent_children_updated_sensibly()?,
        child_key_is_in_children_of_new_key()?,
      }
    }
  }
}
