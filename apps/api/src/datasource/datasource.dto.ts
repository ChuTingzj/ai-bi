import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateDataSourceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsIn(['POSTGRESQL', 'MYSQL'])
  type: 'POSTGRESQL' | 'MYSQL';

  @IsString()
  @IsNotEmpty()
  host: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @IsString()
  @IsNotEmpty()
  database: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsOptional()
  @IsBoolean()
  isReadOnly?: boolean;
}

export class UpdateDataSourceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['POSTGRESQL', 'MYSQL'])
  type?: 'POSTGRESQL' | 'MYSQL';

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  database?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsBoolean()
  isReadOnly?: boolean;
}
