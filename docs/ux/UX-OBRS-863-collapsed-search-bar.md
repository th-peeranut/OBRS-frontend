# UX/UI decision — OBRS-863 · Collapsed search summary on the results page

Branch `ao/obrs-863-collapsible-search-bar`. Governed by `docs/design-system.md`
(§2 tokens, §4 button roles, §5 shape, §9 i18n, §11 rubric). No raw hex below —
every colour is a token from `src/styles/variables.scss` or
`src/styles/_dark-tokens.scss`.

Short on purpose. This card adds no route, no component, no store surface and no
API call; it adds **one boolean and one bar** to a component that already existed.
The long-form sibling spec is `UX-OBRS-862-date-strip.md`, which introduced a
whole component and earned its length.

---

## 1. What changed

`/schedule-booking` rendered `app-schedule-booking-filter` fully expanded on
arrival — the same form the customer had just filled in on `/home`. It now
renders as a one-line summary of that search, with a control that opens the
original form in place.

```
ScheduleBookingComponent (unchanged html)
  app-navbar
  app-stepper
  app-schedule-booking-filter      ◄── only this component changed
      button.search-summary        ◄── NEW: summary + disclosure toggle, always rendered
      app-station-load-error       ◄── moved ABOVE the disclosure (see §4)
      @if (isExpanded) { …the existing form, unmodified… }
  app-schedule-booking-day-strip
  app-schedule-booking-list
  app-footer
```

No new files. No new NgRx action, reducer or selector.

## 2. States

| State | Bar | Form | Trigger |
|---|---|---|---|
| collapsed (default once a search exists) | route · date(s) · seats + **แก้ไข / Edit** | not rendered | arrival, and after a successful search |
| expanded | same summary + **ย่อ / Collapse** | rendered | pressing the bar |
| no search yet | `SEARCH_SUMMARY_EMPTY` | rendered | nothing in the store to summarise |

The third row is the one worth stating: the bar collapses only once a summary
actually resolves. A customer who reaches this route directly gets the form, not
an empty strip above an empty page. The decision is taken **once** — a later
`scheduleFilter` emission (the day strip writes one on every tap) must not reopen
a bar the customer just closed.

## 3. Where the summary's values come from

`selectScheduleFilter` + `selectProvinceWithStation`, resolved through
`getStationFallbackLabel` with the same `'en' | 'th'` narrowing
`ScheduleBookingListComponent.normalizeLocale()` uses, and dates through
`formatDayChip` — the same formatter the day strip renders its chips with.

Deliberately **not** the form controls. The form holds what the customer is
part-way through editing; the list below holds what the last search returned. A
bar fed from the form could say one thing while the trips said another, which is
the single failure this bar must not have.

## 4. `app-station-load-error` moved out of the disclosure

It used to sit between the two halves of the form. Collapsed is now the default,
so leaving it there would hide the only signal that the station call failed from
exactly the customer about to find both dropdowns empty (OBRS-1222 / OBRS-642).
It is now a sibling of the bar and renders in both states.

## 5. Tokens and contrast

| Element | Light | Dark |
|---|---|---|
| bar border | `$text-lightblack` (4.60:1 on white — it is the only thing marking the control's bounds, same reasoning as the day-strip chip) | `$dk-text-muted` (`$dk-border` is a hairline that composites to 1.29:1 and cannot carry the 3:1 floor) |
| bar fill | `$primary-white` | `$dk-bg-card` |
| route text | `$text-black` | `$dk-text` |
| date / seats | `$text-lightblack` | `$dk-text-muted` |
| Edit / Collapse | `$primary-blue` + underline | `$dk-accent` + underline |

The action is underlined as well as coloured, so it is not carried by hue alone.

## 6. Accessibility

The bar IS the button — one `<button type="button">` spanning the full width, so
the whole strip is the tap target and the 44px floor is cleared without a second
element. It carries `aria-expanded`, which is the accessible contract of a
disclosure, on the element that is actually pressed. There is no `aria-controls`:
the panel it would name does not exist in the DOM while collapsed.

## 7. The measurement (AC#5)

`e2e/tests/obrs-863-capture.spec.ts`, two trees served at once, 390×664:

| | first trip card top | viewport | above the fold |
|---|---|---|---|
| BEFORE (`origin/dev` b9c4f7c3) | **983px** | 664px | no |
| AFTER | **610px** | 664px | yes |

Collapsing the form alone got it to 690px — still 26px short. The rest came from
the card's own frame: `.booking-card` carries 32px of margin above and below plus
16px of padding, sized for a form, around what is now a 65px bar. The collapsed
state gives that frame up (`.booking-section .booking-card.is-collapsed`); the
expanded state keeps it unchanged.
