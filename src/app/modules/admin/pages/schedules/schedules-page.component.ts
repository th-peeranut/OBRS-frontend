import { Component, OnInit } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminScheduleSetDto,
  AdminTranslationDto,
} from '../../../../services/admin/admin-api.service';

interface ScheduleRow {
  tripId: string;
  departure: string;
  route: string;
  vehicle: string;
  driver: string;
  occupancy: number;
  status: string;
}

@Component({
  selector: 'app-schedules-page',
  templateUrl: './schedules-page.component.html',
  styleUrl: './schedules-page.component.scss',
})
export class SchedulesPageComponent implements OnInit {
  protected schedules: ScheduleRow[] = [
    {
      tripId: '#TRP-8821',
      departure: '09:30 AM - Oct 24',
      route: 'Bangkok -> Chonburi',
      vehicle: 'BKK-4421 (Hino 500 Series)',
      driver: 'Somchai K.',
      occupancy: 85,
      status: 'EN ROUTE',
    },
    {
      tripId: '#TRP-8822',
      departure: '11:15 AM - Oct 24',
      route: 'Rayong -> Bangkok',
      vehicle: 'RY-9910 (Isuzu Giga)',
      driver: 'Anan P.',
      occupancy: 42,
      status: 'SCHEDULED',
    },
    {
      tripId: '#TRP-8819',
      departure: '06:00 AM - Oct 24',
      route: 'Chiang Mai -> Phrae',
      vehicle: 'CNX-112 (Volvo FH)',
      driver: 'Wichai R.',
      occupancy: 100,
      status: 'COMPLETED',
    },
    {
      tripId: '#TRP-8815',
      departure: '05:30 AM - Oct 24',
      route: 'Phuket -> Krabi',
      vehicle: 'PKT-551 (UD Quon)',
      driver: 'TBA',
      occupancy: 0,
      status: 'CANCELLED',
    },
  ];

  protected isLoading = false;
  protected errorMessage = '';

  constructor(private readonly adminApiService: AdminApiService) {}

  async ngOnInit(): Promise<void> {
    await this.loadScheduleSets();
  }

  protected statusClass(status: string): string {
    const normalizedStatus = status.toUpperCase();

    if (
      normalizedStatus === 'EN ROUTE' ||
      normalizedStatus === 'COMPLETED' ||
      normalizedStatus === 'ACTIVE'
    ) {
      return 'is-success';
    }

    if (normalizedStatus === 'SCHEDULED' || normalizedStatus === 'PENDING') {
      return 'is-warning';
    }

    return 'is-danger';
  }

  private async loadScheduleSets(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const response = await firstValueFrom(this.adminApiService.getScheduleSets());
      const scheduleSets = response?.data ?? [];
      this.schedules = scheduleSets.map((scheduleSet) => this.toScheduleRow(scheduleSet));
    } catch {
      this.errorMessage = 'Unable to load schedule data from backend.';
    } finally {
      this.isLoading = false;
    }
  }

  private toScheduleRow(scheduleSet: AdminScheduleSetDto): ScheduleRow {
    const routeName =
      this.getTranslationLabel(scheduleSet.route?.translations, 'en') ??
      scheduleSet.route?.slug ??
      '-';
    const vehicleTypeName =
      this.getTranslationLabel(scheduleSet.vehicleType?.translations, 'en') ??
      scheduleSet.vehicleType?.slug ??
      '-';

    const departureTime = scheduleSet.departureTimes?.[0] ?? '-';
    const dateRange = `${scheduleSet.startDate ?? '-'} to ${scheduleSet.endDate ?? '-'}`;

    return {
      tripId: `#SET-${scheduleSet.id}`,
      departure: `${departureTime} - ${dateRange}`,
      route: routeName,
      vehicle: vehicleTypeName,
      driver: '-',
      occupancy: 0,
      status: (scheduleSet.status ?? 'SCHEDULED').replace(/_/g, ' ').toUpperCase(),
    };
  }

  private getTranslationLabel(
    translations: AdminTranslationDto[] | null | undefined,
    locale?: string
  ): string | null {
    if (!translations || translations.length === 0) {
      return null;
    }

    if (locale) {
      const translation = translations.find(
        (item) => item.locale?.toLowerCase() === locale.toLowerCase()
      );

      if (translation?.label) {
        return translation.label;
      }
    }

    return translations.find((item) => item.label)?.label ?? null;
  }
}
