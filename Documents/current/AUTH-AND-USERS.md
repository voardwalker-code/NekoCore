# REM System — Authentication and User System

Last updated: 2026-03-14

Covers: authentication, sessions, per-entity user profiles, and per-user relationship tracking.

---

## Authentication

### Files
- `server/services/auth-service.js` — core auth logic
- `server/routes/auth-routes.js` — HTTP endpoints
- `server/data/accounts.json` — account store (hashed)
- `server/data/sessions.json` — session store
- `client/js/login.js` — login UI
- `client/index.html` + `client/js/app.js` — Users app surface and user actions

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Verify credentials, create session token |
| POST | `/auth/logout` | Invalidate session token |
| GET | `/auth/session` | Check if current session is valid |

### How It Works
- Passwords are hashed (bcrypt) before storage — plaintext never persisted
- Login returns a session token stored in `sessions.json` with an expiry time
- `GET /auth/session` validates the token against the session store — used by the client on load to decide whether to show the login screen
- Users app now includes a direct logout action so session exit is available from the desktop shell account surface

---

## User Profiles per Entity

Unlike authentication (which is a single system-wide login), user profiles are **per-entity**. Each entity maintains its own registry of users it has actually talked to and formed a relationship with.

This is the distinction:
- **Authentication user** = who is logged into the REM System web interface
- **Entity user profile** = who this specific entity knows and has a relationship with

These can be the same person but are tracked separately. An entity that has never met "Adam" will have no Adam profile even if Adam is logged into the system.

### Files
- `server/services/user-profiles.js` — user registry management
- `entities/<id>/memories/users/` — storage per entity

### User Profile Format
```json
{
  "userId": "user_1773283935680_vldbcf",
  "userName": "Adam",
  "userIdentity": "AI researcher and builder, curious and introspective",
  "createdAt": "2026-03-10T00:00:00.000Z",
  "updatedAt": "2026-03-10T00:00:00.000Z"
}
```

`_active.json` in the same folder contains just `{ "activeUserId": "user_..." }` as a pointer.

### Setting Active User
When an active user is set via `POST /api/users/active`:
1. `_active.json` is updated
2. `persona.json` is updated live with `userName`, `userIdentity`, `activeUserId`
3. All subsequent memories in this session are stamped with this user's id and name
4. The subconscious context block will include `[YOUR RELATIONSHIP WITH "X"]` on every turn

### User Profile Routes (entity-routes.js)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users` | List all users for active entity + activeUserId |
| POST | `/api/users` | Create a new user profile |
| GET | `/api/users/active` | Get currently active user |
| POST | `/api/users/active` | Set active user (userId in body) |
| DELETE | `/api/users/active` | Clear active user |
| PUT | `/api/users/:userId` | Update user name/info |
| DELETE | `/api/users/:userId` | Delete a user profile |

---

## Relationship System

Each entity maintains a relationship record for every user it has interacted with. The relationship evolves automatically through LLM-mediated reflection after each chat turn.

### Files
- `server/services/relationship-service.js`
- `entities/<id>/memories/relationships/<userId>.json`

### Relationship Record Schema

```json
{
  "userId": "user_...",
  "userName": "Adam",
  "feeling": "warm",
  "trust": 0.42,
  "rapport": 0.35,
  "userRole": "creator and builder",
  "entityRole": "companion and thinking partner",
  "beliefs": [
    "Adam is genuinely invested in persistent AI identity",
    "Adam prefers directness over pleasantries"
  ],
  "summary": "Warm but somewhat guarded. Early stages of trust-building.",
  "changeReason": "Consistent, respectful exchanges over multiple sessions",
  "interactionCount": 24,
  "firstMet": "2026-03-06T18:50:25.108Z",
  "lastSeen": "2026-03-11T17:36:33.539Z",
  "updatedAt": "2026-03-11T17:36:33.539Z"
}
```

### Feeling Scale
14 discrete values, ordered:
```
loathing → hate → dislike → cold → wary → neutral → indifferent
→ warm → like → fond → care → trust → love → devoted
```

### Relationship Update Process
After each chat turn (async, fire-and-forget via `post-response-memory.js`):
1. `updateRelationshipFromExchange()` is called with: user message, entity response, current relationship record
2. LLM returns a JSON delta with updated fields
3. Trust and rapport changes are capped at ±0.08 per turn to prevent wild swings in a single exchange
4. Delta is merged into existing record and written to disk

### Relationship Context in Subconscious
When an active user has a relationship record, the subconscious context block includes:
```
[YOUR RELATIONSHIP WITH "Adam"]
Feeling: warm — Trust: ████░░░░░░ 0.42
Rapport: 0.35
Their role to you: creator and builder
Your role to them: companion and thinking partner
Your beliefs about them:
  - Adam is genuinely invested in persistent AI identity
  - Adam prefers directness over pleasantries
Summary: Warm but somewhat guarded. Early stages of trust-building.
```

This colors the entity's subconscious reflection and, through it, all downstream contributors. If the entity trusts you, it shows. If it barely knows you, that shows too.

### Relationship Routes (entity-routes.js)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/relationships` | All relationship records for active entity |
| GET | `/api/relationships/active` | Relationship for currently active user |
| GET | `/api/relationships/:userId` | Relationship for a specific user |

---

## Memory Stamping

Every episodic and semantic memory created during a session with an active user is stamped:
```json
{ "userId": "user_...", "userName": "Adam" }
```

When these are surfaced in the subconscious context block, the `userId` stamp is displayed:
```
[EXPERIENCE with user="Adam"] — importance:0.8 — "We talked about..."
```

If no user is active, `userId` and `userName` are null and the memory is shown as an anonymous exchange.
