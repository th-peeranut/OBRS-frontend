import {
  SegmentRow,
  formatDuration,
  formatFare,
  formatStatusLabel,
  normalizeDurationForSave,
  normalizeDurationMinutes,
  normalizeFareForSave,
  normalizeVehicleTypeKey,
  parseStatus,
  statusClass,
  toRouteDtoFallback,
  toRoutePayload,
  toRouteRow,
  toRouteStatusOptions,
  toSegmentGroups,
  toSegmentPivotRows,
  toSegmentUpdatePayload,
  toSegments,
  toStopName,
  toStopPoints,
  toVehicleTypeOptions,
} from './routes.mappers';
import { AdminLookupDto, AdminRouteDto, AdminRouteStopDto, AdminSegmentDto } from '../../../../services/admin/admin-api.service';

describe('routes.mappers', () => {
  describe('statusClass', () => {
    it('maps ACTIVE to is-success', () => {
      expect(statusClass('active')).toBe('is-success');
      expect(statusClass('ACTIVE')).toBe('is-success');
    });

    it('maps SUSPENDED / TEMPORARILY_CLOSED / *PENDING* to is-warning', () => {
      expect(statusClass('suspended')).toBe('is-warning');
      expect(statusClass('temporarily_closed')).toBe('is-warning');
      expect(statusClass('approval_pending')).toBe('is-warning');
    });

    it('falls back to is-danger for anything else', () => {
      expect(statusClass('decommissioned')).toBe('is-danger');
      expect(statusClass('unknown')).toBe('is-danger');
    });
  });

  describe('formatFare', () => {
    it('formats to two decimal places', () => {
      expect(formatFare(12)).toBe('12.00');
      expect(formatFare(12.345)).toBe('12.35');
      expect(formatFare(0)).toBe('0.00');
    });
  });

  describe('formatStatusLabel', () => {
    it('replaces underscores with spaces and upper-cases', () => {
      expect(formatStatusLabel('temporarily_closed')).toBe('TEMPORARILY CLOSED');
      expect(formatStatusLabel('active')).toBe('ACTIVE');
    });
  });

  describe('formatDuration', () => {
    it('returns "-" for missing/non-finite values', () => {
      expect(formatDuration(null, 'en')).toBe('-');
      expect(formatDuration(undefined, 'en')).toBe('-');
      expect(formatDuration(Number.NaN, 'en')).toBe('-');
    });

    it('formats zero minutes', () => {
      expect(formatDuration(0, 'en')).toBe('0 min');
      expect(formatDuration(0, 'th')).toBe('0 นาที');
    });

    it('formats minutes only (en/th)', () => {
      expect(formatDuration(45, 'en')).toBe('45 min');
      expect(formatDuration(45, 'th')).toBe('45 นาที');
    });

    it('formats hours only, no remainder (en/th)', () => {
      expect(formatDuration(120, 'en')).toBe('2 hr');
      expect(formatDuration(120, 'th')).toBe('2 ชม.');
    });

    it('formats hours + minutes (en/th)', () => {
      expect(formatDuration(125, 'en')).toBe('2 hr 5 min');
      expect(formatDuration(125, 'th')).toBe('2 ชม. 5 นาที');
    });

    it('rounds and clamps negative values to zero', () => {
      expect(formatDuration(-10, 'en')).toBe('0 min');
      expect(formatDuration(59.6, 'en')).toBe('1 hr');
    });
  });

  describe('normalizeVehicleTypeKey', () => {
    it('trims and lower-cases', () => {
      expect(normalizeVehicleTypeKey('  VAN  ')).toBe('van');
    });

    it('returns empty string for null/undefined', () => {
      expect(normalizeVehicleTypeKey(null)).toBe('');
      expect(normalizeVehicleTypeKey(undefined)).toBe('');
    });
  });

  describe('normalizeDurationMinutes', () => {
    it('returns null for missing/non-finite values', () => {
      expect(normalizeDurationMinutes(null)).toBeNull();
      expect(normalizeDurationMinutes(undefined)).toBeNull();
      expect(normalizeDurationMinutes(Number.NaN)).toBeNull();
    });

    it('rounds and clamps negative values to zero', () => {
      expect(normalizeDurationMinutes(-5)).toBe(0);
      expect(normalizeDurationMinutes(4.5)).toBe(5);
      expect(normalizeDurationMinutes(0)).toBe(0);
    });
  });

  describe('normalizeFareForSave', () => {
    it('clamps non-finite or non-positive values to 0.01', () => {
      expect(normalizeFareForSave(Number.NaN)).toBe(0.01);
      expect(normalizeFareForSave(0)).toBe(0.01);
      expect(normalizeFareForSave(-5)).toBe(0.01);
    });

    it('rounds to two decimal places otherwise', () => {
      expect(normalizeFareForSave(12.345)).toBe(12.35);
      expect(normalizeFareForSave(9.999)).toBe(10);
    });
  });

  describe('normalizeDurationForSave', () => {
    it('clamps non-finite or non-positive values to 1', () => {
      expect(normalizeDurationForSave(Number.NaN)).toBe(1);
      expect(normalizeDurationForSave(0)).toBe(1);
      expect(normalizeDurationForSave(-5)).toBe(1);
    });

    it('rounds otherwise', () => {
      expect(normalizeDurationForSave(4.5)).toBe(5);
      expect(normalizeDurationForSave(10)).toBe(10);
    });
  });

  describe('parseStatus', () => {
    it('parses a plain string status', () => {
      expect(parseStatus('active', 'en')).toEqual({ code: 'active', name: 'ACTIVE' });
    });

    it('falls back to "unknown" for missing value', () => {
      expect(parseStatus(undefined, 'en').code).toBe('unknown');
    });
  });

  describe('toStopName', () => {
    it('prefers a localized translation over the raw slug/code', () => {
      const stop = {
        slug: 'central-station',
        translations: [
          { locale: 'en', label: 'Central Station' },
          { locale: 'th', label: 'สถานีกลาง' },
        ],
      };
      expect(toStopName(stop, 'en')).toBe('Central Station');
      expect(toStopName(stop, 'th')).toBe('สถานีกลาง');
    });

    it('falls back to slug/code, then "-", when no translation matches', () => {
      expect(toStopName({ slug: 'raw-slug', translations: [] }, 'en')).toBe('raw-slug');
      expect(toStopName(undefined, 'en')).toBe('-');
    });
  });

  describe('toRouteDtoFallback', () => {
    it('maps a RouteRow back into an AdminRouteDto shape', () => {
      const dto = toRouteDtoFallback({
        id: 1,
        slug: 'a-b',
        label: 'A to B',
        description: '-',
        status: 'ACTIVE',
        statusCode: 'active',
        updatedAt: '-',
      });

      expect(dto).toEqual({
        id: 1,
        slug: 'a-b',
        status: 'active',
        translations: [{ locale: 'en', label: 'A to B', description: undefined }],
      });
    });

    it('preserves a real description (only "-" is treated as absent)', () => {
      const dto = toRouteDtoFallback({
        id: 2,
        slug: 'c-d',
        label: 'C to D',
        description: 'Scenic route',
        status: 'ACTIVE',
        statusCode: 'active',
        updatedAt: '-',
      });

      expect(dto.translations).toEqual([
        { locale: 'en', label: 'C to D', description: 'Scenic route' },
      ]);
    });
  });

  describe('toRouteRow', () => {
    const baseRoute: AdminRouteDto = {
      id: 10,
      slug: 'x-y',
      status: 'active',
      translations: [
        { locale: 'en', label: 'X to Y', description: 'EN desc' },
        { locale: 'th', label: 'เอ็กซ์ ไป วาย', description: 'TH desc' },
      ],
      updatedAt: '2026-07-01T03:00:00Z',
    };

    it('localizes label/description/status per locale', () => {
      const rowEn = toRouteRow(baseRoute, 'en', 'en');
      expect(rowEn.label).toBe('X to Y');
      expect(rowEn.description).toBe('EN desc');
      expect(rowEn.statusCode).toBe('active');

      const rowTh = toRouteRow(baseRoute, 'th', 'th');
      expect(rowTh.label).toBe('เอ็กซ์ ไป วาย');
      expect(rowTh.description).toBe('TH desc');
    });

    it('falls back to slug and "-" when a translation is missing', () => {
      const sparse: AdminRouteDto = { id: 11, slug: 'bare-slug', status: 'suspended' };
      const row = toRouteRow(sparse, 'en', 'en');
      expect(row.label).toBe('bare-slug');
      expect(row.description).toBe('-');
      expect(row.statusCode).toBe('suspended');
    });
  });

  describe('toRouteStatusOptions', () => {
    it('includes the known route statuses by default', () => {
      const options = toRouteStatusOptions([], [], 'en');
      const codes = options.map((o) => o.code);
      expect(codes).toEqual(
        jasmine.arrayContaining(['active', 'suspended', 'temporarily_closed', 'decommissioned'])
      );
    });

    it('overrides a known status label with a localized lookup translation', () => {
      const lookups: AdminLookupDto[] = [
        {
          id: 1,
          category: 'route_status',
          slug: 'active',
          translations: [{ locale: 'th', label: 'ใช้งาน' }],
        },
      ];
      const options = toRouteStatusOptions(lookups, [], 'th');
      const active = options.find((o) => o.code === 'active');
      expect(active?.label).toBe('ใช้งาน');
    });

    it('adds an unrecognized route status found only on a route DTO', () => {
      const routes: AdminRouteDto[] = [{ id: 1, slug: 'r1', status: 'archived' }];
      const options = toRouteStatusOptions([], routes, 'en');
      expect(options.some((o) => o.code === 'archived')).toBeTrue();
    });
  });

  describe('toStopPoints', () => {
    const labels = { origin: 'Origin', terminal: 'Terminal' };

    it('returns [] when there are no stops', () => {
      expect(toStopPoints(undefined, 'en', labels)).toEqual([]);
      expect(toStopPoints({ stops: [] }, 'en', labels)).toEqual([]);
    });

    it('sorts by stopOrder and labels only the first/last stop', () => {
      const routeStops: AdminRouteStopDto = {
        stops: [
          { stopOrder: 2, stop: { slug: 'mid', translations: [{ locale: 'en', label: 'Mid' }] } },
          { stopOrder: 1, stop: { slug: 'start', translations: [{ locale: 'en', label: 'Start' }] } },
          { stopOrder: 3, stop: { slug: 'end', translations: [{ locale: 'en', label: 'End' }] } },
        ],
      };

      const points = toStopPoints(routeStops, 'en', labels);
      expect(points.map((p) => p.slug)).toEqual(['start', 'mid', 'end']);
      expect(points[0].label).toBe('Origin');
      expect(points[1].label).toBeUndefined();
      expect(points[2].label).toBe('Terminal');
    });

    it('defaults missing distance/offset to 0', () => {
      const routeStops: AdminRouteStopDto = {
        stops: [{ stopOrder: 1, stop: { slug: 'only' } }],
      };
      const [point] = toStopPoints(routeStops, 'en', labels);
      expect(point.distance).toBe('0 km');
      expect(point.duration).toBe('0 mins');
      expect(point.offsetMinutesFromOrigin).toBe(0);
    });
  });

  describe('toSegments', () => {
    it('returns [] when there are no stop pairs', () => {
      expect(toSegments(undefined, 'en')).toEqual([]);
      expect(toSegments({ stopPairs: [] }, 'en')).toEqual([]);
    });

    it('maps a stop pair, formatting duration and defaulting a missing fare to 0', () => {
      const response: AdminSegmentDto = {
        stopPairs: [
          {
            segmentId: 7,
            fromStop: { slug: 'a', name: 'A' },
            toStop: { slug: 'b', name: 'B' },
            fare: '25.50',
            estimatedDurationMinutes: 90,
            vehicleType: { slug: 'van', name: 'Van' },
          },
        ],
      };

      const [segment] = toSegments(response, 'en');
      expect(segment).toEqual({
        id: 7,
        origin: 'A',
        destination: 'B',
        fare: 25.5,
        duration: '1 hr 30 min',
        estimatedDurationMinutes: 90,
        fromStopSlug: 'a',
        toStopSlug: 'b',
        vehicleTypeSlug: 'van',
        vehicleTypeName: 'Van',
      });
    });

    it('falls back to slug for origin/destination and "-" when both are missing, and defaults id by index', () => {
      const response: AdminSegmentDto = {
        stopPairs: [{}],
      };
      const [segment] = toSegments(response, 'en');
      expect(segment.id).toBe(1);
      expect(segment.origin).toBe('-');
      expect(segment.destination).toBe('-');
      expect(segment.fare).toBe(0);
      expect(segment.vehicleTypeName).toBe('-');
    });
  });

  describe('toVehicleTypeOptions', () => {
    it('de-duplicates by normalized vehicle type slug', () => {
      const segments: SegmentRow[] = [
        {
          id: 1,
          origin: 'A',
          destination: 'B',
          fare: 1,
          duration: '-',
          estimatedDurationMinutes: null,
          fromStopSlug: 'a',
          toStopSlug: 'b',
          vehicleTypeSlug: 'VAN',
          vehicleTypeName: 'Van',
        },
        {
          id: 2,
          origin: 'B',
          destination: 'C',
          fare: 1,
          duration: '-',
          estimatedDurationMinutes: null,
          fromStopSlug: 'b',
          toStopSlug: 'c',
          vehicleTypeSlug: ' van ',
          vehicleTypeName: 'Van (dup)',
        },
        {
          id: 3,
          origin: 'C',
          destination: 'D',
          fare: 1,
          duration: '-',
          estimatedDurationMinutes: null,
          fromStopSlug: 'c',
          toStopSlug: 'd',
          vehicleTypeSlug: '',
          vehicleTypeName: 'Ignored',
        },
      ];

      const options = toVehicleTypeOptions(segments);
      expect(options.length).toBe(1);
      expect(options[0]).toEqual({ slug: 'VAN', name: 'Van' });
    });
  });

  describe('toRoutePayload', () => {
    it('always includes the en translation and trims/lower-cases slug and status', () => {
      const payload = toRoutePayload({
        slug: '  A-B  ',
        status: ' Active ',
        enLabel: ' A to B ',
        enDescription: '  ',
        thLabel: '',
        thDescription: '',
      });

      expect(payload.slug).toBe('a-b');
      expect(payload.status).toBe('active');
      expect(payload.translations).toEqual([
        { locale: 'en', label: 'A to B', description: undefined },
      ]);
    });

    it('adds a th translation only when thLabel is non-empty', () => {
      const payload = toRoutePayload({
        slug: 'a-b',
        status: 'active',
        enLabel: 'A to B',
        enDescription: '',
        thLabel: 'เอ ถึง บี',
        thDescription: 'คำอธิบาย',
      });

      expect(payload.translations.length).toBe(2);
      expect(payload.translations[1]).toEqual({
        locale: 'th',
        label: 'เอ ถึง บี',
        description: 'คำอธิบาย',
      });
    });
  });

  describe('toSegmentUpdatePayload', () => {
    const segments: SegmentRow[] = [
      {
        id: 1,
        origin: 'A',
        destination: 'B',
        fare: 10,
        duration: '-',
        estimatedDurationMinutes: 30,
        fromStopSlug: 'a',
        toStopSlug: 'b',
        vehicleTypeSlug: 'van',
        vehicleTypeName: 'Van',
      },
      {
        id: 2,
        origin: 'B',
        destination: 'C',
        fare: 15,
        duration: '-',
        estimatedDurationMinutes: 20,
        fromStopSlug: 'b',
        toStopSlug: 'c',
        vehicleTypeSlug: 'van',
        vehicleTypeName: 'Van',
      },
      {
        id: 3,
        origin: 'X',
        destination: 'Y',
        fare: 99,
        duration: '-',
        estimatedDurationMinutes: 5,
        fromStopSlug: 'x',
        toStopSlug: 'y',
        vehicleTypeSlug: 'minibus',
        vehicleTypeName: 'Minibus',
      },
    ];

    it('only includes stop pairs of the same vehicle type as the edited segment', () => {
      const payload = toSegmentUpdatePayload(segments[0], 'a', 'b2', 12, 40, segments, 'route-1');

      expect(payload.route).toBe('route-1');
      expect(payload.vehicleType).toBe('van');
      expect(payload.stopPairs.length).toBe(2);
      expect(payload.stopPairs.map((p) => p.toStop)).toEqual(['b2', 'c']);
    });

    it('applies normalized fare/duration only to the edited stop pair, leaving others untouched', () => {
      const payload = toSegmentUpdatePayload(segments[0], 'a', 'b', -5, 0, segments, 'route-1');

      const edited = payload.stopPairs[0];
      const untouched = payload.stopPairs[1];
      expect(edited.fare).toBe(0.01); // clamped
      expect(edited.estimatedDurationMinutes).toBe(1); // clamped
      expect(untouched.fare).toBe(15);
      expect(untouched.estimatedDurationMinutes).toBeUndefined();
    });
  });

  // ── OBRS-1027: vehicle-type pivot + origin grouping ─────────────────────
  describe('toSegmentPivotRows / toSegmentGroups', () => {
    const VEHICLE_TYPES = [
      { slug: 'van', name: 'Van' },
      { slug: 'minibus', name: 'Minibus' },
    ];

    function pivotSegment(overrides: Partial<SegmentRow> = {}): SegmentRow {
      return {
        id: 1,
        origin: 'Alpha',
        destination: 'Beta',
        fare: 100,
        duration: '20 mins',
        estimatedDurationMinutes: 20,
        fromStopSlug: 'alpha',
        toStopSlug: 'beta',
        vehicleTypeSlug: 'van',
        vehicleTypeName: 'Van',
        ...overrides,
      };
    }

    it('collapses the two vehicle types of one stop pair into a SINGLE row with one cell each', () => {
      const rows = toSegmentPivotRows(
        [
          pivotSegment({ id: 1, vehicleTypeSlug: 'van', fare: 100 }),
          // Same pair, other type. The ids differ because the backend
          // regenerates them on every save, so they must not key the pair.
          pivotSegment({
            id: 99,
            vehicleTypeSlug: 'minibus',
            vehicleTypeName: 'Minibus',
            fare: 140,
          }),
        ],
        VEHICLE_TYPES
      );

      expect(rows.length).toBe(1);
      expect(rows[0].fares.map((cell) => cell.segment?.fare)).toEqual([100, 140]);
    });

    it('leaves the cell null (NOT a zero fare) for a vehicle type with no row for the pair', () => {
      const rows = toSegmentPivotRows(
        [pivotSegment({ vehicleTypeSlug: 'van', fare: 100 })],
        VEHICLE_TYPES
      );

      expect(rows[0].fares[0].segment?.fare).toBe(100);
      expect(rows[0].fares[1].segment)
        .withContext('a missing vehicle type must be null so the view can say "not set"')
        .toBeNull();
    });

    it('keeps two pairs that share a destination NAME apart when their slugs differ', () => {
      const rows = toSegmentPivotRows(
        [
          pivotSegment({ id: 1, fromStopSlug: 'alpha', toStopSlug: 'beta-1', destination: 'Beta' }),
          pivotSegment({ id: 2, fromStopSlug: 'alpha', toStopSlug: 'beta-2', destination: 'Beta' }),
        ],
        VEHICLE_TYPES
      );

      expect(rows.length).toBe(2);
    });

    it('takes the duration from the first vehicle type that actually carries one', () => {
      const rows = toSegmentPivotRows(
        [
          // formatDuration renders a null duration as '-'; the other type's real
          // value must win rather than whichever segment arrived first.
          pivotSegment({ id: 1, vehicleTypeSlug: 'van', duration: '-' }),
          pivotSegment({
            id: 2,
            vehicleTypeSlug: 'minibus',
            vehicleTypeName: 'Minibus',
            duration: '45 mins',
          }),
        ],
        VEHICLE_TYPES
      );

      expect(rows[0].duration).toBe('45 mins');
    });

    it('groups rows under their origin slug in first-seen order', () => {
      const rows = toSegmentPivotRows(
        [
          pivotSegment({ id: 1, fromStopSlug: 'alpha', origin: 'Alpha', toStopSlug: 'beta' }),
          pivotSegment({ id: 2, fromStopSlug: 'gamma', origin: 'Gamma', toStopSlug: 'delta' }),
          pivotSegment({ id: 3, fromStopSlug: 'alpha', origin: 'Alpha', toStopSlug: 'delta' }),
        ],
        VEHICLE_TYPES
      );

      const groups = toSegmentGroups(rows, VEHICLE_TYPES);

      expect(groups.map((group) => group.originSlug)).toEqual(['alpha', 'gamma']);
      expect(groups[0].rows.length).toBe(2);
      expect(groups[1].rows.length).toBe(1);
    });

    it('summarises a per-vehicle-type fare range per group, ignoring the absent type', () => {
      const rows = toSegmentPivotRows(
        [
          pivotSegment({ id: 1, toStopSlug: 'beta', fare: 100, vehicleTypeSlug: 'van' }),
          pivotSegment({ id: 2, toStopSlug: 'delta', fare: 260, vehicleTypeSlug: 'van' }),
          pivotSegment({
            id: 3,
            toStopSlug: 'beta',
            fare: 140,
            vehicleTypeSlug: 'minibus',
            vehicleTypeName: 'Minibus',
          }),
        ],
        VEHICLE_TYPES
      );

      const [group] = toSegmentGroups(rows, VEHICLE_TYPES);

      expect(group.fareRanges[0]).toEqual(
        jasmine.objectContaining({ vehicleTypeSlug: 'van', min: 100, max: 260 })
      );
      // Only ONE minibus fare exists in the group, so min === max — and the
      // van-only pair must not drag the minibus range to 0.
      expect(group.fareRanges[1]).toEqual(
        jasmine.objectContaining({ vehicleTypeSlug: 'minibus', min: 140, max: 140 })
      );
    });

    it('reports a null range (not 0) for a vehicle type with no fare in the group', () => {
      const rows = toSegmentPivotRows([pivotSegment({ vehicleTypeSlug: 'van' })], VEHICLE_TYPES);

      const [group] = toSegmentGroups(rows, VEHICLE_TYPES);

      expect(group.fareRanges[1].min).toBeNull();
      expect(group.fareRanges[1].max).toBeNull();
    });

    it('returns no rows and no groups for an empty segment list', () => {
      expect(toSegmentPivotRows([], VEHICLE_TYPES)).toEqual([]);
      expect(toSegmentGroups([], VEHICLE_TYPES)).toEqual([]);
    });
  });
});
