import { Component } from '@angular/core';
import { Station } from '../../../../interfaces/station.interface';

@Component({
  selector: 'app-station-home',
  templateUrl: './station-home.component.html',
  styleUrl: './station-home.component.scss',
})
export class StationHomeComponent {
  isOn: boolean = false;

  currentDirection: 'left' | 'right' = 'left'; // Default direction is 'left'

  stationList: Station[] = [
    {
      nameThai: 'บ้านบึง',
      nameEnglish: 'Banbueng',
      url: 'https://example.com/banbueng',
    },
    {
      nameThai: 'พนัสนิคม',
      nameEnglish: 'Phanat Nikhom',
      url: 'https://example.com/phanat-nikhom',
    },
    {
      nameThai: 'พานทอง',
      nameEnglish: 'Phan Thong',
      url: 'https://example.com/phan-thong',
    },
    {
      nameThai: 'เมืองชลบุรี',
      nameEnglish: 'Mueang Chonburi',
      url: 'https://example.com/mueang-chonburi',
    },
    {
      nameThai: 'บางพระ',
      nameEnglish: 'Bang Phra',
      url: 'https://example.com/bang-phra',
    },
    {
      nameThai: 'ศรีราชา',
      nameEnglish: 'Si Racha',
      url: 'https://example.com/si-racha',
    },
    {
      nameThai: 'แหลมฉบัง',
      nameEnglish: 'Laem Chabang',
      url: 'https://example.com/laem-chabang',
    },
    {
      nameThai: 'พัทยาเหนือ',
      nameEnglish: 'North Pattaya',
      url: 'https://example.com/north-pattaya',
    },
    {
      nameThai: 'พัทยากลาง',
      nameEnglish: 'Central Pattaya',
      url: 'https://example.com/central-pattaya',
    },
    {
      nameThai: 'พัทยาใต้',
      nameEnglish: 'South Pattaya',
      url: 'https://example.com/south-pattaya',
    },
    {
      nameThai: 'บางนา',
      nameEnglish: 'Bang Na',
      url: 'https://example.com/bangna',
    },
    {
      nameThai: 'สุขุมวิท',
      nameEnglish: 'Sukhumvit',
      url: 'https://example.com/sukhumvit',
    },
    {
      nameThai: 'พระโขนง',
      nameEnglish: 'Phra Khanong',
      url: 'https://example.com/phra-khanong',
    },
    {
      nameThai: 'เอกมัย',
      nameEnglish: 'Ekkamai',
      url: 'https://example.com/ekkamai',
    },
    {
      nameThai: 'อโศก',
      nameEnglish: 'Asok',
      url: 'https://example.com/asok',
    },
    {
      nameThai: 'หมอชิต',
      nameEnglish: 'Mo Chit',
      url: 'https://example.com/mo-chit',
    },
    {
      nameThai: 'อนุสาวรีย์ชัยสมรภูมิ',
      nameEnglish: 'Victory Monument',
      url: 'https://example.com/victory-monument',
    },
    {
      nameThai: 'ราชเทวี',
      nameEnglish: 'Ratchathewi',
      url: 'https://example.com/ratchathewi',
    },
    {
      nameThai: 'พญาไท',
      nameEnglish: 'Phaya Thai',
      url: 'https://example.com/phaya-thai',
    },
    {
      nameThai: 'กรุงเทพฯ',
      nameEnglish: 'Bangkok',
      url: 'https://example.com/bangkok',
    },
  ];

  onObrsClick(direction: 'left' | 'right'): void {
    if (this.currentDirection !== direction) {
      this.currentDirection = direction;
    }
  }
}
