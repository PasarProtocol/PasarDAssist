import mongoose, { Connection, Model } from 'mongoose';

export const OrderEventSchema = new mongoose.Schema(
  {
    blockNumber: Number,
    transactionHash: String,
    chain: String,
    seller: String,
    buyer: String,
    orderId: Number,
    tokenId: String,
    baseToken: String,
    amount: Number,
    quoteToken: String,
    oldQuoteToken: String,
    newQuoteToken: String,
    minPrice: Number,
    price: Number,
    reservePrice: Number,
    oldReservePrice: Number,
    newReservePrice: Number,
    buyoutPrice: Number,
    oldBuyoutPrice: Number,
    newBuyoutPrice: Number,
    oldPrice: Number,
    newPrice: Number,
    startTime: Number,
    endTime: Number,
    royaltyOwner: String,
    royaltyFee: Number,
    platformAddress: String,
    platformFee: Number,
    eventType: Number,
    gasFee: Number,
    timestamp: Number,
  },
  { versionKey: false },
);

export function getOrderEventModel(connection: Connection): Model<any> {
  return connection.model('order_events', OrderEventSchema);
}
