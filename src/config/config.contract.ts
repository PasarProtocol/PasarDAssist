import { Chain } from '../modules/utils/enums';

export const ConfigContract = {
  mainnet: {
    [Chain.ELA]: {
      wsUrl: 'ws://10.0.0.146:20635',
      rpcUrl: 'http://10.0.0.146:20636',

      pasarContract: '0xaeA699E4dA22986eB6fa2d714F5AC737Fe93a998',
      stickerContract: '0xF63f820F4a0bC6E966D61A4b20d24916713Ebb95',
      registerContract: '0x3d0AD66765C319c2A1c6330C1d815608543dcc19',
      pasarMiningContract: '0xB27CC87EaF372F78E3Ca4da38b013E154e7247e0',
      channelRegistryContract: '0xF5c140100F1E8475bc5097FF9D5689d043d9BE12',

      pasarContractDeploy: 12698149,
      stickerContractDeploy: 12695430,
      registerContractDeploy: 12698059,
      pasarMiningContractDeploy: 14255847,
      channelRegistryContractDeploy: 15376251,

      ELAToken: '0x0000000000000000000000000000000000000000',
    },

    [Chain.V1]: {
      wsUrl: 'ws://10.0.0.146:20635',
      rpcUrl: 'http://10.0.0.146:20636',

      pasarContract: '0x02E8AD0687D583e2F6A7e5b82144025f30e26aA0',
      stickerContract: '0x020c7303664bc88ae92cE3D380BF361E03B78B81',
      diaTokenContract: '0x2C8010Ae4121212F836032973919E8AeC9AEaEE5',

      pasarContractDeploy: 7744408,
      stickerContractDeploy: 7744408,

      ELAToken: '0x0000000000000000000000000000000000000000',
    },

    [Chain.ETH]: {
      wsUrl: 'wss://mainnet.infura.io/ws/v3/9aa3d95b3bc440fa88ea12eaa4456161',
      rpcUrl: 'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',

      pasarContract: '0x940b857f2D5FA0cf9f0345B43C0e3308cD9E4A62',
      stickerContract: '0x020c7303664bc88ae92cE3D380BF361E03B78B81',
      registerContract: '0x24A7af00c8d03F2FeEb89045B2B93c1D7C3ffB08',

      pasarContractDeploy: 15126947,
      stickerContractDeploy: 15126909,
      registerContractDeploy: 15126930,

      ELAToken: '0xe6fd75ff38Adca4B97FBCD938c86b98772431867',
    },

    [Chain.FSN]: {
      wsUrl: 'ws://10.0.0.146:9001',
      rpcUrl: 'http://10.0.0.146:9000',

      pasarContract: '0xa18279eBDfA5747e79DBFc23fa999b4Eaf2A9780',
      registerContract: '0x020c7303664bc88ae92cE3D380BF361E03B78B81',

      pasarContractDeploy: 7388472,
      registerContractDeploy: 7388472,

      ELAToken: '0x471a525f12804f3eb45573f60b7c4ac29b3460e2',
    },
  },

  testnet: {
    [Chain.ELA]: {
      wsUrl: 'wss://api-testnet.elastos.io/eth-ws',
      rpcUrl: 'https://api-testnet.elastos.io/eth',

      pasarContract: '0x19088c509C390F996802B90bdc4bFe6dc3F5AAA7',
      stickerContract: '0x32496388d7c0CDdbF4e12BDc84D39B9E42ee4CB0',
      registerContract: '0x2b304ffC302b402785294629674A8C2b64cEF897',
      pasarMiningContract: '0xB27CC87EaF372F78E3Ca4da38b013E154e7247e0',
      channelRegistryContract: '0x38D3fE3C53698fa836Ba0c1e1DD8b1d8584127A7',

      pasarContractDeploy: 12311847,
      stickerContractDeploy: 12311834,
      registerContractDeploy: 12311838,
      pasarMiningContractDeploy: 14255847,
      channelRegistryContractDeploy: 14673711,

      ELAToken: '0x0000000000000000000000000000000000000000',
    },

    [Chain.V1]: {
      wsUrl: 'wss://api-testnet.elastos.io/eth-ws',
      rpcUrl: 'https://api-testnet.elastos.io/eth',

      pasarContract: '0x2652d10A5e525959F7120b56f2D7a9cD0f6ee087',
      stickerContract: '0xed1978c53731997f4DAfBA47C9b07957Ef6F3961',
      diaTokenContract: '0x85946E4b6AB7C5c5C60A7b31415A52C0647E3272',

      pasarContractDeploy: 7377671,
      stickerContractDeploy: 7377671,

      ELAToken: '0x0000000000000000000000000000000000000000',
    },

    [Chain.ETH]: {
      wsUrl: 'wss://goerli.infura.io/ws/v3/9aa3d95b3bc440fa88ea12eaa4456161',
      rpcUrl: 'https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',

      pasarContract: '0x7d797f3564073FFF8E75D9D5Be57EBC01512b554',
      stickerContract: '0xAB5bB5FcEFc9703814AF68077387BC09Be12190b',
      registerContract: '0x2C8615B32cf6535Eb38DD076aD822E7c2362a4c7',

      pasarContractDeploy: 7920243,
      stickerContractDeploy: 7920234,
      registerContractDeploy: 7920236,

      ELAToken: '0x8c947E0fA67e91370587076A4108Df17840e9982',
    },

    [Chain.FSN]: {
      wsUrl: 'wss://testnet.fusionnetwork.io',
      rpcUrl: 'https://testnet.fusionnetwork.io',

      pasarContract: '0xa18279eBDfA5747e79DBFc23fa999b4Eaf2A9780',
      registerContract: '0x020c7303664bc88ae92cE3D380BF361E03B78B81',

      pasarContractDeploy: 7400000,
      registerContractDeploy: 7300000,

      ELAToken: '0x471a525f12804f3eb45573f60b7c4ac29b3460e2',
    },
  },
};
