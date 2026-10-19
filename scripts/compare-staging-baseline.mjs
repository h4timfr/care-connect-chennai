import { readFileSync } from "node:fs";
const [expected, observed] = process.argv.slice(2);
if (!expected || !observed) throw new Error("Usage: node scripts/compare-staging-baseline.mjs EXPECTED.json OBSERVED.json");
const canonicalize = (x) => Array.isArray(x) ? x.map(canonicalize) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonicalize(x[k])])) : x;
const a=JSON.parse(readFileSync(expected,"utf8")), b=JSON.parse(readFileSync(observed,"utf8"));
const required=["schemas","enums","tables","columns","constraints","indexes","policies","functions","triggers","relation_grants","column_grants","publication"];
for(const value of [a,b]) if(!value || typeof value!=="object" || required.some(k=>!Array.isArray(value[k])) || Object.keys(value).length!==required.length) throw new Error("Incomplete or unexpected snapshot categories");
const keys=Array.from(new Set([...Object.keys(a),...Object.keys(b)])).sort();
let different=false;
for(const key of keys){ const equal=Object.hasOwn(a,key)&&Object.hasOwn(b,key)&&JSON.stringify(canonicalize(a[key]))===JSON.stringify(canonicalize(b[key])); different ||= !equal; console.log(key+": "+(equal?"MATCH":"DIFFERENCE")); }
process.exitCode=different?1:0;
