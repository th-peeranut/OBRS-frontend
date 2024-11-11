import { Component, ElementRef, HostListener, Renderer2, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../auth/auth.service';
import { Location } from '@angular/common';
import { RolesService } from '../../services/roles/roles.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  isDropdownOpen = false;
  currentLanguage: string = 'th';
  
  loginForm: FormGroup;

  @ViewChild('dropdownButton', { static: true }) dropdownButton!: ElementRef;

   constructor(
    private translate: TranslateService,
    private renderer: Renderer2,
    private elementRef: ElementRef,
    private fb: FormBuilder,
    private service: AuthService,
    private toastr: ToastrService,
    private location: Location,
    private roleService: RolesService
  ) {
    this.translate.setDefaultLang('th');
    this.translate.use('th');

    this.creatForm();
  }

  switchLanguage(lang: string) {
    this.isDropdownOpen = false;
    this.currentLanguage = lang;
    this.translate.use(lang);
  }

  toggleDropdown() {
    this.isDropdownOpen = !this.isDropdownOpen;

    if (this.isDropdownOpen) {
      this.renderer.listen('document', 'click', (event: Event) => this.handleOutsideClick(event));
    }
  }

  handleOutsideClick(event: Event) {
    const targetElement = event.target as HTMLElement;
    const clickedInsideDropdown = this.elementRef.nativeElement.contains(targetElement);
    const clickedDropdownButton = this.dropdownButton.nativeElement.contains(targetElement);

    if (clickedInsideDropdown && clickedDropdownButton) {
      this.isDropdownOpen = true;
    }else{
      this.isDropdownOpen = false;
    }
  }

  creatForm(){
    this.loginForm = this.fb.group({
      email: ["", [Validators.required, Validators.email]],
      password: ["", Validators.required],
      rememberMe: [false, Validators.required]
    });
  }

  async login(){
    this.loginForm.markAllAsTouched();

    if(this.loginForm.valid){
      const payload = this.loginForm.value;
      const res = await this.service.login(payload)

      if(res){
        this.toastr.success('เข้าสู่ระบบสำเร็จ');

        this.roleService.getRoles();
        // this.location.back();
      }else{
        this.toastr.error('พบข้อผิดพลาด เข้าสู่ระบบไม่สำเร็จ');
      }
    }
  }
}
