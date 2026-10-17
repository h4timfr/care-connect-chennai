# Chennai provider research catalogue

`chennai-provider-candidates.json` holds public-web **research** about candidate Chennai facilities
and doctors. It is **not** a list of CareConnect providers. Imported records become rows in the
private candidate tables (migration `00056_provider_candidates.sql`). There:

- only platform admins can see them (`/admin/providers`);
- they start in status `candidate` with booking disabled;
- they never appear in patient listings.

> **Status:** the file holds the commissioned research workbook
> `CareConnect_Chennai_Provider_Research_2026-10-06.xlsx` (SHA-256 in the file's `source_workbook`),
> converted without adding facts: **100 facilities, 399 doctors, 418 doctor–facility
> relationships** (all 418 `CONFIRMED_PUBLIC`, 0 `POSSIBLE_NEEDS_CONFIRMATION`). **0 registrations
> are authoritatively verified.** It replaces the 2026-10-05 catalogue (20 / 50 / 50, commit
> `816596b`). Migration 00056 is not deployed, so neither catalogue has been imported into
> production. **If any database holds the 2026-10-05 import, don't run this import there:** the
> same research IDs now name different records (e.g. `CLINIC-001` was Apollo Clinic T. Nagar and
> is now Apollo Hospitals, Greams Road).

## Workbook mapping

Regenerate the file from the workbook (Python 3, standard library only), then format it:

```bash
python scripts/candidates/workbook_to_catalogue.py CareConnect_Chennai_Provider_Research_2026-10-06.xlsx
npx prettier --write research/chennai-provider-candidates.json
npm run candidates:seed -- --check
```

The converter changes the **format** only, and stops on anything it can't map exactly. It also
checks the workbook's Summary totals and derived sheets (human-verification queue, confidence
lists) against the converted records.

| Workbook                                               | Catalogue                                                                                                                   |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `FAC-###` / `DOC-###`                                  | `CLINIC-###` / `DOCTOR-###`, same number (the ID format migration 00056 accepts)                                            |
| Confidence `HIGH` / `MEDIUM` / `LOW/UNRESOLVED`        | `high` / `medium` / `low`                                                                                                   |
| Relationship `AFFILIATION CONFIRMED`                   | `CONFIRMED_PUBLIC`                                                                                                          |
| Registration `NOT AUTHORITATIVELY VERIFIED`, no number | `registration_status: not_verified`, `registration_info: null`                                                              |
| `specialties_services`                                 | one exact string in `specialties` (not split)                                                                               |
| `unresolved_conflicts`                                 | `unresolved_issues`, verbatim                                                                                               |
| DUPLICATES_CONFLICTS (11 findings)                     | an issue on **both** records: other record, finding, status, required action. Nothing is merged.                            |
| Facility `metro_scope` other than "Chennai city"       | an issue: scope plus `ELEVATED` review priority (in this workbook, ELEVATED facilities are exactly these 37)                |
| `provider_type` other than "Medical doctor" (5)        | an issue: provider type and expected registration authority                                                                 |
| Facility source                                        | `official_facility`; `supports` = identity evidence + branch + metro scope                                                  |
| Doctor and relationship sources                        | `official_institution` (official provider/institutional doctor directories); relationship `supports` adds "appears current" |

Not carried into the catalogue:

- **Public phone numbers** (`public_phone_contact`): the pipeline does not accept phone numbers.
  CareConnect records contact details as review evidence.
- **Registry search attempts** (NMC, TNMC, TN Dental Council URLs and notes). They confirmed nothing,
  so they are not attached as sources. For every doctor the workbook records: no authoritative
  registry match in this research pass. The TNMC search needs a registration number and the
  requester's identity/OTP. Provider-site registration claims are not treated as verification.
- **Derived sheets** (Summary, HUMAN_VERIFICATION, HIGH/MEDIUM/LOW lists): every candidate needs
  human verification anyway (`review_status: candidate`). ELEVATED doctors are exactly those with
  `medium` or `low` confidence.
- `branch_information`, `exact_branch` and `branch_locality` aren't separate fields. The
  converter checks that they equal the facility's name and locality, and the branch also appears
  in the facility source.

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
