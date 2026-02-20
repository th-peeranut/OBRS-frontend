import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';

@Injectable({
  providedIn: 'root',
})
export class AlertService {
  private loadingCount = 0;
  private isLoadingVisible = false;

  success(message: string) {
    this.isLoadingVisible = false;
    return Swal.fire({ icon: 'success', title: message });
  }

  error(message: string) {
    this.isLoadingVisible = false;
    return Swal.fire({ icon: 'error', title: message });
  }

  info(message: string) {
    this.isLoadingVisible = false;
    return Swal.fire({ icon: 'info', title: message });
  }

  warning(message: string) {
    this.isLoadingVisible = false;
    return Swal.fire({ icon: 'warning', title: message });
  }

  showLoading(title = 'Loading...') {
    this.loadingCount += 1;

    if (this.isLoadingVisible) {
      return;
    }

    this.isLoadingVisible = true;
    void Swal.fire({
      title,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });
  }

  hideLoading() {
    if (this.loadingCount > 0) {
      this.loadingCount -= 1;
    }

    if (this.loadingCount === 0 && this.isLoadingVisible) {
      if (Swal.isLoading()) {
        Swal.close();
      }
      this.isLoadingVisible = false;
    }
  }
}
