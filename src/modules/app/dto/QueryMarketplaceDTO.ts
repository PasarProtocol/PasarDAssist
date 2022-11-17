import { QueryPageDTO } from './QueryPageDTO';
import { Chain, OrderTag } from '../../utils/enums';

export class QueryMarketplaceDTO extends QueryPageDTO {
  chain: Chain | 'all';
  status: OrderTag[];
  collection: string[];
  token: string[];
  adult: boolean;
  sort: number;
  minPrice?: number;
  maxPrice?: number;
  type: string;
}
