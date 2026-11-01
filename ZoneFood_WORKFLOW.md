# ZoneFood --- Claude Code Build Workflow

**Purpose:** Build a complete, demonstrable DBMS mini-project from the
supplied `ZoneFood_Master_Plan(1).pdf`.

**Execution rule:** Implement Parts 1--3 only. Part 4 is optional and
must not be started unless the user explicitly approves it. The project
is complete when Parts 1--3 pass their acceptance checks and the
repository can be run from a fresh clone.

------------------------------------------------------------------------

## 0. Instructions to Claude Code

You are the implementation engineer for this project. Treat the PDF in
this folder as the primary project specification.

### Before doing anything

1.  Locate and read the entire `ZoneFood_Master_Plan(1).pdf`. Do not
    rely on its filename alone; inspect the actual file.
2.  Read this `WORKFLOW.md` completely.
3.  Inspect the existing folder/repository before creating, changing, or
    deleting files.
4.  Extract the actual requirements, database entities, relationships,
    workflows, technology choices, and deliverables from the PDF.
5.  Create `PROJECT_STATUS.md` with:
    -   requirements checklist and source page/section where
        identifiable;
    -   planned implementation phases;
    -   decisions and assumptions;
    -   risks, unresolved questions, and items intentionally excluded.
6.  Create `docs/REQUIREMENTS_TRACEABILITY.md` mapping each requirement
    from the PDF to its implementation location and its verification
    method.
7.  Present a concise implementation plan and identify any
    contradictions or unclear requirements. Do not invent faculty
    requirements that are not in the PDF.

**Do not spend the entire session repeatedly analysing the PDF.**
Complete the analysis once, record the findings, then proceed phase by
phase. If an important ambiguity blocks implementation, ask the user one
focused question. Otherwise make a conservative, documented decision and
continue.

### General engineering rules

-   Build a working, coherent mini-project---not a giant enterprise
    platform.
-   Follow the PDF where it defines requirements. Where the PDF
    describes optional or research extensions, keep them out of Parts
    1--3.
-   Do not blindly copy code snippets from the PDF. Verify SQL syntax,
    parameterisation, library compatibility, and consistency.
-   Prefer a small number of complete, demonstrable workflows over many
    half-built screens.
-   Keep PostgreSQL as the authoritative relational system of record.
    Use MongoDB for genuinely variable/unstructured submissions or logs,
    not as a duplicate relational database.
-   Include pgvector/semantic matching only to the extent required by
    the PDF's core requirement mapping. Keep the implementation small
    and testable; do not turn it into a large AI/ML feature.
-   Use synthetic demo data only. Clearly label it as synthetic. Do not
    imply it is real city, restaurant, NGO, or food-safety data.
-   Never hardcode credentials, API keys, or secrets. Use
    `.env.example`; keep real `.env` out of Git.
-   Use parameterised SQL. Validate input on the server. Hash passwords
    using a suitable password-hashing library.
-   Enforce important integrity rules in the database as well as in the
    application.
-   Keep code readable and explainable to a DBMS faculty reviewer.
-   Avoid unnecessary abstractions, microservices, cloud dependencies,
    paid APIs, and complex deployment requirements.
-   Do not add blockchain, real IoT integrations, computer vision,
    mobile apps, causal claims, or food-safety guarantees.
-   Do not claim tests passed unless they were actually run. Record
    exact commands and outcomes.
-   Do not silently delete user files or overwrite existing work.
-   After every phase: run relevant tests, fix failures, update
    `PROJECT_STATUS.md`, and report what changed.

### Scope boundary: the four parts

  -----------------------------------------------------------------------
  Part                    Scope                   Required to finish?
  ----------------------- ----------------------- -----------------------
  Part 1                  Database foundation and Yes
                          data model              

  Part 2                  Core application, API,  Yes
                          and database            
                          integration             

  Part 3                  Advanced DBMS           Yes
                          demonstrations,         
                          dashboard, testing, and 
                          submission package      

  Part 4                  Forecasting and         No --- optional only
                          research/experimental   
                          extensions              
  -----------------------------------------------------------------------

