import { gui } from '@golemui/gui-shared';
import type { DxRuntimeParams } from '@golemui/gui-shared';
import { buildSummary } from './summary';
import { emptyTrip, type Trip } from './types';

/** Two empty stops so the map and repeater have something to show on load. */
export const initialData = { trip: emptyTrip(2) };

const header = [
  '# Addresses → Live map',
  '',
  'Type one or more addresses: each one drops a numbered pin on the map.',
  'With two or more points the **real driving route** is calculated (OSRM).',
  'Drag any pin to adjust its coordinates.',
].join('\n');

const readTrip = (params: DxRuntimeParams): Trip | undefined =>
  (params?.$form as { trip?: Trip } | undefined)?.trip;

export const formDef = [
  gui.displays.custom('routeSummary', { props: { md: header } }, ['intro']),

  gui.layouts.grid(
    [
      gui.layouts.verticalFlex(
        [
          gui.inputs.repeater('trip.stops', {
            label: 'Route stops',
            addLabel: 'Add stop',
            removeLabel: 'Remove',
            addButtonIcon: 'add_location_alt',
            removeButtonIcon: 'delete',
            title: 'Stop',
            template: [
              gui.layouts.flex([
                gui.inputs.custom(
                  'addressAutocomplete',
                  'place',
                  {
                    // Writes inside a repeater don't trigger a global recompute,
                    // so this fires an event the app turns into a "kick" that
                    // refreshes the sibling map + summary. See App.tsx.
                    onChange: 'tripChanged',
                    props: { placeholder: 'Type an address…', lang: 'en' },
                  },
                ),
              ]),
            ],
          }),
          // Reactive summary (recomputes on every form recompute).
          gui.displays.custom(
            'routeSummary',
            (params: DxRuntimeParams) => ({
              uid: 'tripSummary',
              props: { md: buildSummary(readTrip(params)) },
            }),
            ['summary'],
          ),
        ],
        { gap: 16 },
        ['panel'],
      ),

      // Map reads its stops from a reactive runtime prop.
      gui.inputs.custom(
        'routeMap',
        'trip',
        (params: DxRuntimeParams) => ({
          uid: 'routeMap',
          props: { height: 520, stops: readTrip(params)?.stops ?? [] },
        }),
      ),
    ],
    { direction: 'row', autoFit: true },
  ),
];
