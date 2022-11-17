import { CACHE_MANAGER, Inject, Injectable, Logger } from '@nestjs/common';
import {
  ContractOrderInfo,
  ContractTokenInfo,
  ContractUserInfo,
  IncomeType,
  IPFSCollectionInfo,
  IPFSTokenInfo,
  UpdateCollectionParams,
} from './interfaces';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { getTokenInfoModel } from '../common/models/TokenInfoModel';
import axios from 'axios';
import { getOrderInfoModel } from '../common/models/OrderInfoModel';
import { DbService } from '../database/db.service';
import { UpdateOrderParams } from '../database/interfaces';
import { Sleep } from '../utils/utils.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Chain } from '../utils/enums';
import { Web3Service } from '../utils/web3.service';
import { TOKEN721_ABI } from '../../contracts/Token721ABI';
import { TOKEN1155_ABI } from '../../contracts/Token1155ABI';
import { ConfigContract } from '../../config/config.contract';
import { getTokenEventModel } from '../common/models/TokenEventModel';
import { Constants } from '../../constants';
import { Cache } from 'cache-manager';

@Injectable()
export class SubTasksService {
  private readonly logger = new Logger('SubTasksService');

  constructor(
    private configService: ConfigService,
    private dbService: DbService,
    private web3Service: Web3Service,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectConnection() private readonly connection: Connection,
    @InjectQueue('order-data-queue-local') private orderDataQueueLocal: Queue,
    @InjectQueue('token-data-queue-local') private tokenDataQueueLocal: Queue,
    @InjectQueue('collection-data-queue-local') private collectionDataQueueLocal: Queue,
  ) {}

  private async getInfoByIpfsUri(
    ipfsUri: string,
  ): Promise<IPFSTokenInfo | ContractUserInfo | IPFSCollectionInfo> {
    const tokenCID = ipfsUri.split(':')[2];

    try {
      const response = await axios(this.configService.get('IPFS_GATEWAY') + tokenCID);
      return (await response.data) as IPFSTokenInfo;
    } catch (err) {
      this.logger.error(err);
    }
  }

  async dealWithNewToken(tokenInfo: ContractTokenInfo, blockNumber: number) {
    const ipfsTokenInfo = (await this.getInfoByIpfsUri(tokenInfo.tokenUri)) as IPFSTokenInfo;

    if (ipfsTokenInfo.version.toString() === '1') {
      ipfsTokenInfo.data = {
        image: ipfsTokenInfo.image,
        kind: ipfsTokenInfo.kind,
        thumbnail: ipfsTokenInfo.thumbnail,
        size: ipfsTokenInfo.size,
        signature: '',
      };
    }

    if (ipfsTokenInfo.creator && ipfsTokenInfo.creator.did) {
      await this.dbService.updateUser(tokenInfo.royaltyOwner, ipfsTokenInfo.creator);
    }

    const TokenInfoModel = getTokenInfoModel(this.connection);
    await TokenInfoModel.findOneAndUpdate(
      { uniqueKey: tokenInfo.uniqueKey },
      {
        tokenIdHex: '0x' + BigInt(tokenInfo.tokenId).toString(16),
        ...tokenInfo,
        ...ipfsTokenInfo,
        tokenOwner: tokenInfo.royaltyOwner,
        blockNumber,
      },
      {
        upsert: true,
      },
    );
  }

  async dealWithNewOrder(orderInfo: ContractOrderInfo) {
    let ipfsUserInfo;
    if (
      orderInfo.baseToken !==
      ConfigContract[this.configService.get('NETWORK')][Chain.V1].stickerContract
    ) {
      ipfsUserInfo = await this.getInfoByIpfsUri(orderInfo.sellerUri);
      if (ipfsUserInfo && ipfsUserInfo.did) {
        await this.dbService.updateUser(orderInfo.sellerAddr, ipfsUserInfo as ContractUserInfo);
      }
    }

    const OrderInfoModel = getOrderInfoModel(this.connection);
    const orderInfoDoc = new OrderInfoModel({
      ...orderInfo,
      sellerInfo: ipfsUserInfo,
      tokenIdHex: '0x' + BigInt(orderInfo.tokenId).toString(16),
    });

    await orderInfoDoc.save();
  }

  async updateTokenOwner(chain: Chain, contract: string, tokenId: string, to: string) {
    const result = await this.dbService.updateTokenOwner(chain, contract, tokenId, to);
    if (result.matchedCount === 0) {
      this.logger.warn(`Token ${tokenId} is not exist yet, put the operation into the queue`);
      await Sleep(1000);
      await this.tokenDataQueueLocal.add(
        'update-token-owner',
        { chain, contract, tokenId, to },
        { removeOnComplete: true },
      );
    }
  }

