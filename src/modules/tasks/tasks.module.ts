import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { ScheduleModule } from '@nestjs/schedule';
import { DbModule } from '../database/db.module';
import { UtilsModule } from '../utils/utils.module';
import { SubTasksService } from './sub-tasks.service';
import { DataCheckService } from './data-check.service';
import { BullModule } from '@nestjs/bull';
import { TokenDataConsumer } from './token-data.consumer';
import { OrderDataConsumer } from './order-data.consumer';
import { PasarV1Service } from './tasks.pasarV1';
import { TasksCommonService } from './tasks.common';
import { TasksEthereum } from './tasks.ethereum';
import { TasksFusion } from './tasks.fusion';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DbModule,
    UtilsModule,
    BullModule.registerQueue(
      {
        name: 'token-data-queue-local',
      },
      {
        name: 'order-data-queue-local',
      },
      {
        name: 'collection-data-queue-local',
      },
    ),
  ],
  providers: [
    TasksService,
    TasksEthereum,
    TasksFusion,
    PasarV1Service,
    TasksCommonService,
    SubTasksService,
    DataCheckService,
    TokenDataConsumer,
    OrderDataConsumer,
  ],
})
export class TasksModule {}
