use aiken/builtin
use aiken/bytearray
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
use aiken/dict
use aiken/list
use aiken/transaction.{
  InlineDatum, Input, Mint, Output, OutputReference, ScriptContext, Spend,
  Transaction, WithdrawFrom,
}
use aiken/transaction/credential.{Inline, ScriptCredential, StakeCredential}
use aiken/transaction/value.{Value}

type TrieAction {
  Genesis { inp: OutputReference, oidx: Int }
  Between { head: OutputReference, oidx: Int }
  Onto { oidx: Int }
}

type TrieDatum {
  key: ByteArray,
  children: List<ByteArray>,
}

fn get_trieid(v: Value, our_policy) -> ByteArray {
  expect [_ada, (shouldbe_our_policy, ourpolicy_dict)] =
    v |> value.to_dict |> dict.to_list
  expect [(trie_id, 1)] = ourpolicy_dict |> dict.to_list
  expect shouldbe_our_policy == our_policy
  trie_id
}

fn insert(self: List<a>, e: a, compare: fn(a, a) -> Ordering) -> List<a> {
  when self is {
    [] ->
      [e]
    [x, ..xs] ->
      if compare(e, x) == Less {
        [e, ..self]
      } else {
        [x, ..insert(xs, e, compare)]
      }
  }
}

// non-performant version. can introduce: multiple trie-actions, via a redeemer list. Can build up a tree from the inps, then flatten for output list
fn trie_handler(
  this: StakeCredential,
  redeemer: TrieAction,
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
  let trie_outputs =
    outputs
      |> list.filter(fn(out) { out.address.payment_credential == this_cred })
  when redeemer is {
    Genesis { inp: genesis_inp, oidx } -> {
      expect [] = trie_inputs
      let trie_id = builtin.blake2b_256(builtin.serialise_data(genesis_inp))
      expect Some(Output {
        value: new_value,
        datum: InlineDatum(new_raw_datum),
        ..
      }) = outputs |> list.at(oidx)
      expect TrieDatum { key: new_key, children: new_children }: TrieDatum =
        new_raw_datum
      let new_id = get_trieid(new_value, this_policy)
      and {
        // ids are correct
        new_id == trie_id,
        // input is in
        (
          inputs
            |> list.find(
                 fn(inp: Input) -> Bool { inp.output_reference == genesis_inp },
               )
        ) != None,
        // hash of input is minted
        dict.to_list(value.tokens(mint |> value.from_minted_value, this_policy)) == [
          (trie_id, 1),
        ],
        // no children
        new_children == [],
        // empty key
        new_key == "",
      }
    }
    Onto { .. } -> {
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
      let trie_id = get_trieid(head_value, this_policy)
      expect TrieDatum { key: head_key, children: head_children }: TrieDatum =
        raw_datum
      let head_key_length = head_key |> bytearray.length
      expect [
        Output {
          datum: InlineDatum(continuing_raw_datum),
          value: cont_value,
          ..
        },
        Output { datum: InlineDatum(new_raw_datum), value: new_value, .. },
      ] = trie_outputs
      expect TrieDatum { key: cont_key, children: cont_children }: TrieDatum =
        continuing_raw_datum
      expect TrieDatum { key: new_key, children: new_children }: TrieDatum =
        new_raw_datum
      let new_key_suffix = new_key |> bytearray.drop(head_key_length)
      let new_key_suffix_first_char = new_key_suffix |> bytearray.slice(0, 1)

      let cont_id = get_trieid(cont_value, this_policy)
      let new_id = get_trieid(new_value, this_policy)
      and {
        // minted is correct (1 lock)
        dict.to_list(value.tokens(mint |> value.from_minted_value, this_policy)) == [
          (trie_id, 1),
        ],
        // ids are correct
        cont_id == trie_id,
        new_id == trie_id,
        // head prefixes new_key
        new_key_suffix != "",
        head_key == ( new_key |> bytearray.take(head_key_length) ),
        // cont key == head key
        cont_key == head_key,
        // continuing utxo has 1 single new child
        ( head_children |> insert(new_key_suffix, bytearray.compare) ) == cont_children,
        // no existing children share a first char with this new child
        !list.any(
          head_children,
          fn(child_key) {
            (
              child_key
                |> bytearray.slice(0, 1)
            ) == new_key_suffix_first_char
          },
        ),
        // new utxo has 0 children
        new_children == [],
        // 
        True,
      }
    }
    // datum prefixes new
    _ -> fail
  }
  //   when trie_inputs |> list.length is {
  //     1 -> {
  //       expect [Input { output: Output { address, value, .. }, .. }] = trie_inputs
  //       expect
  //         (
  //           value
  //             |> value.without_lovelace
  //             |> value.tokens(this_policy)
  //             |> dict.size
  //         ) == 1
  //       True
  //     }
  //     2 -> {
  //       expect [Input { output: Output { address, value, .. }, .. }, ..] =
  //         trie_inputs
  //       expect
  //         (
  //           value
  //             |> value.without_lovelace
  //             |> value.tokens(this_policy)
  //             |> dict.size
  //         ) == 1
  //       True
  //     }
  //     _ -> fail @"wrong number of trie inputs"
  //   }
}

validator {
  fn main(r: Data, c: ScriptContext) {
    let ScriptContext { transaction, purpose } = c
    when purpose is {
      Mint(policy_id) ->
        // validation happens in staking
        transaction.withdrawals
          |> dict.has_key(Inline(ScriptCredential(policy_id)))
      WithdrawFrom(stake_cred) -> {
        expect redeemer: TrieAction = r
        trie_handler(stake_cred, redeemer, transaction)
      }
      _ -> fail @"bad purpose"
    }
  }

  fn spend(_d: Data, _r: Data, ctx: ScriptContext) {
    expect ScriptContext {
      transaction: Transaction { inputs, withdrawals, .. },
      purpose: Spend(own_oref),
    } = ctx
    expect Some(self) =
      inputs |> list.find(fn(inp) { inp.output_reference == own_oref })
    withdrawals |> dict.has_key(Inline(self.output.address.payment_credential))
  }
}
