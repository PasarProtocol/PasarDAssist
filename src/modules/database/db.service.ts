import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  CollectionEventType,
  ContractUserInfo,
  IncomeType,
  OrderEventType,
  OrderState,
  UpdateCollectionParams,
} from '../tasks/interfaces';
import { UpdateOrderParams } from './interfaces';
import { Chain } from '../utils/enums';
import { ConfigContract } from '../../config/config.contract';

@Injectable()
export class DbService {
  private logger = new Logger('DbService');

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private configService: ConfigService,
  ) {}

  async getTokenEventLastHeight(chain: Chain, contract: string): Promise<number> {
    const results = await this.connection
      .collection('token_events')
      .find({ chain, contract })
      .sort({ blockNumber: -1 })
      .limit(1)
      .toArray();
    if (results.length > 0) {
      return results[0].blockNumber;
    } else {
      //TODO: change to more universal method to get contract deploy block
      return parseInt(
        ConfigContract[this.configService.get('NETWORK')][chain].stickerContractDeploy,
      );
    }
  }

  async getUserTokenEventLastHeight(chain: Chain, contract: string): Promise<number> {
    const results = await this.connection
      .collection('token_events')
      .find({ chain, contract })
      .sort({ blockNumber: -1 })
      .limit(1)
      .toArray();
    if (results.length > 0) {
      return results[0].blockNumber;
    } else {
      return 0;
    }
  }

  async getOrderEventLastHeight(chain: Chain, orderEventType: OrderEventType): Promise<number> {
    const results = await this.connection
      .collection('order_events')
      .find({ chain, eventType: orderEventType })
      .sort({ blockNumber: -1 })
      .limit(1)
      .toArray();
    if (results.length > 0) {
      return results[0].blockNumber;
    } else {
      return parseInt(ConfigContract[this.configService.get('NETWORK')][chain].pasarContractDeploy);
    }
  }

  async updateOrder(chain: Chain, orderId: number, params: UpdateOrderParams) {
    return await this.connection
      .collection('orders')
      .updateOne({ chain, orderId }, { $set: params });
  }

  async updateTokenOwner(chain: Chain, contract: string, tokenId: string, to: string) {
    return await this.connection
      .collection('tokens')
      .updateOne({ chain, contract, tokenId }, { $set: { tokenOwner: to } });
  }

  async updateCollection(token: string, chain: Chain, collection: UpdateCollectionParams) {
    return await this.connection
      .collection('collections')
      .updateOne({ token, chain }, { $set: collection }, { upsert: true });
  }

  async orderCount() {
    return await this.connection.collection('orders').countDocuments();
  }

  async tokenCount() {
    return await this.connection.collection('tokens').countDocuments();
  }

  async getCollectionEventLastHeight(
    chain: Chain,
    eventType: CollectionEventType,
  ): Promise<number> {
    const results = await this.connection
      .collection('collection_events')
      .find({ chain, eventType })
      .sort({ blockNumber: -1 })
      .limit(1)
      .toArray();
    if (results.length > 0) {
      return results[0].blockNumber;
    } else {
      //TODO: change to more universal method to get contract deploy block
      return parseInt(
        ConfigContract[this.configService.get('NETWORK')][chain].registerContractDeploy,
      );
    }
  }

  async insertToken(tokenInfo: {
    chain: Chain;
    tokenId: string;
    uniqueKey: string;
    createTime: number;
    tokenUri: string;
    tokenSupply: number;
    tokenOwner: string;
    tokenIdHex: string;
    contract: string;
    blockNumber: number;
    updateTime: number;
    notGetDetail: boolean;
    retryTimes: number;
  }) {
    return await this.connection.collection('tokens').insertOne(tokenInfo);
  }

  async getLatestNoDetailTokens() {
    return await this.connection
      .collection('tokens')
      .find({ notGetDetail: true, retryTimes: { $lt: 5 } })
      .sort({ createTime: 1 })
      .limit(10)
      .toArray();
  }

  async updateTokenDetail(
    tokenId: string,
    chain: string,
    contract: string,
    tokenDetail: {
      image: string;
      creator: string;
      data: any;
      name: string;
      description: string;
      type: string;
      adult: boolean;
      version: number;
      notGetDetail: boolean;
      properties: any;
      attributes: any;
    },
  ) {
    return await this.connection
      .collection('tokens')
      .updateOne({ tokenId, chain, contract }, { $set: tokenDetail });
  }

  async increaseTokenRetryTimes(tokenId: string, chain: string, contract: string) {
    return await this.connection
      .collection('tokens')
      .updateOne({ tokenId, chain, contract }, { $inc: { retryTimes: 1 } });
  }

  async getRegisteredCollections() {
    return await this.connection.collection('collections').find().toArray();
  }

  async updateUser(address: string, creator: ContractUserInfo) {
    return await this.connection
      .collection('address_did')
      .updateOne({ address }, { $set: creator }, { upsert: true });
  }

  async insertTokenRates(data: any[]) {
    await this.connection.collection('token_rates').deleteMany({});
    return await this.connection.collection('token_rates').insertMany(data);
  }

  async getCollectionByToken(token: string, chain: string) {
    return await this.connection.collection('collections').findOne({ token, chain });
  }

  async getAllCollections() {
    return await this.connection.collection('collections').find().toArray();
  }

  async getCollectionItems(collection: string, chain: string) {
    const items = await this.connection
      .collection('tokens')
      .aggregate([
        { $match: { chain, contract: collection } },
        { $group: { _id: '$chain', items: { $sum: 1 } } },
      ])
      .toArray();
    return items.length > 0 ? items[0].items : 0;
  }

  async getCollectionOwners(collection: string, chain: string) {
    return await this.connection
      .collection('tokens')
      .distinct('tokenOwner', { chain, contract: collection })
      .then((res) => res.length);
  }

  async getCollectionTradeCount(collection: string, chain: string) {
    const tv = await this.connection
      .collection('orders')
      .aggregate([
        { $match: { chain, baseToken: collection, orderState: OrderState.Filled } },
        { $group: { _id: '$chain', tv: { $sum: '$filled' } } },
      ])
      .toArray();

    return tv.length > 0 ? tv[0].tv : 0;
  }

  async getCollectionLowestPrice(collection: string, chain: string) {
    const lowestPrice = await this.connection
      .collection('orders')
      .find({ chain, baseToken: collection, orderState: { $ne: OrderState.Cancelled } })
      .sort({ price: 1 })
      .limit(1)
      .toArray();
    return lowestPrice.length > 0 ? lowestPrice[0].price : 0;
  }

  async updateCollectionStatisticsInfo(
    token: string,
    chain: string,
    param: { tradeVolume: number; lowestPrice: number; owners: number; items: number; dia: number },
  ) {
    return await this.connection
      .collection('collections')
      .updateOne({ token, chain }, { $set: param });
  }

  async insertUserIncomeRecords(
    records: { income: number; address: any; type: IncomeType; timestamp: any }[],
  ) {
    return this.connection.collection('user_income_records').insertMany(records);
  }

  async getRewardsDistributionRecordLastHeight() {
    const results = await this.connection
      .collection('rewards_distribution_records')
      .find()
      .sort({ blockNumber: -1 })
      .limit(1)
      .toArray();

    if (results.length > 0) {
      return results[0].blockNumber;
    } else {
      return parseInt(
        ConfigContract[this.configService.get('NETWORK')][Chain.ELA].pasarMiningContractDeploy,
      );
    }
  }

  async insertCollectionAttribute(chain: string, collection: string, key: string, value: string) {
    return await this.connection
      .collection('collection_attributes')
      .updateOne({ chain, collection, key, value }, { $inc: { count: 1 } }, { upsert: true });
  }
}
