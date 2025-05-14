import { Component, OnInit } from '@angular/core';
import { Station } from '../../../../interfaces/station.interface';
import { Router } from '@angular/router';
import { StationService } from '../../../../services/station/station.service';

@Component({
  selector: 'app-station-home',
  templateUrl: './station-home.component.html',
  styleUrl: './station-home.component.scss',
})
export class StationHomeComponent implements OnInit {
  isOn: boolean = false;

  currentDirection: 'left' | 'right' = 'left'; // Default direction is 'left'

  stationList: Station[] = [];

  constructor(private router: Router, private service: StationService) {}

  async ngOnInit() {
    let res = await this.service.getAll();

    if (res?.code === 200) {
      this.stationList = res.data;
    } else {
      this.stationList = [];
    }
  }

  onObrsClick(direction: 'left' | 'right'): void {
    if (this.currentDirection !== direction) {
      this.currentDirection = direction;
    }

    this.stationList.reverse();
  }

  navMap(url: string) {
    window.open(url, '_blank');
  }
}
