import { CACHE_MANAGER, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, Timeout } from '@nestjs/schedule';
import { SubTasksService } from './sub-tasks.service';
import { DbService } from '../database/db.service';
import { Web3Service } from '../utils/web3.service';
import { Sleep } from '../utils/utils.service';
import { TOKEN721_ABI } from '../../contracts/Token721ABI';
import { TOKEN1155_ABI } from '../../contracts/Token1155ABI';
import { ConfigTokens } from '../../config/config.tokens';
import { ConfigService } from '@nestjs/config';
import { Chain } from '../utils/enums';
import { Cache } from 'cache-manager';
import { ConfigContract } from '../../config/config.contract';

@Injectable()
export class TasksCommonService {
  constructor(
    private dbService: DbService,
    private configService: ConfigService,
    private subTasksService: SubTasksService,
    private web3Service: Web3Service,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  private readonly logger = new Logger('TasksCommonService');
  private readonly step = 2000;
  private readonly stepInterval = 2000;

  @Cron('*/5 * * * * *')
  async getUserTokenInfo() {
    const tokens = await this.dbService.getLatestNoDetailTokens();
    if (tokens.length > 0) {
      for (const token of tokens) {
        const tokenUri = token.tokenUri;
        try {
          const tokenInfo = await this.subTasksService.getTokenInfoByUri(
            tokenUri,
            token.retryTimes,
          );
          this.logger.log(JSON.stringify(tokenInfo));

          const attributes = {};
          if (tokenInfo && tokenInfo.attributes && tokenInfo.attributes.length > 0) {
            for (const attribute of tokenInfo.attributes) {
              await this.dbService.insertCollectionAttribute(
                token.chain,
                token.contract,
                attribute.trait_type,
                attribute.value,
              );
              attributes[attribute.trait_type] = attribute.value;
            }
          }

          const collection = await this.dbService.getCollectionByToken(token.contract, token.chain);

          if (tokenInfo) {
            const tokenDetail = {
              name: tokenInfo.name,
              description: tokenInfo.description
                ? tokenInfo.description
                : tokenInfo.data?.description,
              image: tokenInfo.image ? tokenInfo.image : '',
              royaltyOwner: collection?.royaltyOwners[0],
              royaltyFee: collection ? parseInt(collection.royaltyFees[0]) : 0,
              type: tokenInfo.type ? tokenInfo.type : 'image',
              adult: tokenInfo.adult ? tokenInfo.adult : false,
              version: tokenInfo.version ? parseInt(tokenInfo.version) : 2,
              properties: tokenInfo.properties ? tokenInfo.properties : {},
              creator: tokenInfo.creator ? tokenInfo.creator : {},
              data: tokenInfo.data ? tokenInfo.data : {},
              attributes,
              notGetDetail: false,
            };

            await this.dbService.updateTokenDetail(
              token.tokenId,
              token.chain,
              token.contract,
              tokenDetail,
            );
          }
        } catch (e) {
          this.logger.error(e);
          this.logger.error(`Can not get token info from ${tokenUri}`);
          await this.dbService.increaseTokenRetryTimes(token.tokenId, token.chain, token.contract);
        }
      }
    }
  }

  @Cron('0 * * * * *')
  async getPlatformTokenPrice() {
    if (this.configService.get('NETWORK') === 'testnet') {
      return;
    }
    const tokenList = ConfigTokens['mainnet'][Chain.ELA];
    const tokens = [];
    const promises = [];
    const data = [];
    for (const x in tokenList) {
      const token = tokenList[x].toLowerCase();
      tokens.push(token);
      promises.push(this.subTasksService.getELATokenRate(token));
    }

    const rates = await Promise.all(promises);

    for (let i = 0; i < rates.length; i++) {
      const rate = parseFloat(rates[i].data.data.token.derivedELA);
      data[i] = {
        chain: Chain.ELA,
        token: tokens[i],
        rate,
        price: rate * parseFloat(rates[i].data.data.bundle.elaPrice),
      };
    }

    await this.dbService.insertTokenRates(data);
  }

  @Cron('0 */10 * * * *')
  async statisticCollectionItems() {
    const collections = await this.dbService.getAllCollections();
    for (const collection of collections) {
      const items = await this.dbService.getCollectionItems(collection.token, collection.chain);
      const owners = await this.dbService.getCollectionOwners(collection.token, collection.chain);

      const tradeVolume = await this.dbService.getCollectionTradeCount(
        collection.token,
        collection.chain,
      );
      const lowestPrice = await this.dbService.getCollectionLowestPrice(
        collection.token,
        collection.chain,
      );
      let dia = 0;
      if (collection.owner) {
        dia = parseInt(
          await this.web3Service.diaContractRPC.methods.balanceOf(collection.owner).call(),
        );
      }

      await this.dbService.updateCollectionStatisticsInfo(collection.token, collection.chain, {
        items,
        owners,
        tradeVolume,
        lowestPrice,
        dia,
      });
    }
  }

  @Cron('0 */2 * * * *')
  async getTokenPrice() {
    const cmcKeyStr = this.configService.get('CMC_KEY');
    if (!cmcKeyStr) {
      return;
    }

    const cmcKeys = cmcKeyStr.split(',');
    const tokens1 = {
      BTC: 1,
      BNB: 1839,
      HT: 2502,
      AVAX: 5805,
      ETH: 1027,
      FTM: 3513,
      MATIC: 3890,
      CRO: 3635,
      KAVA: 4846,
    };
    const tokens2 = {
      EVMOS: 19899,
      FSN: 2530,
      ELA: 2492,
      TLOS: 4660,
      FUSE: 5634,
      HOO: 7543,
      xDAI: 8635,
      IOTX: 2777,
    };

    const x = Math.floor(Math.random() * cmcKeys.length);
    const headers = { 'Content-Type': 'application/json', 'X-CMC_PRO_API_KEY': cmcKeys[x] };
    const res = await fetch(
      'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=110',
      { method: 'get', headers },
    );
    const result = await res.json();

    const record = { timestamp: Date.parse(result.status.timestamp) };
    result.data.forEach((item) => {
      if (tokens1[item.symbol] === item.id) {
        record[item.symbol] = item.quote.USD.price;
      }
    });

    for (const i in tokens2) {
      const resOther = await fetch(
        `https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=1&convert_id=${tokens2[i]}`,
        { method: 'get', headers },
      );
      const resultOther = await resOther.json();

      if (resultOther.data[0].id === 1) {
        const priceAtBTC = resultOther.data[0].quote[tokens2[i]].price;
        record[i] = record['BTC'] / priceAtBTC;
      } else {
        this.logger.error(`[Get CMC PRICE] the base coin changed`);
      }
    }

    await this.dbService.insertTokensPrice(record);
    await this.dbService.removeOldTokenPriceRecords(record.timestamp - 30 * 24 * 60 * 60 * 1000);
  }

  @Timeout('userCollection', 0)
  async startupListenUserCollectionEvent() {
    const registeredCollections = await this.dbService.getRegisteredCollections();
    registeredCollections.forEach((collection) => {
      if (!this.subTasksService.checkIsBaseCollection(collection.token, collection.chain)) {
        this.startupSyncUserCollection(collection);
      }
    });
  }

  async startupSyncUserCollection(collection) {
    if (!this.subTasksService.checkIsBaseCollection(collection.token, collection.chain)) {
      const nowHeight = await this.web3Service.web3RPC[collection.chain].eth.getBlockNumber();
      const lastHeight = await this.dbService.getUserTokenEventLastHeight(
        collection.chain,
        collection.token,
      );

      const ABI = collection.is721 ? TOKEN721_ABI : TOKEN1155_ABI;
      const eventType = collection.is721 ? 'Transfer' : 'TransferSingle';
      const contractWs = new this.web3Service.web3WS[collection.chain].eth.Contract(
        ABI as any,
        collection.token,
      );

      let syncStartBlock = lastHeight;

      if (nowHeight - lastHeight > this.step + 1) {
        syncStartBlock = nowHeight;

        let fromBlock = lastHeight + 1;
        let toBlock = fromBlock + this.step;
        while (fromBlock <= nowHeight) {
          this.logger.log(
            `Sync [${collection.chain}] user Collection ${collection.token} Transfer events from [${fromBlock}] to [${toBlock}]`,
          );

          contractWs
            .getPastEvents(eventType, {
              fromBlock,
              toBlock,
            })
            .then((events) => {
              events.forEach(async (event) => {
                await this.subTasksService.dealWithUserCollectionToken(
                  event,
                  collection.token,
                  collection.chain,
                  collection.is721,
                  ConfigContract[this.configService.get('NETWORK')][collection.chain].pasarContract,
                );
              });
            });
          fromBlock = toBlock + 1;
          toBlock = fromBlock + this.step > nowHeight ? nowHeight : toBlock + this.step;
          await Sleep(this.stepInterval);
        }

        this.logger.log(
          `Sync ${collection.chain} user Collection ${collection.token} Transfer events from [${fromBlock}] to [${toBlock}] ✅☕🚾️`,
        );
      }

      this.logger.log(
        `Start sync ${collection.chain} user Collection ${collection.token} Transfer events from [${
          syncStartBlock + 1
        }] 💪💪💪 `,
      );

      contractWs.events[eventType]({
        fromBlock: syncStartBlock + 1,
      })
        .on('error', (error) => {
          this.logger.error(error);
        })
        .on('data', async (event) => {
          this.logger.log(
            `Received ${collection.chain} ${collection.token} ${eventType} ${JSON.stringify(
              event,
            )}`,
          );
          await this.subTasksService.dealWithUserCollectionToken(
            event,
            collection.token,
            collection.chain,
            collection.is721,
            ConfigContract[this.configService.get('NETWORK')][collection.chain].pasarContract,
          );
        });
    }
  }
}
