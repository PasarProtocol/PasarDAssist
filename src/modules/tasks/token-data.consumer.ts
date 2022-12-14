import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { SubTasksService } from './sub-tasks.service';
import { Chain } from '../utils/enums';

@Processor('token-data-queue-local')
export class TokenDataConsumer {
  private readonly logger = new Logger('TokenDataConsumer');

  constructor(private subTasksService: SubTasksService) {}

  @Process('update-token-owner')
  async updateOrder(job: Job<{ chain: Chain; contract: string; tokenId: string; to: string }>) {
    this.logger.log(
      `Processing queues job ['update-token-owner'] data: ${JSON.stringify(job.data)}`,
    );
    await this.subTasksService.updateTokenOwner(
      job.data.chain,
      job.data.contract,
      job.data.tokenId,
      job.data.to,
    );

    return true;
  }

  @Process('update-token-timestamp')
  async updateTokenTimestamp(
    job: Job<{ chain: Chain; contract: string; tokenId: string; timestamp: number }>,
  ) {
    this.logger.log(
      `Processing queues job ['update-token-timestamp'] data: ${JSON.stringify(job.data)}`,
    );
    await this.subTasksService.updateTokenTimestamp(
      job.data.chain,
      job.data.contract,
      job.data.tokenId,
      job.data.timestamp,
    );

    return true;
  }

  @Process('update-token-channel')
  async updateTokenChannel(
    job: Job<{ tokenId: string; tokenUri: string; receiptAddr: string; channelEntry: string }>,
  ) {
    this.logger.log(
      `Processing queues job ['update-token-channel'] data: ${JSON.stringify(job.data)}`,
    );
    await this.subTasksService.updateTokenChannel(
      job.data.tokenId,
      job.data.tokenUri,
      job.data.receiptAddr,
      job.data.channelEntry,
    );

    return true;
  }
}
