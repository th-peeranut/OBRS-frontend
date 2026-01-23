import { Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-stepper',
  templateUrl: './stepper.component.html',
  styleUrl: './stepper.component.scss',
})
export class StepperComponent implements OnInit, OnDestroy {
  step: number = 1;
  private routerSubscription?: Subscription;
  private readonly stepRoutes = [
    { step: 1, path: '/schedule-booking' },
    { step: 2, path: '/review-schedule-booking' },
    { step: 3, path: '/passenger-info' },
    { step: 4, path: '/payment' },
    { step: 4, path: '/e-ticket' },
  ];

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.updateStepFromUrl(this.router.url);

    this.routerSubscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.updateStepFromUrl(event.urlAfterRedirects);
      }
    });
  }

  ngOnDestroy(): void {
    this.routerSubscription?.unsubscribe();
  }

  goToStep(stepNumber: number): void {
    const targetPath = this.stepRoutes.find(
      (route) => route.step === stepNumber
    )?.path;

    if (targetPath) {
      this.router.navigate([targetPath]);
    }
  }

  private updateStepFromUrl(url: string): void {
    const cleanPath = url.split('?')[0].split('#')[0];
    const matchedStep = this.stepRoutes.find((route) =>
      cleanPath.startsWith(route.path)
    )?.step;

    this.step = matchedStep ?? 1;
  }
}
