import mongoose, { Connection, Model } from 'mongoose';

export const CollectionInfoSchema = new mongoose.Schema(
  {
    chain: String,
    token: String,
    owner: String,
    name: String,
    uri: String,
    version: Number,
    creator: { did: String, description: String, name: String, signature: String },
    data: {
      avatar: String,
      background: String,
      description: String,
      category: String,
      social: {
        website: String,
        profile: String,
        feeds: String,
        twitter: String,
        telegram: String,
        discord: String,
        medium: String,
      },
    },
  },
  { versionKey: false },
);

export function getCollectionInfoModel(connection: Connection): Model<any> {
  return connection.model('collections', CollectionInfoSchema);
}
