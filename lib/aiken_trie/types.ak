use cardano/transaction.{OutputReference}

pub type TrieAction {
  Genesis { inp: OutputReference, oidx: Int }
  Between { oidx: Int }
  Onto { oidx: Int }
}

pub type TrieDatum {
  TrieDatum { key: ByteArray, children: List<ByteArray> }
  TrieOriginState { required_withdrawal: ByteArray }
}
