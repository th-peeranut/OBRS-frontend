import { Component } from '@angular/core';

@Component({
  selector: 'app-stepper',
  templateUrl: './stepper.component.html',
  styleUrl: './stepper.component.scss',
})
export class StepperComponent {
  step: number = 1;

  constructor() {}

  goToStep(stepNumber: number): void {
    this.step = stepNumber;
  }
}
