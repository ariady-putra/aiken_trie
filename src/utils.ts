import { Data, UTxO, fromHex, toHex } from "@lucid-evolution/lucid";
import { blake2bHex } from "blakejs";

export function UTxOTokenName(utxo: UTxO) {
  const the_output_reference = Data.to(
    {
      transactionId: String(utxo.txHash),
      outputIndex: BigInt(utxo.outputIndex),
    },
    Object.assign({
      title: "OutputReference",
      dataType: "constructor",
      index: 0,
      fields: [
        { dataType: "bytes", title: "transactionId" },
        { dataType: "integer", title: "outputIndex" },
      ],
    })
  );

  const assetName = blake2bHex(fromHex(the_output_reference), undefined, 32);
  return assetName;
}
