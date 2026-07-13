import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class ChatStreamDto {
  @IsUUID()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsUUID()
  dataSourceId?: string;
}
