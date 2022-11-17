import { Max, Min } from 'class-validator';

export class QueryPageDTO {
  @Min(1)
  @Max(50)
  pageSize: number;

  @Min(1)
  pageNum: number;
}
