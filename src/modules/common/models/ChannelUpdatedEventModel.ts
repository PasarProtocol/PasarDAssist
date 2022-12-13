import mongoose, { Connection, Model } from 'mongoose';

export const ChannelUpdatedEventSchema = new mongoose.Schema(
  {
    blockNumber: Number,
    transactionHash: String,
    tokenId: String,
    tokenUri: String,
    channelEntry: String,
    receiptAddr: String,
  },
  { versionKey: false },
);

export function getChannelUpdatedEventModel(connection: Connection): Model<any> {
  return connection.model('channel_updated_events', ChannelUpdatedEventSchema);
}
