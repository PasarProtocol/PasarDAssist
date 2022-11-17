import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Web3 from 'web3';
import { CallOfBatch } from './interfaces';
import { ConfigContract } from '../../config/config.contract';
import { Chain } from './enums';
import { PASAR_ABI } from '../../contracts/PasarABI';
import { STICKER_ABI } from '../../contracts/StickerABI';
import { REGISTER_ABI } from '../../contracts/RegisterABI';
import { PASAR_V1_ABI } from '../../contracts/PasarV1ABI';
import { STICKER_V1_ABI } from '../../contracts/StickerV1ABI';
import { DIA_TOKEN_ABI } from '../../contracts/DIATokenABI';
import { PASAR_MINING_ABI } from '../../contracts/PasarMiningABI';

@Injectable()
export class Web3Service {
  public web3WS: Web3[] = [];
  public web3RPC: Web3[] = [];
  public stickerContractWS: [] = [];
  public pasarContractWS: [] = [];
  public registerContractWS: [] = [];
  public stickerContractRPC: [] = [];
  public pasarContractRPC: [] = [];
  public registerContractRPC: [] = [];

  public pasarMiningContractRPC;
  public pasarMiningContractWS;
  public diaContractRPC;

  constructor(private configService: ConfigService) {
    const env = this.configService.get('NETWORK');

    const options = {
      timeout: 30000, // ms
      // Useful for credentialed urls, e.g: ws://username:password@localhost:8546
      //headers: {
      //    authorization: 'Basic username:password'
      //},
      clientConfig: {
        // Useful if requests are large
        maxReceivedFrameSize: 100000000, // bytes - default: 1MiB
        maxReceivedMessageSize: 100000000, // bytes - default: 8MiB
        keepalive: true, // Useful to keep a connection alive
        keepaliveInterval: 60000, // ms
      },
      reconnect: {
        auto: true,
        delay: 1000,
        maxAttempts: 5,
        onTimeout: false,
      },
    };

    this.web3WS[Chain.ELA] = new Web3(
      new Web3.providers.WebsocketProvider(ConfigContract[env][Chain.ELA].wsUrl, options),
    );
    this.web3RPC[Chain.ELA] = new Web3(
      new Web3.providers.HttpProvider(ConfigContract[env][Chain.ELA].rpcUrl),
    );
    this.web3WS[Chain.V1] = new Web3(
      new Web3.providers.WebsocketProvider(ConfigContract[env][Chain.V1].wsUrl, options),
    );
    this.web3RPC[Chain.V1] = new Web3(
      new Web3.providers.HttpProvider(ConfigContract[env][Chain.V1].rpcUrl),
    );

    this.web3WS[Chain.ETH] = new Web3(
      new Web3.providers.WebsocketProvider(ConfigContract[env][Chain.ETH].wsUrl, options),
    );
    this.web3RPC[Chain.ETH] = new Web3(
      new Web3.providers.HttpProvider(ConfigContract[env][Chain.ETH].rpcUrl),
    );

    this.web3WS[Chain.FSN] = new Web3(
      new Web3.providers.WebsocketProvider(ConfigContract[env][Chain.FSN].wsUrl, options),
    );
    this.web3RPC[Chain.FSN] = new Web3(
      new Web3.providers.HttpProvider(ConfigContract[env][Chain.FSN].rpcUrl),
    );

    //Contract WS
    this.pasarContractWS[Chain.ELA] = new this.web3WS[Chain.ELA].eth.Contract(
      PASAR_ABI,
      ConfigContract[env][Chain.ELA].pasarContract,
    );

    this.stickerContractWS[Chain.ELA] = new this.web3WS[Chain.ELA].eth.Contract(
      STICKER_ABI,
      ConfigContract[env][Chain.ELA].stickerContract,
    );

    this.registerContractWS[Chain.ELA] = new this.web3WS[Chain.ELA].eth.Contract(
      REGISTER_ABI,
      ConfigContract[env][Chain.ELA].registerContract,
    );

    this.pasarContractWS[Chain.ETH] = new this.web3WS[Chain.ETH].eth.Contract(
      PASAR_ABI,
      ConfigContract[env][Chain.ETH].pasarContract,
    );

    this.stickerContractWS[Chain.ETH] = new this.web3WS[Chain.ETH].eth.Contract(
      STICKER_ABI,
      ConfigContract[env][Chain.ETH].stickerContract,
    );

    this.registerContractWS[Chain.ETH] = new this.web3WS[Chain.ETH].eth.Contract(
      REGISTER_ABI,
      ConfigContract[env][Chain.ETH].registerContract,
    );

    this.pasarContractWS[Chain.FSN] = new this.web3WS[Chain.FSN].eth.Contract(
      PASAR_ABI,
      ConfigContract[env][Chain.FSN].pasarContract,
    );

    this.registerContractWS[Chain.FSN] = new this.web3WS[Chain.FSN].eth.Contract(
      REGISTER_ABI,
      ConfigContract[env][Chain.FSN].registerContract,
    );

    this.pasarContractWS[Chain.V1] = new this.web3WS[Chain.V1].eth.Contract(
      PASAR_V1_ABI,
      ConfigContract[env][Chain.V1].pasarContract,
    );

    this.stickerContractWS[Chain.V1] = new this.web3WS[Chain.V1].eth.Contract(
      STICKER_V1_ABI,
      ConfigContract[env][Chain.V1].stickerContract,
    );

    //Contract RPC
    this.pasarContractRPC[Chain.ELA] = new this.web3RPC[Chain.ELA].eth.Contract(
      PASAR_ABI,
      ConfigContract[env][Chain.ELA].pasarContract,
    );

    this.stickerContractRPC[Chain.ELA] = new this.web3RPC[Chain.ELA].eth.Contract(
      STICKER_ABI,
      ConfigContract[env][Chain.ELA].stickerContract,
    );

    this.registerContractRPC[Chain.ELA] = new this.web3RPC[Chain.ELA].eth.Contract(
      REGISTER_ABI,
      ConfigContract[env][Chain.ELA].registerContract,
    );

    this.pasarContractRPC[Chain.ETH] = new this.web3RPC[Chain.ETH].eth.Contract(
      PASAR_ABI,
      ConfigContract[env][Chain.ETH].pasarContract,
    );

    this.stickerContractRPC[Chain.ETH] = new this.web3RPC[Chain.ETH].eth.Contract(
      STICKER_ABI,
      ConfigContract[env][Chain.ETH].stickerContract,
    );

    this.registerContractRPC[Chain.ETH] = new this.web3RPC[Chain.ETH].eth.Contract(
      REGISTER_ABI,
      ConfigContract[env][Chain.ETH].registerContract,
    );

    this.pasarContractRPC[Chain.FSN] = new this.web3RPC[Chain.FSN].eth.Contract(
      PASAR_ABI,
      ConfigContract[env][Chain.FSN].pasarContract,
    );

    this.registerContractRPC[Chain.FSN] = new this.web3RPC[Chain.FSN].eth.Contract(
      REGISTER_ABI,
      ConfigContract[env][Chain.FSN].registerContract,
    );

    this.pasarContractRPC[Chain.V1] = new this.web3RPC[Chain.V1].eth.Contract(
      PASAR_V1_ABI,
      ConfigContract[env][Chain.V1].pasarContract,
    );

    this.stickerContractRPC[Chain.V1] = new this.web3RPC[Chain.V1].eth.Contract(
      STICKER_V1_ABI,
      ConfigContract[env][Chain.V1].stickerContract,
    );

    this.pasarMiningContractRPC = new this.web3RPC[Chain.ELA].eth.Contract(
      PASAR_MINING_ABI,
      ConfigContract[env][Chain.ELA].pasarMiningContract,
    );

    this.pasarMiningContractWS = new this.web3WS[Chain.ELA].eth.Contract(
      PASAR_MINING_ABI,
      ConfigContract[env][Chain.ELA].pasarMiningContract,
    );

    this.diaContractRPC = new this.web3RPC[Chain.V1].eth.Contract(
      DIA_TOKEN_ABI,
      ConfigContract[env][Chain.V1].diaTokenContract,
    );
  }

  web3BatchRequest(calls: CallOfBatch[], chain: Chain): Promise<any> {
    const batch = new this.web3RPC[chain].BatchRequest();
    const promises = calls.map((call) => {
      return new Promise((res, rej) => {
        const req = call['method'].request(call['params'], (err, data) => {
          if (err) rej(err);
          else res(data);
        });
        batch.add(req);
      });
    });
    batch.execute();
    return Promise.all(promises);
  }

  getBaseBatchRequestParam(event: any, chain: Chain): CallOfBatch[] {
    return [
      {
        method: this.web3RPC[chain].eth.getTransactionReceipt,
        params: event.transactionHash,
      },
      {
        method: this.web3RPC[chain].eth.getBlock,
        params: event.blockNumber,
      },
    ];
  }
}
