import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AdminPaginatorComponent } from './admin-paginator.component';

describe('AdminPaginatorComponent', () => {
  let fixture: ComponentFixture<AdminPaginatorComponent>;
  let component: AdminPaginatorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      declarations: [AdminPaginatorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminPaginatorComponent);
    component = fixture.componentInstance;
  });

  function nav(): HTMLElement | null {
    return fixture.nativeElement.querySelector('nav.admin-paginator');
  }

  it('hides entirely when totalPages <= 1 (no "1 / 1" clutter)', () => {
    component.currentPage = 1;
    component.totalPages = 1;
    fixture.detectChanges();

    expect(nav()).withContext('paginator must not render for a single page').toBeNull();
  });

  it('renders Previous/Next and the current/total counter when totalPages > 1', () => {
    component.currentPage = 2;
    component.totalPages = 5;
    fixture.detectChanges();

    const el = nav();
    expect(el).withContext('paginator must render when there is more than one page').not.toBeNull();
    expect(el?.textContent).toContain('2 / 5');
  });

  it('disables Previous on the first page and Next on the last page', () => {
    component.currentPage = 1;
    component.totalPages = 3;
    fixture.detectChanges();

    const buttons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('button');
    expect(buttons[0].disabled).withContext('Previous must be disabled on page 1').toBeTrue();
    expect(buttons[1].disabled).withContext('Next must be enabled before the last page').toBeFalse();

    component.currentPage = 3;
    fixture.detectChanges();
    expect(buttons[0].disabled).withContext('Previous must be enabled after page 1').toBeFalse();
    expect(buttons[1].disabled).withContext('Next must be disabled on the last page').toBeTrue();
  });

  it('disables both buttons when [disabled] is true, regardless of page position', () => {
    component.currentPage = 2;
    component.totalPages = 5;
    component.disabled = true;
    fixture.detectChanges();

    const buttons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('button');
    expect(buttons[0].disabled).toBeTrue();
    expect(buttons[1].disabled).toBeTrue();
  });

  it('emits pageChange with currentPage - 1 / + 1 on Previous/Next click', () => {
    component.currentPage = 2;
    component.totalPages = 5;
    fixture.detectChanges();
    const emitted: number[] = [];
    component.pageChange.subscribe((page) => emitted.push(page));

    const buttons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('button');
    buttons[0].click();
    buttons[1].click();

    expect(emitted).toEqual([1, 3]);
  });
});