**Never start Part 4 automatically.** Finish and verify Parts 1--3
first.

------------------------------------------------------------------------

# PART 1 --- DATABASE FOUNDATION (REQUIRED)

## Phase 1.1 --- Specification and repository setup

Tasks: - Read the PDF and extract only the core requirements needed for
the DBMS mini-project. - Identify the minimum complete set of entities,
relationships, user roles, and workflows. - Inspect the current
repository and preserve useful existing work. - Decide and document the
project structure and local development commands. - Create: -
`README.md` (initial version); - `PROJECT_STATUS.md`; -
`docs/REQUIREMENTS_TRACEABILITY.md`; - `docs/ARCHITECTURE.md`; -
`docs/DECISIONS.md`; - `.gitignore`; - `.env.example`.

Deliverable: - A concise, traceable plan based on the PDF, not an
invented redesign.

Acceptance checks: - The PDF has been read fully. - Core requirements
are listed and mapped. - Optional requirements are clearly separated. -
No application code has been written before the scope and structure are
recorded.

## Phase 1.2 --- Local database environment

Tasks: - Configure Docker Compose for the database services specified by
the core plan: - PostgreSQL 16 with pgvector support; - MongoDB 7. - Add
persistent volumes and health checks. - Configure environment variables
and safe local defaults. - Add clear commands to start, stop, inspect,
and reset the local development databases. - Ensure secrets and local
data files are excluded from Git.

Acceptance checks: - `docker compose config` succeeds. - Both database
services start and become healthy. - PostgreSQL accepts a connection and
the vector extension can be enabled if required. - MongoDB accepts a
connection. - Restarting containers does not unexpectedly erase
persistent data.

## Phase 1.3 --- Relational schema and MongoDB model

Tasks: - Design the ER model from the core workflows in the PDF. -
Implement the necessary relational tables in PostgreSQL. - Include
appropriate: - primary keys; - foreign keys; - UNIQUE, NOT NULL, CHECK
constraints; - sensible data types; - created/updated timestamps where
useful; - indexes for demonstrated query patterns. - Keep the schema
understandable and appropriately normalised. - Do not create every table
in the 77-page plan merely because it is listed. Include the tables
needed to demonstrate the complete core lifecycle. If a table is
explicitly required by the PDF, retain it or document why it was
consolidated. - Design MongoDB collections for variable-schema
submissions/logs described in the PDF. - Document which data belongs in
PostgreSQL and which belongs in MongoDB, with reasons. - Create
versioned SQL migrations. Avoid relying on manual one-off database
changes.

Suggested core lifecycle to preserve where supported by the PDF: 1.
locality/zone and establishment registration; 2. users and roles; 3.
food items/dishes and procurement; 4. inventory lots; 5.
preparation/service or consumption records; 6. waste recording; 7.
surplus listing; 8. recipient organisation and claim/redistribution.

Acceptance checks: - Database migrations run successfully from an empty
database. - Foreign keys and constraints behave correctly. - ER diagram
matches the implemented schema. - MongoDB collection design is
documented and has a real use case. - Schema can be recreated without
manual SQL editing.

## Phase 1.4 --- Seed data

Tasks: - Generate a manageable but convincing synthetic dataset. -
Include multiple zones/localities, establishments, food items, inventory
records, waste events, surplus listings, recipient organisations, and
claims as appropriate to the implemented schema. - Include enough
records to make JOINs, GROUP BY, filtering, analytics, and dashboards
meaningful. - Seed MongoDB with several examples of genuinely
variable-schema submissions/logs. - Make seed scripts repeatable and
deterministic where practical. - Clearly label all demo data as
synthetic.

Do not generate hundreds of thousands of records unless performance
testing genuinely requires it. A mini-project should remain quick to run
on a student laptop.

Acceptance checks: - Seed scripts run without errors. - Re-running the
documented reset-and-seed process produces a usable demo database. -
Data relationships are valid. - The dashboard and required queries have
non-empty results.

