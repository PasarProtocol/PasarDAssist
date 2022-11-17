import { Body, Controller, DefaultValuePipe, Get, ParseIntPipe, Post, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { CommonResponse } from '../utils/interfaces';
import { QueryLatestBidsDTO } from './dto/QueryLatestBidsDTO';
import { Category, Chain, OrderTag } from '../utils/enums';
import { QueryMarketplaceDTO } from './dto/QueryMarketplaceDTO';
import { QueryCollectibleOfCollectionDTO } from './dto/QueryCollectibleOfCollectionDTO';
import { IncomeType } from '../tasks/interfaces';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/check')
  async check(): Promise<CommonResponse> {
    return await this.appService.check();
  }

  @Get('/getTokenOrderByTokenId')
  async getTokenOrderByTokenId(@Query('tokenId') tokenId: string): Promise<CommonResponse> {
    return await this.appService.getTokenOrderByTokenId(tokenId);
  }

  @Get('/getTransHistoryByTokenId')
  async getTransHistoryByTokenId(@Query('tokenId') tokenId: string): Promise<CommonResponse> {
    return await this.appService.getTransHistoryByTokenId(tokenId);
  }

  @Post('/getLatestBids')
  async getLatestBids(@Body() dto: QueryLatestBidsDTO): Promise<CommonResponse> {
    return await this.appService.getLatestBids(dto);
  }

  @Get('/getEarnedByAddress')
  async getEarnedByAddress(@Query('address') address: string): Promise<CommonResponse> {
    return await this.appService.getEarnedByAddress(address, false, false);
  }

  @Get('/getTodayEarnedByAddress')
  async getTodayEarnedByAddress(@Query('address') address: string): Promise<CommonResponse> {
    return await this.appService.getEarnedByAddress(address, true, false);
  }

  @Get('/getEarnedListByAddress')
  async getEarnedListByAddress(@Query('address') address: string): Promise<CommonResponse> {
    return await this.appService.getEarnedByAddress(address, false, true);
  }

  @Get('/getTokenPriceHistory')
  async getTokenPriceHistory(@Query('tokenId') tokenId: string): Promise<CommonResponse> {
    return await this.appService.getTokenPriceHistory(tokenId);
  }

  @Get('/getDidByAddress')
  async getDidByAddress(@Query('address') address: string): Promise<CommonResponse> {
    return await this.appService.getDidByAddress(address);
  }

  @Get('/getRecentOnSale')
  async getRecentOnSale(): Promise<CommonResponse> {
    return await this.appService.getRecentOnSale();
  }

  @Post('/checkFirstSale')
  async checkFirstSale(@Body() uniqueKeys: string[]): Promise<CommonResponse> {
    return await this.appService.checkFirstSale(uniqueKeys);
  }

  @Get('/listCollectibles')
  async listCollectibles(
    @Query('pageNum', ParseIntPipe) pageNum: number = 1,
    @Query('pageSize', ParseIntPipe) pageSize: number = 10,
    @Query('type') type: string = '',
    @Query('after', new DefaultValuePipe(0), ParseIntPipe) after: number,
  ): Promise<CommonResponse> {
    return await this.appService.listCollectibles(pageNum, pageSize, type, after);
  }

  @Post('/marketplace')
  async getMarketplace(@Body() dto: QueryMarketplaceDTO): Promise<CommonResponse> {
    return await this.appService.getMarketplace(dto);
  }

  @Get('/getCollectibleOfMarketplace')
  async getCollectibleOfMarketplace(
    @Query('chain') chain: string,
    @Query('orderId', ParseIntPipe) orderId: number,
  ): Promise<CommonResponse> {
    return await this.appService.getCollectibleOfMarketplace(chain, orderId);
  }

  @Get('/listNFTs')
  async listNFTs(
    @Query('pageNum', ParseIntPipe) pageNum: number = 1,
    @Query('pageSize', ParseIntPipe) pageSize: number = 10,
    @Query('sort', new DefaultValuePipe(-1), ParseIntPipe) sort: 1 | -1,
  ): Promise<CommonResponse> {
    return await this.appService.listNFTs(pageNum, pageSize, sort);
  }

  @Get('/listTransactions')
  async listTransactions(
    @Query('pageNum', ParseIntPipe) pageNum: number = 1,
    @Query('pageSize', ParseIntPipe) pageSize: number = 10,
    @Query('eventType') eventType: string = '',
    @Query('sort', new DefaultValuePipe(-1), ParseIntPipe) sort: 1 | -1,
  ): Promise<CommonResponse> {
    return await this.appService.listTransactions(pageNum, pageSize, eventType, sort);
  }

  @Get('/getTransactionsOfToken')
  async getTransactionsByToken(
    @Query('chain') chain: Chain,
    @Query('tokenId') tokenId: string,
    @Query('baseToken') baseToken: string,
    @Query('eventType') eventType: string = '',
    @Query('sort', new DefaultValuePipe(-1), ParseIntPipe) sort: 1 | -1,
  ): Promise<CommonResponse> {
    return await this.appService.getTransactionsByToken(chain, tokenId, baseToken, eventType, sort);
  }

  @Get('/getPriceHistoryOfToken')
  async getPriceHistoryOfToken(
    @Query('chain') chain: Chain,
    @Query('tokenId') tokenId: string,
    @Query('baseToken') baseToken: string,
  ): Promise<CommonResponse> {
    return await this.appService.getPriceHistoryOfToken(chain, tokenId, baseToken);
  }

  @Get('/getCollectibleInfo')
  async getCollectibleInfo(
    @Query('chain') chain: Chain,
    @Query('tokenId') tokenId: string,
    @Query('baseToken') baseToken: string,
  ): Promise<CommonResponse> {
    return await this.appService.getCollectibleInfo(chain, tokenId, baseToken);
  }

  @Get('/getCollectiblesOfCollection')
  async getCollectiblesOfCollection(
    @Query('chain') chain: Chain,
    @Query('collection') collection: string,
    @Query('exceptToken') exceptToken: string,
    @Query('num', new DefaultValuePipe(4), ParseIntPipe) num: number,
  ): Promise<CommonResponse> {
    return await this.appService.getCollectiblesOfCollection(chain, collection, exceptToken, num);
  }

  @Get('/listCollections')
  async listCollections(
    @Query('pageNum', ParseIntPipe) pageNum: number = 1,
    @Query('pageSize', ParseIntPipe) pageSize: number = 10,
    @Query('chain') type: Chain | 'all' = 'all',
    @Query('category') category: Category | 'all' = 'all',
    @Query('sort', new DefaultValuePipe(0), ParseIntPipe) sort: number,
  ): Promise<CommonResponse> {
    return await this.appService.listCollections(pageNum, pageSize, type, category, sort);
  }

  @Get('/getCollectionInfo')
  async getCollectionInfo(
    @Query('chain') chain: Chain,
    @Query('collection') collection: string,
  ): Promise<CommonResponse> {
    return await this.appService.getCollectionInfo(chain, collection);
  }

  @Get('/getStatisticsOfCollection')
  async getStatisticsOfCollection(
    @Query('chain') chain: Chain,
    @Query('collection') collection: string,
  ): Promise<CommonResponse> {
    return await this.appService.getStatisticsOfCollection(chain, collection);
  }

  @Post('/listCollectibleOfCollection')
  async listCollectibleOfCollection(
    @Body() dto: QueryCollectibleOfCollectionDTO,
  ): Promise<CommonResponse> {
    return await this.appService.listCollectibleOfCollection(dto);
  }

  @Get('/quickSearch')
  async quickSearch(@Query('keyword') keyword: string): Promise<CommonResponse> {
    return await this.appService.quickSearch(keyword);
  }

  @Get('/searchTokens')
  async searchTokens(@Query('keyword') keyword: string): Promise<CommonResponse> {
    return await this.appService.searchTokens(keyword);
  }

  @Get('/searchMarketplace')
  async searchMarketplace(@Query('keyword') keyword: string): Promise<CommonResponse> {
    return await this.appService.searchMarketplace(keyword);
  }

  @Get('/getStatisticsByWalletAddr')
  async getStatisticsByWalletAddr(
    @Query('walletAddr') walletAddr: string,
  ): Promise<CommonResponse> {
    return await this.appService.getStatisticsByWalletAddr(walletAddr);
  }

  @Get('/getCollectionsByWalletAddr')
  async getCollectionsByWalletAddr(
    @Query('pageNum', ParseIntPipe) pageNum: number = 1,
    @Query('pageSize', ParseIntPipe) pageSize: number = 10,
    @Query('walletAddr') walletAddr: string,
    @Query('chain') chain: Chain | 'all',
    @Query('sort', new DefaultValuePipe(1), ParseIntPipe) sort: number,
  ): Promise<CommonResponse> {
    return await this.appService.getCollectionsByWalletAddr(
      pageNum,
      pageSize,
      walletAddr,
      chain,
      sort,
    );
  }

  @Get('/getListedCollectiblesByWalletAddr')
  async getListedCollectiblesByWalletAddr(
    @Query('pageNum', ParseIntPipe) pageNum: number = 1,
    @Query('pageSize', ParseIntPipe) pageSize: number = 10,
    @Query('walletAddr') walletAddr: string,
    @Query('chain') chain: Chain | 'all' = 'all',
    @Query('sort', new DefaultValuePipe(0), ParseIntPipe) sort: number,
  ): Promise<CommonResponse> {
    return await this.appService.getListedCollectiblesByWalletAddr(
      pageNum,
      pageSize,
      walletAddr,
      chain,
      sort,
    );
  }

  @Get('/getOwnedCollectiblesByWalletAddr')
  async getOwnedCollectiblesByWalletAddr(
    @Query('pageNum', ParseIntPipe) pageNum: number = 1,
    @Query('pageSize', ParseIntPipe) pageSize: number = 10,
    @Query('walletAddr') walletAddr: string,
    @Query('chain') chain: Chain | 'all' = 'all',
    @Query('sort', new DefaultValuePipe(0), ParseIntPipe) sort: number,
  ): Promise<CommonResponse> {
    return await this.appService.getOwnedCollectiblesByWalletAddr(
      pageNum,
      pageSize,
      walletAddr,
      chain,
      sort,
    );
  }

  @Get('/getBidsCollectiblesByWalletAddr')
  async getBidsCollectiblesByWalletAddr(
    @Query('pageNum', ParseIntPipe) pageNum: number = 1,
    @Query('pageSize', ParseIntPipe) pageSize: number = 10,
    @Query('walletAddr') walletAddr: string,
    @Query('chain') chain: Chain | 'all' = 'all',
    @Query('sort', new DefaultValuePipe(0), ParseIntPipe) sort: number,
  ): Promise<CommonResponse> {
    return await this.appService.getBidsCollectiblesByWalletAddr(
      pageNum,
      pageSize,
      walletAddr,
      chain,
      sort,
    );
  }

  @Get('/getMintedCollectiblesByWalletAddr')
  async getMintedCollectiblesByWalletAddr(
    @Query('pageNum', ParseIntPipe) pageNum: number = 1,
    @Query('pageSize', ParseIntPipe) pageSize: number = 10,
    @Query('walletAddr') walletAddr: string,
    @Query('chain') chain: Chain | 'all' = 'all',
    @Query('sort', new DefaultValuePipe(0), ParseIntPipe) sort: number,
  ): Promise<CommonResponse> {
    return await this.appService.getMintedCollectiblesByWalletAddr(
      pageNum,
      pageSize,
      walletAddr,
      chain,
      sort,
    );
  }

  @Get('/getSoldCollectiblesByWalletAddr')
  async getSoldCollectiblesByWalletAddr(
    @Query('pageNum', ParseIntPipe) pageNum: number = 1,
    @Query('pageSize', ParseIntPipe) pageSize: number = 10,
    @Query('walletAddr') walletAddr: string,
    @Query('chain') chain: Chain | 'all' = 'all',
    @Query('sort', new DefaultValuePipe(0), ParseIntPipe) sort: number,
  ): Promise<CommonResponse> {
    return await this.appService.getSoldCollectiblesByWalletAddr(
      pageNum,
      pageSize,
      walletAddr,
      chain,
      sort,
    );
  }

  @Get('/getItems')
  async getItems(): Promise<CommonResponse> {
    return await this.appService.getItems();
  }

  @Get('/getTransactions')
  async getTransactions(): Promise<CommonResponse> {
    return await this.appService.getTransactions();
  }

  @Get('/getOwners')
  async getOwners(): Promise<CommonResponse> {
    return await this.appService.getOwners();
  }

  @Get('/getTradingVolume')
  async getTradingVolume(): Promise<CommonResponse> {
    return await this.appService.getTradingVolume();
  }

  @Get('/reGetTokenDetail')
  async reGetTokenDetail(): Promise<CommonResponse> {
    return await this.appService.reGetTokenDetail();
  }

  @Get('/getStatisticsOfUser')
  async getStatisticsOfUser(@Query('walletAddr') walletAddr: string): Promise<CommonResponse> {
    return await this.appService.getStatisticsOfUser(walletAddr);
  }

  @Get('/listTransactionsOfUser')
  async listTransactionsOfUser(
    @Query('walletAddr') walletAddr: string,
    @Query('pageNum', ParseIntPipe) pageNum: number = 1,
    @Query('pageSize', ParseIntPipe) pageSize: number = 10,
    @Query('eventType') eventType: string = 'all',
    @Query('performer') performer: string = 'By',
    @Query('keyword') keyword: string = '',
    @Query('sort', ParseIntPipe) sort: 1 | -1 = -1,
  ): Promise<CommonResponse> {
    return await this.appService.listTransactionsOfUser(
      walletAddr,
      pageNum,
      pageSize,
      eventType,
      performer,
      keyword,
      sort,
    );
  }

  @Get('/getIncomesOfUser')
  async getIncomesOfUser(
    @Query('walletAddr') walletAddr: string,
    @Query('type', ParseIntPipe) type: IncomeType = IncomeType.Royalty,
  ): Promise<CommonResponse> {
    return await this.appService.getIncomesOfUser(walletAddr, type);
  }

  @Get('/getTokensCount')
  async getTokensCount(): Promise<CommonResponse> {
    return await this.appService.getTokensCount();
  }

  @Get('/getPoolRewards')
  async getPoolRewards(): Promise<CommonResponse> {
    return await this.appService.getPoolRewards();
  }

  @Get('/getBidsHistory')
  async getBidsHistory(
    @Query('chain') chain: string,
    @Query('orderId', ParseIntPipe) orderId: number,
  ): Promise<CommonResponse> {
    return await this.appService.getBidsHistory(chain, orderId);
  }

  @Get('/getAttributesOfCollection')
  async getAttributesOfCollection(
    @Query('chain') chain: string,
    @Query('collection') collection: string,
  ): Promise<CommonResponse> {
    return await this.appService.getAttributesOfCollection(chain, collection);
  }

  @Get('/getV1MarketNFTByWalletAddr')
  async getV1MarketNFTByWalletAddr(
    @Query('walletAddr') walletAddr: string,
  ): Promise<CommonResponse> {
    return await this.appService.getV1MarketNFTByWalletAddr(walletAddr);
  }
}
