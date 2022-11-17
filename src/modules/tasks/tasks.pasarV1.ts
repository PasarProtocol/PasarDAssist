import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../database/db.service';
import { Web3Service } from '../utils/web3.service';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { getTokenEventModel } from '../common/models/TokenEventModel';
import { Constants } from '../../constants';
import { SubTasksService } from './sub-tasks.service';
import { ContractTokenInfo, OrderEventType, OrderState } from './interfaces';
import { ConfigService } from '@nestjs/config';
import { getOrderEventModel } from '../common/models/OrderEventModel';
import { Sleep } from '../utils/utils.service';
import { Chain } from '../utils/enums';
import Web3 from 'web3';
import { ConfigContract } from '../../config/config.contract';
import { Timeout } from '@nestjs/schedule';

@Injectable()
export class PasarV1Service {
  private readonly logger = new Logger('PasarV1Service');

  private readonly step = 5000;
  private readonly stepInterval = 1000 * 10;
  private readonly chain = Chain.V1;
  private readonly rpc: Web3;
  private readonly stickerContract =
    ConfigContract[this.configService.get('NETWORK')][this.chain].stickerContract;
  private readonly pasarContract =
    ConfigContract[this.configService.get('NETWORK')][this.chain].pasarContract;
  private readonly stickerContractWS = this.web3Service.stickerContractWS[this.chain];
  private readonly stickerContractRPC = this.web3Service.stickerContractRPC[this.chain];
  private readonly pasarContractWS = this.web3Service.pasarContractWS[this.chain];
  private readonly pasarContractRPC = this.web3Service.pasarContractRPC[this.chain];

  constructor(
    private subTasksService: SubTasksService,
    private configService: ConfigService,
    private dbService: DbService,
    private web3Service: Web3Service,
    @InjectConnection() private readonly connection: Connection,
  ) {
    this.rpc = this.web3Service.web3RPC[this.chain];
  }

  @Timeout('transferV1', 1000)
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
      if (
        eventInfo.to !== this.pasarContract &&
        eventInfo.to !== ConfigContract[this.configService.get('NETWORK')][Chain.ELA].pasarContract
      ) {
        await this.subTasksService.updateTokenOwner(
          this.chain,
          this.stickerContract,
          eventInfo.tokenId,
          eventInfo.to,
        );
      }
    }
  }

  @Timeout('orderForSaleV1', 30 * 1000)
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
      `Start [${this.chain}] OrderForSale events from [${syncStartBlock + 1}] 💪💪💪 `,
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
      amount: event.returnValues._amount,
      price: event.returnValues._price,
      baseToken: this.stickerContract,
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
    contractOrderInfo.baseToken = this.stickerContract;
    contractOrderInfo.quoteToken = Constants.BURN_ADDRESS;
    contractOrderInfo.uniqueKey = eventInfo.tokenId;

    const OrderEventModel = getOrderEventModel(this.connection);
    const orderEvent = new OrderEventModel({
      ...eventInfo,
      chain: this.chain,
      baseToken: this.stickerContract,
      eventType: OrderEventType.OrderForSale,
      gasFee: txInfo.gasUsed,
      timestamp: blockInfo.timestamp,
    });

    await orderEvent.save();
    await this.subTasksService.dealWithNewOrder(contractOrderInfo);
  }

  @Timeout('orderPriceChangedV1', 60 * 1000)
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
    };

    this.logger.log(
      `Received [${this.chain}] OrderPriceChanged Event: ${JSON.stringify(eventInfo)}`,
    );

    const [txInfo, blockInfo] = await this.web3Service.web3BatchRequest(
      [...this.web3Service.getBaseBatchRequestParam(event, this.chain)],
      this.chain,
    );

    const OrderEventModel = getOrderEventModel(this.connection);
    const orderEvent = new OrderEventModel({
      ...eventInfo,
      chain: this.chain,
      baseToken: this.stickerContract,
      eventType: OrderEventType.OrderPriceChanged,
      gasFee: txInfo.gasUsed,
      timestamp: blockInfo.timestamp,
    });

    await orderEvent.save();

    await this.subTasksService.updateOrder(this.chain, parseInt(eventInfo.orderId), {
      price: parseInt(eventInfo.newPrice),
      updateTime: orderEvent.timestamp,
    });
  }

  @Timeout('orderFilledV1', 60 * 1000)
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
      price: event.returnValues._price,
      royaltyFee: event.returnValues._royalty,
      royaltyOwner: event.returnValues._royaltyOwner,
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
      baseToken: this.stickerContract,
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
      royaltyFee: parseInt(eventInfo.royaltyFee),
      updateTime: parseInt(contractOrderInfo.updateTime),
    });

    await this.subTasksService.addUserIncomeRecords(contractOrderInfo);
  }

  @Timeout('orderCancelledV1', 60 * 1000)
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

    const [txInfo, blockInfo] = await this.web3Service.web3BatchRequest(
      [...this.web3Service.getBaseBatchRequestParam(event, this.chain)],
      this.chain,
    );

    const OrderEventModel = getOrderEventModel(this.connection);
    const orderEvent = new OrderEventModel({
      ...eventInfo,
      chain: this.chain,
      baseToken: this.stickerContract,
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
}
