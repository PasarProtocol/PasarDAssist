import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { SubTasksService } from './sub-tasks.service';
import { UpdateCollectionParams } from './interfaces';
import { Chain } from '../utils/enums';

@Processor('collection-data-queue-local')
export class CollectionDataConsumer {
  private readonly logger = new Logger('CollectionDataConsumer');

  constructor(private subTasksService: SubTasksService) {}

  @Process('update-collection')
  async updateOrder(job: Job<{ token: string; chain: Chain; param: UpdateCollectionParams }>) {
    this.logger.log(`Processing job ['update-collection'] data: ${JSON.stringify(job.data)}`);
    await this.subTasksService.updateCollection(job.data.token, job.data.chain, job.data.param);

    return true;
  }
}
