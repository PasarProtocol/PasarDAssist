import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../database/db.service';
import { Web3Service } from '../utils/web3.service';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { SubTasksService } from './sub-tasks.service';
import { FeedsChannelEventType } from './interfaces';
import { ConfigService } from '@nestjs/config';
import { Sleep } from '../utils/utils.service';
import { Chain } from '../utils/enums';
import { ConfigContract } from '../../config/config.contract';
import { Timeout } from '@nestjs/schedule';
import { getChannelEventModel } from '../common/models/ChannelEventModel';
import { Constants } from '../../constants';

@Injectable()
export class TasksChannelRegistry {
  private readonly logger = new Logger('TasksChannelRegistry');

  private readonly step = 2;
  private readonly stepInterval = 100;
  private readonly chain = Chain.ELA;
  private readonly rpc = this.web3Service.web3RPC[this.chain];
  private readonly channelRegistryContract =
    ConfigContract[this.configService.get('NETWORK')][this.chain].channelRegistryContract;
  private readonly channelRegistryContractWS = this.web3Service.channelRegistryContractWS;

  constructor(
    private subTasksService: SubTasksService,
    private configService: ConfigService,
    private dbService: DbService,
    private web3Service: Web3Service,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  @Timeout('ChannelRegistered', 1000)
  async handleChannelRegisteredEvent() {
    await this.startupListenChannelEvent(FeedsChannelEventType.ChannelRegistered);
  }

  @Timeout('ChannelUnregistered', 1000)
  async handleChannelUnregisteredEvent() {
    await this.startupListenChannelEvent(FeedsChannelEventType.ChannelUnregistered);
  }

  @Timeout('ChannelUpdated', 1000)
  async handleChannelUpdatedEvent() {
    await this.startupListenChannelEvent(FeedsChannelEventType.ChannelUpdated);
  }

  async startupListenChannelEvent(eventType: FeedsChannelEventType) {
    const nowHeight = await this.rpc.eth.getBlockNumber();
    const lastHeight = await this.dbService.getChannelEventLastHeight(eventType);

    let syncStartBlock = lastHeight;

    if (nowHeight - lastHeight > this.step + 1) {
      syncStartBlock = nowHeight;

      let fromBlock = lastHeight + 1;
      let toBlock = fromBlock + this.step;
      while (fromBlock <= nowHeight) {
        this.logger.log(`Sync ${eventType} events from [${fromBlock}] to [${toBlock}]`);

        this.channelRegistryContractWS
          .getPastEvents(eventType, {
            fromBlock,
            toBlock,
          })
          .then((events) => {
            events.forEach(async (event) => {
              await this.dealWithChannelEvents(event, eventType);
            });
          });
        fromBlock = toBlock + 1;
        toBlock = fromBlock + this.step > nowHeight ? nowHeight : toBlock + this.step;
        await Sleep(this.stepInterval);
      }

      this.logger.log(`Sync ${eventType} events from [${fromBlock}] to [${toBlock}] ✅☕🚾️`);
    }

    this.logger.log(`Start sync ${eventType} events from [${syncStartBlock + 1}] 💪💪💪 `);

    this.channelRegistryContractWS.events[eventType]({
      fromBlock: syncStartBlock + 1,
    })
      .on('error', (error) => {
        this.logger.error(error);
      })
      .on('data', async (event) => {
        await this.dealWithChannelEvents(event, eventType);
      });
  }

  async dealWithChannelEvents(event, eventType: FeedsChannelEventType) {
    const eventInfo = {
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      tokenId: event.returnValues.tokenId,
      tokenUri: event.returnValues.tokenURI ?? event.returnValues.newChannelURI,
      channelEntry: event.returnValues.channelEntry ?? event.returnValues.newChannelEntry,
      receiptAddr: event.returnValues.receiptAddr,
      eventType,
    };

    this.logger.log(`Received ${eventType} ${JSON.stringify(eventInfo)}`);

    const ChannelEventModel = getChannelEventModel(this.connection);
    const channelEvent = new ChannelEventModel(eventInfo);
    await channelEvent.save();

    if (eventType === FeedsChannelEventType.ChannelUnregistered) {
      await this.subTasksService.updateTokenOwner(
        Chain.ELA,
        this.channelRegistryContract,
        eventInfo.tokenId,
        Constants.BURN_ADDRESS,
      );
      return;
    }

    const channelInfo = {
      tokenId: eventInfo.tokenId,
      tokenUri: eventInfo.tokenUri,
      receiptAddr: eventInfo.receiptAddr,
      channelEntry: eventInfo.channelEntry,
    };

    if (eventType === FeedsChannelEventType.ChannelRegistered) {
      const newChannelInfo = {
        blockNumber: eventInfo.blockNumber,
        tokenIdHex: '0x' + BigInt(eventInfo.tokenId).toString(16),
        chain: this.chain,
        contract: this.channelRegistryContract,
        tokenOwner: event.returnValues.ownerAddr,
        royaltyOwner: event.returnValues.ownerAddr,
        agentAddr: event.returnValues.agentAddr,
        notGetDetail: true,
        retryTimes: 0,
      };
      Object.assign(channelInfo, newChannelInfo);

      await this.dbService.newTokenChannel(channelInfo);
    } else {
      await this.subTasksService.updateTokenChannel(channelInfo);
    }
  }
}
