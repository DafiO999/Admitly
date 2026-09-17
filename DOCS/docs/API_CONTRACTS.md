# HTTP API contracts

Base path:

```text
/api
```

## Error response

```json
{
  "error": {
    "code": "VALIDATION",
    "message": "Invalid request",
    "details": []
  }
}
```

Never expose stack traces or secrets.

## Health

### `GET /api/health`

```json
{
  "status": "ok"
}
```

A later deployment milestone may extend health output with database readiness, but it must remain safe and non-secret.

## Diagnosis

### `POST /api/diagnosis`

Request:

```json
{
  "profile": {}
}
```

Response:

```json
{
  "diagnosis": {
    "goalSummary": "...",
    "strengths": [],
    "constraints": [],
    "focusNow": []
  },
  "mode": "rules"
}
```

AI-enhanced wording can be added later without breaking the deterministic contract.

## Recommendations

### `POST /api/recommendations`

Request:

```json
{
  "profile": {}
}
```

Response:

```json
{
  "engineVersion": "1.0.0",
  "recommendations": []
}
```

Must work without Gemini.

## Recommendation explanation

### `POST /api/recommendations/:universityId/explanation`

Returns a validated optional AI explanation.

## Comparison

### `POST /api/comparison`

Request:

```json
{
  "profile": {},
  "universityIds": ["1", "2"]
}
```

Accept 2–3 IDs.

## Roadmap

### `POST /api/roadmap`

Request:

```json
{
  "profile": {},
  "selectedUniversityIds": ["1", "2"]
}
```

Returns:

```json
{
  "roadmap": {
    "items": [],
    "nextActionId": "..."
  },
  "sourceCoverage": {
    "official": 0,
    "verified": 0,
    "demo": 0,
    "unknown": 0
  }
}
```

## Profile persistence

### `PUT /api/profile`

Stores/updates a profile.

Authentication/ownership can be introduced later if required; do not invent a complete auth product in the MVP backend.

## Plan retrieval

### `GET /api/plan/:profileId`

Returns the coherent persisted plan for a profile.

## Roadmap status

### `PATCH /api/roadmaps/:roadmapId/items/:itemId`

Request:

```json
{
  "status": "done"
}
```

Recalculate next action after status update.

## Recalculation

### `POST /api/plan/recalculate`

Request:

```json
{
  "profile": {}
}
```

Returns a coherent new recommendation run + roadmap.

## Status mapping

Suggested:

```text
200 success
201 created
400 validation
404 not found
409 conflict
422 impossible domain request
429 upstream/rate limit where surfaced
502 external provider unavailable
503 database/service unavailable
500 unexpected internal error
```
