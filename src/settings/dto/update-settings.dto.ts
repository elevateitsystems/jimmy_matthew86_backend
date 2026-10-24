import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export const DASHBOARD_VIEWS = ['Active', 'All containers'] as const;
export type DashboardView = (typeof DASHBOARD_VIEWS)[number];

export class UpdateSettingsDto {
  @IsOptional()
  @IsBoolean()
  emailUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  compactTable?: boolean;

  @IsOptional()
  @IsIn([...DASHBOARD_VIEWS, 'All'])
  defaultView?: DashboardView | 'All';
}
