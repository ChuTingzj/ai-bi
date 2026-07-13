import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateSessionDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsUUID()
  dataSourceId?: string;
}
