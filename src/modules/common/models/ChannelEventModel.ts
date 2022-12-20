import mongoose, { Connection, Model } from 'mongoose';

export const ChannelEventSchema = new mongoose.Schema(
  {
    blockNumber: Number,
    transactionHash: String,
    tokenId: String,
    tokenUri: String,
    channelEntry: String,
    receiptAddr: String,
    eventType: String,
  },
  { versionKey: false },
);

export function getChannelEventModel(connection: Connection): Model<any> {
  return connection.model('channel_events', ChannelEventSchema);
}
