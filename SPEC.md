# Introduction -  Vegan Activists NL Caldendar

I am the onwer of https://veganactivists.nl and the vegan activists NL Signal groups and bot. Help me design and implement a production-quality public calendar for vegan activism events in the Netherlands that is viewable via the website and deeply integrated with the signal groups. That calendar shall be an extension of the current website.

The goal is to have a single calendar where every major and minor event for vegan activism and animal rights activism are found. 

My plan is to get these events from two sources. First of all Vegan Activists NL is a thriving Signal community with multiple Signal groups held together by a website (veganactivists.nl) and a Signal bot coded by me (in Python using Signal-cli). One of the groups is the events group and people often post events there. Many of these events are only spread via Signal and WhatsApp. I would like to give them a home so even people who are not part of these groups can find these events. My idea is to use the Signal Bot to automatically pick up on such events and allow these Signal users to very easily publish their event (or updates to their event) on the calendar that we are about to build, ideally in two clicks. The idea is that if a user posts an event that the bot sends them a private message with a URL where they can publish the event. They will be taken to a pre-filled form (based on what an LLM was able to parse from their Signal message on the events group), will be identified by their Signal ACI (Account Identifier) and if all goes well it should literally take them one click to publish to the calendar after reviewing the prefilled form.

There are also lots of events that are published on various other platforms. There is a popular events world-wide aggregator called animalrightscalendar.com that scrapes these events (also from Facebook, which is something I have attempted but found too hard to do). I know the maintainer and he is willing to help setup a bidirectional feed between our calendar and his'. We would feed him the events that basically are only published via Signal and I would get the other events from his site. We would avoid feedback loops by maintinaing ids, but that way I would be able to serve the most complete calendar the Netherlands knows for animal rights / vegan activism. The nice thing is also that any event published on our calendar would also end up on animalrightscalendar.com, which already has a strong following, and so that would be a good reason for people publishing on the Vegan Activists NL events group to publish to the Vegan Activists NL calendar.

Eventually I would like to also make a special announcement group where only the bot and a few admins are allowed to post. This group would see events posted on a regular schedule and other news that is aggregated from our chat group. That way I am hoping to build a thriving community. Currently there are some 240 people in the events group.

I am an experienced software and machine learning engineer. Do not optimize for simplicity at the expense of correctness, maintainability, typing, testing, security, or operability. I want you to write high quality code, more on that later, and I will be reviewing everything you write. 

Before writing substantial implementation code:

1. Review this specification critically.
2. Identify ambiguities, missing requirements, security risks, and architectural risks.
3. Ask a small number of high-value questions.
4. Propose an implementation plan divided into independently reviewable milestones.
5. Record important architectural decisions and explicit non-goals.

Do not silently invent product behavior for consequential ambiguities.

# Functional spec

## Product goal

Extend the current veganactivists.nl websaite by adding a public calendar where people can discover vegan activism events taking place in the Netherlands.

Visitors must be able to browse events without creating an account. Authenticated users can publish events either personally or on behalf of an organization they belong to. Admins can manage users, groups and events as well as feature certain events.

The initial launch goal is a useful public activism calendar, not a general-purpose event platform.

## MVP scope

Version one must include:

* Migration of the current NextJs webpages to the new Solid stack.
* A public event calendar available.
* Public event detail pages.
* Filtering by (Dutch) city and province.
* User authentication via Signal via the Bot.
* Manual event creation, editing, and deletion.
* Organizations.
* Organization membership and organization-level roles.
* Events published by individuals.
* Events published on behalf of organizations.
* The whole site, both public and non-public should work both on mobile and desktop.

The following are not required for the initial launch unless needed as enabling infrastructure, they are out of scope:

* Event RSVP'ing. 
* Calendar REST API
* Signal event message ingestion (that will be part of a followup project)
* Integrations with external event websites such as animalrightscalendar.com.
* Scraping.
* Advanced recommendation features.
* Native mobile applications, although the website should be mobile-first.
* Ticket sales or payment processing.
* Online-only events.
* Recurring events.
* Flagging spam events

