import { Module } from '@nestjs/common';
import { DataSourceController } from './datasource.controller';
import { DataSourceService } from './datasource.service';
import { CryptoService } from '../common/crypto.service';

@Module({
  controllers: [DataSourceController],
  providers: [DataSourceService, CryptoService],
  exports: [DataSourceService],
})
export class DataSourceModule {}
