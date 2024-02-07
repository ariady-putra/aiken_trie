use aiken/dict
use aiken/list
use aiken/transaction.{
  Input, Mint, Output, ScriptContext, Spend, Transaction, WithdrawFrom,
}
use aiken/transaction/credential.{Inline, ScriptCredential}
use aiken_trie/trie
use aiken_trie/types

validator {
  fn spend(_d: Data, _r: Data, ctx: ScriptContext) {
    expect ScriptContext {
      transaction: Transaction { inputs, withdrawals, .. },
      purpose: Spend(own_oref),
    } = ctx
    expect Some(self) =
      inputs |> list.find(fn(inp) { inp.output_reference == own_oref })
    withdrawals
      |> dict.has_key(Inline(self.output.address.payment_credential))
  }

  fn main(r: Data, ctx: ScriptContext) {
    let ScriptContext { transaction, purpose } = ctx
    when purpose is {
      Mint(policy_id) ->
        // validation happens in staking
        transaction.withdrawals
          |> dict.has_key(Inline(ScriptCredential(policy_id)))
      WithdrawFrom(stake_cred) -> {
        expect redeemer: types.TrieAction = r
        trie.trie_handler(stake_cred, redeemer, transaction)
      }
      _ -> fail
    }
  }
}
