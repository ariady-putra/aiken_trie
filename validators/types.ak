use aiken_trie/types

validator datum_redeemer {
  /// Redeemer
  mint(_trie_action: types.TrieAction, _p, _t) {
    False
  }

  /// Datum
  spend(_trie_datum: Option<types.TrieDatum>, _r, _o, _t) {
    False
  }

  else(_) {
    fail
  }
}
