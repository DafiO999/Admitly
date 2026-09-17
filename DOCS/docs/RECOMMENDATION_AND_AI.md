# Recommendation engine and AI

## Deterministic ranking

Pipeline:

```text
profile
  -> normalize
  -> hard filters
  -> component scores
  -> stable ranking
  -> top 3–5
```

## Weights

| Component | Max |
|---|---:|
| Academic | 30 |
| Program | 30 |
| Budget | 25 |
| Preferences | 15 |
| Total | 100 |

Keep weights in one configuration constant.

## Hard filters

Use only high-confidence constraints.

Examples:

- country is U.S.;
- requested program is supported by available program evidence;
- explicit hard preference may filter if product semantics say so.

Missing optional data should usually produce an unknown/neutral condition rather than exclusion.

## Budget scoring

Let:

- `B` = applicant annual budget
- `C` = chosen annual cost metric

Initial rule:

```text
C <= B               -> 25
B < C <= 1.15B       -> 20
1.15B < C <= 1.35B   -> 12
1.35B < C <= 1.60B   -> 5
C > 1.60B            -> 0
C unknown            -> neutral partial + concern
```

Do not label a general College Scorecard cost metric as a guaranteed international-student cost.

## Stable ordering

1. fit score descending;
2. program score descending;
3. budget score descending;
4. university name ascending.

Same input must produce same order.

## Reason codes

Examples:

```text
PROGRAM_EXACT_MATCH
WITHIN_BUDGET
NEAR_BUDGET
PREFERRED_STATE
SAT_ABOVE_REFERENCE
SAT_BELOW_REFERENCE
COST_UNKNOWN
REQUIREMENT_UNKNOWN
```

## Gemini role

Allowed:

- diagnosis wording;
- recommendation explanation;
- roadmap title/description rewriting.

Forbidden:

- choosing/ranking university candidates;
- inventing deadlines;
- inventing admission requirements;
- inventing costs;
- generating admission probability;
- changing source status.

All outputs must be structured and Zod-validated.

Prompt invariant:

```text
Use only supplied facts.
Do not add deadlines, requirements, costs, probabilities or guarantees.
If a fact is missing, omit it or mark it unknown.
Return only the requested structured JSON.
```

If Gemini is unavailable, deterministic API behavior remains valid.

Live Gemini calls are excluded from normal tests.
