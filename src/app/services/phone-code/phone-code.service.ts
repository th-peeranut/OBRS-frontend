import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import phoneCodeData from '../../../../public/phone-code/phone-code.json';
import { PhoneCode } from '../../shared/interfaces/phone-code.interface';

@Injectable({
  providedIn: 'root',
})
export class PhoneCodeService {
  constructor(private http: HttpClient) {}

  getPhoneCode(): PhoneCode[] {
    return phoneCodeData;
  }
}
