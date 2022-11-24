import {
  BadRequestException,
  CACHE_MANAGER,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Web3Service } from '../utils/web3.service';
import { ConfigService } from '@nestjs/config';
import { DbService } from '../database/db.service';
import { Constants } from '../../constants';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { Cache } from 'cache-manager';
import { IncomeType, OrderEventType, OrderState, OrderType } from '../tasks/interfaces';
import { QueryLatestBidsDTO } from './dto/QueryLatestBidsDTO';
import { Category, Chain, OrderTag } from '../utils/enums';
import { ConfigContract } from '../../config/config.contract';
import { QueryMarketplaceDTO } from './dto/QueryMarketplaceDTO';
import { QueryCollectibleOfCollectionDTO } from './dto/QueryCollectibleOfCollectionDTO';

@Injectable()
export class AppService {
  private logger = new Logger('AppService');

  constructor(
    private web3Service: Web3Service,
    private configService: ConfigService,
    private dbService: DbService,
    @InjectConnection() private readonly connection: Connection,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async check() {
    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS };
  }

  async loadCollectionsInfo() {
    const data = await this.connection.collection('collections').find().toArray();
    const collections = {};
    for (const item of data) {
      collections[`${item.chain}-${item.token}`] = { name: item.name };
    }

    await this.cacheManager.set(Constants.CACHE_KEY_COLLECTIONS, JSON.stringify(collections));
    this.logger.log('Load collections information successfully...');
  }

  private static getSortOfToken(sort: number) {
    let sortObj;
    switch (sort) {
      case 0:
        sortObj = { 'order.createTime': -1 };
        break;
      case 1:
        sortObj = { createTime: -1 };
        break;
      case 2:
        sortObj = { 'order.createTime': 1 };
        break;
      case 3:
        sortObj = { createTime: 1 };
        break;
      case 4:
        sortObj = { 'order.price': 1 };
        break;
      case 5:
        sortObj = { 'order.price': -1 };
        break;
      case 6:
        sortObj = { 'order.endTime': 1 };
        break;
      default:
        sortObj = { 'order.createTime': -1 };
        break;
    }
    return sortObj;
  }

  private static getSortOfOrder(sort: number) {
    let sortObj;
    switch (sort) {
      case 0:
        sortObj = { createTime: -1 };
        break;
      case 1:
        sortObj = { 'token.createTime': -1 };
        break;
      case 2:
        sortObj = { createTime: 1 };
        break;
      case 3:
        sortObj = { 'token.createTime': 1 };
        break;
      case 4:
        sortObj = { price: 1 };
        break;
      case 5:
        sortObj = { price: -1 };
        break;
      case 6:
        sortObj = { endTime: 1 };
        break;
      default:
        sortObj = { createTime: -1 };
        break;
    }
    return sortObj;
  }

  private static getSortOfTokenOrder(sort: number) {
    let sortObj;
    switch (sort) {
      case 0:
        sortObj = { 'order.createTime': -1 };
        break;
      case 1:
        sortObj = { 'token.createTime': -1 };
        break;
      case 2:
        sortObj = { 'order.createTime': 1 };
        break;
      case 3:
        sortObj = { 'token.createTime': 1 };
        break;
      case 4:
        sortObj = { 'order.price': 1 };
        break;
      case 5:
        sortObj = { 'order.price': -1 };
        break;
      case 6:
        sortObj = { 'order.endTime': 1 };
        break;
      default:
        sortObj = { 'order.createTime': -1 };
        break;
    }
    return sortObj;
  }

