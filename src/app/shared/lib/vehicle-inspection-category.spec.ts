import {
  categoryLabelKey,
  groupContiguousByCategory,
  VEHICLE_INSPECTION_CATEGORIES,
} from './vehicle-inspection-category';

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

  // OBRS-553: this is the ONE shared implementation behind both
  // inspection-page.mappers.ts's groupRowsByCategory (OBRS-530) and
  // vehicle-inspection.mappers.ts's groupDetailRowsByCategory — pinned here
  // directly so a future edit to the walk itself is caught regardless of
  // which caller's spec happens to run.
  describe('groupContiguousByCategory', () => {
    interface Row {
      id: number;
      cat: string;
    }
    const categoryOf = (row: Row) => row.cat;

    it('partitions an already-sorted flat array into contiguous runs', () => {
      const rows: Row[] = [
        { id: 1, cat: 'ENGINE_FLUIDS' },
        { id: 2, cat: 'ENGINE_FLUIDS' },
        { id: 3, cat: 'TIRES' },
      ];

      const groups = groupContiguousByCategory(rows, categoryOf);

      expect(groups.map((g) => g.category)).toEqual(['ENGINE_FLUIDS', 'TIRES']);
      expect(groups[0].labelKey).toBe('ADMIN.INSPECTION_ITEMS.CATEGORY.ENGINE_FLUIDS');
      expect(groups[0].rows.map((r) => r.row.id)).toEqual([1, 2]);
      expect(groups[1].rows.map((r) => r.row.id)).toEqual([3]);
    });

    // The regression this whole function exists to prevent: a filter()-per-
    // category rewrite (`rows.filter(r => categoryOf(r) === c).map((row, i)
    // => ({row, flatIndex: i}))`) produces IDENTICAL groups/labels to the
    // assertion above, so that assertion alone cannot catch a regression to
    // filter(). Only the flatIndex sequence below can: filter() resets it to
    // 0 at every group boundary ([0, 1, 0, 1, 0] for this 5-row, 3-category
    // fixture), while the correct walk carries a running count ([0..4]).
    it('carries a running flatIndex across group boundaries — never resets per group', () => {
      const rows: Row[] = [
        { id: 15, cat: 'CABIN' },
        { id: 17, cat: 'CABIN' },
        { id: 16, cat: 'SAFETY_DOCS' },
        { id: 18, cat: 'SAFETY_DOCS' },
        { id: 22, cat: 'WALKAROUND' },
      ];

      const groups = groupContiguousByCategory(rows, categoryOf);
      const flattened = groups.flatMap((g) => g.rows);

      expect(flattened.map((r) => r.flatIndex)).toEqual([0, 1, 2, 3, 4]);
      expect(flattened.map((r) => r.row.id)).toEqual(rows.map((r) => r.id));
    });

    it('a repeated (non-contiguous) category value starts a NEW group, not merging back into the earlier one', () => {
      // Guards the "contiguous RUN" semantics specifically: if category
      // codes ever appear out of a stable sort (a caller bug upstream), two
      // separated runs of the same code must stay two groups, not merge.
      const rows: Row[] = [
        { id: 1, cat: 'TIRES' },
        { id: 2, cat: 'CABIN' },
        { id: 3, cat: 'TIRES' },
      ];

      const groups = groupContiguousByCategory(rows, categoryOf);

      expect(groups.length).toBe(3);
      expect(groups.map((g) => g.category)).toEqual(['TIRES', 'CABIN', 'TIRES']);
    });

    it('an empty input produces no groups', () => {
      expect(groupContiguousByCategory<Row>([], categoryOf)).toEqual([]);
    });
  });
});
