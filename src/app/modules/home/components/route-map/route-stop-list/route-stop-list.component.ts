import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { RouteStop } from '../../../../../shared/interfaces/route-map.interface';

@Component({
  selector: 'app-route-stop-list',
  templateUrl: './route-stop-list.component.html',
  styleUrl: './route-stop-list.component.scss',
})
export class RouteStopListComponent implements OnChanges {
  @Input() stops: RouteStop[] = [];
  @Input() type: 'pickup' | 'dropoff' = 'pickup';
  @Input() selectedSlug: string | null = null;
  @Input() province = '';

  @Output() stopSelected = new EventEmitter<RouteStop>();
  @Output() confirmClicked = new EventEmitter<void>();

  ngOnChanges(_changes: SimpleChanges): void {}

  onStopClick(stop: RouteStop): void {
    this.stopSelected.emit(stop);
  }

  onConfirm(): void {
    this.confirmClicked.emit();
  }

  trackBySlug(_index: number, stop: RouteStop): string {
    return stop.slug;
  }
}
