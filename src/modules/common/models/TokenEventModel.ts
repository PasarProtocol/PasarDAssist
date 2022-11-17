import mongoose, { Connection, Model } from 'mongoose';

export const TokenEventSchema = new mongoose.Schema(
  {
    blockNumber: Number,
    transactionHash: String,
    from: String,
    to: String,
    tokenId: String,
    operator: String,
    value: Number,
    gasFee: Number,
    timestamp: Number,
    chain: String,
    contract: String,
  },
  { versionKey: false },
);

export function getTokenEventModel(connection: Connection): Model<any> {
  return connection.model('token_events', TokenEventSchema);
}
