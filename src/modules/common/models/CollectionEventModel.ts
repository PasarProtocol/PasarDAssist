import mongoose, { Connection, Model } from 'mongoose';

export const CollectionEventSchema = new mongoose.Schema(
  {
    blockNumber: Number,
    transactionHash: String,
    chain: String,
    token: String,
    owner: String,
    name: String,
    uri: String,
    eventType: Number,
    gasFee: Number,
    timestamp: Number,
    royaltyOwners: [String],
    royaltyFees: [Number],
  },
  { versionKey: false },
);

export function getCollectionEventModel(connection: Connection): Model<any> {
  return connection.model('collection_events', CollectionEventSchema);
}
