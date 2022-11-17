import { CACHE_MANAGER, Inject, Injectable, Logger } from '@nestjs/common';
import { DbService } from '../database/db.service';
import { Web3Service } from '../utils/web3.service';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { getTokenEventModel } from '../common/models/TokenEventModel';
import { Constants } from '../../constants';
import { SubTasksService } from './sub-tasks.service';
import { CollectionEventType, ContractTokenInfo, OrderEventType, OrderState } from './interfaces';
import { ConfigService } from '@nestjs/config';
import { getOrderEventModel } from '../common/models/OrderEventModel';
import { Sleep } from '../utils/utils.service';
import { Chain } from '../utils/enums';
import { ConfigContract } from '../../config/config.contract';
import { Timeout } from '@nestjs/schedule';
import { getCollectionEventModel } from '../common/models/CollectionEventModel';
import { TOKEN721_ABI } from '../../contracts/Token721ABI';
import { getRewardDistributionInfoModel } from '../common/models/RewardsDistributionInfoModel';
import { Cache } from 'cache-manager';

@Injectable()
export class TasksService {
  private readonly logger = new Logger('TasksService');

  private readonly step = 5000;
  private readonly stepInterval = 1000 * 10;
  private readonly chain = Chain.ELA;
  private readonly rpc = this.web3Service.web3RPC[this.chain];
  private readonly stickerContract =
    ConfigContract[this.configService.get('NETWORK')][this.chain].stickerContract;
  private readonly pasarContract =
    ConfigContract[this.configService.get('NETWORK')][this.chain].pasarContract;
  private readonly registerContract =
    ConfigContract[this.configService.get('NETWORK')][this.chain].registerContract;
  private readonly stickerContractWS = this.web3Service.stickerContractWS[this.chain];
  private readonly stickerContractRPC = this.web3Service.stickerContractRPC[this.chain];
  private readonly pasarContractWS = this.web3Service.pasarContractWS[this.chain];
  private readonly pasarContractRPC = this.web3Service.pasarContractRPC[this.chain];
  private readonly registerContractWS = this.web3Service.registerContractWS[this.chain];

