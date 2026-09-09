import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const FILTER_OPERATORS = [
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'LIKE',
  'IN',
  'IS NULL',
  'IS NOT NULL',
] as const;

export class GuidanceFilterDto {
  @IsString()
  @IsNotEmpty()
  field!: string;

  @IsIn(FILTER_OPERATORS)
  operator!: (typeof FILTER_OPERATORS)[number];

  @IsOptional()
  @IsString()
  value?: string;
}

export class GuidanceJoinDto {
  @IsString()
  @IsNotEmpty()
  leftTable!: string;

  @IsArray()
  @IsString({ each: true })
  leftColumns!: string[];

  @IsString()
  @IsNotEmpty()
  rightTable!: string;

  @IsArray()
  @IsString({ each: true })
  rightColumns!: string[];

  @IsIn(['INNER'])
  type!: 'INNER';
}

export class GuidancePayloadDto {
  @IsArray()
  @IsString({ each: true })
  tables!: string[];

  @IsArray()
  @IsString({ each: true })
  fields!: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuidanceFilterDto)
  filters!: GuidanceFilterDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuidanceJoinDto)
  joins?: GuidanceJoinDto[];
}

export class ChatStreamDto {
  @IsUUID()
  sessionId!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsUUID()
  dataSourceId?: string;

  @IsOptional()
  @IsBoolean()
  afterGuidance?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => GuidancePayloadDto)
  guidance?: GuidancePayloadDto;
}
