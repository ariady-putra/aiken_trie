use aiken/builtin
use aiken/dict
use aiken/transaction/value.{Value}

pub fn get_trieid(v: Value, our_policy: ByteArray) -> ByteArray {
  expect [_ada, (shouldbe_our_policy, ourpolicy_dict)] =
    v |> value.to_dict |> dict.to_list
  expect [(trie_id, 1)] = ourpolicy_dict |> dict.to_list
  expect shouldbe_our_policy == our_policy
  trie_id
}

pub fn insert(self: List<a>, e: a, compare: fn(a, a) -> Ordering) -> List<a> {
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

pub fn list_replace(self: List<a>, original: a, new: a) {
  when self is {
    [] ->
      []
    [x, ..xs] ->
      if x == original {
        [new, ..xs]
      } else {
        [x, ..list_replace(xs, original, new)]
      }
  }
}

pub fn to_hex(self: ByteArray) -> ByteArray {
  self
    |> encode_base16(builtin.length_of_bytearray(self) - 1, "")
}

fn encode_base16(bytes: ByteArray, ix: Int, builder: ByteArray) -> ByteArray {
  if ix < 0 {
    builder
  } else {
    let byte = builtin.index_bytearray(bytes, ix)
    let msb = byte / 16
    let lsb = byte % 16
    encode_base16(
      bytes,
      ix - 1,
      builtin.cons_bytearray(
        msb + if msb < 10 {
          48
        } else {
          87
        },
        builtin.cons_bytearray(
          lsb + if lsb < 10 {
            48
          } else {
            87
          },
          builder,
        ),
      ),
    )
  }
}