  constructor(
    private subTasksService: SubTasksService,
    private configService: ConfigService,
    private dbService: DbService,
    private web3Service: Web3Service,
    @InjectConnection() private readonly connection: Connection,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  @Timeout('transfer' + Chain.ELA, 1000)
  async handleTransferEvent() {
    const nowHeight = await this.rpc.eth.getBlockNumber();
    const lastHeight = await this.dbService.getTokenEventLastHeight(
      this.chain,
      this.stickerContract,
    );

    let syncStartBlock = lastHeight;

    if (nowHeight - lastHeight > this.step + 1) {
      syncStartBlock = nowHeight;

      let fromBlock = lastHeight + 1;
      let toBlock = fromBlock + this.step;
      while (fromBlock <= nowHeight) {
        this.logger.log(`Sync [${this.chain}] Transfer events from [${fromBlock}] to [${toBlock}]`);

        this.stickerContractWS
          .getPastEvents('TransferSingle', {
            fromBlock,
            toBlock,
          })
          .then((events) => {
            events.forEach(async (event) => {
              await this.handleTransferEventData(event);
            });
          });
        fromBlock = toBlock + 1;
        toBlock = fromBlock + this.step > nowHeight ? nowHeight : toBlock + this.step;
        await Sleep(this.stepInterval);
      }

      this.logger.log(
        `Sync [${this.chain}] Transfer events from [${
          lastHeight + 1
        }] to [${nowHeight}] finished ✅☕🚾️`,
      );
    }

    this.logger.log(
      `Start sync [${this.chain}] Transfer events from [${syncStartBlock + 1}] 💪💪💪 `,
    );

    this.stickerContractWS.events
      .TransferSingle({
        fromBlock: syncStartBlock + 1,
      })
      .on('error', (error) => {
        this.logger.error(error);
      })
      .on('data', async (event) => {
        await this.handleTransferEventData(event);
      });
  }

  private async handleTransferEventData(event: any) {
    const eventInfo = {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      from: event.returnValues._from,
      to: event.returnValues._to,
      tokenId: event.returnValues._id,
      operator: event.returnValues._operator,
      value: event.returnValues._value,
    };

    this.logger.log(`Received [${this.chain}] Transfer Event: ${JSON.stringify(eventInfo)}`);

    const [txInfo, blockInfo, tokenInfo] = await this.web3Service.web3BatchRequest(
      [
        ...this.web3Service.getBaseBatchRequestParam(event, this.chain),
        {
          method: this.stickerContractRPC.methods.tokenInfo(event.returnValues._id).call,
          params: {},
        },
      ],
      this.chain,
    );

    const contractTokenInfo = { ...tokenInfo };
    contractTokenInfo.chain = this.chain;
    contractTokenInfo.contract = this.stickerContract;
    contractTokenInfo.uniqueKey = eventInfo.tokenId;

    const TokenEventModel = getTokenEventModel(this.connection);
    const tokenEvent = new TokenEventModel({
      ...eventInfo,
      chain: this.chain,
      contract: this.stickerContract,
      gasFee: txInfo.gasUsed,
      timestamp: blockInfo.timestamp,
    });

    await tokenEvent.save();

    if (eventInfo.from === Constants.BURN_ADDRESS) {
      await this.subTasksService.dealWithNewToken(
        contractTokenInfo as ContractTokenInfo,
        eventInfo.blockNumber,
      );
    } else {
      if (eventInfo.to !== this.pasarContract) {
        await this.subTasksService.updateTokenOwner(
          this.chain,
          this.stickerContract,
          eventInfo.tokenId,
          eventInfo.to,
        );
      }
    }
  }

  @Timeout(`orderForAuction` + Chain.ELA, 30 * 1000)
  async handleOrderForAuctionEvent() {
    const nowHeight = await this.rpc.eth.getBlockNumber();
    const lastHeight = await this.dbService.getOrderEventLastHeight(
      this.chain,
      OrderEventType.OrderForAuction,
    );

    let syncStartBlock = lastHeight;

    if (nowHeight - lastHeight > this.step + 1) {
      syncStartBlock = nowHeight;

      let fromBlock = lastHeight + 1;
      let toBlock = fromBlock + this.step;
      while (fromBlock <= nowHeight) {
        this.logger.log(
          `Sync [${this.chain}] OrderForAuction events from [${fromBlock}] to [${toBlock}]`,
        );
        this.pasarContractWS
          .getPastEvents('OrderForAuction', {
            fromBlock,
            toBlock,
          })
          .then((events) => {
            events.forEach(async (event) => {
              await this.handleOrderForAuctionEventData(event);
            });
          });
        fromBlock = toBlock + 1;
        toBlock = fromBlock + this.step > nowHeight ? nowHeight : toBlock + this.step;
        await Sleep(this.stepInterval);
      }

      this.logger.log(
        `Sync [${this.chain}] OrderForAuction events from [${
          lastHeight + 1
        }] to [${nowHeight}] finished ✅☕🚾️️`,
      );
    }

    this.logger.log(
      `Start sync [${this.chain}] OrderForAuction events from [${syncStartBlock + 1}] 💪💪💪 `,
    );

    this.pasarContractWS.events
      .OrderForAuction({
        fromBlock: syncStartBlock + 1,
      })
      .on('error', (error) => {
        this.logger.error(error);
      })
      .on('data', async (event) => {
        await this.handleOrderForAuctionEventData(event);
      });
  }

  private async handleOrderForAuctionEventData(event: any) {
    const eventInfo = {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      seller: event.returnValues._seller,
      orderId: event.returnValues._orderId,
      tokenId: event.returnValues._tokenId,
      baseToken: event.returnValues._baseToken,
      amount: event.returnValues._amount,
      quoteToken: event.returnValues._quoteToken,
      minPrice: event.returnValues._minPrice,
      reservePrice: event.returnValues._reservePrice,
      buyoutPrice: event.returnValues._buyoutPrice,
      startTime: event.returnValues._startTime,
      endTime: event.returnValues._endTime,
    };

    this.logger.log(`Received [${this.chain}] OrderForAuction Event: ${JSON.stringify(eventInfo)}`);

    const [txInfo, blockInfo, contractOrder] = await this.web3Service.web3BatchRequest(
      [
        ...this.web3Service.getBaseBatchRequestParam(event, this.chain),
        {
          method: this.web3Service.pasarContractRPC[this.chain].methods.getOrderById(
            event.returnValues._orderId,
          ).call,
          params: {},
        },
      ],
      this.chain,
    );

    const contractOrderInfo = { ...contractOrder };
    contractOrderInfo.chain = this.chain;
    contractOrderInfo.uniqueKey = this.subTasksService.checkIsBaseCollection(
      eventInfo.baseToken,
      Chain.ELA,
    )
      ? eventInfo.tokenId
      : `${this.chain}-${eventInfo.baseToken}-${eventInfo.tokenId}`;

    const OrderEventModel = getOrderEventModel(this.connection);
    const orderEvent = new OrderEventModel({
      ...eventInfo,
      chain: this.chain,
      eventType: OrderEventType.OrderForAuction,
      gasFee: txInfo.gasUsed,
      timestamp: blockInfo.timestamp,
    });

    await orderEvent.save();
    await this.subTasksService.dealWithNewOrder(contractOrderInfo);
  }

  @Timeout('orderBid' + Chain.ELA, 60 * 1000)
  async handleOrderBidEvent() {
    const nowHeight = await this.rpc.eth.getBlockNumber();
    const lastHeight = await this.dbService.getOrderEventLastHeight(
      this.chain,
      OrderEventType.OrderBid,
    );

    let syncStartBlock = lastHeight;

    if (nowHeight - lastHeight > this.step + 1) {
      syncStartBlock = nowHeight;

      let fromBlock = lastHeight + 1;
      let toBlock = fromBlock + this.step;
      while (fromBlock <= nowHeight) {
        this.logger.log(`Sync [${this.chain}] OrderBid events from [${fromBlock}] to [${toBlock}]`);
        this.pasarContractWS
          .getPastEvents('OrderBid', {
            fromBlock,
            toBlock,
          })
          .then((events) => {
            events.forEach(async (event) => {
              await this.handleOrderBidEventData(event);
            });
          });
        fromBlock = toBlock + 1;
        toBlock = fromBlock + this.step > nowHeight ? nowHeight : toBlock + this.step;
        await Sleep(this.stepInterval);
      }

      this.logger.log(
        `Sync [${this.chain}] OrderBid events from [${
          lastHeight + 1
        }] to [${nowHeight}] finished ✅☕🚾️️`,
      );
    }

    this.logger.log(
      `Start sync [${this.chain}] OrderBid events from [${syncStartBlock + 1}] 💪💪💪 `,
    );
    this.web3Service.pasarContractWS[this.chain].events
      .OrderBid({
        fromBlock: syncStartBlock + 1,
      })
      .on('error', (error) => {
        this.logger.error(error);
      })
      .on('data', async (event) => {
        await this.handleOrderBidEventData(event);
      });
  }

  private async handleOrderBidEventData(event: any) {
    const eventInfo = {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      seller: event.returnValues._seller,
      buyer: event.returnValues._buyer,
      orderId: event.returnValues._orderId,
      price: event.returnValues._price,
    };

    this.logger.log(`Received [${this.chain}] BidOrder Event: ${JSON.stringify(eventInfo)}`);

    const [txInfo, blockInfo, contractOrderInfo] = await this.web3Service.web3BatchRequest(
      [
        ...this.web3Service.getBaseBatchRequestParam(event, this.chain),
        {
          method: this.pasarContractRPC.methods.getOrderById(event.returnValues._orderId).call,
          params: {},
        },
      ],
      this.chain,
    );

    const OrderEventModel = getOrderEventModel(this.connection);
    const orderEvent = new OrderEventModel({
      ...eventInfo,
      chain: this.chain,
      baseToken: contractOrderInfo.baseToken,
      eventType: OrderEventType.OrderBid,
      gasFee: txInfo.gasUsed,
      timestamp: blockInfo.timestamp,
    });

    await orderEvent.save();

    await this.subTasksService.updateOrder(this.chain, parseInt(eventInfo.orderId), {
      bids: contractOrderInfo.bids,
      lastBid: contractOrderInfo.lastBid,
      lastBidder: contractOrderInfo.lastBidder,
      buyerUri: contractOrderInfo.buyerUri,
      updateTime: contractOrderInfo.updateTime,
    });
  }

  @Timeout('orderForSale' + Chain.ELA, 30 * 1000)
  async handleOrderForSaleEvent() {
    const nowHeight = await this.rpc.eth.getBlockNumber();
    const lastHeight = await this.dbService.getOrderEventLastHeight(
      this.chain,
      OrderEventType.OrderForSale,
    );

    let syncStartBlock = lastHeight;

    if (nowHeight - lastHeight > this.step + 1) {
      syncStartBlock = nowHeight;

      let fromBlock = lastHeight + 1;
      let toBlock = fromBlock + this.step;

      while (fromBlock <= nowHeight) {
        this.logger.log(
          `Sync [${this.chain}] OrderForSale events from [${fromBlock}] to [${toBlock}]`,
        );
        this.pasarContractWS
          .getPastEvents('OrderForSale', {
            fromBlock,
            toBlock,
          })
          .then((events) => {
            events.forEach(async (event) => {
              await this.handleOrderForSaleEventData(event);
            });
          });
        fromBlock = toBlock + 1;
        toBlock = fromBlock + this.step > nowHeight ? nowHeight : toBlock + this.step;
        await Sleep(this.stepInterval);
      }

      this.logger.log(
        `Sync [${this.chain}] OrderForSale events from [${
          lastHeight + 1
        }] to [${nowHeight}] finished ✅☕🚾️️`,
      );
    }

    this.logger.log(
      `Start sync [${this.chain}] OrderForSale events from [${syncStartBlock + 1}] 💪💪💪 `,
    );
    this.web3Service.pasarContractWS[this.chain].events
      .OrderForSale({
        fromBlock: syncStartBlock + 1,
      })
      .on('error', (error) => {
        this.logger.error(error);
      })
      .on('data', async (event) => {
        await this.handleOrderForSaleEventData(event);
      });
  }

  private async handleOrderForSaleEventData(event: any) {
    const eventInfo = {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      seller: event.returnValues._seller,
      orderId: event.returnValues._orderId,
      tokenId: event.returnValues._tokenId,
      baseToken: event.returnValues._baseToken,
      amount: event.returnValues._amount,
      quoteToken: event.returnValues._quoteToken,
      price: event.returnValues._price,
      startTime: event.returnValues._startTime,
    };

    this.logger.log(`Received [${this.chain}] OrderForSale Event: ${JSON.stringify(eventInfo)}`);

    const [txInfo, blockInfo, contractOrder] = await this.web3Service.web3BatchRequest(
      [
        ...this.web3Service.getBaseBatchRequestParam(event, this.chain),
        {
          method: this.pasarContractRPC.methods.getOrderById(event.returnValues._orderId).call,
          params: {},
        },
      ],
      this.chain,
    );

    const contractOrderInfo = { ...contractOrder };
    contractOrderInfo.chain = this.chain;
    contractOrderInfo.uniqueKey = this.subTasksService.checkIsBaseCollection(
      eventInfo.baseToken,
      Chain.ELA,
    )
      ? eventInfo.tokenId
      : `${this.chain}-${eventInfo.baseToken}-${eventInfo.tokenId}`;

    const OrderEventModel = getOrderEventModel(this.connection);
    const orderEvent = new OrderEventModel({
      ...eventInfo,
      chain: this.chain,
      eventType: OrderEventType.OrderForSale,
      gasFee: txInfo.gasUsed,
      timestamp: blockInfo.timestamp,
    });

    await orderEvent.save();

    await this.subTasksService.dealWithNewOrder(contractOrderInfo);
  }

  @Timeout('orderPriceChanged' + Chain.ELA, 60 * 1000)
  async handleOrderPriceChangedEvent() {
    const nowHeight = await this.rpc.eth.getBlockNumber();
    const lastHeight = await this.dbService.getOrderEventLastHeight(
      this.chain,
      OrderEventType.OrderPriceChanged,
    );

    let syncStartBlock = lastHeight;

    if (nowHeight - lastHeight > this.step + 1) {
      syncStartBlock = nowHeight;

      let fromBlock = lastHeight + 1;
      let toBlock = fromBlock + this.step;

      while (fromBlock <= nowHeight) {
        this.logger.log(
          `Sync [${this.chain}] OrderPriceChanged events from [${fromBlock}] to [${toBlock}]`,
        );

        this.pasarContractWS
          .getPastEvents('OrderPriceChanged', {
            fromBlock,
            toBlock,
          })
          .then((events) => {
            events.forEach(async (event) => {
              await this.handleOrderPriceChangedEventData(event);
            });
          });
        fromBlock = toBlock + 1;
        toBlock = fromBlock + this.step > nowHeight ? nowHeight : toBlock + this.step;
        await Sleep(this.stepInterval);
      }

      this.logger.log(
        `Sync [${this.chain}] OrderPriceChanged events from [${
          lastHeight + 1
        }] to [${nowHeight}] finished ✅☕🚾️`,
      );
    }

    this.logger.log(
      `Start sync [${this.chain}] OrderPriceChanged events from [${syncStartBlock + 1}] 💪💪💪 `,
    );

    this.pasarContractWS.events
      .OrderPriceChanged({
        fromBlock: syncStartBlock + 1,
      })
      .on('error', (error) => {
        this.logger.error(error);
      })
      .on('data', async (event) => {
        await this.handleOrderPriceChangedEventData(event);
      });
  }

  private async handleOrderPriceChangedEventData(event: any) {
    const eventInfo = {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      seller: event.returnValues._seller,
      orderId: event.returnValues._orderId,
      oldPrice: event.returnValues._oldPrice,
      newPrice: event.returnValues._newPrice,
      oldReservePrice: event.returnValues._olderReservePrice,
      newReservePrice: event.returnValues._newReservePrice,
      oldBuyoutPrice: event.returnValues._olderBuyoutPrice,
      newBuyoutPrice: event.returnValues._newBuyoutPrice,
      oldQuoteToken: event.returnValues._olderQuoteToken,
      newQuoteToken: event.returnValues._newQuoteToken,
    };

    this.logger.log(
      `Received [${this.chain}] OrderPriceChanged Event: ${JSON.stringify(eventInfo)}`,
    );

    const [txInfo, blockInfo, contractOrderInfo] = await this.web3Service.web3BatchRequest(
      [
        ...this.web3Service.getBaseBatchRequestParam(event, this.chain),
        {
          method: this.pasarContractRPC.methods.getOrderById(event.returnValues._orderId).call,
          params: {},
        },
      ],
      this.chain,
    );

    const OrderEventModel = getOrderEventModel(this.connection);
    const orderEvent = new OrderEventModel({
      ...eventInfo,
      chain: this.chain,
      baseToken: contractOrderInfo.baseToken,
      eventType: OrderEventType.OrderPriceChanged,
      gasFee: txInfo.gasUsed,
      timestamp: blockInfo.timestamp,
    });

    await orderEvent.save();

    await this.subTasksService.updateOrder(this.chain, parseInt(eventInfo.orderId), {
      price: parseInt(eventInfo.newPrice),
      reservePrice: parseInt(eventInfo.newReservePrice),
      buyoutPrice: parseInt(eventInfo.newBuyoutPrice),
      quoteToken: eventInfo.newQuoteToken,
      updateTime: orderEvent.timestamp,
    });
  }

  @Timeout('orderFilled' + Chain.ELA, 60 * 1000)
  async handleOrderFilledEvent() {
    const nowHeight = await this.rpc.eth.getBlockNumber();
    const lastHeight = await this.dbService.getOrderEventLastHeight(
      this.chain,
      OrderEventType.OrderFilled,
    );

    let syncStartBlock = lastHeight;

    if (nowHeight - lastHeight > this.step + 1) {
      syncStartBlock = nowHeight;

      let fromBlock = lastHeight + 1;
      let toBlock = fromBlock + this.step;

      while (fromBlock <= nowHeight) {
        this.logger.log(
          `Sync [${this.chain}] OrderFilled events from [${fromBlock}] to [${toBlock}]`,
        );

        this.pasarContractWS
          .getPastEvents('OrderFilled', {
            fromBlock,
            toBlock,
          })
          .then((events) => {
            events.forEach(async (event) => {
              await this.handleOrderFilledEventData(event);
            });
          });
        fromBlock = toBlock + 1;
        toBlock = fromBlock + this.step > nowHeight ? nowHeight : toBlock + this.step;
        await Sleep(this.stepInterval);
      }

      this.logger.log(
        `Sync [${this.chain}] OrderFilled events from [${
          lastHeight + 1
        }] to [${nowHeight}] finished ✅☕🚾️️`,
      );
    }

    this.logger.log(
      `Start sync [${this.chain}] OrderFilled events from [${syncStartBlock + 1}] 💪💪💪 `,
    );
    this.pasarContractWS.events
      .OrderFilled({
        fromBlock: syncStartBlock + 1,
      })
      .on('error', (error) => {
        this.logger.error(error);
      })
      .on('data', async (event) => {
        await this.handleOrderFilledEventData(event);
      });
  }

  private async handleOrderFilledEventData(event: any) {
    const eventInfo = {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      seller: event.returnValues._seller,
      buyer: event.returnValues._buyer,
      orderId: event.returnValues._orderId,
      baseToken: event.returnValues._baseToken,
      quoteToken: event.returnValues._quoteToken,
      price: event.returnValues._price,
      royaltyFee: event.returnValues._royaltyFee,
      platformFee: event.returnValues._platformFee,
    };

    this.logger.log(`Received [${this.chain}] OrderFilled Event: ${JSON.stringify(eventInfo)}`);

    const [txInfo, blockInfo, contractOrderInfo] = await this.web3Service.web3BatchRequest(
      [
        ...this.web3Service.getBaseBatchRequestParam(event, this.chain),
        {
          method: this.pasarContractRPC.methods.getOrderById(event.returnValues._orderId).call,
          params: {},
        },
      ],
      this.chain,
    );

    const OrderEventModel = getOrderEventModel(this.connection);
    const orderEvent = new OrderEventModel({
      ...eventInfo,
      chain: this.chain,
      baseToken: contractOrderInfo.baseToken,
      eventType: OrderEventType.OrderFilled,
      gasFee: txInfo.gasUsed,
      timestamp: blockInfo.timestamp,
    });

    await orderEvent.save();

    await this.subTasksService.updateOrder(this.chain, parseInt(eventInfo.orderId), {
      orderState: parseInt(contractOrderInfo.orderState),
      buyerAddr: contractOrderInfo.buyerAddr,
      buyerUri: contractOrderInfo.buyerUri,
      filled: parseInt(contractOrderInfo.filled),
      platformFee: parseInt(contractOrderInfo.platformFee),
      royaltyFee: parseInt(eventInfo.royaltyFee),
      updateTime: parseInt(contractOrderInfo.updateTime),
    });

    await this.subTasksService.addUserIncomeRecords(contractOrderInfo);
  }

  @Timeout('orderCancelled' + Chain.ELA, 60 * 1000)
  async handleOrderCancelledEvent() {
    const nowHeight = await this.rpc.eth.getBlockNumber();
    const lastHeight = await this.dbService.getOrderEventLastHeight(
      this.chain,
      OrderEventType.OrderCancelled,
    );

    let syncStartBlock = lastHeight;

    if (nowHeight - lastHeight > this.step + 1) {
      syncStartBlock = nowHeight;

      let fromBlock = lastHeight + 1;
      let toBlock = fromBlock + this.step;

      while (fromBlock <= nowHeight) {
        this.logger.log(
          `Sync [${this.chain}] OrderCancelled events from [${fromBlock}] to [${toBlock}]`,
        );

        this.pasarContractWS
          .getPastEvents('OrderCanceled', {
            fromBlock,
            toBlock,
          })
          .then((events) => {
            events.forEach(async (event) => {
              await this.handleOrderCancelledEventData(event);
            });
          });
        fromBlock = toBlock + 1;
        toBlock = fromBlock + this.step > nowHeight ? nowHeight : toBlock + this.step;
        await Sleep(this.stepInterval);
      }

      this.logger.log(
        `Sync [${this.chain}] OrderCancelled events from [${
          lastHeight + 1
        }] to [${nowHeight}] finished ✅☕🚾️️`,
      );
    }

    this.logger.log(
      `Start sync [${this.chain}] OrderCancelled events from [${syncStartBlock + 1}] 💪💪💪 `,
    );
    this.pasarContractWS.events
      .OrderCanceled({
        fromBlock: syncStartBlock + 1,
      })
      .on('error', (error) => {
        this.logger.error(error);
      })
      .on('data', async (event) => {
        await this.handleOrderCancelledEventData(event);
      });
  }

  private async handleOrderCancelledEventData(event: any) {
    const eventInfo = {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      seller: event.returnValues._seller,
      orderId: event.returnValues._orderId,
    };

    this.logger.log(`Received [${this.chain}] OrderCancelled Event: ${JSON.stringify(eventInfo)}`);

    const [txInfo, blockInfo, contractOrderInfo] = await this.web3Service.web3BatchRequest(
      [
        ...this.web3Service.getBaseBatchRequestParam(event, this.chain),
        {
          method: this.pasarContractRPC.methods.getOrderById(event.returnValues._orderId).call,
          params: {},
        },
      ],
      this.chain,
    );

    const OrderEventModel = getOrderEventModel(this.connection);
    const orderEvent = new OrderEventModel({
      ...eventInfo,
      chain: this.chain,
      baseToken: contractOrderInfo.baseToken,
      eventType: OrderEventType.OrderCancelled,
      gasFee: txInfo.gasUsed,
      timestamp: blockInfo.timestamp,
    });

    await orderEvent.save();

    await this.subTasksService.updateOrder(this.chain, parseInt(eventInfo.orderId), {
      orderState: OrderState.Cancelled,
      updateTime: orderEvent.timestamp,
    });
  }

  @Timeout('tokenRegistered' + Chain.ELA, 60 * 1000)
  async handleTokenRegisteredEvent() {
    const nowHeight = await this.rpc.eth.getBlockNumber();
    const lastHeight = await this.dbService.getCollectionEventLastHeight(
      this.chain,
      CollectionEventType.TokenRegistered,
    );

    let syncStartBlock = lastHeight;

    if (nowHeight - lastHeight > this.step + 1) {
      syncStartBlock = nowHeight;

      let fromBlock = lastHeight + 1;
      let toBlock = fromBlock + this.step;

      while (fromBlock <= nowHeight) {
        this.logger.log(
          `Sync [${this.chain}] TokenRegistered events from [${fromBlock}] to [${toBlock}]`,
        );

        this.registerContractWS
          .getPastEvents('TokenRegistered', {
            fromBlock,
            toBlock,
          })
          .then((events) => {
            events.forEach(async (event) => {
              await this.handleTokenRegisteredEventData(event);
            });
          });
        fromBlock = toBlock + 1;
        toBlock = fromBlock + this.step > nowHeight ? nowHeight : toBlock + this.step;
        await Sleep(this.stepInterval);
      }

      this.logger.log(
        `Sync [${this.chain}] TokenRegistered events from [${
          lastHeight + 1
        }] to [${nowHeight}] finished ✅☕🚾️️`,
      );
    }

    this.logger.log(
      `Start sync [${this.chain}] TokenRegistered events from [${syncStartBlock + 1}] 💪💪💪 `,
    );
    this.registerContractWS.events
      .TokenRegistered({
        fromBlock: syncStartBlock + 1,
      })
      .on('error', (error) => {
        this.logger.error(error);
      })
      .on('data', async (event) => {
        await this.handleTokenRegisteredEventData(event);
      });
  }

  private async handleTokenRegisteredEventData(event: any) {
    const eventInfo = {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      token: event.returnValues._token,
      owner: event.returnValues._owner,
      name: event.returnValues._name,
      uri: event.returnValues._uri,
    };

    this.logger.log(`Received [${this.chain}] TokenRegistered Event: ${JSON.stringify(eventInfo)}`);

    const tokenContract = new this.web3Service.web3RPC[this.chain].eth.Contract(
      TOKEN721_ABI,
      eventInfo.token,
    );

    const [txInfo, blockInfo, is721, symbol] = await this.web3Service.web3BatchRequest(
      [
        ...this.web3Service.getBaseBatchRequestParam(event, this.chain),
        { method: tokenContract.methods.supportsInterface('0x80ac58cd').call, params: {} },
        { method: tokenContract.methods.symbol().call, params: {} },
      ],
      this.chain,
    );

    const CollectionEventModel = getCollectionEventModel(this.connection);
    const collectionEvent = new CollectionEventModel({
      ...eventInfo,
      chain: this.chain,
      eventType: CollectionEventType.TokenRegistered,
      gasFee: txInfo.gasUsed,
      timestamp: blockInfo.timestamp,
    });

    await collectionEvent.save();

    const chain =
      eventInfo.token ===
      ConfigContract[this.configService.get('NETWORK')][Chain.V1].stickerContract
        ? Chain.V1
        : this.chain;
    await this.subTasksService.updateCollection(eventInfo.token, this.chain, {
      owner: eventInfo.owner,
      uri: eventInfo.uri,
      name: eventInfo.name,
      chain,
      is721,
      symbol,
      blockNumber: eventInfo.blockNumber,
    });

    if (!this.subTasksService.checkIsBaseCollection(eventInfo.token, this.chain)) {
      await this.subTasksService.startupSyncCollection(eventInfo.token, this.chain, is721);
    }

    await this.subTasksService.updateCachedCollections(this.chain, eventInfo.token, eventInfo.name);
  }

  @Timeout('tokenRoyaltyChanged' + Chain.ELA, 60 * 1000)
  async handleRoyaltyChangedEvent() {
    const nowHeight = await this.rpc.eth.getBlockNumber();
    const lastHeight = await this.dbService.getCollectionEventLastHeight(
      this.chain,
      CollectionEventType.TokenRoyaltyChanged,
    );

    let syncStartBlock = lastHeight;

    if (nowHeight - lastHeight > this.step + 1) {
      syncStartBlock = nowHeight;

      let fromBlock = lastHeight + 1;
      let toBlock = fromBlock + this.step;

      while (fromBlock <= nowHeight) {
        this.logger.log(
          `Sync [${this.chain}] TokenRoyaltyChanged events from [${fromBlock}] to [${toBlock}]`,
        );

        this.registerContractWS
          .getPastEvents('TokenRoyaltyChanged', {
            fromBlock,
            toBlock,
          })
          .then((events) => {
            events.forEach(async (event) => {
              await this.handleTokenRoyaltyChangedEventData(event);
            });
          });
        fromBlock = toBlock + 1;
        toBlock = fromBlock + this.step > nowHeight ? nowHeight : toBlock + this.step;
        await Sleep(this.stepInterval);
      }

      this.logger.log(
        `Sync [${this.chain}] TokenRoyaltyChanged events from [${
          lastHeight + 1
        }] to [${nowHeight}] finished ✅☕🚾️️`,
      );
    }

    this.logger.log(
      `Start sync [${this.chain}] TokenRoyaltyChanged events from [${syncStartBlock + 1}] 💪💪💪 `,
    );
    this.registerContractWS.events
      .TokenRoyaltyChanged({
        fromBlock: syncStartBlock + 1,
      })
      .on('error', (error) => {
        this.logger.error(error);
      })
      .on('data', async (event) => {
        await this.handleTokenRoyaltyChangedEventData(event);
      });
  }

  private async handleTokenRoyaltyChangedEventData(event: any) {
    const eventInfo = {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      token: event.returnValues._token,
      royaltyOwners: event.returnValues._royaltyOwners,
      royaltyFees: event.returnValues._royaltyRates,
    };

    this.logger.log(
      `Received [${this.chain}] TokenRoyaltyChanged Event: ${JSON.stringify(eventInfo)}`,
    );

    const [txInfo, blockInfo] = await this.web3Service.web3BatchRequest(
      [...this.web3Service.getBaseBatchRequestParam(event, this.chain)],
      this.chain,
    );

    const CollectionEventModel = getCollectionEventModel(this.connection);
    const collectionEvent = new CollectionEventModel({
      ...eventInfo,
      chain: this.chain,
      eventType: CollectionEventType.TokenRoyaltyChanged,
      gasFee: txInfo.gasUsed,
      timestamp: blockInfo.timestamp,
    });

    await collectionEvent.save();
    await this.subTasksService.updateCollection(eventInfo.token, this.chain, {
      royaltyOwners: eventInfo.royaltyOwners,
      royaltyFees: eventInfo.royaltyFees,
    });
  }

  @Timeout('tokenInfoUpdated' + Chain.ELA, 60 * 1000)
  async handleTokenInfoUpdatedEvent() {
    const nowHeight = await this.rpc.eth.getBlockNumber();
    const lastHeight = await this.dbService.getCollectionEventLastHeight(
      this.chain,
      CollectionEventType.TokenInfoUpdated,
    );

    let syncStartBlock = lastHeight;

    if (nowHeight - lastHeight > this.step + 1) {
      syncStartBlock = nowHeight;

      let fromBlock = lastHeight + 1;
      let toBlock = fromBlock + this.step;

      while (fromBlock <= nowHeight) {
        this.logger.log(
          `Sync [${this.chain}] TokenInfoUpdated events from [${fromBlock}] to [${toBlock}]`,
        );

        this.registerContractWS
          .getPastEvents('TokenInfoUpdated', {
            fromBlock,
            toBlock,
          })
          .then((events) => {
            events.forEach(async (event) => {
              await this.handleTokenInfoUpdatedEventData(event);
            });
          });
        fromBlock = toBlock + 1;
        toBlock = fromBlock + this.step > nowHeight ? nowHeight : toBlock + this.step;
        await Sleep(this.stepInterval);
      }

      this.logger.log(
        `Sync [${this.chain}] TokenInfoUpdated events from [${
          lastHeight + 1
        }] to [${nowHeight}] finished ✅☕🚾️️`,
      );
    }

    this.logger.log(
      `Start sync [${this.chain}] TokenInfoUpdated events from [${syncStartBlock + 1}] 💪💪💪 `,
    );
    this.registerContractWS.events
      .TokenInfoUpdated({
        fromBlock: syncStartBlock + 1,
      })
      .on('error', (error) => {
        this.logger.error(error);
      })
      .on('data', async (event) => {
        await this.handleTokenInfoUpdatedEventData(event);
      });
  }

  private async handleTokenInfoUpdatedEventData(event: any) {
    const eventInfo = {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      token: event.returnValues._token,
      name: event.returnValues._name,
      uri: event.returnValues._uri,
    };

    this.logger.log(
      `Received [${this.chain}] TokenInfoUpdatedEventData Event: ${JSON.stringify(eventInfo)}`,
    );

    const [txInfo, blockInfo] = await this.web3Service.web3BatchRequest(
      [...this.web3Service.getBaseBatchRequestParam(event, this.chain)],
      this.chain,
    );

    const CollectionEventModel = getCollectionEventModel(this.connection);
    const collectionEvent = new CollectionEventModel({
      ...eventInfo,
      chain: this.chain,
      eventType: CollectionEventType.TokenInfoUpdated,
      gasFee: txInfo.gasUsed,
      timestamp: blockInfo.timestamp,
    });

    await collectionEvent.save();
    await this.subTasksService.updateCollection(eventInfo.token, this.chain, {
      uri: eventInfo.uri,
      name: eventInfo.name,
    });

    await this.subTasksService.updateCachedCollections(this.chain, eventInfo.token, eventInfo.name);
  }

  @Timeout('RewardsDistribution' + Chain.ELA, 60 * 1000)
  async handleRewardsDistributionEvent() {
    const nowHeight = await this.rpc.eth.getBlockNumber();
    const lastHeight = await this.dbService.getRewardsDistributionRecordLastHeight();

    let syncStartBlock = lastHeight;

    if (nowHeight - lastHeight > this.step + 1) {
      syncStartBlock = nowHeight;

      let fromBlock = lastHeight + 1;
      let toBlock = fromBlock + this.step;

      while (fromBlock <= nowHeight) {
        this.logger.log(
          `Sync [${this.chain}] RewardsDistribution events from [${fromBlock}] to [${toBlock}]`,
        );

        this.web3Service.pasarMiningContractWS
          .getPastEvents('RewardsDistribution', {
            fromBlock,
            toBlock,
          })
          .then((events) => {
            events.forEach(async (event) => {
              await this.handleRewardsDistributionEventData(event);
            });
          });
        fromBlock = toBlock + 1;
        toBlock = fromBlock + this.step > nowHeight ? nowHeight : toBlock + this.step;
        await Sleep(this.stepInterval);
      }

      this.logger.log(
        `Sync [${this.chain}] RewardsDistribution events from [${
          lastHeight + 1
        }] to [${nowHeight}] finished ✅☕🚾️️`,
      );
    }

    this.logger.log(
      `Start sync [${this.chain}] RewardsDistribution events from [${syncStartBlock + 1}] 💪💪💪 `,
    );
    this.web3Service.pasarMiningContractWS.events
      .RewardsDistribution({
        fromBlock: syncStartBlock + 1,
      })
      .on('error', (error) => {
        this.logger.error(error);
      })
      .on('data', async (event) => {
        await this.handleRewardsDistributionEventData(event);
      });
  }

  private async handleRewardsDistributionEventData(event: any) {
    const data = {
      blockNumber: event.blockNumber,
      pool: parseInt(event.returnValues.pool),
      amount: parseInt(event.returnValues.amount),
      market: event.returnValues.market,
      buyer: event.returnValues.buyer,
      seller: event.returnValues.seller,
      creator: event.returnValues.creator,
    };

    const RewardsDistributionInfoModel = getRewardDistributionInfoModel(this.connection);
    const rewardsDistributionInfo = new RewardsDistributionInfoModel(data);
    await rewardsDistributionInfo.save();
  }
}