The architecture should nevertheless leave clean extension points for such possible future features.

## Current site migration

The current veganactivists.nl website contains only two pages (in English and in Dutch) which explain how to get on to the Signal groups. We wish to extend this with the new calendar function. However, we do not wish to necessarily retain any use of technology. It was built with Next.js and Tailwind. You can keep tailwind, but definitely ditch Next.js and use the technology stack that is described in this spec. Keep the path based locale.

## Event date

Every event must contain:

* Short title.
* Long description.
* Start date and time (in `Europe/Amsterdam` timezone) (start time necessary also for multi-day events)
* Location address or description (must include at the very least the Dutch city the event starts in).
* Publisher identity:
  * an individual user (may or may not be visible to users); or
  * an organization (always visible).
* Status of the event: visible or hidden. 

An event may additionally contain:

* How to get in contact.
* Flyer or image.
* End date and time. (also in `Europe/Amsterdam` timezone)
* Google Maps URL or map pin.
* Registration instructions.
* External event URL.
* Registration URL (may be the same as the external event URL)

The system should be able to represent an event that:

* has a precise address;
* has only a city (which for our purposes is synonymous with town and village);
* has a meeting-point description with only a city;
* has a not-yet-announced location, but does have a city;

We do not deal in online events in the MVP.

Define validation rules for end times, URLs, image types, image sizes, and required geographic fields. Use structured data types instead of stringly typed data types where possible. 

## Event URL

Each event has a unique URL slug that shall never change. This URL shall not be the primary key of the event in the database, since that may change during migration. We shall use a human-readable slug derived from title + short random suffix (e.g. veganistische-mars-utrecht-4f8k)

## Geographic model

The public interface must support filtering upcoming events by (one or more):

* woonplaats;
* province.

Use woonplaats (place) as the canonical geographic unit for events, each linked to its municipality and province via the official CBS/PDOK dataset. At event creation, the publisher selects a city from this canonical list (autocomplete); this drives all city/province filtering. The publisher's free-text address or meeting-point description is stored separately for display and is never used for filtering or inferred from.

Do not infer a city or province unreliably from arbitrary text. If geocoding is introduced, it must be treated as an explicit, fallible process.

The system is initially limited to events relevant to the Netherlands only. Events accross the border are explicitly disallowed for now (this should be made clear to any user who tries to make such an event).

## Authentication and users

Unauthenticated visitors may browse all public events.

### Signup

To create an account a user must manually find the Signal user called VeganActivistsNL-Bot in the Signal App and send it a message to request an account, for example "signup". Clear instruction will be provided to the user. Once that message is received by the bot, they receive a URL (pretty much immediately) by the bot via a Signal message back to the website where they can set up their account. In that URL the Signal users's ACI is encoded. Once the website receives that URL it should check that it was signed by the bot, so that we know the Signal bot has sent the message and that the user truly is the owner of that ACI. Also the link shall only be valid for 1 hour. Only one user can be associated with one ACI (must be enforced). 

Part of this project is to modify the bot to implement this account request feature.

Once they click on the URL sent by the bot they can then provide their user details:

* unique account name (citext)
* email address (will not be verified)
* display name
* information about their affiliations (not published)
* password

Authentication must use secure, HTTP-only cookies or another clearly justified browser-session design. Do not store long-lived tokens in the browser local storage. A user can be logged in for 24 hours and the account name can be remembered indefinitely for easy login. The website is running on HTTPS of course.

### Login

A user gets three login attempts every 12h.

## Password reset

To reset a user's password they can send a message to the bot with the request "password reset". A link will then be send to them where they can reset their password.

## Authorization model

Use backend-enforced authorization. Frontend visibility is not a security boundary.

### Visitor

A visitor is not logged in and may:

* view public events;
* filter and search events;
* view organization profiles.

### User

A user is logged in and may:

 * Update their profile

