import { Injectable } from '@angular/core';
import Swal, { SweetAlertIcon } from 'sweetalert2';

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

  toast(message: string, icon: SweetAlertIcon = 'info'): void {
    const Toast = Swal.mixin({
      toast: true,
      position: 'top-end',
      icon,
      title: message,
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
      didOpen: (toast) => {
        toast.onmouseenter = Swal.stopTimer;
        toast.onmouseleave = Swal.resumeTimer;
      },
    });
    void Toast.fire();
  }

  async confirm(options: {
    title: string;
    text: string;
    confirmButtonText: string;
    cancelButtonText: string;
    icon?: SweetAlertIcon;
  }): Promise<boolean> {
    this.isLoadingVisible = false;
    const result = await Swal.fire({
      icon: options.icon ?? 'warning',
      title: options.title,
      text: options.text,
      showCancelButton: true,
      confirmButtonText: options.confirmButtonText,
      cancelButtonText: options.cancelButtonText,
      reverseButtons: true,
      focusCancel: true,
    });

    return result.isConfirmed;
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
