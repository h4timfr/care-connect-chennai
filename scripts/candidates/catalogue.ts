/*
 * Chennai provider research catalogue: validation and SQL generation for migration 00056.
 *
 * The catalogue is public-web RESEARCH about candidate facilities and doctors. It is not a list of
 * CareConnect providers. This module only ever produces candidate rows (status 'candidate',
 * booking disabled) plus their research sources; it never touches clinics / doctors / clinic_doctors,
 * review state, evidence or contact logs. Re-running it updates research facts in place.
 */

export type Confidence = "high" | "medium" | "low";
export type SourceType =
  | "official_facility"
  | "official_institution"
  | "government_registry"
  | "directory"
  | "news"
  | "other";
export type ResearchStatus = "CONFIRMED_PUBLIC" | "POSSIBLE_NEEDS_CONFIRMATION";

export interface CatalogueSource {
  url: string;
  source_type: SourceType;
  /** What this source supports, e.g. "Doctor listed on the facility's consultant page". */
  supports: string;
  researched_on: string;
  confidence: Confidence;
}

export interface CatalogueFacility {
  research_id: string;
  name: string;
  facility_type: string;
  address: string | null;
  locality: string;
  website: string | null;
  specialties: string[];
  source_confidence: Confidence;
  unresolved_issues: string[];
  researched_on: string;
  sources: CatalogueSource[];
}

export interface CatalogueDoctor {
  research_id: string;
  full_name: string;
  specialty: string;
  qualifications: string | null;
  /** Public registration details exactly as found, or null. Never invented. */
  registration_info: string | null;
  registration_status: "not_verified" | "public_listing_seen";
  source_confidence: Confidence;
  unresolved_issues: string[];
  researched_on: string;
  sources: CatalogueSource[];
}

export interface CatalogueRelationship {
  doctor: string;
  facility: string;
  research_status: ResearchStatus;
  confidence: Confidence;
  unresolved_issues: string[];
  sources: CatalogueSource[];
}

export interface Catalogue {
  catalogue: string;
  facilities: CatalogueFacility[];
  doctors: CatalogueDoctor[];
  relationships: CatalogueRelationship[];
}

export interface Expectations {
  facilities: number;
  doctors: number;
  relationships: number;
  confirmedPublic: number;
  possibleNeedsConfirmation: number;
}

/** The research summary this pipeline was commissioned for. */
export const EXPECTED_CHENNAI: Expectations = {
  facilities: 20,
  doctors: 50,
  relationships: 50,
  confirmedPublic: 41,
  possibleNeedsConfirmation: 9,
};

const CONFIDENCE = ["high", "medium", "low"];
const SOURCE_TYPES = [
  "official_facility",
  "official_institution",
  "government_registry",
  "directory",
  "news",
  "other",
];
const RESEARCH_STATUS = ["CONFIRMED_PUBLIC", "POSSIBLE_NEEDS_CONFIRMATION"];
/**
 * Fields the research must not carry: CareConnect decides these (review, permission, booking) or
 * they would be invented operational data (fees, phones, availability).
 */
const FORBIDDEN_KEYS = [
  "review_status",
  "permission_status",
  "booking_enabled",
  "careconnect_status",
  "verified",
  "verification",
  "fee",
  "fees",
  "consultation_fee",
  "phone",
  "phones",
  "availability",
  "schedule",
  "schedules",
  "slots",
  "id",
];

const isDate = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isUrl = (v: unknown) =>
  typeof v === "string" && /^https?:\/\/\S+$/.test(v) && v.length <= 1000;
const text = (v: unknown, min: number, max: number) =>
  typeof v === "string" && v.trim().length >= min && v.trim().length <= max;
const textArray = (v: unknown, max: number) =>
  Array.isArray(v) && v.every((x) => typeof x === "string" && text(x, 1, max));

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  counts: {
    facilities: number;
    doctors: number;
    relationships: number;
    confirmedPublic: number;
    possibleNeedsConfirmation: number;
  };
}

function checkForbidden(value: unknown, path: string, errors: string[]) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => checkForbidden(v, `${path}[${i}]`, errors));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.includes(k.toLowerCase())) {
        errors.push(
          `${path}.${k}: not allowed in research data (CareConnect decides it or it would be invented)`,
        );
      }
      checkForbidden(v, `${path}.${k}`, errors);
    }
  }
}