### Editor

An authenticated editor may:

* create an event published as themselves;
* edit or delete events they personally own;
* cancel an event. 
* create an organization. They will then immediately become the organisation's admin.

For the MVP every registered account automatically becomes an editor. Perhaps later we will vet users before making them editors, but for now we will allow them to be editors.

### Org editor

An organization editor may:

* create events on behalf of that organization;
* edit and delete organization events that they have created (not the ones they have not created).

### Org admin

An organization admin may:

* edit an organization's profile;
* add members by their account name;
* remove members;
* promote or demote organization administrators;
* create, edit, and delete all organization events;

There must always be at least one organization administrator.

Deleting an organization requires a site admin.

When an organization or user is deleted a question is asked to the admin, whether they want to cascade this delete and also delete all events associated with this organization or user. Deletes do not automatically cascade. If the events are not deleted (so no cascade) then the organization / user will be listed publically as "deleted". In the database the organization is not actually deleted, but a tombstone will be put.

### Site admin

A site admin has god mode and can thus do everything everyone combined can, plus:

* administer all users and organizations (create, edit, promote/demote, delete)
* feature or unfeature events (featured events will be shown on the front page)

Root access must not be granted merely by matching a normal editable profile field. Bootstrap root accounts through explicit configuration or a controlled administrative process.

Model global roles separately from organization-scoped memberships. Avoid encoding all permissions in one user role column.

## Organizations

An organization should contain at least:

* name; Must be unique. (citext)
* slug; Must be unique and once set, can not change. Perhaps later we will provide multiple slugs.
* description;
* optional website URL;
* optional logo;
* created timestamp;
* updated timestamp;
* status or deletion state.

Any editor can create as many organizations, without approval, as they want for now.

Membership should be represented explicitly, with a scoped role such as `org_editor` or `org_admin`. Every organization has at least one `org_admin`.

## Event ownership and publication

An event must have exactly one publishing identity:

* an individual or
* an organization.

Also retain the user who created and most recently changed it.

Suggested distinctions:

* `publisher`: the public person or organization shown on the event;
* `created_by`: the user who entered the event;
* `updated_by`: the user who most recently changed it;
* `source`: manual, Signal import, partner import, or another future source.

Imported events will need provenance and external identifiers, even if imports are not yet implemented in the MVP.

If an event is not owned by an organization then it is fully controllable by the user who has created the event.

## Public calendar experience

The public site should prioritize upcoming events. All public facing pages must be available in both Dutch and English. All non-public pages need only be available in English.

It should provide:

* a useful landing page with featured events;
* chronological event browsing (infinite scroll);
* (multi) city and province filtering;
* individual event pages;
* organization pages;
* accessible mobile and desktop layouts;
* shareable, stable URLs for events and organizations;
* useful page metadata for search engines and social sharing (e.g. via Signal).

Filtering state should preferably be reflected in the URL so filtered views are shareable and browser navigation works correctly.

Past events should normally be excluded from the default view but may remain reachable through direct links or an archive.

## Featured events

Site admins may mark events as featured. They do this at their own discretion, by taking the event slug and entering it into a featured events admin page only visible to site admins.

Featured events appear prominently on the front page as long as they are set in the future. Once they are happening or set in the past they stop being featured. 

For the MVP, featuring should be editorial rather than algorithmic.

## Showing, hiding or canceling an event

An editor with edit rights over an event can set the status of event:

 - Hidden - It will then not be shown on the calendar anymore or be accessible via its URL (404 shall be given).
 - Visible- At any time an editor can set a hiddent event to visible.  
 - Cancelled - The event will still be accessible through the event URL, but will not anymore show up on the calendar. Once a user goes to event page then it will be clearly shown as cancelled and a reason for such cancellation will be often be visible too.

When an editor sets an event's status to cancelled then a cancel reason can optionally be provided that will be shown to users.

## Deleting events

