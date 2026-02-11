import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';

@Injectable({
  providedIn: 'root',
})
export class AlertService {
  success(message: string) {
    return Swal.fire({ icon: 'success', title: message });
  }

  error(message: string) {
    return Swal.fire({ icon: 'error', title: message });
  }

  info(message: string) {
    return Swal.fire({ icon: 'info', title: message });
  }

  warning(message: string) {
    return Swal.fire({ icon: 'warning', title: message });
  }
}