**Part 1 completion gate:** Do not proceed until migrations, seed
scripts, ER diagram, and database integrity checks pass.

------------------------------------------------------------------------

# PART 2 --- CORE APPLICATION AND DATABASE INTEGRATION (REQUIRED)

## Phase 2.1 --- Application skeleton and configuration

Tasks: - Implement the application using the core stack specified in the
PDF (Next.js 15 and the required supporting services, unless the
repository already has a justified compatible setup). - Create a clear
folder structure for UI, API routes, database access, validation, and
shared types. - Configure PostgreSQL and MongoDB connections using
environment variables. - Add a simple health/status endpoint or
equivalent database connectivity check. - Keep database access explicit
and understandable. Do not introduce an ORM if it obscures the SQL
required for the DBMS demonstration. - Add consistent error handling and
logging without exposing secrets.

Acceptance checks: - Application starts using documented commands. -
PostgreSQL and MongoDB connections work. - Missing environment variables
produce clear setup errors. - No credentials are committed.

## Phase 2.2 --- Authentication and role-based access

Tasks: - Implement registration/login or a controlled demo-user login
flow appropriate for the mini-project. - Store password hashes, never
plaintext passwords. - Implement at least the roles required by the PDF;
use a minimal set of roles that can be demonstrated. - Enforce
authorisation on the server/API, not only by hiding frontend buttons. -
Prevent unauthorised users from accessing or changing restricted
records. - Provide safe demo accounts in documentation if using seeded
users; use local-only demo credentials and never production credentials.

Acceptance checks: - Valid login works. - Invalid credentials are
rejected. - Passwords are stored as hashes. - Role restrictions are
tested at API level. - Unauthenticated access to protected operations is
rejected.

## Phase 2.3 --- Core lifecycle workflows

Implement complete end-to-end workflows for the core lifecycle. Keep the
number of screens modest and ensure each workflow persists data
correctly.

Minimum practical workflows: - Establishment/user can view and manage
its relevant records. - Record procurement and inventory updates. -
Record preparation/consumption or service activity where included in the
chosen schema. - Record food waste with quantity, category/reason, time,
and establishment context. - Create surplus food listings. - Recipient
organisation can view available surplus and submit a claim. -
Appropriate user can view claim status and update it through valid state
transitions. - Admin/manager can view locality-level records and
summaries.

Rules: - Every write operation must validate input. - Every write
operation must enforce user permissions. - Use database transactions
when a workflow changes multiple related records. - Prevent invalid
quantities, broken references, duplicate claims, and invalid status
transitions. - Display useful errors instead of silently failing. - Do
not build separate screens for every table.

Acceptance checks: - Each core workflow can be completed through the
UI/API. - Data appears correctly after refresh. - Invalid inputs are
rejected. - Related records remain consistent after failures. - Users
cannot perform another role's restricted actions.

## Phase 2.4 --- MongoDB integration and data flow

Tasks: - Implement the MongoDB use case described in the PDF, such as
flexible field submissions, inspection logs, or variable-schema
records. - Demonstrate inserting and retrieving documents with different
optional fields. - If the PDF requires synchronising selected
information with PostgreSQL, implement a clear, controlled ingestion/ETL
process. - Avoid duplicating the full PostgreSQL schema in MongoDB. -
Document the source of truth and failure/retry behaviour. - Add a small,
meaningful semantic matching feature with pgvector only if required by
the core requirement mapping. Keep it limited to a clear use case, such
as matching inconsistent food-item or establishment names. Explain the
embedding source and limitations; do not claim advanced AI capability.

Acceptance checks: - MongoDB data is actually written and read by the
application. - Different document shapes are demonstrated. - Any
PostgreSQL synchronisation is testable and does not create duplicate
records on retry. - If pgvector is included, vector data is stored and a
similarity query returns sensible results. - The reason for using each
database is explained in the documentation.

**Part 2 completion gate:** The main user workflows, role restrictions,
PostgreSQL persistence, and genuine MongoDB use case must work before
moving on.

------------------------------------------------------------------------