Before a user deletes an event they need to be prompted whether they are really sure. We also will tell them that they can also set the event to cancelled if the event was cancelled. They may not be aware of the distinction. Deleting an event makes sense when nobody has seen the event and was quitly cancelled or the event was duplicated, but if the event was truly cancelled then the event should be set to cancelled instead of being deleted.


##  Account deletion

A logged-in user may request deletion of their own account. Site admins may also delete a user account.

Deleting an account anonymizes the user's profile — email, display name, and affiliation info are erased; the account row is retained as a tombstone so created_by/updated_by/publisher references on existing events remain valid (shown publicly as "deleted user" where the individual was the publisher). Events the user published are not deleted, since they may be a public record of past or upcoming organizing that other people still rely on.

 The Signal ACI link is removed on deletion; the person may request a new account later, but this does not restore the old profile or its history.

 A user cannot delete their own account while they are the sole org_admin of an organization — they must first promote another member or transfer the org, consistent with the rule that every organization always has at least one admin.

## Images and uploads

Event flyers and organization logos are optional. The user should be told what requirements we have of images (file size and ideal dimensions).

We can store the images in the database initially, so that backup becomes easy. This is MVP only and we may change this lateron.

Do not trust file extensions alone. An image file should be vetted and if the image is not given in the right resolution, then the resolution should be automatically adjusted. 

 - Process before inserting. Decode the upload, validate that it is genuinely an image, apply EXIF orientation, resize when needed, re-encode in webp and strip metadata.
 - Set upload limits before decoding. Also reject absurd pixel dimensions to prevent decompression-bomb attacks.
 - Serve immutable URLs, such as /images/{sha256}.webp, with long-lived cache headers.
 - Keep image bytes out of ordinary event queries. Use a separate table so listing events never accidentally fetches all image data.
 - For event flyers keep a full resolution image (with maximum width/height dimension 1600) and a smaller preview version (max width/height 600)
 - For organizations keep a 400px and smaller 160px version.

# Signal Bot interaction

The bot needs only one extra feature (see `bot_feature.py`): the ability to send an account signup url to users who request it. It is part of this project to modify the bot. The bot's architecture / tech stack should NOT be modified. 

# Technical spec for the website / calendar

## Stack

Use SolidJs and SolidStart for frontend and backend. Use tailwind for styling. Run on Bun. The database shall be Postgres. 

The website shall be hosted somewhere in the cloud on a Linux-based VPS (a distro like Ubuntu) and we shall use Cloudflare as a CDN / reverse proxy.

Deployment and supplying depdencies will be managed by Nix. 

Code will be on Github and should be assumed to be public.

## Config

I want all config in a single TOML. Secrets shall be passed via environment variables.

## Nix and Nushell

 - A `flake.nix` and `flake.lock` will define a dev shell (i.e. `nix develop`) and nix apps. 
 - By running `nix run .#install` we can install the webapp as a systemd service, just like the bot. Any shell scripting shall be done with Nushell, which can be supplied by Nix. See the flake.nix of the bot for inspiration.

