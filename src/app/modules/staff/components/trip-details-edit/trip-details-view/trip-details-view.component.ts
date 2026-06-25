import { Component, Input } from '@angular/core';
import { WalkInTripDto } from '../../../../../services/staff/staff-api.service';
import dayjs from 'dayjs';

@Component({
  selector: 'app-trip-details-view',
  templateUrl: './trip-details-view.component.html',
  styleUrl: './trip-details-view.component.scss',
})
export class TripDetailsViewComponent {
  @Input() trip: WalkInTripDto | null = null;

  protected formatDateTime(dateTime: string): string {
    return dayjs(dateTime).format('D MMM YYYY HH:mm');
  }
}
