import mongoose, { Connection, Model } from 'mongoose';

export const RewardDistributionInfoModel = new mongoose.Schema(
  {
    blockNumber: Number,
    pool: Number,
    market: String,
    seller: String,
    buyer: String,
    creator: String,
    amount: Number,
  },
  { versionKey: false },
);

export function getRewardDistributionInfoModel(connection: Connection): Model<any> {
  return connection.model('rewards_distribution_records', RewardDistributionInfoModel);
}
