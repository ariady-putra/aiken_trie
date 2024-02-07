import { C, Data, UTxO, fromHex, toHex } from "lucid-cardano";

export function UTxOTokenName(utxo: UTxO) {
  const the_output_reference = Data.to(
    {
      transactionId: { hash: utxo.txHash },
      outputIndex: BigInt(utxo.outputIndex),
    },
    Object.assign({
      title: "OutputReference",
      dataType: "constructor",
      index: 0,
      fields: [
        {
          title: "transactionId",
          description:
            "A unique transaction identifier, as the hash of a transaction body. Note that the transaction id\n isn't a direct hash of the `Transaction` as visible on-chain. Rather, they correspond to hash\n digests of transaction body as they are serialized on the network.",
          anyOf: [
            {
              title: "TransactionId",
              dataType: "constructor",
              index: 0,
              fields: [{ dataType: "bytes", title: "hash" }],
            },
          ],
        },
        { dataType: "integer", title: "outputIndex" },
      ],
    }),
  );
  const assetName = toHex(C.hash_blake2b256(fromHex(the_output_reference)));
  return assetName;
}
