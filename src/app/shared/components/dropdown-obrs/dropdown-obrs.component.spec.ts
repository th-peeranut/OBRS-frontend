import { DropdownObrsComponent } from './dropdown-obrs.component';
import {
  createElementRefStub,
  createTranslateStub,
} from '../../../testing/test-stubs';

describe('DropdownObrsComponent', () => {
  let component: DropdownObrsComponent;

  beforeEach(() => {
    component = new DropdownObrsComponent(
      {} as never,
      createElementRefStub(),
      createTranslateStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