# PART 3 --- ADVANCED DBMS, DASHBOARD, TESTING, AND SUBMISSION (REQUIRED)

## Phase 3.1 --- DBMS query catalogue

Tasks: Create a documented SQL catalogue with queries that run against
the actual project database. Include representative examples of: -
SELECT, INSERT, UPDATE, DELETE; - INNER/LEFT joins across multiple
tables; - GROUP BY and HAVING; - aggregate functions; - subqueries and
correlated subqueries where appropriate; - window functions; - a
recursive CTE if it has a meaningful use in the locality hierarchy; -
filtering, sorting, and date-range analysis.

Each query must include: - its purpose in plain English; - the SQL; -
expected output or a short explanation of the result; - tables used.

Do not include decorative SQL that does not execute against the final
schema.

Acceptance checks: - Every documented query has been executed
successfully. - Query results are meaningful with the seeded data. - The
catalogue matches the final schema.

## Phase 3.2 --- Advanced database features

Implement and demonstrate a justified set of advanced DBMS features from
the PDF, such as: - triggers for audit fields, inventory consistency, or
valid state changes; - stored procedures/functions for a meaningful
operation; - transactions for multi-step claims or inventory
operations; - indexes and EXPLAIN/EXPLAIN ANALYZE comparisons where
useful; - views and materialised views for repeated summaries; -
partitioning only if it is actually justified and can be demonstrated; -
full-text search if included in the core plan; - pgvector similarity
search if included in the core plan.

Important: - Prefer fewer features implemented correctly over a long
list implemented superficially. - If the PDF explicitly requires a
feature, include it or record a clear blocker and ask the user. - For
each feature, document: why it is used, where it is implemented, and how
to demonstrate it. - Include any required ALTER and DROP examples in a
safe, clearly labelled demonstration SQL file or migration history.
Never drop live project tables as part of normal startup.

Acceptance checks: - Triggers/functions execute correctly. - Transaction
rollback is demonstrated for a failure case. - Indexes are present and
their purpose is documented. - Views return correct results. - Any
materialised view refresh process is documented. - All feature
demonstrations run on a clean database.

## Phase 3.3 --- Dashboard and UI completion

Build a polished but manageable interface. Prioritise usability and
clear demonstration over animation or excessive page count.

Required screens should cover: - login; - role-appropriate
home/dashboard; - establishment or food lifecycle records; - waste
recording and history; - surplus listings and recipient claims; -
locality/zone analytics; - admin/manager views where needed.

UI expectations: - consistent navigation and visual design; - responsive
layout; - loading, empty, success, and error states; - readable tables,
filters, and summary cards; - realistic seeded data; - no fake buttons
or non-functional controls; - charts must use real database query
results, not hardcoded numbers.

Acceptance checks: - Every visible primary action works. - Charts and
summary cards use live application data. - Role-based navigation matches
server-side permissions. - The app remains usable at normal laptop
resolution.

## Phase 3.4 --- Testing and verification

Create and run tests for: - database migrations from empty state; - seed
process; - primary/foreign key and CHECK constraints; - authentication
and role permissions; - core CRUD/workflow operations; - transaction
rollback and consistency; - MongoDB insert/read and any ingestion
process; - required SQL catalogue queries; - API validation and error
handling; - critical UI flows where practical.

Also perform: - clean database reset and rebuild; - clean application
start; - fresh-clone simulation using only tracked files; - basic
performance checks for key queries; - manual demo walkthrough.

Do not fabricate test results. If a test cannot be run due to
environment limitations, state exactly why and provide the command
needed to run it.

Acceptance checks: - All implemented tests pass, or remaining failures
are clearly documented. - No critical console errors or broken main
workflows. - Fresh setup instructions work from a clean clone. - No
untracked local dependency is required for the project to run.

## Phase 3.5 --- Final documentation and submission package

