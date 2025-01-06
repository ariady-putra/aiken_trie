use aiken/collection/list
use aiken/collection/pairs
use aiken_trie/trie
use aiken_trie/types
use cardano/address.{Address, Script}
use cardano/script_context.{Minting, ScriptContext, Withdrawing}
use cardano/transaction.{Input, Output, OutputReference, Transaction}

validator main {
  spend(_d: Option<Data>, _r: Data, own_oref: OutputReference, tx: Transaction) {
    let Transaction { inputs, withdrawals, .. } = tx

    expect Some(Input {
      output: Output { address: Address { payment_credential, .. }, .. },
      ..
    }) = {
      let Input { output_reference, .. } <- list.find(inputs)
      output_reference == own_oref
    }

    withdrawals |> pairs.has_key(payment_credential)
  }

  else(ctx: ScriptContext) {
    let ScriptContext(transaction, r, purpose) = ctx
    when purpose is {
      Minting(policy_id) ->
        // validation happens in staking
        transaction.withdrawals |> pairs.has_key(policy_id |> Script)

      Withdrawing(stake_cred) -> {
        expect redeemer: types.TrieAction = r
        trie.trie_handler(stake_cred, redeemer, transaction)
      }

      _ -> fail @"Invalid ScriptPurpose"
    }
  }
}
