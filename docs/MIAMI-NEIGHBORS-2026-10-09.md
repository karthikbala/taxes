# Miami-Dade neighbour check — 9 October 2026

## Delivered behavior

The authenticated `POST /api/v2/property/neighbors` endpoint and `/poc` neighbour button independently resolve the subject address/unit, retrieve official Miami-Dade parcel geometry and appraiser ownership, and return JSON with field/source provenance. Existing tax lookup remains separate. This feature is Miami-Dade only; no collector calls, model calls or paid providers are involved.

Abutting land parcels and same-building condominium units are separate scopes. Official published parent-folio links provide the condo-site geometry; individual units are never drawn as separate land footprints. Shared edges, corner touches, gaps and unsupported geometry are distinct outcomes. The app compares complete registered owner-name sets, shared co-owner names and the requested owner name, without treating name similarity as legal identity.

Default detail cap is 50 (maximum 100), concurrency two, deadline 120 seconds. Candidate enumeration is paginated and bounded. Large building indexes use bounded official owner searches to prioritize candidates. Unexamined candidates, unavailable owners, unsupported geometry and incomplete indexes remain explicit; absence of observed matches cannot become a clearance claim. Entity continuation lines are grouped for comparison while preserving original source names.

## API

Use the existing Bearer access key. The normal lookup fields are accepted, plus optional `neighborOptions` with `sameBuilding`, `adjacency`, `includeCornerTouch` and `maxCandidates`. Options default to both scopes, no corner-touch inclusion and 50 detailed candidates. This endpoint does not accept arbitrary source URLs. Other counties return an explicit unsupported result.

## Source-backed acceptance

* Client default: 555 NE 15 ST UNIT 401 / JUDE PATRICK JACOB, folio 0132310520010. Published parent 0132310520001 supplies condo-site geometry. A fresh bounded run enumerated 382 candidates, inspected 50 and found no confirmed owner-name matches among those inspections. Coverage remains incomplete and aggregate absence remains unknown.
* One verified abutting land parcel: 0132310060210, 464 NE 16 ST, source owner display lines TRINITY EPISCOPAL CATHEDRAL; INC. A 4.42 m gap parcel is excluded from abutting results. Another large geometry is explicitly unsupported under the local projection bound.
* Positive independent example: 555 NE 15 ST UNIT T-15 / GASTON GIRARD, folio 0132310520640. Fresh detailed records confirmed same-building and owner-name matches at folios 0132310520940 (12-B), 0132310521010 (20-B) and 0132310521220 (16-C). Positive findings remain true despite the bounded overall scope. No claim of unique legal-person identity is made.
* Fixed shared Miami resolution: when the native explicit alphanumeric-unit filter reports incomplete/no result, a bounded complete street index resolves only the exact corroborated unit. Missing/conflicting units and reference-only parent rows cannot silently select a property.

Sanitized source/result evidence is in `docs/evidence/neighbors-2026-10-09/`. Live values are dated; fixtures are offline regression evidence, never runtime fallback.

## Validation and release

Selected offline checks: 86 passed, covering geometry, owner/entity matching, pagination and limits, API authentication, UI rendering, shared Miami resolution and existing lookup/server controls. Standalone and hosted builds passed. A local browser run verified authenticated source fetching, SVG map, separate unit list and coverage comments. GitHub CI and final published acceptance are recorded below after release.

No paid source/provider or runtime model requests were made. No PortTrack files, credentials or deployment were changed. GitHub remains the canonical standalone Node/Linux project; publication updates the existing demonstration host only.