## Code

 - Use strict TypeScript and prefer a functional, immutable and strongly typed style of coding. 
    - Dont stray to far though and stay close to idiomatic SolidJs code.
    - You can use advanced typescript type tricks, such as type constructors like `Omit` and use of type guards and such. For example if you have a full database record, but we're only retrieving a part of that then we can create a partial type from the full type.
     - Leverage the type system to define data types that are impossible to get wrong. For example, we know that Signal ACI's are UUID's, so we can make a SignalACI type that only accepts valid UUID's.
 - Prefer functional programming with immutable data structures. Most functions/methods should have referential transparency. I do not care about mutability inside functions.
 - Prefer clear domain services and policies over scattering logic across route handlers, controllers and models. Make sure the domain services have great unit test coverage.
 - Write comments on components and functions that need explanation. Describe intent and the reason for this component. Don't be pedantic. If the intent is clear from the function name, we dont' need comments. 
 - Provide docs in markdown format that describe how to install the system, develop on the system and the basic architecture and layout of the system (not in total detail, but high-level only). 
 - Use assertions liberally to check whether assumptions are correct.
 - Log all major events with a logger. 
 - Take good care of error handling with error boundaries. The user should not see exceptions, but should see something that they can report to a site admin that will help them debug the problem (e.g. a unique code and/or timestamp).
 - Write unit tests where the logic gets complicated. Not very every little bit. When it is necessary to mock different services, use dependency injection to insert those mock services.
 - Arrange code primarily in folders and moduldes by their function, not their technical implementation (e.g. we don't want a `models` folder).
 - Avoid duplicating business rules between the frontend and backend. The backend remains authoritative for validation and authorization.
 - All code shall be auto-formatted with a formatter
  - Use a repository pattern (from domain driven design) whereby all database calls are hidden by repositories that give access to certain parts of the database without really exposing that the database is a Postgres database or a database at all really.
 - Interact with the Postgres database using hand-written, parameterized SQL — do not use an ORM or a fluent query-builder that constructs SQL through method chaining (e.g. no Prisma, Drizzle, Kysely). Every repository function must still return a precisely typed result: validate or map each row into its declared TypeScript type at the query boundary, so callers never see any or a raw driver result type.i
 - Use a TypeScript formatter to auto-format code.
 - Do not silently swallow error/exceptions anywhere. At the very least log a warning or error.

 ## Use of libraries

  - Use typescript libraries for things where we really don't want to reinvent the wheel: e.g. logging, CLI argument parsing, date time handling, database connection pooling, etc. Stick to well known and supported libraries.
  - You can use js libraries as long as there is proper type(script) support for it. 

## Rendering

 - Use server-side rendering for public pages where it improves:
    * initial response time;
    * search-engine visibility;
    * link previews;
    * resilience under crawler traffic.
 Use client-side interactivity for filters, forms, and administrative workflows.

## (Code) Naming

The project is simply called veganactivists.nl or VANL for short. The website will also have a few pages that are not related to the calendar. The calendar is simply called calendar. We do not use Dutch names or comments code or databases tables.

## Caching and crawler protection

The public read workload will be much larger than the write workload.

Design public event responses so they can be cached safely.

Possible layers include:

* cache headers;
* reverse-proxy caching;
* application-level caching;
* pre-rendered or incrementally regenerated public pages;
* a CDN or managed proxy in front of the origin. 

Do not add a complex caching system until the expected access patterns require it.

The design should protect the origin against abusive crawlers through:

* request-rate limits;
* request-body limits;
* connection limits;
* timeouts;
* caching of anonymous GET requests;
* robots policy;
* optional CDN or proxy protection;
* restricted expensive query combinations.

Authenticated or personalized responses must not leak through shared caches.

## Reliability

The public site should continue to serve cached pages temporarily if the database is unavailable, where practical.  Also pages that do not require the database shall remain functional.

## Database

Use PostgreSQL. Define the schema of the database in code. Production database changes must be represented by version-controlled migrations and applied through an explicit deployment step.

Keep database access behind repositories or focused query modules. Route handlers and UI components must not contain ad hoc SQL or scattered ORM queries.

## Time handling

The product uses Dutch local time, but persistence and API behavior must be explicit and standardized on UTC.

Preferred approach:

* accept local event input associated with `Europe/Amsterdam`;
* convert unambiguous instants to unix epoch timestamps.
* store and return unix epoch timestamps.
* render in `Europe/Amsterdam`.

Correctly handle daylight-saving transitions.

## Deployment and operations

We do not use containers. We use Nix and systemd to set everything up. Take inspiration from the nix.flake of the bot.

## Backups

Create automated daily backups based on the PostgresDB. Use a systemd timer to schedule the backup.

Store backups off-server in S3-compatible object storage. 

Past events may eventually be archived or deleted, but this should be a retention policy rather than an accidental consequence of backups.

# Expected output before implementation

Before generating the application, provide:

1. A list of unresolved product questions.
2. A recommended architecture and alternatives considered.
3. A proposed domain model.
4. A permission matrix.
6. A rendering and caching strategy.
7. A threat model.
8. A deployment topology.
9. A backup and restore plan.
10. A milestone-based implementation plan.
11. Explicit MVP non-goals.
12. The decisions that would be expensive to reverse later.

After I approve these, implement one milestone at a time. Keep each milestone runnable and reviewable. Do not generate a large unverified codebase in one response.


# Workflow

## Agent Development Workflow

Work in small, reviewable milestones. Do not attempt to implement the entire product in one pass.

For each milestone, follow this loop:

### 1. Re-establish context

Before changing code:

* Read the product specification.
* Read the current implementation plan.
* Read the relevant architecture decision records.
* Inspect the existing repository rather than assuming its structure.
* Restate the milestone’s acceptance criteria.
* Identify unresolved questions that materially affect this milestone.


### 2. Propose the change

Provide a concise implementation proposal containing:

* the behavior being added;
* the files or modules likely to change;
* database or API changes;
* security and authorization implications;
* tests to add;
* documentation to update;
* risks or decisions requiring approval.

Do not write implementation code until the proposal is internally coherent.

### 3. Implement the smallest complete slice

Implement one vertical slice that can run end to end.

A slice should preferably include:

* database model (do not bother with migration strategies, since we are building from scratch);
* backend domain behavior;
* API endpoint;
* generated or typed frontend API usage;
* frontend behavior;
* authorization;
* tests.

Avoid implementing disconnected layers that cannot yet be exercised together.

Do not add speculative abstractions for unimplemented future features. Preserve extension points through clear boundaries and data modeling, not empty frameworks.

### 4. Verify continuously

After each meaningful change:

* run the relevant formatter;
* run static analysis and type checking;
* run focused tests;
* inspect failures before continuing.

Before declaring the milestone complete, run the complete required verification suite.

Never claim that a command passed unless it was actually executed and its result was observed.

Do not weaken, skip, delete, or broadly mock tests merely to obtain a passing result.

### 5. Review your own work

Inspect the final diff as a critical reviewer.

Check specifically for:

* authorization bypasses;
* missing ownership checks;
* accidental exposure of private data;
* incorrect transaction boundaries;
* timezone and daylight-saving errors;
* missing or duplicated validation;
* duplicated domain rules;
* stale generated API types;
* unhandled failure paths;
* unnecessary dependencies;
* unrelated changes;
* mobile first-ness;
* caching strategy;
* migrations that cannot safely be applied or rolled back.

Compare the result directly with the milestone acceptance criteria.

### 6. Demonstrate the result

Provide evidence that the slice works.

Depending on the milestone, evidence may include:

* test output;
* type-checking and lint output;
* example API requests and responses;
* screenshots or browser-test results;
* migration status;
* a short manual verification procedure.

Do not substitute a prose description for executable evidence.

### 7. Update project records

Update as appropriate:

* implementation plan;
* architecture decision records;
* OpenAPI schema;
* generated frontend client;
* operational documentation;
* unresolved-question log;
* known limitations.

Record why consequential decisions were made, not only what was changed.

### 8. Stop at the review boundary

At the end of each milestone, report:

1. what changed;
2. important design decisions;
3. commands executed and their results;
4. tests added;
5. remaining risks or limitations;
6. deviations from the approved plan;
7. the proposed next milestone.

Then stop for review.

Do not begin the next milestone automatically unless explicitly instructed.

## Failure handling

When verification fails:

1. Stop adding new functionality.
2. Determine whether the failure is caused by the new change, the environment, or an existing defect.
3. Fix the root cause where it is within scope.
4. Add or improve a regression test where appropriate.
5. Re-run the affected checks.
6. Clearly report any failure that cannot be resolved.

Never conceal a failure by removing assertions, widening types to `any`, suppressing diagnostics, or replacing real behavior with mocks without explicit justification.