  async getTokenOrderByTokenId(tokenId: string) {
    const result = await this.connection
      .collection('tokens')
      .aggregate([
        { $match: { tokenId } },
        {
          $lookup: {
            from: 'token_events',
            let: { tokenId: '$tokenId' },
            pipeline: [
              {
                $match: { $expr: { $eq: ['$tokenId', '$$tokenId'] }, from: Constants.BURN_ADDRESS },
              },
              { $sort: { blockNumber: -1 } },
              { $group: { _id: '$tokenId', doc: { $first: '$$ROOT' } } },
              { $replaceRoot: { newRoot: '$doc' } },
              { $project: { _id: 0, transactionHash: 1 } },
            ],
            as: 'tokenEvent',
          },
        },
        { $unwind: { path: '$tokenEvent', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'orders',
            let: { tokenId: '$tokenId' },
            pipeline: [
              { $sort: { createTime: -1 } },
              { $group: { _id: '$tokenId', doc: { $first: '$$ROOT' } } },
              { $replaceRoot: { newRoot: '$doc' } },
              { $match: { $expr: { $eq: ['$tokenId', '$$tokenId'] } } },
              { $project: { _id: 0, tokenId: 0 } },
            ],
            as: 'order',
          },
        },
        { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
      ])
      .toArray();

    let data;
    if (result.length > 0) {
      data = result[0];
      const authorData = await this.cacheManager.get(data.royaltyOwner.toLowerCase());
      if (authorData) {
        data.authorAvatar = JSON.parse(authorData as string).avatar;
      }
    } else {
      data = {} as any;
    }

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async getLatestBids(dto: QueryLatestBidsDTO) {
    const order = await this.connection
      .collection('orders')
      .findOne(
        { tokenId: dto.tokenId, orderType: OrderType.Auction },
        { sort: { createTime: -1 } },
      );

    if (!order) {
      throw new BadRequestException('No auction order found');
    }

    const filter = { orderId: order.orderId, eventType: OrderEventType.OrderBid };

    const total = await this.connection.collection('order_events').count(filter);
    let data = [];

    if (total > 0) {
      data = await this.connection
        .collection('order_events')
        .find(filter)
        .sort({ blockNumber: -1 })
        .project({ _id: 0, transactionHash: 0 })
        .skip((dto.pageNum - 1) * dto.pageSize)
        .limit(dto.pageSize)
        .toArray();

      for (const item of data) {
        const userData = await this.cacheManager.get(item.buyer.toLowerCase());
        if (userData) {
          item.buyerName = JSON.parse(userData as string).name;
        }
      }
    }

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data: { total, data } };
  }

  async getTransHistoryByTokenId(tokenId: string) {
    const data = await this.connection
      .collection('orders')
      .aggregate([
        { $match: { tokenId } },
        { $sort: { updateTime: -1 } },
        {
          $lookup: {
            from: 'order_events',
            localField: 'orderId',
            foreignField: 'orderId',
            as: 'events',
          },
        },
        {
          $project: {
            _id: 0,
            'events._id': 0,
            'events.tokenId': 0,
            tokenId: 0,
            quoteToken: 0,
            royaltyOwner: 0,
            royaltyFee: 0,
            sellerUri: 0,
            buyerUri: 0,
            platformFee: 0,
            platformAddr: 0,
          },
        },
      ])
      .toArray();

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async getEarnedByAddress(address: string, isToday: boolean, isReturnList: boolean) {
    const match = {
      orderState: OrderState.Filled,
      $or: [{ royaltyOwner: address }, { sellerAddr: address }],
    };

    if (isToday) {
      match['updateTime'] = {
        $gte: new Date().setHours(0, 0, 0) / 1000,
        $lte: new Date().setHours(23, 59, 59) / 1000,
      };
    }

    const items = await this.connection
      .collection('orders')
      .aggregate([
        { $match: match },
        {
          $lookup: {
            from: 'tokens',
            localField: 'tokenId',
            foreignField: 'tokenId',
            as: 'token',
          },
        },
        { $unwind: { path: '$token' } },
        {
          $project: {
            _id: 0,
            orderType: 1,
            orderState: 1,
            price: 1,
            sellerAddr: 1,
            filled: 1,
            royaltyOwner: 1,
            royaltyFee: 1,
            platformFee: 1,
            updateTime: 1,
            'token.name': 1,
            'token.data.thumbnail': 1,
          },
        },
        { $sort: { updateTime: -1 } },
      ])
      .toArray();

    if (isReturnList) {
      return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data: items };
    }

    let data = 0;
    items.forEach((item) => {
      if (item.royaltyOwner === address) {
        if (item.sellerAddr === address) {
          data += (item.orderType === OrderType.Sale ? item.price : item.filled) - item.platformFee;
        } else {
          data += item.royaltyFee;
        }
      } else {
        data +=
          (item.orderType === OrderType.Sale ? item.price : item.filled) -
          item.platformFee -
          item.royaltyFee;
      }
    });

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async getTokenPriceHistory(tokenId: string) {
    const data = await this.connection
      .collection('orders')
      .find({ tokenId, orderState: OrderState.Filled })
      .sort({ updateTime: 1 })
      .project({ _id: 0, updateTime: 1, price: '$filled' })
      .toArray();

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async getDidByAddress(address: string) {
    const data = await this.connection.collection('address_did').findOne({ address });
    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async getRecentOnSale() {
    const collections = await this.connection
      .collection('collections')
      .find()
      .sort({ dia: -1 })
      .limit(3)
      .toArray();

    const tokenIds = [];
    const collectionNames = {};
    for (const collection of collections) {
      const result = await this.connection
        .collection('orders')
        .find({
          baseToken: collection.token,
          chain: collection.chain,
          orderState: OrderState.Created,
        })
        .sort({ createTime: -1 })
        .limit(5)
        .toArray();

      collectionNames[collection.token + collection.chain] = collection.name;

      tokenIds.push(
        ...result.map((item) => ({
          tokenId: item.tokenId,
          chain: item.chain,
          contract: item.baseToken,
        })),
      );
    }

    const data = await this.connection.collection('tokens').find({ $or: tokenIds }).toArray();

    for (const item of data) {
      item.collectionName = collectionNames[item.contract + item.chain];
    }

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async listCollectibles(pageNum: number, pageSize: number, type: string, after: number) {
    const matchOrder = {};
    const matchToken = {};
    let selectOrder = false;
    let selectToken = false;

    if (type === '') {
      selectOrder = true;
      selectToken = true;
      matchOrder['$or'] = [{ orderState: OrderState.Created }, { orderState: OrderState.Filled }];
    } else {
      matchOrder['$or'] = [];
      if (type.includes('listed')) {
        selectOrder = true;
        matchOrder['$or'].push({ orderState: OrderState.Created });
      }
      if (type.includes('sold')) {
        selectOrder = true;
        matchOrder['$or'].push({ orderState: OrderState.Filled });
      }
      if (type.includes('minted')) {
        selectToken = true;
      }
    }

    if (after > 0) {
      matchOrder['createTime'] = { $gt: after };
      matchToken['createTime'] = { $gt: after };
    }

    const pipelineOrder = [
      { $sort: { createTime: -1 } },
      { $limit: pageSize * pageNum },
      {
        $lookup: {
          from: 'tokens',
          localField: 'uniqueKey',
          foreignField: 'uniqueKey',
          as: 'token',
        },
      },
      { $unwind: { path: '$token', preserveNullAndEmptyArrays: true } },
    ] as any;

    if (Object.keys(matchOrder).length > 0) {
      pipelineOrder.unshift({ $match: matchOrder });
    }

    const pipelineToken = [
      {
        $lookup: {
          from: 'orders',
          localField: 'uniqueKey',
          foreignField: 'uniqueKey',
          as: 'orders',
        },
      },
      { $match: { orders: { $size: 0 } } },
    ] as any;

    if (Object.keys(matchToken).length > 0) {
      pipelineToken.unshift({ $match: matchToken });
    }

    let countOrder = 0;
    let countToken = 0;
    const orders = [];
    let tokens = [];

    if (selectOrder) {
      countOrder = await this.connection.collection('orders').countDocuments(matchOrder);
      const result = await this.connection.collection('orders').aggregate(pipelineOrder).toArray();

      for (const item of result) {
        if (item.token) {
          const token = item.token;
          delete item.token;
          const order = item;
          orders.push({ ...token, order });
        }
      }
    }

    if (selectToken) {
      const count = await this.connection
        .collection('tokens')
        .aggregate([...pipelineToken, { $count: 'total' }])
        .toArray();
      countToken = count.length > 0 ? count[0].total : 0;
      tokens = await this.connection
        .collection('tokens')
        .aggregate([
          ...pipelineToken,
          { $sort: { createTime: -1 } },
          { $limit: pageSize * pageNum },
        ])
        .toArray();
    }

    const data = [...orders, ...tokens]
      .sort((a, b) => a.createTime - b.createTime)
      .splice((pageNum - 1) * pageSize, pageSize);

    const collections = JSON.parse(await this.cacheManager.get(Constants.CACHE_KEY_COLLECTIONS));

    for (const item of data) {
      item.collectionName =
        collections[`${item.chain}-${item.contract ? item.contract : item.baseToken}`].name;
    }

    return {
      status: HttpStatus.OK,
      message: Constants.MSG_SUCCESS,
      data: { data, total: countToken + countOrder },
    };
  }

  async listCollections(
    pageNum: number,
    pageSize: number,
    type: Chain | 'all',
    category: Category | 'all',
    sort: number,
  ) {
    const filter = {};
    if (type !== 'all') {
      if (type === Chain.ELA) {
        filter['$or'] = [{ chain: Chain.ELA }, { chain: Chain.V1 }];
      } else {
        filter['chain'] = type;
      }
    }
    if (category !== 'all') {
      filter['data.category'] = category;
    }

    let sortObj;
    switch (sort) {
      case 0:
        sortObj = { dia: -1 };
        break;
      case 1:
        sortObj = { blockNumber: -1 };
        break;
      case 2:
        sortObj = { blockNumber: 1 };
        break;
      case 3:
        sortObj = { tradingVolume: 1 };
        break;
      case 4:
        sortObj = { tradingVolume: -1 };
        break;
      case 5:
        sortObj = { items: 1 };
        break;
      case 6:
        sortObj = { items: -1 };
        break;
      case 7:
        sortObj = { owners: 1 };
        break;
      case 8:
        sortObj = { owners: -1 };
        break;
      default:
        sortObj = { dia: -1 };
        break;
    }

    const total = await this.connection.collection('collections').countDocuments(filter);

    let data = [];

    if (total > 0) {
      data = await this.connection
        .collection('collections')
        .find(filter)
        .sort(sortObj)
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize)
        .toArray();
    }

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data: { data, total } };
  }

  async getMarketplace(dto: QueryMarketplaceDTO) {
    const now = Date.now();
    const match = { orderState: OrderState.Created };
    const matchToken = {};
    const pipeline = [];
    let data = [];
    let total = 0;
    if (dto.status && dto.status.length > 0 && dto.status.length < 5) {
      match['$or'] = [];
      if (dto.status.includes(OrderTag.BuyNow)) {
        match['$or'].push({ orderType: OrderType.Sale });
      }
      if (dto.status.includes(OrderTag.OnAuction)) {
        match['$or'].push({ endTime: { $gt: now } });
      }
      if (dto.status.includes(OrderTag.HasEnded)) {
        match['$or'].push({ endTime: { $lt: now, $ne: 0 } });
      }
      if (dto.status.includes(OrderTag.HasBids)) {
        match['$or'].push({ lastBid: { $gt: 0 } });
      }
    }

    if (dto.collection && dto.collection.length > 0) {
      match['baseToken'] = { $in: dto.collection };
    }

    if (dto.token && dto.token.length > 0) {
      match['quoteToken'] = { $in: dto.token };
    }

    if (dto.chain !== 'all') {
      match['chain'] = dto.chain;
    }

    const priceMatch = {};
    if (dto.minPrice) {
      priceMatch['$gte'] = dto.minPrice * 1e18;
    }
    if (dto.maxPrice) {
      priceMatch['$lte'] = dto.maxPrice * 1e18;
    }
    if (Object.keys(priceMatch).length > 0) {
      match['price'] = priceMatch;
    }

    if (!dto.adult) {
      matchToken['$or'] = [{ 'token.adult': { $exists: false } }, { 'token.adult': false }];
    }
    if (dto.type && dto.type !== 'all') {
      if (dto.type === 'avatar') {
        matchToken['order.type'] = 'avatar';
      } else {
        matchToken['order.type'] = { $ne: 'avatar' };
      }
    }

    let sort = {};
    switch (dto.sort) {
      case 0:
        sort = { createTime: -1 };
        break;
      case 1:
        sort = { 'token.createTime': -1 };
        break;
      case 2:
        sort = { createTime: 1 };
        break;
      case 3:
        sort = { 'token.createTime': 1 };
        break;
      case 4:
        sort = { price: 1 };
        break;
      case 5:
        sort = { price: -1 };
        break;
      case 6:
        sort = { endTime: 1 };
        match['endTime'] = { $gt: now };
        break;
      default:
        sort = { createTime: -1 };
        break;
    }

    const pagination = [
      { $sort: sort },
      { $skip: (dto.pageNum - 1) * dto.pageSize },
      { $limit: dto.pageSize },
    ];
    const unionToken = [
      { $match: match },
      {
        $lookup: {
          from: 'tokens',
          localField: 'uniqueKey',
          foreignField: 'uniqueKey',
          as: 'token',
        },
      },
      { $unwind: { path: '$token', preserveNullAndEmptyArrays: true } },
    ];

    let paginationFirst = false;
    if (dto.sort in [0, 2, 4, 5, 6] && Object.keys(matchToken).length === 0) {
      paginationFirst = true;
    } else {
      pipeline.push(...unionToken);
      if (Object.keys(matchToken).length > 0) {
        pipeline.push({ $match: matchToken });
      }
    }

    const result = await this.connection
      .collection('orders')
      .aggregate([...pipeline, { $count: 'total' }])
      .toArray();

    total = result.length > 0 ? result[0].total : 0;

    if (total > 0) {
      paginationFirst
        ? pipeline.push(...[...pagination, ...unionToken])
        : pipeline.push(...pagination);

      data = await this.connection
        .collection('orders')
        .aggregate([...pipeline])
        .toArray();
    }

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data: { data, total } };
  }

  async getCollectibleOfMarketplace(chain: string, orderId: number) {
    const data = await this.connection
      .collection('orders')
      .aggregate([
        { $match: { chain, orderId } },
        {
          $lookup: {
            from: 'tokens',
            localField: 'uniqueKey',
            foreignField: 'uniqueKey',
            as: 'token',
          },
        },
        { $unwind: { path: '$token', preserveNullAndEmptyArrays: true } },
      ])
      .toArray();

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data: data[0] };
  }

  async listNFTs(pageNum: number, pageSize: number, sort: 1 | -1) {
    const total = await this.connection
      .collection('tokens')
      .countDocuments({ tokenOwner: { $ne: Constants.BURN_ADDRESS } });
    const data = await this.connection
      .collection('tokens')
      .find({ tokenOwner: { $ne: Constants.BURN_ADDRESS } })
      .sort({ createTime: sort })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .toArray();

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data: { data, total } };
  }

