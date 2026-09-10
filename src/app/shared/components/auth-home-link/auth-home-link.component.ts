import { Component } from '@angular/core';

/**
 * OBRS-714: the exit the 8 public auth pages never had.
 *
 * They render neither `<app-navbar>` nor `<app-footer>` by design (the split
 * layout has no chrome), so the brand logo at the top was the only thing on the
 * page that LOOKS like a way home — and on all 8 it was a bare `<img>`. Seven of
 * them formed a closed set whose links only pointed at each other; a backend
 * error on `/otp/login/<phone>` left the user editing the URL by hand.
 *
 * This wraps the logo in the same `routerLink="/"` the navbar, admin-layout and
 * staff-layout already give every other page. It projects the `<img>` rather
 * than owning it, deliberately: `.logo-section .logo-img` is sized by each
 * PAGE's stylesheet, and a moved `<img>` would carry this component's
 * encapsulation attribute instead of the page's, silently dropping those rules.
 */
@Component({
  selector: 'app-auth-home-link',
  templateUrl: './auth-home-link.component.html',
  styleUrl: './auth-home-link.component.scss',
  standalone: false,
})
export class AuthHomeLinkComponent {}
