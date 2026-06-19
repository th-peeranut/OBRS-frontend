import { DropdownGroupObrsComponent } from './dropdown-group-obrs.component';
import {
  createElementRefStub,
  createTranslateStub,
} from '../../../testing/test-stubs';

describe('DropdownGroupObrsComponent', () => {
  let component: DropdownGroupObrsComponent;

  beforeEach(() => {
    component = new DropdownGroupObrsComponent(
      {} as never,
      createElementRefStub(),
      createTranslateStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