function checkSources(sources: unknown, path: string, errors: string[]) {
  if (!Array.isArray(sources) || sources.length === 0) {
    errors.push(`${path}.sources: at least one source is required (provenance is mandatory)`);
    return;
  }
  sources.forEach((s: Partial<CatalogueSource>, i) => {
    const p = `${path}.sources[${i}]`;
    if (!isUrl(s.url)) errors.push(`${p}.url: must be an http(s) URL`);
    if (!SOURCE_TYPES.includes(String(s.source_type)))
      errors.push(`${p}.source_type: one of ${SOURCE_TYPES.join(", ")}`);
    if (!text(s.supports, 2, 500))
      errors.push(`${p}.supports: describe what the source supports (2–500 chars)`);
    if (!isDate(s.researched_on)) errors.push(`${p}.researched_on: YYYY-MM-DD`);
    if (!CONFIDENCE.includes(String(s.confidence)))
      errors.push(`${p}.confidence: high, medium or low`);
  });
}

/**
 * Validates a research catalogue. With `expect`, also checks the commissioned totals so a partial
 * or altered file cannot be imported as the Chennai catalogue by accident.
 */
export function validateCatalogue(
  input: unknown,
  expect: Expectations | null = EXPECTED_CHENNAI,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const data = (input ?? {}) as Partial<Catalogue>;
  const facilities = Array.isArray(data.facilities) ? data.facilities : [];
  const doctors = Array.isArray(data.doctors) ? data.doctors : [];
  const relationships = Array.isArray(data.relationships) ? data.relationships : [];
  if (!Array.isArray(data.facilities)) errors.push("facilities: must be an array");
  if (!Array.isArray(data.doctors)) errors.push("doctors: must be an array");
  if (!Array.isArray(data.relationships)) errors.push("relationships: must be an array");
  checkForbidden(data, "catalogue", errors);

  const facilityIds = new Set<string>();
  facilities.forEach((f, i) => {
    const p = `facilities[${i}]`;
    if (!/^CLINIC-\d{3}$/.test(String(f.research_id)))
      errors.push(`${p}.research_id: CLINIC-### expected`);
    else if (facilityIds.has(f.research_id))
      errors.push(`${p}.research_id: duplicate ${f.research_id}`);
    else facilityIds.add(f.research_id);
    if (!text(f.name, 2, 200)) errors.push(`${p}.name: 2–200 chars`);
    if (!text(f.facility_type, 2, 80)) errors.push(`${p}.facility_type: 2–80 chars`);
    if (f.address !== null && !text(f.address, 2, 500))
      errors.push(`${p}.address: 2–500 chars or null`);
    if (!text(f.locality, 2, 80)) errors.push(`${p}.locality: 2–80 chars`);
    if (f.website !== null && !isUrl(f.website)) errors.push(`${p}.website: http(s) URL or null`);
    if (!textArray(f.specialties, 120)) errors.push(`${p}.specialties: array of strings`);
    if (!CONFIDENCE.includes(String(f.source_confidence)))
      errors.push(`${p}.source_confidence: high, medium or low`);
    if (!textArray(f.unresolved_issues, 500))
      errors.push(`${p}.unresolved_issues: array of strings`);
    if (!isDate(f.researched_on)) errors.push(`${p}.researched_on: YYYY-MM-DD`);
    checkSources(f.sources, p, errors);
  });

  const doctorIds = new Set<string>();
  doctors.forEach((d, i) => {
    const p = `doctors[${i}]`;
    if (!/^DOCTOR-\d{3}$/.test(String(d.research_id)))
      errors.push(`${p}.research_id: DOCTOR-### expected`);
    else if (doctorIds.has(d.research_id))
      errors.push(`${p}.research_id: duplicate ${d.research_id}`);
    else doctorIds.add(d.research_id);
    if (!text(d.full_name, 3, 200)) errors.push(`${p}.full_name: 3–200 chars`);
    if (!text(d.specialty, 2, 120)) errors.push(`${p}.specialty: 2–120 chars`);
    if (d.qualifications !== null && !text(d.qualifications, 1, 500))
      errors.push(`${p}.qualifications: up to 500 chars or null`);
    if (d.registration_info !== null && !text(d.registration_info, 1, 300))
      errors.push(`${p}.registration_info: up to 300 chars or null`);
    if (!["not_verified", "public_listing_seen"].includes(String(d.registration_status))) {
      errors.push(
        `${p}.registration_status: not_verified or public_listing_seen (research never verifies registration)`,
      );
    }
    if (!CONFIDENCE.includes(String(d.source_confidence)))
      errors.push(`${p}.source_confidence: high, medium or low`);
    if (!textArray(d.unresolved_issues, 500))
      errors.push(`${p}.unresolved_issues: array of strings`);
    if (!isDate(d.researched_on)) errors.push(`${p}.researched_on: YYYY-MM-DD`);
    checkSources(d.sources, p, errors);
  });

  const pairs = new Set<string>();
  let confirmedPublic = 0;
  let possibleNeedsConfirmation = 0;
  relationships.forEach((r, i) => {
    const p = `relationships[${i}]`;
    if (!doctorIds.has(r.doctor)) errors.push(`${p}.doctor: unknown ${String(r.doctor)}`);
    if (!facilityIds.has(r.facility)) errors.push(`${p}.facility: unknown ${String(r.facility)}`);
    const key = `${r.doctor}→${r.facility}`;
    if (pairs.has(key)) errors.push(`${p}: duplicate relationship ${key}`);
    pairs.add(key);
    if (!RESEARCH_STATUS.includes(String(r.research_status))) {
      errors.push(`${p}.research_status: CONFIRMED_PUBLIC or POSSIBLE_NEEDS_CONFIRMATION`);
    }
    if (r.research_status === "CONFIRMED_PUBLIC") confirmedPublic++;
    if (r.research_status === "POSSIBLE_NEEDS_CONFIRMATION") {
      possibleNeedsConfirmation++;
      if (!r.unresolved_issues?.length)
        warnings.push(`${p}: POSSIBLE_NEEDS_CONFIRMATION without an unresolved issue`);
    }
    if (!CONFIDENCE.includes(String(r.confidence)))
      errors.push(`${p}.confidence: high, medium or low`);
    if (!textArray(r.unresolved_issues, 500))
      errors.push(`${p}.unresolved_issues: array of strings`);
    checkSources(r.sources, p, errors);
  });

  for (const id of doctorIds) {
    if (![...pairs].some((k) => k.startsWith(`${id}→`)))
      warnings.push(`${id}: no researched facility relationship`);
  }

  const counts = {
    facilities: facilities.length,
    doctors: doctors.length,
    relationships: relationships.length,
    confirmedPublic,
    possibleNeedsConfirmation,
  };
  if (expect) {
    for (const [k, v] of Object.entries(expect) as [keyof Expectations, number][]) {
      if (counts[k] !== v) errors.push(`expected ${v} ${k}, found ${counts[k]}`);
    }
  }
  return { errors, warnings, counts };
}

