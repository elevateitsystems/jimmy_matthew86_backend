import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const CONTAINER_BUCKETS = [
  'all',
  'open',
  'at_origin',
  'on_water',
  'not_collected',
  'at_warehouse',
  'dehired',
  'delivered',
  'overdue',
  'no_destination',
] as const;

export const CONTAINER_VIEWS = ['arrived', 'in_transit', 'delivered'] as const;

export type ContainerBucket = (typeof CONTAINER_BUCKETS)[number];
export type ContainerView = (typeof CONTAINER_VIEWS)[number];

export class ListContainersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(CONTAINER_VIEWS)
  view?: ContainerView;

  @IsOptional()
  @IsIn(CONTAINER_BUCKETS)
  bucket?: ContainerBucket;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number;
}
