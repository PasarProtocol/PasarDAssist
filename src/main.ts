import { NestFactory } from '@nestjs/core';
import { MainModule } from './modules/main.module';
import { ConfigService } from '@nestjs/config';
import { AppService } from './modules/app/app.service';

async function bootstrap() {
  const app = await NestFactory.create(MainModule);

  app.setGlobalPrefix('/api/v1', { exclude: ['/feeds/api/v1/price'] });

  const appService = app.get(AppService);
  await appService.loadCollectionsInfo();

  const configService = app.get(ConfigService);
  await app.listen(configService.get('LISTEN_PORT'));
}
bootstrap().then(() => console.log('Pasar Assist Service start successfully ✅ '));