  async updateOrder(chain: Chain, orderId: number, params: UpdateOrderParams) {
    if (params.buyerUri) {
      params.buyerInfo = (await this.getInfoByIpfsUri(params.buyerUri)) as ContractUserInfo;
      if (params.buyerInfo && params.buyerInfo.did) {
        await this.dbService.updateUser(params.buyerAddr, params.buyerInfo);
      }
    }

    const result = await this.dbService.updateOrder(chain, orderId, params);
    if (result.matchedCount === 0) {
      this.logger.warn(`Order ${orderId} is not exist yet, put the operation into the queue`);
      await Sleep(1000);
      await this.orderDataQueueLocal.add(
        'update-order',
        { chain, orderId, params },
        { removeOnComplete: true },
      );
    }
  }

  async updateCollection(token: string, chain: Chain, params: UpdateCollectionParams) {
    const collection = { token, ...params };
    if (params.uri && params.uri.split(':')[0] === 'pasar') {
      const ipfsCollectionInfo = (await this.getInfoByIpfsUri(params.uri)) as IPFSCollectionInfo;
      Object.assign(collection, ipfsCollectionInfo);
    }

    const result = await this.dbService.updateCollection(token, chain, collection);
    if (result.upsertedCount === 0 && result.matchedCount === 0) {
      this.logger.warn(`Collection ${token} is not exist yet, put the operation into the queue`);
      await Sleep(1000);
      await this.collectionDataQueueLocal.add(
        'update-collection',
        { token, chain, params },
        { removeOnComplete: true },
      );
    }

    if (result.upsertedCount === 1 || result.modifiedCount === 1) {
      const key = `${chain}-${token}`;
      const cachedData = await this.cacheManager.get(Constants.CACHE_KEY_COLLECTIONS);
      if (cachedData) {
        const oldCollections = JSON.parse(cachedData as string);
        for (const id of Object.keys(oldCollections)) {
          if (id === key) {
            oldCollections[id] = { ...oldCollections[id], ...collection };
            await this.cacheManager.set(
              Constants.CACHE_KEY_COLLECTIONS,
              JSON.stringify(oldCollections),
            );
            return;
          }
        }

        await this.cacheManager.set(
          Constants.CACHE_KEY_COLLECTIONS,
          JSON.stringify({ ...oldCollections, [key]: collection }),
        );
      } else {
        await this.cacheManager.set(
          Constants.CACHE_KEY_COLLECTIONS,
          JSON.stringify({ [key]: collection }),
        );
      }
    }
  }

  checkIsBaseCollection(token: string, chain: Chain) {
    return (
      ConfigContract[this.configService.get('NETWORK')][chain].stickerContract === token ||
      ConfigContract[this.configService.get('NETWORK')][Chain.V1].stickerContract === token
    );
  }

  async startupSyncCollection(token: string, chain: Chain, is721: boolean) {
    const ABI = is721 ? TOKEN721_ABI : TOKEN1155_ABI;
    const event = is721 ? 'Transfer' : 'TransferSingle';
    const contractWs = new this.web3Service.web3WS[chain].eth.Contract(ABI, token);
    contractWs.events[event]({
      fromBlock: 0,
    })
      .on('error', (error) => {
        this.logger.error(error);
      })
      .on('data', async (event) => {
        this.logger.log(`${token} event ${JSON.stringify(event)} received`);
        await this.dealWithUserCollectionToken(event, token, chain, is721);
      });
  }

  async dealWithUserCollectionToken(event, contract: string, chain: Chain, is721: boolean) {
    const tokenId = is721 ? event.returnValues._tokenId : event.returnValues._id;
    const contractRPC = new this.web3Service.web3RPC[chain].eth.Contract(
      is721 ? TOKEN721_ABI : TOKEN1155_ABI,
      contract,
    );
    const method = is721
      ? contractRPC.methods.tokenURI(tokenId).call
      : contractRPC.methods.uri(tokenId).call;

    const [txInfo, blockInfo, tokenUri] = await this.web3Service.web3BatchRequest(
      [
        ...this.web3Service.getBaseBatchRequestParam(event, chain),
        {
          method: method,
          params: {},
        },
      ],
      chain,
    );

    const eventInfo = {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      from: event.returnValues._from,
      to: event.returnValues._to,
      tokenId,
      operator: event.returnValues._operator,
      value: is721 ? 1 : parseInt(event.returnValues._value),
      chain,
      contract,
      gasFee: txInfo.gasUsed,
      timestamp: blockInfo.timestamp,
    };

    const TokenEventModel = getTokenEventModel(this.connection);
    const tokenEvent = new TokenEventModel(eventInfo);
    await tokenEvent.save();

    if (eventInfo.from === Constants.BURN_ADDRESS) {
      const tokenInfo = {
        tokenId,
        tokenUri,
        tokenSupply: 1,
        tokenOwner: event.returnValues._to,
        tokenIdHex: '0x' + BigInt(tokenId).toString(16),
        chain,
        contract,
        uniqueKey: `${chain}-${contract}-${tokenId}`,
        blockNumber: event.blockNumber,
        createTime: blockInfo.timestamp,
        updateTime: blockInfo.timestamp,
        notGetDetail: true,
        retryTimes: 0,
      };

      await this.dbService.insertToken(tokenInfo);
    } else {
      await this.dbService.updateTokenOwner(chain, contract, tokenId, event.returnValues._to);
    }
  }

