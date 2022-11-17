import { ContractUserInfo, OrderState } from '../tasks/interfaces';

export interface UpdateOrderParams {
  price?: number;
  reservePrice?: number;
  buyoutPrice?: number;
  quoteToken?: string;
  updateTime?: number;
  orderState?: OrderState;
  buyerInfo?: ContractUserInfo;
  buyerUri?: string;
  filled?: number;
  buyerAddr?: string;
  platformAddr?: string;
  platformFee?: number;
  bids?: number;
  lastBid?: number;
  lastBidder?: string;
  royaltyOwner?: string;
  royaltyFee?: number;
}