  getAllPasarAddress(): string[] {
    const addresses = [];
    for (const chain of Object.keys(ConfigContract[this.configService.get('NETWORK')])) {
      addresses.push(ConfigContract[this.configService.get('NETWORK')][chain].pasarContract);
    }
    return addresses;
  }

  async listTransactions(pageNum: number, pageSize: number, eventType: string, sort: 1 | -1) {
    const matchOrder = {};
    const matchToken = { $or: [] };
    let userSpecifiedTokenFilter = false;

    if (eventType !== '') {
      const eventTypes = eventType.split(',');
      if (eventTypes.length !== 11) {
        const orderTypes = [];
        if (eventTypes.includes('BuyOrder')) {
          orderTypes.push(OrderEventType.OrderFilled);
        }
        if (eventTypes.includes('CancelOrder')) {
          orderTypes.push(OrderEventType.OrderCancelled);
        }
        if (eventTypes.includes('ChangeOrderPrice')) {
          orderTypes.push(OrderEventType.OrderPriceChanged);
        }
        if (eventTypes.includes('CreateOrderForSale')) {
          orderTypes.push(OrderEventType.OrderForSale);
        }
        if (eventTypes.includes('CreateOrderForAuction')) {
          orderTypes.push(OrderEventType.OrderForAuction);
        }
        if (eventTypes.includes('BidForOrder')) {
          orderTypes.push(OrderEventType.OrderBid);
        }

        if (orderTypes.length > 0) {
          matchOrder['eventType'] = { $in: orderTypes };
        }

        if (eventTypes.includes('Mint')) {
          userSpecifiedTokenFilter = true;
          matchToken['$or'].push({ from: Constants.BURN_ADDRESS });
        }
        if (eventTypes.includes('Burn')) {
          userSpecifiedTokenFilter = true;
          matchToken['$or'].push({ to: Constants.BURN_ADDRESS });
        }
        if (
          eventTypes.includes('SafeTransferFrom') ||
          eventTypes.includes('SafeTransferFromWithMemo')
        ) {
          userSpecifiedTokenFilter = true;
          const addresses = this.getAllPasarAddress();
          addresses.push(Constants.BURN_ADDRESS);
          matchToken['$or'].push({ from: { $nin: addresses }, to: { $nin: addresses } });
        }
      }
    }

    //when user not specify any token event type, we will return 3 event types above
    //so token event type always has a filter
    if (!userSpecifiedTokenFilter) {
      matchToken['$or'].push({ from: Constants.BURN_ADDRESS });
      matchToken['$or'].push({ to: Constants.BURN_ADDRESS });
      const addresses = this.getAllPasarAddress();
      matchToken['$or'].push({ from: { $nin: addresses }, to: { $nin: addresses } });
    }

    const pipeline1 = [
      { $sort: { timestamp: sort } },
      { $limit: pageSize * pageNum },
      {
        $lookup: {
          from: 'orders',
          let: { chain: '$chain', baseToken: '$baseToken', orderId: '$orderId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$chain', '$$chain'] },
                    { $eq: ['$baseToken', '$$baseToken'] },
                    { $eq: ['$orderId', '$$orderId'] },
                  ],
                },
              },
            },
          ],
          as: 'order',
        },
      },
      { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'tokens',
          localField: 'order.uniqueKey',
          foreignField: 'uniqueKey',
          as: 'token',
        },
      },
      { $unwind: { path: '$token', preserveNullAndEmptyArrays: true } },
    ];

    const pipeline2 = [
      { $sort: { timestamp: sort } },
      { $limit: pageSize * pageNum },
      {
        $lookup: {
          from: 'tokens',
          let: { tokenId: '$tokenId', chain: '$chain', contract: '$contract' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$tokenId', '$$tokenId'] },
                    { $eq: ['$chain', '$$chain'] },
                    { $eq: ['$contract', '$$contract'] },
                  ],
                },
              },
            },
          ],
          as: 'token',
        },
      },
      { $unwind: { path: '$token', preserveNullAndEmptyArrays: true } },
    ];

    let totalOrder = 0;
    let totalToken = 0;
    let orderEvents = [];
    let tokenEvents = [];

    if (Object.keys(matchOrder).length === 0 && !userSpecifiedTokenFilter) {
      totalOrder = await this.connection.collection('order_events').countDocuments();
      orderEvents = await this.connection.collection('order_events').aggregate(pipeline1).toArray();

      totalToken = await this.connection.collection('token_events').countDocuments(matchToken);
      tokenEvents = await this.connection
        .collection('token_events')
        .aggregate([{ $match: matchToken }, ...pipeline2])
        .toArray();
    } else if (Object.keys(matchOrder).length > 0 && userSpecifiedTokenFilter) {
      totalOrder = await this.connection.collection('order_events').countDocuments(matchOrder);
      orderEvents = await this.connection
        .collection('order_events')
        .aggregate([{ $match: matchOrder }, ...pipeline1])
        .toArray();

      totalToken = await this.connection.collection('token_events').countDocuments(matchToken);
      tokenEvents = await this.connection
        .collection('token_events')
        .aggregate([{ $match: matchToken }, ...pipeline2])
        .toArray();
    } else {
      if (userSpecifiedTokenFilter) {
        totalToken = await this.connection.collection('token_events').countDocuments(matchToken);
        tokenEvents = await this.connection
          .collection('token_events')
          .aggregate([{ $match: matchToken }, ...pipeline2])
          .toArray();
      } else {
        totalOrder = await this.connection.collection('order_events').countDocuments(matchOrder);
        orderEvents = await this.connection
          .collection('order_events')
          .aggregate([{ $match: matchOrder }, ...pipeline1])
          .toArray();
      }
    }

    const events = [...orderEvents, ...tokenEvents];
    const data = events
      .sort((a, b) => {
        return sort === 1 ? a.timestamp - b.timestamp : b.timestamp - a.timestamp;
      })
      .splice(pageSize * (pageNum - 1), pageSize);

    data.forEach((item) => {
      let eventTypeName = '';
      if (item.order) {
        switch (item.eventType) {
          case OrderEventType.OrderForSale:
            eventTypeName = 'CreateOrderForSale';
            break;
          case OrderEventType.OrderForAuction:
            eventTypeName = 'CreateOrderForAuction';
            break;
          case OrderEventType.OrderBid:
            eventTypeName = 'BidForOrder';
            break;
          case OrderEventType.OrderCancelled:
            eventTypeName = 'CancelOrder';
            break;
          case OrderEventType.OrderPriceChanged:
            eventTypeName = 'ChangeOrderPrice';
            break;
          case OrderEventType.OrderFilled:
            eventTypeName = 'BuyOrder';
            break;
        }
      } else {
        if (item.from === Constants.BURN_ADDRESS) {
          eventTypeName = 'Mint';
        } else if (item.to === Constants.BURN_ADDRESS) {
          eventTypeName = 'Burn';
        } else {
          eventTypeName = 'SafeTransferFrom';
        }
      }

      item.eventTypeName = eventTypeName;
    });

    return {
      status: HttpStatus.OK,
      message: Constants.MSG_SUCCESS,
      data: { data, total: totalToken + totalOrder },
    };
  }

  async getTransactionsByToken(
    chain: Chain,
    tokenId: string,
    baseToken: string,
    eventType: string,
    sort: 1 | -1,
  ) {
    const orders = await this.connection
      .collection('orders')
      .find({
        chain: chain === Chain.V1 ? { $in: [Chain.V1, Chain.ELA] } : chain,
        tokenId,
        baseToken,
      })
      .toArray();

    const orderConditions = orders.map((order) => ({
      chain: order.chain,
      baseToken: order.baseToken,
      orderId: order.orderId,
    }));

    const matchOrder = {};
    if (orderConditions.length > 0) {
      matchOrder['$or'] = orderConditions;
    }
    const matchToken = { chain, tokenId, contract: baseToken, $or: [] };
    let userSpecifiedOrderFilter = false;
    let userSpecifiedTokenFilter = false;

    if (eventType !== '') {
      const eventTypes = eventType.split(',');
      if (eventTypes.length !== 11) {
        const orderTypes = [];
        if (eventTypes.includes('BuyOrder')) {
          userSpecifiedOrderFilter = true;
          orderTypes.push(OrderEventType.OrderFilled);
        }
        if (eventTypes.includes('CancelOrder')) {
          userSpecifiedOrderFilter = true;
          orderTypes.push(OrderEventType.OrderCancelled);
        }
        if (eventTypes.includes('ChangeOrderPrice')) {
          userSpecifiedOrderFilter = true;
          orderTypes.push(OrderEventType.OrderPriceChanged);
        }
        if (eventTypes.includes('CreateOrderForSale')) {
          userSpecifiedOrderFilter = true;
          orderTypes.push(OrderEventType.OrderForSale);
        }
        if (eventTypes.includes('CreateOrderForAuction')) {
          userSpecifiedOrderFilter = true;
          orderTypes.push(OrderEventType.OrderForAuction);
        }
        if (eventTypes.includes('BidForOrder')) {
          userSpecifiedOrderFilter = true;
          orderTypes.push(OrderEventType.OrderBid);
        }

        if (orderTypes.length > 0) {
          matchOrder['eventType'] = { $in: orderTypes };
        }

        if (eventTypes.includes('Mint')) {
          userSpecifiedTokenFilter = true;
          matchToken['$or'].push({ from: Constants.BURN_ADDRESS });
        }
        if (eventTypes.includes('Burn')) {
          userSpecifiedTokenFilter = true;
          matchToken['$or'].push({ to: Constants.BURN_ADDRESS });
        }
        if (
          eventTypes.includes('SafeTransferFrom') ||
          eventTypes.includes('SafeTransferFromWithMemo')
        ) {
          userSpecifiedTokenFilter = true;
          const addresses = this.getAllPasarAddress();
          addresses.push(Constants.BURN_ADDRESS);
          matchToken['$or'].push({ from: { $nin: addresses }, to: { $nin: addresses } });
        }
      }
    }

    //when user not specify any token event type, we will return 3 event types above
    //so token event type always has a filter
    if (!userSpecifiedTokenFilter) {
      matchToken['$or'].push({ from: Constants.BURN_ADDRESS });
      matchToken['$or'].push({ to: Constants.BURN_ADDRESS });
      const addresses = this.getAllPasarAddress();
      matchToken['$or'].push({ from: { $nin: addresses }, to: { $nin: addresses } });
    }

    const pipeline1 = [
      { $match: matchOrder },
      {
        $lookup: {
          from: 'orders',
          let: { chain: '$chain', baseToken: '$baseToken', orderId: '$orderId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$chain', '$$chain'] },
                    { $eq: ['$baseToken', '$$baseToken'] },
                    { $eq: ['$orderId', '$$orderId'] },
                  ],
                },
              },
            },
          ],
          as: 'order',
        },
      },
      { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
      { $sort: { timestamp: sort } },
    ];
    const pipeline2 = [{ $match: matchToken }, { $sort: { timestamp: sort } }];

    let totalOrder = 0;
    let totalToken = 0;
    let orderEvents = [];
    let tokenEvents = [];

    if (
      (!userSpecifiedOrderFilter && !userSpecifiedTokenFilter) ||
      (userSpecifiedOrderFilter && userSpecifiedTokenFilter)
    ) {
      if (orderConditions.length > 0) {
        totalOrder = await this.connection.collection('order_events').countDocuments(matchOrder);
        orderEvents = await this.connection
          .collection('order_events')
          .aggregate(pipeline1)
          .toArray();
      }

      totalToken = await this.connection.collection('token_events').countDocuments(matchToken);
      tokenEvents = await this.connection.collection('token_events').aggregate(pipeline2).toArray();
    } else {
      if (userSpecifiedTokenFilter) {
        totalToken = await this.connection.collection('token_events').countDocuments(matchToken);
        tokenEvents = await this.connection
          .collection('token_events')
          .aggregate(pipeline2)
          .toArray();
      } else {
        if (orderConditions.length > 0) {
          totalOrder = await this.connection.collection('order_events').countDocuments(matchOrder);
          orderEvents = await this.connection
            .collection('order_events')
            .aggregate(pipeline1)
            .toArray();
        }
      }
    }

    const events = [...orderEvents, ...tokenEvents];
    const data = events.sort((a, b) => {
      return sort === 1 ? a.timestamp - b.timestamp : b.timestamp - a.timestamp;
    });

    data.forEach((item) => {
      let eventTypeName = '';
      if (item.eventType) {
        switch (item.eventType) {
          case OrderEventType.OrderForSale:
            eventTypeName = 'CreateOrderForSale';
            break;
          case OrderEventType.OrderForAuction:
            eventTypeName = 'CreateOrderForAuction';
            break;
          case OrderEventType.OrderBid:
            eventTypeName = 'BidForOrder';
            break;
          case OrderEventType.OrderCancelled:
            eventTypeName = 'CancelOrder';
            break;
          case OrderEventType.OrderPriceChanged:
            eventTypeName = 'ChangeOrderPrice';
            break;
          case OrderEventType.OrderFilled:
            eventTypeName = 'BuyOrder';
            break;
        }
      } else {
        if (item.from === Constants.BURN_ADDRESS) {
          eventTypeName = 'Mint';
        } else if (item.to === Constants.BURN_ADDRESS) {
          eventTypeName = 'Burn';
        } else {
          eventTypeName = 'SafeTransferFrom';
        }
      }

      item.eventTypeName = eventTypeName;
    });

    return {
      status: HttpStatus.OK,
      message: Constants.MSG_SUCCESS,
      data: { data, total: totalToken + totalOrder },
    };
  }

  async getPriceHistoryOfToken(chain: Chain, tokenId: string, baseToken: string) {
    const data = await this.connection
      .collection('orders')
      .find({ chain, tokenId, baseToken, orderState: OrderState.Filled })
      .toArray();

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async getCollectiblesOfCollection(
    chain: Chain,
    collection: string,
    exceptToken: string,
    num: number,
  ) {
    const data = await this.connection
      .collection('tokens')
      .aggregate([
        { $match: { chain, contract: collection, tokenId: { $ne: exceptToken } } },
        { $sort: { createTime: -1 } },
        { $limit: num },
        {
          $lookup: {
            from: 'orders',
            let: { uniqueKey: '$uniqueKey' },
            pipeline: [
              { $sort: { createTime: -1 } },
              { $group: { _id: '$uniqueKey', doc: { $first: '$$ROOT' } } },
              { $replaceRoot: { newRoot: '$doc' } },
              {
                $match: {
                  $expr: {
                    $eq: ['$uniqueKey', '$$uniqueKey'],
                  },
                },
              },
            ],
            as: 'order',
          },
        },
        { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
      ])
      .toArray();

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async getCollectionInfo(chain: Chain, collection: string) {
    const data = await this.connection
      .collection('collections')
      .findOne({ chain, token: collection });
    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async quickSearch(keyword: string) {
    const filter = [
      { name: { $regex: keyword, $options: 'i' } },
      { description: { $regex: keyword, $options: 'i' } },
    ];

    const filter2 = [
      { 'creator.name': { $regex: keyword, $options: 'i' } },
      { 'creator.description': { $regex: keyword, $options: 'i' } },
    ];

    const accounts = await this.connection
      .collection('address_did')
      .find({ $or: [{ address: keyword }, ...filter] })
      .limit(3)
      .toArray();

    const items = await this.connection
      .collection('tokens')
      .find({
        $or: [
          { royaltyOwner: keyword },
          { tokenId: keyword },
          { tokenIdHex: keyword },
          { tokenOwner: keyword },
          ...filter,
          ...filter2,
        ],
      })
      .limit(3)
      .toArray();

    const collections = await this.connection
      .collection('collections')
      .find({ $or: [{ owner: keyword }, { token: keyword }, ...filter, ...filter2] })
      .limit(3)
      .toArray();

    return {
      status: HttpStatus.OK,
      message: Constants.MSG_SUCCESS,
      data: { accounts, items, collections },
    };
  }

  async getCollectibleInfo(chain: Chain, tokenId: string, contract: string) {
    const data = await this.connection.collection('tokens').findOne({ chain, tokenId, contract });
    if (data) {
      const order = await this.connection
        .collection('orders')
        .find({ chain, tokenId, baseToken: contract })
        .sort({ createTime: -1 })
        .limit(1)
        .toArray();
      data.listed = order.length === 1 && order[0].orderState === OrderState.Created;
      if (data.listed) {
        data.listedOn = order[0].createTime;
        data.order = order[0];
      }

      const attributes = await this.connection
        .collection('collection_attributes')
        .aggregate([
          { $match: { chain, collection: contract } },
          {
            $group: {
              _id: '$key',
              values: { $push: '$value' },
              counts: { $push: '$count' },
              total: { $sum: '$count' },
            },
          },
        ])
        .toArray();

      const attributesCount = {};
      attributes.forEach((item) => {
        attributesCount[item._id] = {};
        item.values.forEach((value, index) => {
          attributesCount[item._id][value] = item.counts[index] / item.total;
        });
      });

      data.attributes?.forEach((item) => {
        item.percentage = attributesCount[item.trait_type][item.value];
      });
    }
    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async searchTokens(keyword: string) {
    const data = await this.connection
      .collection('tokens')
      .find({
        $or: [
          { royaltyOwner: keyword },
          { tokenId: keyword },
          { tokenIdHex: keyword },
          { tokenOwner: keyword },
          { name: { $regex: keyword, $options: 'i' } },
          { description: { $regex: keyword, $options: 'i' } },
          { 'creator.name': { $regex: keyword, $options: 'i' } },
          { 'creator.description': { $regex: keyword, $options: 'i' } },
        ],
      })
      .toArray();

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async searchMarketplace(keyword: string) {
    const data = await this.connection
      .collection('tokens')
      .aggregate([
        {
          $match: {
            $or: [
              { royaltyOwner: keyword },
              { tokenId: keyword },
              { tokenIdHex: keyword },
              { tokenOwner: keyword },
              { name: { $regex: keyword, $options: 'i' } },
              { description: { $regex: keyword, $options: 'i' } },
              { 'creator.name': { $regex: keyword, $options: 'i' } },
              { 'creator.description': { $regex: keyword, $options: 'i' } },
            ],
          },
        },
        {
          $lookup: {
            from: 'orders',
            let: { uniqueKey: '$uniqueKey' },
            pipeline: [
              { $sort: { createTime: -1 } },
              { $group: { _id: '$uniqueKey', doc: { $first: '$$ROOT' } } },
              { $replaceRoot: { newRoot: '$doc' } },
              {
                $match: {
                  $expr: {
                    $eq: ['$uniqueKey', '$$uniqueKey'],
                  },
                },
              },
            ],
            as: 'order',
          },
        },
        { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
        { $match: { 'order.orderState': OrderState.Created } },
      ])
      .toArray();

    const data2 = await this.connection
      .collection('orders')
      .aggregate([
        {
          $match: {
            orderState: OrderState.Created,
            $or: [
              { sellerAddr: keyword },
              { 'sellerInfo.name': { $regex: keyword, $options: 'i' } },
              { 'sellerInfo.description': { $regex: keyword, $options: 'i' } },
            ],
          },
        },
        {
          $lookup: {
            from: 'tokens',
            localField: 'uniqueKey',
            foreignField: 'uniqueKey',
            as: 'token',
          },
        },
        { $unwind: { path: '$token', preserveNullAndEmptyArrays: true } },
      ])
      .toArray();

    const data1 = data.map((item) => {
      const order = item.order;
      delete item.order;
      return { ...order, token: item };
    });

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data: [...data1, ...data2] };
  }

  async getStatisticsOfCollection(chain: Chain, collection: string) {
    const items = await this.connection
      .collection('tokens')
      .aggregate([
        { $match: { chain, contract: collection } },
        { $group: { _id: '$chain', items: { $sum: 1 } } },
      ])
      .toArray();

    const owners = await this.connection
      .collection('tokens')
      .distinct('tokenOwner', { chain, contract: collection })
      .then((res) => res.length);

    const tv = await this.connection
      .collection('orders')
      .aggregate([
        { $match: { chain, baseToken: collection, orderState: OrderState.Filled } },
        { $group: { _id: '$chain', tv: { $sum: '$filled' } } },
      ])
      .toArray();

    const lowestPrice = await this.connection
      .collection('orders')
      .find({ chain, baseToken: collection, orderState: { $ne: OrderState.Cancelled } })
      .sort({ price: 1 })
      .limit(1)
      .toArray();
    return {
      status: HttpStatus.OK,
      message: Constants.MSG_SUCCESS,
      data: {
        items: items[0].items,
        owners,
        lowestPrice: lowestPrice[0].price / Constants.ELA_ESC_PRECISION,
        tradingVolume: tv[0].tv / Constants.ELA_ESC_PRECISION,
      },
    };
  }

  async listCollectibleOfCollection(dto: QueryCollectibleOfCollectionDTO) {
    const now = Date.now();
    const match = {};
    if (dto.status && dto.status.length > 0 && dto.status.length < 5) {
      match['$or'] = [];
      if (dto.status.includes(OrderTag.BuyNow)) {
        match['$or'].push({ 'order.orderType': OrderType.Sale });
      }
      if (dto.status.includes(OrderTag.OnAuction)) {
        match['$or'].push({ 'order.endTime': { $gt: now } });
      }
      if (dto.status.includes(OrderTag.HasEnded)) {
        match['$or'].push({ 'order.endTime': { $lt: now, $ne: 0 } });
      }
      if (dto.status.includes(OrderTag.HasBids)) {
        match['$or'].push({ 'order.lastBid': { $gt: 0 } });
      }
    }

    if (dto.attribute && Object.keys(dto.attribute).length > 0) {
      match['$and'] = [];
      Object.keys(dto.attribute).forEach((key) => {
        match['$and'].push({ [`attributes.${key}`]: { $in: dto.attribute[key] } });
      });
    }

    if (dto.token && dto.token.length > 0) {
      match['order.quoteToken'] = { $in: dto.token };
    }

    const priceMatch = {};
    if (dto.minPrice) {
      priceMatch['$gte'] = dto.minPrice * 1e18;
    }
    if (dto.maxPrice) {
      priceMatch['$lte'] = dto.maxPrice * 1e18;
    }
    if (Object.keys(priceMatch).length > 0) {
      match['order.price'] = priceMatch;
    }

    let sort = {};
    switch (dto.sort) {
      case 0:
        sort = { 'order.createTime': -1 };
        break;
      case 1:
        sort = { createTime: -1 };
        break;
      case 2:
        sort = { 'order.createTime': 1 };
        break;
      case 3:
        sort = { createTime: 1 };
        break;
      case 4:
        sort = { 'order.price': 1 };
        break;
      case 5:
        sort = { 'order.price': -1 };
        break;
      case 6:
        sort = { 'order.endTime': 1 };
        match['order.endTime'] = { $gt: now };
        break;
      default:
        sort = { createTime: -1 };
        break;
    }

    const pipeline = [
      {
        $match: {
          chain: dto.chain,
          contract: dto.collection,
          tokenOwner: { $ne: Constants.BURN_ADDRESS },
        },
      },
      {
        $lookup: {
          from: 'orders',
          let: { uniqueKey: '$uniqueKey' },
          pipeline: [
            { $sort: { createTime: -1 } },
            { $group: { _id: '$uniqueKey', doc: { $first: '$$ROOT' } } },
            { $replaceRoot: { newRoot: '$doc' } },
            {
              $match: {
                $expr: {
                  $eq: ['$uniqueKey', '$$uniqueKey'],
                },
              },
            },
          ],
          as: 'order',
        },
      },
      { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
    ] as any;

    if (Object.keys(match).length > 0) {
      pipeline.push({ $match: match });
    }

    const result = await this.connection
      .collection('tokens')
      .aggregate([...pipeline, { $count: 'total' }])
      .toArray();

    const total = result.length > 0 ? result[0].total : 0;
    let data = [];

    if (total > 0) {
      data = await this.connection
        .collection('tokens')
        .aggregate([
          ...pipeline,
          { $sort: sort },
          { $skip: (dto.pageNum - 1) * dto.pageSize },
          { $limit: dto.pageSize },
        ])
        .toArray();
    }

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data: { data, total } };
  }

  async getStatisticsByWalletAddr(address: string) {
    const listed = await this.connection
      .collection('orders')
      .countDocuments({ sellerAddr: address, orderState: OrderState.Created });
    const owned = await this.connection
      .collection('tokens')
      .countDocuments({ tokenOwner: address });
    const sold = await this.connection
      .collection('orders')
      .countDocuments({ sellerAddr: address, orderState: OrderState.Filled });
    const minted = await this.connection
      .collection('tokens')
      .countDocuments({ royaltyOwner: address });
    const bids = await this.connection
      .collection('order_events')
      .countDocuments({ eventType: OrderEventType.OrderBid, buyer: address });
    const collections = await this.connection
      .collection('collections')
      .countDocuments({ owner: address });

    return {
      status: HttpStatus.OK,
      message: Constants.MSG_SUCCESS,
      data: { listed, owned, sold, minted, bids, collections },
    };
  }

  async getCollectionsByWalletAddr(
    pageNum: number,
    pageSize: number,
    walletAddr: string,
    chain: Chain | 'all',
    sort: number,
  ) {
    const match = { owner: walletAddr };
    if (chain !== 'all') {
      match['chain'] = chain;
    }

    const total = await this.connection.collection('collections').countDocuments(match);

    let data = [];
    if (total > 0) {
      data = await this.connection
        .collection('collections')
        .find(match)
        .sort({ blockNumber: sort === 1 ? -1 : 1 })
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize)
        .toArray();
    }

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data: { data, total } };
  }

  async getListedCollectiblesByWalletAddr(
    pageNum: number,
    pageSize: number,
    walletAddr: string,
    chain: Chain | 'all',
    sort: number,
  ) {
    const match = { sellerAddr: walletAddr, orderState: OrderState.Created };
    if (chain !== 'all') {
      if (chain === Chain.ELA) {
        match['chain'] = { $in: [Chain.ELA, Chain.V1] };
      } else {
        match['chain'] = chain;
      }
    }

    const total = await this.connection.collection('orders').countDocuments(match);

    let data = [];
    if (total > 0) {
      data = await this.connection
        .collection('orders')
        .aggregate([
          { $match: match },
          {
            $lookup: {
              from: 'tokens',
              localField: 'uniqueKey',
              foreignField: 'uniqueKey',
              as: 'token',
            },
          },
          { $unwind: { path: '$token', preserveNullAndEmptyArrays: true } },
          { $sort: AppService.getSortOfOrder(sort) },
          { $skip: (pageNum - 1) * pageSize },
          { $limit: pageSize },
        ])
        .toArray();
    }

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data: { data, total } };
  }

  async getOwnedCollectiblesByWalletAddr(
    pageNum: number,
    pageSize: number,
    walletAddr: string,
    chain: Chain | 'all',
    sort: number,
  ) {
    const match = { tokenOwner: walletAddr };
    if (chain !== 'all') {
      if (chain === Chain.ELA) {
        match['chain'] = { $in: [Chain.ELA, Chain.V1] };
      } else {
        match['chain'] = chain;
      }
    }

    const total = await this.connection.collection('tokens').countDocuments(match);

    let data = [];
    if (total > 0) {
      data = await this.connection
        .collection('tokens')
        .aggregate([
          { $match: match },
          {
            $lookup: {
              from: 'orders',
              let: { uniqueKey: '$uniqueKey' },
              pipeline: [
                { $sort: { createTime: -1 } },
                { $group: { _id: '$uniqueKey', doc: { $first: '$$ROOT' } } },
                { $replaceRoot: { newRoot: '$doc' } },
                {
                  $match: {
                    $expr: {
                      $eq: ['$uniqueKey', '$$uniqueKey'],
                    },
                  },
                },
              ],
              as: 'order',
            },
          },
          { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
          { $sort: AppService.getSortOfToken(sort) },
          { $skip: (pageNum - 1) * pageSize },
          { $limit: pageSize },
        ])
        .toArray();
    }

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data: { data, total } };
  }

  async getBidsCollectiblesByWalletAddr(
    pageNum: number,
    pageSize: number,
    walletAddr: string,
    chain: Chain | 'all',
    sort: number,
  ) {
    const match = { buyer: walletAddr, eventType: OrderEventType.OrderBid };
    if (chain !== 'all') {
      if (chain === Chain.ELA) {
        match['chain'] = { $in: [Chain.ELA, Chain.V1] };
      } else {
        match['chain'] = chain;
      }
    }

    const total = await this.connection.collection('order_events').countDocuments(match);

    let data = [];
    if (total > 0) {
      data = await this.connection
        .collection('order_events')
        .aggregate([
          { $match: match },
          {
            $lookup: {
              from: 'orders',
              let: { orderId: '$orderId', chain: '$chain' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [{ $eq: ['$orderId', '$$orderId'] }, { $eq: ['$chain', '$$chain'] }],
                    },
                  },
                },
              ],
              as: 'order',
            },
          },
          { $unwind: { path: '$events', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'tokens',
              localField: 'order.uniqueKey',
              foreignField: 'uniqueKey',
              as: 'token',
            },
          },
          { $unwind: { path: '$token', preserveNullAndEmptyArrays: true } },
          { $sort: AppService.getSortOfTokenOrder(sort) },
          { $skip: (pageNum - 1) * pageSize },
          { $limit: pageSize },
        ])
        .toArray();
    }

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data: { data, total } };
  }

  async getMintedCollectiblesByWalletAddr(
    pageNum: number,
    pageSize: number,
    walletAddr: string,
    chain: Chain | 'all',
    sort: number,
  ) {
    const match = { royaltyOwner: walletAddr, tokenOwner: { $ne: Constants.BURN_ADDRESS } };
    if (chain !== 'all') {
      if (chain === Chain.ELA) {
        match['chain'] = { $in: [Chain.ELA, Chain.V1] };
      } else {
        match['chain'] = chain;
      }
    }

    const total = await this.connection.collection('tokens').countDocuments(match);

    let data = [];
    if (total > 0) {
      data = await this.connection
        .collection('tokens')
        .aggregate([
          { $match: match },
          {
            $lookup: {
              from: 'orders',
              let: { uniqueKey: '$uniqueKey' },
              pipeline: [
                { $sort: { createTime: -1 } },
                { $group: { _id: '$uniqueKey', doc: { $first: '$$ROOT' } } },
                { $replaceRoot: { newRoot: '$doc' } },
                {
                  $match: {
                    $expr: {
                      $eq: ['$uniqueKey', '$$uniqueKey'],
                    },
                  },
                },
              ],
              as: 'order',
            },
          },
          { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
          { $sort: AppService.getSortOfToken(sort) },
          { $skip: (pageNum - 1) * pageSize },
          { $limit: pageSize },
        ])
        .toArray();
    }

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data: { data, total } };
  }

  async getSoldCollectiblesByWalletAddr(
    pageNum: number,
    pageSize: number,
    walletAddr: string,
    chain: Chain | 'all',
    sort: number,
  ) {
    const match = { seller: walletAddr, orderState: OrderState.Filled };
    if (chain !== 'all') {
      if (chain === Chain.ELA) {
        match['chain'] = { $in: [Chain.ELA, Chain.V1] };
      } else {
        match['chain'] = chain;
      }
    }

    const total = await this.connection.collection('orders').countDocuments(match);

    let data = [];
    if (total > 0) {
      data = await this.connection
        .collection('orders')
        .aggregate([
          { $match: match },
          {
            $lookup: {
              from: 'tokens',
              localField: 'uniqueKey',
              foreignField: 'uniqueKey',
              as: 'token',
            },
          },
          { $unwind: { path: '$token', preserveNullAndEmptyArrays: true } },
          { $sort: AppService.getSortOfOrder(sort) },
          { $skip: (pageNum - 1) * pageSize },
          { $limit: pageSize },
        ])
        .toArray();
    }

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data: { data, total } };
  }

  async getItems() {
    const data = await this.connection
      .collection('tokens')
      .countDocuments({ tokenOwner: { $ne: Constants.BURN_ADDRESS } });

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async getTransactions() {
    const countTokens = await this.connection.collection('token_events').countDocuments();
    const countOrders = await this.connection.collection('order_events').countDocuments();
    const data = countTokens + countOrders;

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async getOwners() {
    const data = await this.connection
      .collection('tokens')
      .distinct('tokenOwner')
      .then((res) => res.length);

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async getTradingVolume() {
    const result = await this.connection
      .collection('orders')
      .find({ orderState: OrderState.Filled })
      .toArray();

    const tokenRates = await this.connection.collection('token_rates').find().toArray();
    const rates = {};
    tokenRates.forEach((item) => {
      if (!rates[item.chain]) {
        rates[item.chain] = {};
      }
      rates[item.chain][item.token] = item.rate;
    });

    let total = 0;
    result.forEach((item) => {
      let rate = 1;
      if (item.quoteToken && item.quoteToken !== Constants.BURN_ADDRESS) {
        rate = rates[item.chain][item.quoteToken.toLowerCase()];
      }
      const amount = item.amount ? item.amount : 1;
      total += (amount * item.price * rate) / Constants.ELA_ESC_PRECISION;
    });

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data: total };
  }

  async reGetTokenDetail() {
    const result = await this.connection
      .collection('tokens')
      .updateMany({ notGetDetail: true, retryTimes: { $gt: 4 } }, { $set: { retryTimes: 0 } });

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data: result };
  }

  async getStatisticsOfUser(address: string) {
    const created = await this.connection
      .collection('tokens')
      .countDocuments({ royaltyOwner: address });
    const sold = await this.connection
      .collection('orders')
      .countDocuments({ sellerAddr: address, orderState: OrderState.Filled });
    const purchased = await this.connection.collection('orders').countDocuments({
      buyerAddr: address,
      orderState: OrderState.Filled,
    });

    const transactionsToken = await this.connection
      .collection('token_events')
      .countDocuments({ $or: [{ from: address }, { to: address }] });
    const transactionsOrder = await this.connection.collection('order_events').countDocuments({
      $or: [
        { buyer: address, eventType: OrderEventType.OrderBid },
        { seller: address, eventType: OrderEventType.OrderPriceChanged },
      ],
    });

    return {
      status: HttpStatus.OK,
      message: Constants.MSG_SUCCESS,
      data: { created, sold, purchased, transactions: transactionsToken + transactionsOrder },
    };
  }

  async listTransactionsOfUser(
    walletAddr: string,
    pageNum: number,
    pageSize: number,
    eventType: string,
    performer: string,
    keyword: string,
    sort: 1 | -1,
  ) {
    const addresses = this.getAllPasarAddress();
    addresses.push(Constants.BURN_ADDRESS);

    const matchOrder = { $or: [{ buyer: walletAddr }, { seller: walletAddr }] };
    let matchToken: { $or?: any; from?: string; to?: string } = {
      $or: [
        { from: walletAddr, to: { $nin: addresses } },
        { to: walletAddr, from: { $nin: addresses } },
      ],
    };
    let userSpecifiedTokenFilter = false;
    let userSpecifiedOrderFilter = false;

    if (eventType !== '') {
      const eventTypes = eventType.split(',');
      if (eventTypes.length !== 11) {
        const orderTypes = [];
        if (eventTypes.includes('BuyOrder')) {
          orderTypes.push(OrderEventType.OrderFilled);
        }
        if (eventTypes.includes('CancelOrder')) {
          orderTypes.push(OrderEventType.OrderCancelled);
        }
        if (eventTypes.includes('ChangeOrderPrice')) {
          orderTypes.push(OrderEventType.OrderPriceChanged);
        }
        if (eventTypes.includes('CreateOrderForSale')) {
          orderTypes.push(OrderEventType.OrderForSale);
        }
        if (eventTypes.includes('CreateOrderForAuction')) {
          orderTypes.push(OrderEventType.OrderForAuction);
        }
        if (eventTypes.includes('BidForOrder')) {
          orderTypes.push(OrderEventType.OrderBid);
        }

        if (orderTypes.length > 0) {
          userSpecifiedOrderFilter = true;
          matchOrder['eventType'] = { $in: orderTypes };
        }

        if (eventTypes.includes('Mint')) {
          userSpecifiedTokenFilter = true;
          matchToken = { from: Constants.BURN_ADDRESS, to: walletAddr };
        }
        if (eventTypes.includes('Burn')) {
          userSpecifiedTokenFilter = true;
          matchToken = { to: Constants.BURN_ADDRESS, from: walletAddr };
        }
        if (
          eventTypes.includes('SafeTransferFrom') ||
          eventTypes.includes('SafeTransferFromWithMemo')
        ) {
          userSpecifiedTokenFilter = true;
        }
      }
    }

    const pipeline1 = [
      {
        $lookup: {
          from: 'orders',
          let: { chain: '$chain', baseToken: '$baseToken', orderId: '$orderId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$chain', '$$chain'] },
                    { $eq: ['$baseToken', '$$baseToken'] },
                    { $eq: ['$orderId', '$$orderId'] },
                  ],
                },
              },
            },
          ],
          as: 'order',
        },
      },
      { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'tokens',
          localField: 'order.uniqueKey',
          foreignField: 'uniqueKey',
          as: 'token',
        },
      },
      { $unwind: { path: '$token', preserveNullAndEmptyArrays: true } },
    ] as any;

    const pipeline2 = [
      { $sort: { timestamp: sort } },
      { $limit: pageSize * pageNum },
      {
        $lookup: {
          from: 'tokens',
          let: { tokenId: '$tokenId', chain: '$chain', contract: '$contract' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$tokenId', '$$tokenId'] },
                    { $eq: ['$chain', '$$chain'] },
                    { $eq: ['$contract', '$$contract'] },
                  ],
                },
              },
            },
          ],
          as: 'token',
        },
      },
      { $unwind: { path: '$token', preserveNullAndEmptyArrays: true } },
    ] as any;

    if (keyword !== '') {
      const match = {
        $match: {
          $or: [
            { 'token.royaltyOwner': keyword },
            { 'token.tokenId': keyword },
            { 'token.tokenIdHex': keyword },
            { 'token.tokenOwner': keyword },
            { 'token.name': { $regex: keyword, $options: 'i' } },
            { 'token.description': { $regex: keyword, $options: 'i' } },
          ],
        },
      };
      pipeline1.push(match);
      pipeline2.push(match);
    }
    pipeline1.push({ $sort: { timestamp: sort } }, { $limit: pageSize * pageNum });
    pipeline2.push({ $sort: { timestamp: sort } }, { $limit: pageSize * pageNum });

    let totalOrder = 0;
    let totalToken = 0;
    let orderEvents = [];
    let tokenEvents = [];

    if (
      (!userSpecifiedOrderFilter && !userSpecifiedTokenFilter) ||
      (userSpecifiedOrderFilter && userSpecifiedTokenFilter)
    ) {
      totalOrder = await this.connection.collection('order_events').countDocuments(matchOrder);
      orderEvents = await this.connection
        .collection('order_events')
        .aggregate([{ $match: matchOrder }, ...pipeline1])
        .toArray();

      totalToken = await this.connection.collection('token_events').countDocuments(matchToken);
      tokenEvents = await this.connection
        .collection('token_events')
        .aggregate([{ $match: matchToken }, ...pipeline2])
        .toArray();
    } else {
      if (userSpecifiedTokenFilter) {
        totalToken = await this.connection.collection('token_events').countDocuments(matchToken);
        tokenEvents = await this.connection
          .collection('token_events')
          .aggregate([{ $match: matchToken }, ...pipeline2])
          .toArray();
      } else {
        totalOrder = await this.connection.collection('order_events').countDocuments(matchOrder);
        orderEvents = await this.connection
          .collection('order_events')
          .aggregate([{ $match: matchOrder }, ...pipeline1])
          .toArray();
      }
    }

    const events = [...orderEvents, ...tokenEvents];
    const data = events
      .sort((a, b) => {
        return sort === 1 ? a.timestamp - b.timestamp : b.timestamp - a.timestamp;
      })
      .splice(pageSize * (pageNum - 1), pageSize);

    data.forEach((item) => {
      let eventTypeName = '';
      if (item.order) {
        switch (item.eventType) {
          case OrderEventType.OrderForSale:
            eventTypeName = 'CreateOrderForSale';
            break;
          case OrderEventType.OrderForAuction:
            eventTypeName = 'CreateOrderForAuction';
            break;
          case OrderEventType.OrderBid:
            eventTypeName = 'BidForOrder';
            break;
          case OrderEventType.OrderCancelled:
            eventTypeName = 'CancelOrder';
            break;
          case OrderEventType.OrderPriceChanged:
            eventTypeName = 'ChangeOrderPrice';
            break;
          case OrderEventType.OrderFilled:
            eventTypeName = 'BuyOrder';
            break;
        }
      } else {
        if (item.from === Constants.BURN_ADDRESS) {
          eventTypeName = 'Mint';
        } else if (item.to === Constants.BURN_ADDRESS) {
          eventTypeName = 'Burn';
        } else {
          eventTypeName = 'SafeTransferFrom';
        }
      }

      item.eventTypeName = eventTypeName;
    });

    return {
      status: HttpStatus.OK,
      message: Constants.MSG_SUCCESS,
      data: { data, total: totalToken + totalOrder },
    };
  }

  async getIncomesOfUser(address: string, type: IncomeType) {
    const data = await this.connection
      .collection('user_income_records')
      .find({ address, type })
      .toArray();

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async checkFirstSale(uniqueKeys: string[]) {
    const match = [];
    uniqueKeys.forEach((uniqueKey) => {
      const [chain, contract, tokenId] = uniqueKey.split('-');
      match.push({
        chain,
        contract,
        tokenId,
      });
    });

    const data = await this.connection
      .collection('tokens')
      .aggregate([
        { $match: { $or: match } },
        {
          $lookup: {
            from: 'orders',
            let: { uniqueKey: '$uniqueKey' },
            pipeline: [
              { $sort: { createTime: -1 } },
              {
                $match: {
                  $expr: {
                    $eq: ['$uniqueKey', '$$uniqueKey'],
                  },
                },
              },
            ],
            as: 'orders',
          },
        },
      ])
      .toArray();

    const result = data.map((item) => {
      const data = {
        chain: item.chain,
        contract: item.contract,
        tokenId: item.tokenId,
        isOnSale: false,
        isFirstSale: true,
      };
      if (item.orders.length > 0) {
        if (item.orders[0].orderState === OrderState.Created) {
          data.isOnSale = true;
        }

        item.orders.forEach((order) => {
          if (order.orderState === OrderState.Filled) {
            data.isFirstSale = false;
            return;
          }
        });
      }

      return data;
    });

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data: result };
  }

  async getTokensCount() {
    const totalCount = await this.connection
      .collection('tokens')
      .countDocuments({ tokenOwner: { $ne: Constants.BURN_ADDRESS } });
    const nativeTokenCount = await this.connection.collection('tokens').countDocuments({
      contract: ConfigContract[this.configService.get('NETWORK')][Chain.V1].stickerContract,
      tokenOwner: { $ne: Constants.BURN_ADDRESS },
    });

    const pasarTokenCount = await this.connection.collection('tokens').countDocuments({
      contract: ConfigContract[this.configService.get('NETWORK')][Chain.ELA].pasarContract,
      tokenOwner: { $ne: Constants.BURN_ADDRESS },
    });

    const ecoTokenCount = await this.connection.collection('tokens').countDocuments({
      contract: ConfigContract[this.configService.get('NETWORK')][Chain.ELA].ecoContract,
      tokenOwner: { $ne: Constants.BURN_ADDRESS },
    });

    return {
      status: HttpStatus.OK,
      message: Constants.MSG_SUCCESS,
      data: {
        nativeTokenCount,
        pasarTokenCount,
        ecoTokenCount,
        otherTokenCount: totalCount - nativeTokenCount - pasarTokenCount - ecoTokenCount,
      },
    };
  }

  async getPoolRewards() {
    const data = await this.connection
      .collection('rewards_distribution_records')
      .aggregate([
        {
          $group: {
            _id: '$pool',
            total: { $sum: '$amount' },
          },
        },
      ])
      .toArray();

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async getBidsHistory(chain: string, orderId: number) {
    const data = await this.connection
      .collection('order_events')
      .find({ chain, orderId, eventType: OrderEventType.OrderBid })
      .sort({ timestamp: -1 })
      .toArray();

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async getAttributesOfCollection(chain: string, collection: string) {
    const result = await this.connection
      .collection('collection_attributes')
      .find({ chain, collection })
      .toArray();

    const data = {};
    result.forEach((item) => {
      if (!data[item.key]) {
        data[item.key] = {};
      }
      data[item.key][item.value] = item.count;
    });

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async getV1MarketNFTByWalletAddr(walletAddr: string) {
    const data = await this.connection
      .collection('orders')
      .find({ sellerAddr: walletAddr, chain: Chain.V1, orderState: OrderState.Created })
      .limit(5)
      .toArray();

    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }

  async getQuotedTokensRate() {
    const data = await this.connection.collection('tokens_rates').find({}).toArray();
    return { status: HttpStatus.OK, message: Constants.MSG_SUCCESS, data };
  }
}
