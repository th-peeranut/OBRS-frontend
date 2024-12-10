import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import {
  NgxOtpInputComponent,
  NgxOtpInputComponentOptions,
} from 'ngx-otp-input';

@Component({
  selector: 'app-otp',
  templateUrl: './otp.component.html',
  styleUrl: './otp.component.scss',
  standalone: true,
  imports: [NgxOtpInputComponent],
})
export class OtpComponent implements OnChanges {
  @Input() disabled: boolean = false;
  @Output() otpCode = new EventEmitter<string>();

  otpOptions: NgxOtpInputComponentOptions = {
    otpLength: 6,
    autoFocus: true,
    autoBlur: false,
    hideInputValues: false,
    inputMode: 'numeric',
    regexp: /^[0-9]+$/,
  };

  ngOnChanges(changes: SimpleChanges) {}
}
