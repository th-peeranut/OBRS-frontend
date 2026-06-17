import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { map, Observable, Subject } from 'rxjs';
import { select, Store } from '@ngrx/store';
import { Appstate } from '../../../../shared/stores/appstate';
import { selectProvinceWithStation } from '../../../../shared/stores/station/station.selector';
import { Station, StationApi } from '../../../../shared/interfaces/station.interface';

@Component({
  selector: 'app-station-home',
  templateUrl: './station-home.component.html',
  styleUrl: './station-home.component.scss',
})
export class StationHomeComponent implements OnInit, OnDestroy {
  currentDirection: 'forward' | 'reverse' = 'forward';
  stationList$: Observable<Station[]>;

  private destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private translateService: TranslateService,
    private store: Store,
    private appStore: Store<Appstate>
  ) {}

  ngOnInit() {
    this.stationList$ = this.store.pipe(
      select(selectProvinceWithStation),
      map((stations) => this.mapApiStations(stations || []))
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onDirectionClick(direction: 'forward' | 'reverse'): void {
    this.currentDirection = direction;
  }

  getRouteTitle(stations: Station[], reverse: boolean): string {
    const ordered = reverse ? stations.slice().reverse() : stations;
    if (ordered.length === 0) return '';
    if (ordered.length === 1) return this.getStationName(ordered[0]);
    if (ordered.length === 2) {
      return `${this.getStationName(ordered[0])} - ${this.getStationName(ordered[1])}`;
    }

    return `${this.getStationName(ordered[0])} - ${this.getStationName(ordered[1])} - ${this.getStationName(ordered[ordered.length - 1])}`;
  }

  getDisplayedStations(stations: Station[]): Station[] {
    if (this.currentDirection === 'reverse') {
      return stations.slice().reverse();
    }
    return stations;
  }

  isLeft(index: number): boolean {
    return index % 2 === 0;
  }

  isEndPoint(index: number, listLength: number): boolean {
    return index === 0 || index === listLength - 1;
  }

  trackByStationId(_index: number, station: Station): number {
    return station.id;
  }

  getStationName(station: Station): string {
    return this.translateService.currentLang === 'th'
      ? station.nameThai
      : station.nameEnglish;
  }

  navMap(url: string) {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  private mapApiStations(stations: StationApi[]): Station[] {
    return stations.map((stationApi) => {
      const english = this.getTranslationLabel(stationApi?.translations, 'en') || stationApi.slug;
      const thai = this.getTranslationLabel(stationApi?.translations, 'th') || english;

      return {
        id: stationApi.id,
        code: stationApi.slug,
        nameThai: thai,
        nameEnglish: english,
        createdBy: '',
        createdDate: stationApi.createdAt,
        lastUpdatedBy: '',
        lastUpdatedDate: stationApi.updatedAt,
        url: '',
      };
    });
  }

  private getTranslationLabel(translations: unknown, locale: string): string {
    if (!translations) {
      return '';
    }

    const normalizedLocale = locale.toLowerCase();
    if (Array.isArray(translations)) {
      const matched = translations.find((item: any) =>
        String(item?.locale ?? '').toLowerCase().startsWith(normalizedLocale)
      );

      return matched?.label ?? translations.find((item: any) => item?.label)?.label ?? '';
    }

    if (typeof translations === 'object') {
      const translationMap = translations as Record<string, any>;
      return (
        translationMap[normalizedLocale]?.label ??
        Object.values(translationMap).find((item: any) => item?.label)?.label ??
        ''
      );
    }

    return '';
  }

}
