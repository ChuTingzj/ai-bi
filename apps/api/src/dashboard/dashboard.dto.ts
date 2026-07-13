import { IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateDashboardChartDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsObject()
  chartConfig: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  sourceMessageId?: string;

  @IsOptional()
  @IsObject()
  position?: { x: number; y: number; w: number; h: number };
}

export class UpdateChartPositionDto {
  @IsObject()
  position: { x: number; y: number; w: number; h: number };
}
