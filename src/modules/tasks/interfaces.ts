import { Chain } from '../utils/enums';

export interface ContractTokenInfo {
  tokenId: string;
  tokenIndex: number;
  tokenSupply: number;
  tokenOwner: string;
  tokenUri: string;
  royaltyOwner: string;
  royaltyFee: number;
  tokenMinter: string;
  createTime: number;
  updateTime: number;
  chain: string;
  contract: string;
  uniqueKey: string;
}

export interface ContractOrderInfo {
  orderId: number;
  orderType: OrderType;
  orderState: OrderState;
  baseToken: string;
  tokenId: string;
  amount: number;
  quoteToken: string;
  price: number;
  reservePrice: number;
  buyoutPrice: number;
  startTime: number;
  endTime: number;
  sellerAddr: string;
  buyerAddr: string;
  bids: number;
  lastBidder: string;
  lastBid: number;
  filled: number;
  royaltyOwner: string;
  royaltyOwners: string[];
  royaltyFee: number;
  royaltyFees: number[];
  royaltyFeeTotal: number;
  sellerUri: string;
  buyerUri: string;
  platformAddr: string;
  platformFee: number;
  isBlindBox: boolean;
  createTime: number;
  updateTime: number;
  chain: string;
  contract: string;
  uniqueKey: string;
}

export interface ContractUserInfo {
  did: string;
  description: string;
  name: string;
  signature?: string;
}

interface TokenData {
  image: string;
  kind: string;
  size: number;
  thumbnail: string;
  signature: string;
}

export interface TokenProperties {
  [key: string]: string;
}

export interface IPFSTokenInfo {
  version: number;
  type: string;
  name: string;
  description: string;
  creator?: ContractUserInfo;
  data?: TokenData;
  adult?: boolean;
  properties?: TokenProperties;

  image?: string;
  kind?: string;
  size?: number;
  thumbnail?: string;
}

export interface IPFSCollectionInfo {
  version: number;
  creator: ContractUserInfo;
  data: {
    avatar: string;
    background: string;
    description: string;
    category: string;
    social: {
      website: string;
      profile: string;
      feeds: string;
      twitter: string;
      telegram: string;
      discord: string;
      medium: string;
    };
  };
}

export interface UpdateCollectionParams {
  chain?: Chain;
  owner?: string;
  name?: string;
  uri?: string;
  royaltyOwners?: string[];
  royaltyFees?: number[];
  is721?: boolean;
  symbol?: string;
  blockNumber?: number;
}

export enum OrderEventType {
  OrderForAuction,
  OrderBid,
  OrderForSale,
  OrderFilled,
  OrderCancelled,
  OrderPriceChanged,
}

export enum CollectionEventType {
  TokenRegistered,
  TokenRoyaltyChanged,
  TokenInfoUpdated,
}

export enum OrderType {
  Sale = 1,
  Auction,
}

export enum OrderState {
  Created = 1,
  Filled,
  Cancelled,
}

export enum IncomeType {
  Sale = 1,
  Royalty,
}
