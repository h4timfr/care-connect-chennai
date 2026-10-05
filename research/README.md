# Chennai provider research catalogue

`chennai-provider-candidates.json` holds public-web **research** about candidate Chennai facilities
and doctors. It is **not** a list of CareConnect providers. Imported records become rows in the
private candidate tables (migration `00056_provider_candidates.sql`). There:

- only platform admins can see them (`/admin/providers`);
- they start in status `candidate` with booking disabled;
- they never appear in patient listings.

> **Status:** the file is currently an empty placeholder. The commissioned research (20
> facilities, 50 doctors, 50 doctor–facility relationships: 41 `CONFIRMED_PUBLIC`, 9
> `POSSIBLE_NEEDS_CONFIRMATION`) has not been added to the repository yet. Do not fill it with
> anything but that research.

## Format

```jsonc
{
  "catalogue": "chennai-provider-candidates",
  "facilities": [/* CatalogueFacility */],
  "doctors": [/* CatalogueDoctor */],
  "relationships": [/* CatalogueRelationship */],
}
```

The exact types live in [`scripts/candidates/catalogue.ts`](../scripts/candidates/catalogue.ts).

| Record       | Fields                                                                                                                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Facility     | `research_id` (`CLINIC-###`), `name`, `facility_type`, `address` (or null), `locality`, `website` (http(s) or null), `specialties[]`, `source_confidence` (`high`/`medium`/`low`), `unresolved_issues[]`, `researched_on`, `sources[]`                                          |
| Doctor       | `research_id` (`DOCTOR-###`), `full_name`, `specialty`, `qualifications` (or null), `registration_info` (as publicly found, or null), `registration_status` (`not_verified` or `public_listing_seen`), `source_confidence`, `unresolved_issues[]`, `researched_on`, `sources[]` |
| Relationship | `doctor` (`DOCTOR-###`), `facility` (`CLINIC-###`), `research_status` (`CONFIRMED_PUBLIC` or `POSSIBLE_NEEDS_CONFIRMATION`), `confidence`, `unresolved_issues[]`, `sources[]`                                                                                                   |
| Source       | `url` (http(s)), `source_type` (`official_facility`, `official_institution`, `government_registry`, `directory`, `news`, `other`), `supports` (what it shows), `researched_on`, `confidence`                                                                                    |

Rules the validator enforces:

- **Provenance:** every facility, doctor and relationship has at least one source.
- **Research IDs only:** IDs are research identifiers, never CareConnect UUIDs.
- **Branches stay separate:** distinct facilities get their own `CLINIC-###`, e.g. separate
  branches or localities. Don't merge them; record any conflicting address formulations as
  `unresolved_issues`.
- **No CareConnect decisions or invented data:** a record must not contain any of
  `review_status`, `permission_status`, `booking_enabled`, `careconnect_status`, `verified`, fees,
  phone numbers, availability, schedules or slots.
- **Registration:** never `verified` in research. CareConnect records its own registration check as
  evidence in the review screen.
- **Totals:** must match the commissioned totals above unless `--allow-partial` is passed.

## Import

```bash
npm run candidates:seed -- --check
npm run candidates:seed -- --out candidates-import.sql
```

Review the SQL, then run it **as the database owner on staging first**, then production. It upserts
research facts by research ID and replaces research sources. Re-running it never changes review
status, permission, notes, evidence or contact logs. Nothing here ever creates clinics, doctors,
doctor–clinic links, schedules or bookings.