Produce: - `README.md` with project overview, features, architecture,
stack, setup, run, reset, seed, test, and demo instructions; - ER
diagram; - relational schema/data dictionary; - MongoDB collection
design and example documents; - architecture/data-flow diagram; -
requirements traceability matrix; - SQL query catalogue; - advanced DBMS
features explanation; - test report with actual commands and results; -
demo account instructions, if applicable; - screenshots of the working
application; - a concise project report or report-ready documentation; -
a short demo script explaining the problem, workflow, database choices,
and key DBMS concepts.

Git readiness: - Ensure `.gitignore` excludes `.env`, secrets, local
database volumes, build output, caches, and dependencies. - Ensure
`.env.example` is complete and contains placeholders only. - Check that
no secrets or personal data are committed. - Organise commits logically
if Git is already initialised. Do not rewrite or erase existing
history. - Verify that the project can be started using only tracked
files and documented setup steps.

**Part 3 completion gate --- project is considered complete only
when:** 1. A fresh setup can start the application and databases. 2.
Core workflows work end to end. 3. PostgreSQL and MongoDB have
meaningful, demonstrated roles. 4. The required DBMS concepts and SQL
queries are demonstrable. 5. Tests and documentation reflect the actual
implementation. 6. The user can explain the architecture and demonstrate
the project to faculty.

Stop here. Do not begin Part 4 automatically.

------------------------------------------------------------------------

# PART 4 --- OPTIONAL EXTENSIONS (NOT REQUIRED FOR SUBMISSION)

Only start this part if the user explicitly requests it after Parts 1--3
are complete.

Possible extensions from the PDF: - demand or waste forecasting; -
seasonal-naive, ridge, or LightGBM model comparisons; - forecast
evaluation and time-based validation; - research-oriented food-state or
safety-related data; - storage profiles and temperature simulations; -
batch-level traceability enhancements; - intervention and outcome
tracking; - additional literature review and research positioning.

Guardrails: - These are optional extensions, not prerequisites for a
working DBMS mini-project. - Do not claim food is safe/unsafe or provide
lab-grade shelf-life predictions. - Do not claim causal impact from
observational data. - Do not add real IoT, mobile, or computer-vision
integrations unless separately approved. - Do not delay or destabilise
the completed Parts 1--3 to add optional features.

------------------------------------------------------------------------

# How Claude Code must work

Use this loop for every phase:

1.  **Inspect** the relevant files and current implementation.
2.  **Plan** the smallest complete change for the phase.
3.  **Implement** the change.
4.  **Run** the relevant tests and checks.
5.  **Fix** failures before moving forward.
6.  **Document** the implementation and commands.
7.  **Update** `PROJECT_STATUS.md` and `REQUIREMENTS_TRACEABILITY.md`.
8.  **Report** what was completed, what was tested, and what remains.

Do not: - jump ahead to later phases; - mark a phase complete without
running its checks; - create placeholder pages or fake functionality and
call it done; - silently weaken a requirement because it is
inconvenient; - expand the project beyond the mini-project scope; -
start Part 4 without approval.

If context limits or a session restart interrupts work: - read
`WORKFLOW.md` and `PROJECT_STATUS.md`; - inspect the actual repository
state; - verify the last claimed completed phase; - continue from the
first incomplete task; - do not assume the previous session completed
work merely because the status file says so.

## Initial command to give Claude Code

After placing this file and the PDF in the project root, open Claude
Code in that folder and send:

> Read `WORKFLOW.md` and the entire `ZoneFood_Master_Plan(1).pdf`.
> Inspect the repository. Follow the workflow exactly. First complete
> Phase 1.1 only: extract and map the core requirements, inspect the
> existing folder, create the initial planning/documentation files, and
> present the concise scope and phase checklist. Do not start
> application implementation until Phase 1.1 is documented. Parts 1--3
> are required; Part 4 is optional and must not be started without my
> explicit approval. Do not ask me questions unless a genuine blocker
> prevents a safe decision.

------------------------------------------------------------------------

## Definition of done

The ZoneFood DBMS mini-project is done when **Parts 1, 2, and 3** are
implemented, tested, documented, and runnable from a fresh clone. Part 4
is outside the required completion scope.
