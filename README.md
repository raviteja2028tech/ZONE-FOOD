
# ZoneFood
### Locality-Scale Food Resource & Waste Intelligence System

<p align="center">
  <strong>A database-driven platform for food lifecycle tracking, waste analytics, surplus redistribution and forecasting.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Project-DBMS%20Mini%20Project-blue" />
  <img src="https://img.shields.io/badge/Database-PostgreSQL%2016-336791" />
  <img src="https://img.shields.io/badge/MongoDB-7.x-47A248" />
  <img src="https://img.shields.io/badge/Frontend-Next.js%2016-black" />
  <img src="https://img.shields.io/badge/Forecasting-LightGBM-orange" />
</p>

---

## Table of Contents

- [Overview](#overview)
- [Problem Statement](#problem-statement)
- [Objectives](#objectives)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Database Design](#database-design)
- [Application Modules](#application-modules)
- [Advanced DBMS Implementation](#advanced-dbms-implementation)
- [Waste Forecasting](#waste-forecasting)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Running the Application](#running-the-application)
- [Demo Accounts](#demo-accounts)
- [Testing](#testing)
- [Security](#security)
- [Documentation](#documentation)
- [Dataset](#dataset)
- [Team](#team)
- [Academic Context](#academic-context)

---

## Overview

**ZoneFood** is a locality-scale food resource and waste intelligence system developed as a Database Management Systems (DBMS) mini-project.

The platform tracks food across its complete lifecycle:

**Procurement → Inventory → Preparation → Service → Waste → Surplus → Redistribution**

It brings together different types of establishments, including:

- Restaurants
- College messes and canteens
- Hostels
- Hospitals
- Offices
- Supermarkets
- Clubs
- Residential communities

Instead of treating food waste as an isolated establishment-level problem, ZoneFood provides a connected database system that supports locality-wide analysis.

It helps answer important questions:

- Where is the maximum food waste occurring?
- Which establishments consistently generate excess waste?
- Which suppliers are associated with higher spoilage?
- How does waste change across weekdays and seasons?
- How much surplus food can potentially be redistributed?
- Which recipients are suitable for available surplus?
- How much food waste can be expected in the coming days?

The project combines relational database management, document-oriented storage, vector similarity search, full-stack application development, analytical SQL and machine-learning-based forecasting.

> **Data Disclaimer:** All records in this repository are synthetic and created exclusively for academic demonstration. Names, people, suppliers, organisations, quantities and emission factors are fictional. No real business, institution, locality or food-safety record is represented.

---

## Problem Statement

Food procurement, inventory, preparation, consumption and waste records are often maintained separately across different establishments.

This fragmentation creates several problems:

- Lack of centralised food lifecycle tracking.
- Difficulty maintaining consistency between inventory, preparation and consumption.
- Limited visibility into recurring food waste patterns.
- Difficulty identifying surplus redistribution opportunities.
- Inability to perform locality-wide analytical comparisons.
- Lack of historical forecasting for better preparation and inventory planning.

ZoneFood addresses these challenges through an integrated database-backed platform that connects operational records and transforms them into actionable analytical information.

---

## Objectives

1. Design a structured relational database for food lifecycle management.
2. Integrate PostgreSQL and MongoDB for different data requirements.
3. Implement database constraints, triggers, procedures and transactions.
4. Develop role-based authentication and application workflows.
5. Enable food waste analytics at establishment and locality levels.
6. Implement surplus-to-recipient matching using semantic similarity.
7. Demonstrate advanced SQL concepts and query optimisation.
8. Compare forecasting models using chronological validation.
9. Provide reproducible setup, database migrations and automated testing.

---

## Key Features

### 1. Complete Food Lifecycle Management

- Procurement and supplier tracking.
- Inventory lot management.
- Preparation batch recording.
- Service session tracking.
- Waste event recording.
- Surplus listing and redistribution.
- Claim management and approval workflows.

### 2. Multi-Role Application

| Role | Capabilities |
|---|---|
| Zone Administrator | Zone-wide monitoring, analytics, establishments, recipients and system administration |
| Auditor | Read-only access to operational information and audit records |
| Establishment Manager | Procurement, inventory, preparation, waste, surplus and staff management |
| Establishment Staff | Day-to-day operational record management |
| Recipient Agent | Surplus discovery, matching and claim management |

### 3. Analytics Dashboard

- Waste trend analysis.
- Weekday waste profiles.
- Zone comparisons.
- Diversion rate analysis.
- Establishment peer rankings.
- Surplus rescue funnel.
- Supplier spoilage analysis.
- Data provenance and anomaly identification.

### 4. Surplus Redistribution

- Surplus food listing.
- Recipient suitability ranking.
- Semantic food matching.
- Claim submission and approval.
- Claim lifecycle management.
- Inventory deduction and transaction integrity.

### 5. Advanced Database Demonstrations

A dedicated DBMS Lab provides access to:

- SQL query catalogue.
- EXPLAIN ANALYZE.
- Constraint demonstrations.
- Database object exploration.
- Materialised view refresh.
- Transaction and rollback demonstrations.

### 6. Waste Forecasting

Three forecasting approaches are compared:

- Seasonal Naive
- Ridge Regression
- LightGBM

The forecasting dashboard provides:

- Actual versus predicted waste.
- Model performance comparison.
- Feature importance.
- Expected next-day waste by establishment.
- Zone-level forecasts.

---

## System Architecture

ZoneFood uses a multi-database architecture.

```text
                   USERS
                     |
                     v
             NEXT.JS APPLICATION
             React 19 + TypeScript
                     |
          +----------+----------+
          |                     |
          v                     v
    APPLICATION APIs       AUTHENTICATION
          |
    +-----+-------------------+
    |                         |
    v                         v
POSTGRESQL 16              MONGODB 7
+ pgvector                 Flexible Documents
    |                         |
    |                         |
    v                         v
Core Transactions        Field Submissions
Food Lifecycle           Inspection Reports
Inventory                Sensor Readings
Waste Events             Establishment Metadata
Surplus & Claims         Activity Records
    |
    v
DATABASE ANALYTICS
SQL Queries / Views / Triggers
    |
    v
FORECASTING PIPELINE
Seasonal Naive / Ridge / LightGBM
    |
    v
ANALYTICS & FORECAST DASHBOARDS
```

### Why Three Database Technologies?

| Technology | Purpose |
|---|---|
| PostgreSQL 16 | Primary transactional database and system of record |
| MongoDB 7 | Flexible operational documents and heterogeneous submissions |
| pgvector | Vector similarity search and semantic matching within PostgreSQL |

**PostgreSQL** maintains structured relationships, transactional consistency, constraints and business rules.

**MongoDB** handles differently shaped submissions without forcing every establishment into an excessively wide relational structure.

**pgvector** enables semantic similarity search using 384-dimensional embeddings and HNSW indexes.

---

## Technology Stack

| Category | Technologies |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Visualisation | Recharts |
| Animations | Motion, GSAP |
| Backend | Next.js App Router and API routes |
| Relational Database | PostgreSQL 16 |
| Document Database | MongoDB 7 |
| Vector Search | pgvector |
| Database Access | PostgreSQL `pg` driver, MongoDB official driver |
| Validation | Zod |
| Authentication | bcrypt, signed HTTP-only session cookies |
| Machine Learning | Python, Ridge Regression, LightGBM |
| Embeddings | MiniLM-L6-v2, ONNX Runtime |
| Infrastructure | Docker Compose |
| Testing | pytest, Vitest, integration tests |

---

## Database Design

### PostgreSQL

PostgreSQL acts as the central system of record.

The relational schema covers:

- Geographical hierarchy.
- Establishments and organisations.
- Food items and dishes.
- Suppliers and procurement.
- Inventory lots.
- Preparation batches.
- Service sessions.
- Waste events.
- Surplus listings.
- Recipient claims.
- Audit records.
- Forecasting information.

### MongoDB

MongoDB stores flexible operational records:

| Collection / Data Area | Purpose |
|---|---|
| Waste Submissions | Different formats of waste reporting |
| Inspection Reports | Operational inspection records |
| Bin Sensor Readings | Time-series sensor information |
| Establishment Metadata | Flexible establishment-specific information |
| Activity Stream | Operational activity records |

### Vector Search

pgvector is used for:

- Food-name normalisation.
- Semantic food matching.
- Surplus-to-recipient similarity matching.

The embedding pipeline uses MiniLM-L6-v2 locally through ONNX Runtime.

---

## Application Modules

| Module | Description |
|---|---|
| Dashboard | Zone-wide operational KPIs and analytics |
| Establishments | Establishment management and comparisons |
| Recipients | Recipient organisation management |
| Zones | Geographical hierarchy and roll-up analysis |
| Procurement | Supplier and purchase records |
| Inventory | Stock and expiry management |
| Service Sessions | Preparation and service tracking |
| Waste Management | Waste recording and analysis |
| Surplus Management | Surplus creation and recipient matching |
| Claims | Claim approval and lifecycle management |
| Field Logs | Flexible field submissions |
| Inspections | Inspection report management |
| Food Catalogue | Food and dish catalogue |
| Matching | Semantic food matching |
| Data Sync | Embedding and demonstration data preparation |
| Analytics | Waste trends, comparisons and diversion metrics |
| Forecast | Waste forecasting and model comparisons |
| DBMS Lab | SQL queries and advanced database demonstrations |
| Audit Log | User-attributed audit information |
| System Status | Database and application status |

The interface provides role-specific dashboards and workflows. Data displayed by the application is retrieved from the connected databases.

---

## Advanced DBMS Implementation

ZoneFood demonstrates practical DBMS concepts beyond basic CRUD operations.

### SQL Query Catalogue

**26 SQL queries (Q01–Q26)** demonstrate:

- Joins.
- GROUP BY and HAVING.
- Nested subqueries.
- Correlated subqueries.
- Window functions.
- Recursive CTEs.
- DML operations.

Location: `db/queries/`

Documentation: `docs/QUERY_CATALOGUE.md`

### Stored Functions and Procedures

Examples include:

- `fn_claim_surplus`
- `fn_transition_claim`
- `sp_close_service_session`

Implemented through the database migrations.

### Triggers

The implementation includes trigger groups T1–T6 covering:

| Trigger Area | Responsibility |
|---|---|
| Consumption Balance | Quantity consistency |
| Cost and CO2e Provenance | Cost and emissions attribution |
| Inventory Ledger | Controlled stock deduction |
| Audit | User-attributed activity tracking |
| Claim State Machine | Valid claim transitions |
| Listing Guard | Surplus listing validation |

### Views and Materialised Views

- Reusable analytical views.
- Materialised views for precomputed analytical results.
- Administrative refresh functionality.

### Indexing and Partitioning

- B-tree and specialised indexes.
- Full-text and trigram search.
- HNSW vector indexes.
- Partitioned event data.
- EXPLAIN ANALYZE evidence.

### Transactions and Concurrency

- ACID transaction demonstrations.
- Savepoints.
- Rollback.
- Concurrent operation tests.
- Race-condition handling.

### DDL Operations

Demonstrations include:

- ALTER operations.
- DROP operations.
- Controlled schema lifecycle management.

### Audit Logging

Relevant database changes are attributed to the authenticated application user.

More details:

- `docs/ADVANCED_DBMS.md`
- `docs/DB_OBJECTS.md`
- `docs/EXPLAIN_EVIDENCE.md`
- `docs/CONCURRENCY_EVIDENCE.md`

---

## Waste Forecasting

ZoneFood includes an implemented forecasting pipeline using historical synthetic waste records.

### Models Compared

| Model | Description |
|---|---|
| Seasonal Naive | Historical seasonal baseline |
| Ridge Regression | Regularised linear regression |
| LightGBM | Gradient-boosted decision trees |

### Forecasting Methodology

The pipeline uses:

- Chronological train, validation and test splits.
- Leakage-aware feature engineering.
- Historical and calendar-based features.
- A 28-day test evaluation window.
- Establishment-level and zone-level evaluation.

Random shuffling is avoided to preserve the time sequence of observations.

### Evaluation Metrics

| Metric | Purpose |
|---|---|
| MAE | Mean Absolute Error |
| RMSE | Root Mean Squared Error |
| WAPE | Weighted Absolute Percentage Error |

### Forecasting Workflow

```text
Historical Waste Records
          |
          v
    Data Preparation
          |
          v
   Feature Engineering
          |
          v
 Chronological Splitting
          |
     +----+----+
     |    |    |
     v    v    v
 Seasonal Ridge LightGBM
 Naive
     |    |    |
     +----+----+
          |
          v
   Model Evaluation
          |
          v
 PostgreSQL Storage
          |
          v
    Forecast Dashboard
```

### Execution

```bash
python scripts/forecast.py
```

The script trains and evaluates the models and stores the results in PostgreSQL.

Documentation: `docs/FORECASTING.md`

> Forecasting results are based on synthetic historical data. They demonstrate the implemented modelling and evaluation pipeline and should not be interpreted as real-world predictive guarantees.

---

## Project Structure

```text
ZONE-FOOD/
│
├── db/
│   ├── migrations/
│   │   ├── 001_*.sql
│   │   ├── ...
│   │   └── 019_*.sql
│   │
│   ├── queries/
│   │   ├── Q01_*.sql
│   │   ├── ...
│   │   └── Q26_*.sql
│   │
│   └── demos/
│
├── src/
│   ├── app/
│   │   ├── API routes
│   │   └── Application pages
│   │
│   ├── components/
│   │
│   └── lib/
│       ├── auth/
│       ├── db/
│       ├── domain/
│       ├── embeddings/
│       ├── env/
│       ├── http/
│       ├── log/
│       └── validation/
│
├── scripts/
│   ├── migrate.py
│   ├── mongo_init.py
│   ├── seed.py
│   ├── seed_catalog.py
│   ├── verify_db.py
│   ├── setup_db.py
│   ├── forecast.py
│   ├── gen_docs.py
│   ├── gen_part3_docs.py
│   └── run_all_tests.py
│
├── scripts-web/
│   └── prepare-demo.ts
│
├── tests/
│   └── Database and migration tests
│
├── tests-web/
│   └── Web unit and integration tests
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   ├── MONGODB_DESIGN.md
│   ├── ER_DIAGRAM.md
│   ├── DATA_DICTIONARY.md
│   ├── QUERY_CATALOGUE.md
│   ├── ADVANCED_DBMS.md
│   ├── DB_OBJECTS.md
│   ├── EXPLAIN_EVIDENCE.md
│   ├── CONCURRENCY_EVIDENCE.md
│   ├── FORECASTING.md
│   ├── TEST_REPORT.md
│   ├── REQUIREMENTS_AUDIT.md
│   ├── REQUIREMENTS_TRACEABILITY.md
│   ├── PROJECT_REPORT.md
│   ├── DEMO_SCRIPT.md
│   ├── VIVA_QA.md
│   └── screenshots/
│
├── docker-compose.yml
├── requirements.txt
├── package.json
├── .env.example
├── .gitignore
├── README.md
├── IMPLEMENTATION.md
├── CURRENT_STATUS.md
└── FRIEND_SETUP_GUIDE.md
```

---

## Getting Started

Follow these instructions to run ZoneFood locally.

### Prerequisites

Install the following:

| Requirement | Version |
|---|---|
| Docker Desktop | Latest stable |
| Python | 3.11+ |
| Node.js | 20.9+ |
| npm | Included with Node.js |
| Git | Latest stable |

Make sure Docker Desktop is running before starting the database services.

### 1. Clone the Repository

```bash
git clone https://github.com/raviteja2028tech/ZONE-FOOD.git

cd ZONE-FOOD
```

### 2. Configure Environment Variables

Create your local environment file.

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

**Linux / macOS:**

```bash
cp .env.example .env
```

Open `.env` and configure the required credentials and environment variables.

Never commit your real `.env` file.

### 3. Create Python Virtual Environment

```bash
python -m venv .venv
```

**Windows PowerShell:**

```powershell
.\.venv\Scripts\python -m pip install -r requirements.txt
```

**Linux / macOS:**

```bash
.venv/bin/python -m pip install -r requirements.txt
```

### 4. Start Database Services

```bash
docker compose up -d --wait
```

This starts:

- PostgreSQL 16 with pgvector.
- MongoDB 7.

The services use Docker volumes to preserve database data between normal restarts.

### 5. Initialise the Databases

**Windows PowerShell:**

```powershell
.\.venv\Scripts\python scripts/setup_db.py
```

**Linux / macOS:**

```bash
.venv/bin/python scripts/setup_db.py
```

This prepares the database schema, applies migrations and loads the synthetic demonstration dataset.

To completely reset and rebuild the database:

```bash
python scripts/setup_db.py --reset
```

> Warning: `--reset` destroys and recreates the project database contents. Use it only when a fresh rebuild is intended.

### 6. Install Node Dependencies

```bash
npm install
```

### 7. Prepare Demonstration Data

```bash
npm run demo:prepare
```

This prepares local embeddings and demonstration surplus listings. The first run downloads the required embedding model into the local cache.

### 8. Generate Forecasting Results

```bash
python scripts/forecast.py
```

This trains and evaluates the forecasting models and stores the generated results in PostgreSQL.

### 9. Start the Application

```bash
npm run dev
```

Open:

**http://localhost:3000**

ZoneFood is now running locally.

---

## Environment Configuration

The repository includes `.env.example` as the configuration template.

The actual `.env` file is local-only and must not be committed.

Configure the database connection details, application settings, authentication/session secrets and demonstration password according to the variables documented in `.env.example`.

Important configuration considerations:

- Use strong local passwords.
- Keep secrets out of source control.
- Use the same database credentials across the relevant application and setup scripts.
- Configure `DEMO_USER_PASSWORD` for seeded demonstration accounts.
- Keep database ports consistent with Docker Compose configuration.

Default host ports:

| Service | Host Port |
|---|---:|
| PostgreSQL | 5433 |
| MongoDB | 27018 |
| Next.js | 3000 |

Database host connections use `127.0.0.1` to avoid IPv6 localhost resolution delays on certain Windows configurations.

---

## Running the Application

### Development

```bash
npm run dev
```

### Production Build

```bash
npm run build
npm start
```

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

### Database Management

| Task | Command |
|---|---|
| Start databases | `docker compose up -d --wait` |
| Stop databases | `docker compose down` |
| Check containers | `docker compose ps` |
| View PostgreSQL logs | `docker compose logs -f postgres` |
| View MongoDB logs | `docker compose logs -f mongo` |
| Apply migrations | `python scripts/migrate.py up` |
| Check migration status | `python scripts/migrate.py status` |
| Verify database | `python scripts/verify_db.py` |
| Reseed data | `python scripts/seed.py` |
| Regenerate database documentation | `python scripts/gen_docs.py` |

Normal shutdown preserves data:

```bash
docker compose down
```

To delete all database volumes and stored database data:

```bash
docker compose down -v
```

**Use the volume deletion command carefully.**

---

## Demo Accounts

ZoneFood creates synthetic demonstration users through its database seed process.

All seeded accounts share the password configured through:

```env
DEMO_USER_PASSWORD=your_local_demo_password
```

Example account roles:

| Role | Example Email |
|---|---|
| Zone Administrator | `admin@zonefood.example` |
| Auditor | `auditor@zonefood.example` |
| Establishment Manager | `manager.greenfield.academy.canteen@zonefood.example` |
| Establishment Staff | `staff.greenfield.academy.canteen@zonefood.example` |
| Recipient Agent | `agent.annapoorna.community.kitchen@zonefood.example` |

The seeded dataset contains multiple users across the supported roles.

To inspect the available users:

```sql
SELECT email, role
FROM app_user
ORDER BY user_id;
```

These are local synthetic demonstration accounts, not production credentials.

---

## Testing

ZoneFood includes database tests, web unit tests and application integration tests.

### 1. Database Test Suite

```bash
python -m pytest -v
```

Covers:

- Database migrations.
- Constraints and triggers.
- SQL query catalogue.
- Database relationships.
- Transaction behaviour.
- Concurrency.

### 2. Web Unit Tests

```bash
npm test
```

### 3. Web Integration Tests

```bash
npm run test:integration
```

Covers application APIs, role-based access, workflows, ETL and concurrency using disposable test databases.

### 4. Complete Test Workflow

```bash
python scripts/run_all_tests.py
```

To skip the build step:

```bash
python scripts/run_all_tests.py --skip-build
```

The complete test workflow generates:

```text
docs/TEST_REPORT.md
```

The test suites are designed to use separate test databases and must not modify the working demonstration database.

---

## Security

Security measures implemented in ZoneFood include:

- bcrypt password hashing with cost factor 12.
- Signed HTTP-only session cookies.
- SameSite=Lax session configuration.
- Database-backed role and active-status checks.
- Role-based permission checks on application pages and API routes.
- Tenant-scoped SQL operations.
- Zod input validation.
- Database constraints and triggers.
- Login lockout controls.
- Same-origin mutation checks.
- Environment-based secret management.

The auditor role is read-only.

---

## Documentation

The `docs/` directory contains the technical documentation and academic project materials.

| Document | Description |
|---|---|
| `IMPLEMENTATION.md` | Complete implementation overview |
| `ARCHITECTURE.md` | System architecture and data flow |
| `DATA_MODEL.md` | Relational database design |
| `MONGODB_DESIGN.md` | MongoDB collection design |
| `ER_DIAGRAM.md` | Entity Relationship Diagram |
| `DATA_DICTIONARY.md` | Database table and attribute reference |
| `QUERY_CATALOGUE.md` | SQL query catalogue |
| `ADVANCED_DBMS.md` | Advanced DBMS implementation |
| `DB_OBJECTS.md` | Database objects |
| `EXPLAIN_EVIDENCE.md` | Query execution plan evidence |
| `CONCURRENCY_EVIDENCE.md` | Transaction and concurrency demonstrations |
| `FORECASTING.md` | Forecasting methodology and evaluation |
| `TEST_REPORT.md` | Automated testing results |
| `REQUIREMENTS_AUDIT.md` | Requirements audit |
| `REQUIREMENTS_TRACEABILITY.md` | Requirement-to-implementation mapping |
| `PROJECT_REPORT.md` | Academic project report |
| `DEMO_SCRIPT.md` | Application demonstration guide |
| `VIVA_QA.md` | DBMS viva preparation |

Additional setup documentation:

- `FRIEND_SETUP_GUIDE.md` – Fresh clone and execution instructions.
- `CURRENT_STATUS.md` – Project progress and verification record.
- `ZoneFood_WORKFLOW.md` – Project development workflow.

---

## Dataset

The project uses a synthetic locality-scale dataset containing approximately 150 days of historical records.

### Dataset Overview

| Category | Approximate Volume |
|---|---:|
| Geographical structure | 1 sector, 6 blocks, 24 streets |
| Establishments | 32 |
| Residential units | 24 |
| Food items | 81 |
| Dishes | 264 |
| Service sessions | 9,500 |
| Preparation batches | 22,000 |
| Procurement records | 7,900 |
| Inventory lots | 19,900 |
| Waste events | 54,600 |
| Surplus listings | 4,400 |
| Surplus claims | 3,900 |
| MongoDB documents | 650+ |

The dataset includes intentionally planted demonstration patterns such as:

- Chronic over-preparation.
- Supplier-related spoilage.
- Seasonal and weekday variation.
- Monsoon-related spoilage patterns.
- Unusual waste events.
- Surplus redistribution activity.

These patterns help demonstrate database queries, analytical dashboards and forecasting workflows.

All quantities are approximate and refer to the synthetic seeded dataset.

---

## Team

**Developed by:**

| Name | SRN |
|---|---|
| A RAVITEJA | PES1UG24AM001 |
| ARYA DEYANG | PES1UG24AM054 |

**Department:** Artificial Intelligence and Machine Learning (AIML)  
**Institution:** PES University

**Course:** Database Management Systems (DBMS)

---

## Academic Context

ZoneFood is developed as a DBMS mini-project for demonstrating the practical application of database management concepts.

The project focuses on:

- Relational database design and normalisation.
- Multi-database integration.
- SQL querying and optimisation.
- Database constraints and integrity.
- Stored procedures and triggers.
- Views and materialised views.
- Indexing and partitioning.
- Transactions and concurrency.
- Authentication and authorisation.
- Analytical data processing.
- Machine-learning-based waste forecasting.

The objective is to demonstrate how database technologies can be integrated into a practical, data-driven application.

---

## License

This repository is maintained as an academic project.

Unless a separate license file is provided, all rights remain with the respective project authors. Please contact the authors before redistributing the project as a separate work.

---

<p align="center">
  <strong>ZONEFOOD</strong><br/>
  Turning food lifecycle data into actionable intelligence.
</p>