  public async getTokenInfoByUri(uri: string, retryTimes = 0) {
    if (uri.startsWith('pasar:json') || uri.startsWith('feeds:json')) {
      return await this.getInfoByIpfsUri(uri);
    }

    if (uri.startsWith('ipfs://')) {
      const ipfsHash = uri.split('ipfs://')[1];
      const ipfsUri = this.configService.get('IPFS_GATEWAY') + ipfsHash;
      return (await axios(ipfsUri)).data;
    }

    if (retryTimes >= 3 && uri.includes('/ipfs/')) {
      const ipfsHash = uri.split('/ipfs/')[1];
      const ipfsUri = this.configService.get('IPFS_GATEWAY') + ipfsHash;
      return (
        await axios(ipfsUri, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36',
          },
          timeout: 30000,
        })
      ).data;
    }

    if (uri.startsWith('https://')) {
      return (
        await axios(encodeURI(uri), {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36',
          },
          timeout: 30000,
        })
      ).data;
    }
    return null;
  }

  async getTokenRate(token: string) {
    const blockNumber = await this.web3Service.web3RPC[Chain.ELA].eth.getBlockNumber();
    const graphQLParams = {
      query: `query tokenPriceData { token(id: "${token}", block: {number: ${blockNumber}}) { derivedELA } bundle(id: "1", block: {number: ${blockNumber}}) { elaPrice } }`,
      variables: null,
      operationName: 'tokenPriceData',
    };

    return axios({
      method: 'POST',
      url: 'https://api.glidefinance.io/subgraphs/name/glide/exchange',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      data: graphQLParams,
    });
  }

  async addUserIncomeRecords(contractOrderInfo: any) {
    const platformFee = contractOrderInfo.platformFee ? parseInt(contractOrderInfo.platformFee) : 0;
    const royaltyFee = contractOrderInfo.royaltyFeeTotal
      ? parseInt(contractOrderInfo.royaltyFeeTotal)
      : parseInt(contractOrderInfo.royaltyFee);
    const buyerIncome = parseInt(contractOrderInfo.price) - royaltyFee - platformFee;

    const quoteToken = contractOrderInfo.quoteToken
      ? contractOrderInfo.quoteToken
      : Constants.BURN_ADDRESS;

    const timestamp = parseInt(contractOrderInfo.updateTime);

    const records = [
      {
        address: contractOrderInfo.sellerAddr,
        income: buyerIncome,
        quoteToken,
        type: IncomeType.Sale,
        timestamp,
      },
    ];

    if (contractOrderInfo.royaltyOwners && contractOrderInfo.royaltyOwners.length > 0) {
      const royaltyOwners = contractOrderInfo.royaltyOwners;
      for (let i = 0; i < royaltyOwners.length; i++) {
        records.push({
          address: royaltyOwners[i],
          income: parseInt(contractOrderInfo.royaltyFees[i]),
          quoteToken,
          type: IncomeType.Royalty,
          timestamp,
        });
      }
    } else {
      records.push({
        address: contractOrderInfo.royaltyOwner,
        income: parseInt(contractOrderInfo.royaltyFee),
        quoteToken,
        type: IncomeType.Royalty,
        timestamp,
      });
    }

    await this.dbService.insertUserIncomeRecords(records);
  }

  async updateCachedCollections(chain: Chain, token: string, name: string) {
    const key = `${chain}-${token}`;
    const cachedCollections = await this.cacheManager.get(Constants.CACHE_KEY_COLLECTIONS);
    if (cachedCollections) {
      const collections = JSON.parse(cachedCollections.toString());
      const collection = collections[key];
      if (collection) {
        collection.name = name;
      } else {
        collections[key] = { name };
      }
      await this.cacheManager.set(Constants.CACHE_KEY_COLLECTIONS, JSON.stringify(collections));
    }
  }
}
