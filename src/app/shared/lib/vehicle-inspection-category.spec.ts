import { categoryLabelKey, VEHICLE_INSPECTION_CATEGORIES } from './vehicle-inspection-category';

describe('vehicle-inspection-category', () => {
  it('lists exactly the 7 locked groups (SPEC D3), in declaration order', () => {
    expect(VEHICLE_INSPECTION_CATEGORIES).toEqual([
      'ENGINE_FLUIDS',
      'TIRES',
      'LIGHTING',
      'DRIVING',
      'CABIN',
      'SAFETY_DOCS',
      'WALKAROUND',
    ]);
  });

  it('categoryLabelKey builds the shared ADMIN.INSPECTION_ITEMS.CATEGORY.* namespace', () => {
    expect(categoryLabelKey('TIRES')).toBe('ADMIN.INSPECTION_ITEMS.CATEGORY.TIRES');
    expect(categoryLabelKey('WALKAROUND')).toBe('ADMIN.INSPECTION_ITEMS.CATEGORY.WALKAROUND');
  });
});
