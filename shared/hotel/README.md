# Hotel booking core

The parts of the hotel booking demos that don't depend on how the UI is made:
the hotel's OpenAPI contract, pricing and business rules, the mock hotel API,
and the GolemUI form generator and slicer. The paths here mirror where each file
lands inside a demo.

```
shared/src/hotel-api.ts          the OpenAPI contract
shared/src/contract.ts           request schemas and field descriptions read from it
shared/src/pricing.ts            pricing + cross-field business rules
shared/src/forms.ts              slices a generated GolemUI form to the asked fields   (GolemUI demos only)
shared/scripts/generate-forms.ts OpenAPI → GolemUI forms, `npm run forms`            (GolemUI demos only)
server/src/hotel-service.ts      the in-memory mock hotel API
server/src/env.ts                loads .env / ANTHROPIC_API_KEY
```

Each demo must open on its own in StackBlitz, so it can't import from here.
`npm run sync` (root) copies these files into the demos listed in
`scripts/sync-shared.mjs`, read-only and with a banner. The pre-commit hook runs
it, and CI fails if a copy is out of date. Edit the files here, never the copies.

After changing the contract or the generator, run `npm run sync` and then
`npm run hotel:forms` (root) to regenerate the checked-in forms of every demo
that uses them. Each demo's `shared/forms/*.json` is generated, not synced.

`npm run hotel:typecheck` (root) type-checks the sources here with
`tsconfig.json`, which is also what the editor uses. Imports that leave this
folder (the generated forms, npm packages) resolve to
`agui-mastra-hotel-booking-golemui`, so install that demo first.
