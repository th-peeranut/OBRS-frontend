import { Dropdown } from '../interfaces/dropdown.interface';

// OBRS-1231: no option carries `isDefault` any more. DropdownObrsComponent.ngOnChanges
// finds an isDefault option and calls onChange() with it, so `isDefault` on 'นาย' did not
// mean "shown first" - it WROTE 'นาย' into the form control of every register and
// passenger-info form before the traveller touched anything. Removing Validators.required
// alone would have changed nothing on those three surfaces: the dropdown was the one
// asserting a gender, not the validator. Same trap OBRS-1185 hit on the trip-type toggle.
export const TITLE_OPTIONS: Dropdown[] = [
  { id: 1, nameThai: 'นาย', nameEnglish: 'Mr.', nameChinese: '先生' },
  { id: 2, nameThai: 'นางสาว', nameEnglish: 'Miss', nameChinese: '小姐' },
  { id: 3, nameThai: 'นาง', nameEnglish: 'Mrs.', nameChinese: '太太' },
  { id: 4, nameThai: 'เด็กชาย', nameEnglish: 'Master', nameChinese: '小弟弟' },
  { id: 5, nameThai: 'เด็กหญิง', nameEnglish: 'Miss (Child)', nameChinese: '小妹妹' },
  { id: 6, nameThai: 'ดร.', nameEnglish: 'Dr.', nameChinese: '博士' },
  { id: 7, nameThai: 'ศ.', nameEnglish: 'Professor', nameChinese: '教授' },
  { id: 8, nameThai: 'รศ.', nameEnglish: 'Associate Professor', nameChinese: '副教授' },
  { id: 9, nameThai: 'ผศ.', nameEnglish: 'Assistant Professor', nameChinese: '助理教授' },
];
