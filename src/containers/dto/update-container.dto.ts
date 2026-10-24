import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateContainerDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  destination?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  carrier?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  appointmentAt?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  deliveredAt?: string | null;

  @IsOptional()
  @IsBoolean()
  markDelivered?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  driverName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  truckNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  receivingContact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryAddress?: string;
}
