use aiken_trie/types

validator {
  fn redeemer(_trie_action: types.TrieAction, _c) {
    False
  }

  fn datum(_trie_datum: types.TrieDatum, _, _c) {
    False
  }
}