const lit = (v: string | null) => (v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
const arr = (v: string[]) =>
  v.length ? `ARRAY[${v.map((x) => lit(x.trim())).join(", ")}]::text[]` : "'{}'::text[]";
const facilityRef = (id: string) =>
  `(SELECT id FROM public.candidate_facilities WHERE research_id = ${lit(id)})`;
const doctorRef = (id: string) =>
  `(SELECT id FROM public.candidate_doctors WHERE research_id = ${lit(id)})`;
const byId = <T extends { research_id: string }>(a: T, b: T) =>
  a.research_id.localeCompare(b.research_id);

function sourceRows(column: string, ref: string, sources: CatalogueSource[]) {
  return sources.map(
    (s) =>
      `INSERT INTO public.candidate_sources (${column}, url, source_type, supports, researched_on, confidence, origin)\n` +
      `VALUES (${ref}, ${lit(s.url)}, ${lit(s.source_type)}, ${lit(s.supports.trim())}, ${lit(s.researched_on)}, ${lit(s.confidence)}, 'research');`,
  );
}

/**
 * SQL that imports a validated catalogue into the candidate tables. Run it as the database owner
 * (it bypasses RLS), on staging first. It is idempotent: research facts are upserted by research id,
 * research-origin sources are replaced, and review state, notes, evidence and contacts are untouched.
 */
export function buildSeedSql(data: Catalogue, generatedFor: string): string {
  const out: string[] = [
    `-- Generated by scripts/candidates/build-seed.ts from ${generatedFor}. Do not edit by hand.`,
    "-- RESEARCH CANDIDATES ONLY: not CareConnect providers, not listed, not bookable.",
    "-- Requires migration 00056. Run as the database owner, staging first.",
    "BEGIN;",
  ];
  for (const f of [...data.facilities].sort(byId)) {
    out.push(
      `INSERT INTO public.candidate_facilities (research_id, name, facility_type, address, locality, website, specialties, source_confidence, unresolved_issues, researched_on)\n` +
        `VALUES (${lit(f.research_id)}, ${lit(f.name.trim())}, ${lit(f.facility_type.trim())}, ${lit(f.address?.trim() ?? null)}, ${lit(f.locality.trim())}, ${lit(f.website)}, ${arr(f.specialties)}, ${lit(f.source_confidence)}, ${arr(f.unresolved_issues)}, ${lit(f.researched_on)})\n` +
        `ON CONFLICT (research_id) DO UPDATE SET name = EXCLUDED.name, facility_type = EXCLUDED.facility_type, address = EXCLUDED.address, locality = EXCLUDED.locality, website = EXCLUDED.website, specialties = EXCLUDED.specialties, source_confidence = EXCLUDED.source_confidence, unresolved_issues = EXCLUDED.unresolved_issues, researched_on = EXCLUDED.researched_on;`,
    );
  }
  for (const d of [...data.doctors].sort(byId)) {
    out.push(
      `INSERT INTO public.candidate_doctors (research_id, full_name, specialty, qualifications, registration_info, registration_status, source_confidence, unresolved_issues, researched_on)\n` +
        `VALUES (${lit(d.research_id)}, ${lit(d.full_name.trim())}, ${lit(d.specialty.trim())}, ${lit(d.qualifications?.trim() ?? null)}, ${lit(d.registration_info?.trim() ?? null)}, ${lit(d.registration_status)}, ${lit(d.source_confidence)}, ${arr(d.unresolved_issues)}, ${lit(d.researched_on)})\n` +
        `ON CONFLICT (research_id) DO UPDATE SET full_name = EXCLUDED.full_name, specialty = EXCLUDED.specialty, qualifications = EXCLUDED.qualifications, registration_info = EXCLUDED.registration_info, registration_status = EXCLUDED.registration_status, source_confidence = EXCLUDED.source_confidence, unresolved_issues = EXCLUDED.unresolved_issues, researched_on = EXCLUDED.researched_on;`,
    );
  }
  const rels = [...data.relationships].sort((a, b) =>
    `${a.doctor}${a.facility}`.localeCompare(`${b.doctor}${b.facility}`),
  );
  for (const r of rels) {
    out.push(
      `INSERT INTO public.candidate_relationships (doctor_candidate_id, facility_candidate_id, research_status, confidence, unresolved_issues)\n` +
        `VALUES (${doctorRef(r.doctor)}, ${facilityRef(r.facility)}, ${lit(r.research_status)}, ${lit(r.confidence)}, ${arr(r.unresolved_issues)})\n` +
        `ON CONFLICT (doctor_candidate_id, facility_candidate_id) DO UPDATE SET research_status = EXCLUDED.research_status, confidence = EXCLUDED.confidence, unresolved_issues = EXCLUDED.unresolved_issues;`,
    );
  }
  // Research provenance is replaced as a whole for the records in this catalogue.
  out.push(
    `DELETE FROM public.candidate_sources WHERE origin = 'research' AND (` +
      `facility_candidate_id IN (SELECT id FROM public.candidate_facilities WHERE research_id = ANY (${arr(data.facilities.map((f) => f.research_id).sort())}))` +
      ` OR doctor_candidate_id IN (SELECT id FROM public.candidate_doctors WHERE research_id = ANY (${arr(data.doctors.map((d) => d.research_id).sort())}))` +
      ` OR relationship_id IN (SELECT r.id FROM public.candidate_relationships r JOIN public.candidate_doctors d ON d.id = r.doctor_candidate_id WHERE d.research_id = ANY (${arr(data.doctors.map((d) => d.research_id).sort())})));`,
  );
  for (const f of [...data.facilities].sort(byId))
    out.push(...sourceRows("facility_candidate_id", facilityRef(f.research_id), f.sources));
  for (const d of [...data.doctors].sort(byId))
    out.push(...sourceRows("doctor_candidate_id", doctorRef(d.research_id), d.sources));
  for (const r of rels) {
    const ref = `(SELECT id FROM public.candidate_relationships WHERE doctor_candidate_id = ${doctorRef(r.doctor)} AND facility_candidate_id = ${facilityRef(r.facility)})`;
    out.push(...sourceRows("relationship_id", ref, r.sources));
  }
  out.push("COMMIT;", "");
  return out.join("\n");
}
