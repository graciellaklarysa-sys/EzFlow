# EzFlow --- Product Requirements Document (PRD)

**Product name:** EzFlow\
**Tagline:** Run Smarter. Flow Better.\
**Document type:** Product Requirements Document\
**Version:** 1.0\
**Status:** Prototype / MVP specification\
**Primary market:** Indonesian F&B UMKM

------------------------------------------------------------------------

## 1. Product Overview

### 1.1 Product vision

EzFlow is an AI-powered business management platform designed to help
food and beverage (F&B) businesses manage, monitor, and optimize their
daily operations from one integrated system.

The platform combines core business management capabilities---POS,
inventory, menu, employees, finance, operations, and reporting---with an
intelligence layer that provides data-driven recommendations and
Computer Vision-based outlet analytics.

### 1.2 Problem statement

Many small and medium-sized F&B businesses rely on disconnected tools,
manual records, and intuition to make operational decisions. This can
lead to:

-   Inaccurate sales and financial records.
-   Poor inventory planning and unexpected stockouts.
-   Limited visibility into product profitability.
-   Inefficient employee and operational workflows.
-   Underutilized seating areas and ineffective table layouts.
-   Difficulty identifying peak hours and slow business periods.
-   Limited ability to turn operational data into actionable decisions.

### 1.3 Proposed solution

EzFlow provides one integrated platform where business owners can:

-   Record and manage sales transactions.
-   Monitor stock and ingredient consumption.
-   Manage menus, recipes, and product margins.
-   Track employees, shifts, and attendance.
-   Record expenses and monitor financial performance.
-   Manage daily operational checklists.
-   Review AI-generated business insights.
-   Analyze customer flow and seating utilization through a CCTV
    analytics workflow.
-   Compare performance across multiple outlets.

### 1.4 Value proposition

**EzFlow helps F&B businesses run more efficiently by connecting daily
business operations with actionable business intelligence.**

### 1.5 Product positioning

EzFlow is not only a point-of-sale application. It is an **AI-powered
operating system for F&B businesses**, combining:

1.  **Core Management:** POS, inventory, menu, employees, finance,
    operations, and reports.
2.  **Business Intelligence:** AI recommendations, sales forecasting,
    menu intelligence, inventory intelligence, and Computer Vision-based
    outlet analytics.

------------------------------------------------------------------------

## 2. Goals and Success Metrics

### 2.1 Product goals

1.  Centralize essential F&B business operations in one platform.
2.  Reduce manual data entry and operational inconsistencies.
3.  Connect sales transactions with inventory and financial records.
4.  Help owners make better decisions using actual business data.
5.  Support single-outlet and multi-outlet businesses.
6.  Establish a scalable foundation for AI and Computer Vision
    capabilities.

### 2.2 MVP success criteria

The MVP is considered functionally successful when:

-   A new user can register, authenticate, and complete business
    onboarding.
-   An owner can create and configure an outlet.
-   A cashier can create and complete a POS transaction.
-   Completed transactions update sales records and inventory correctly.
-   Recipe-based ingredient deductions work correctly.
-   Owners can manage menus, inventory, employees, expenses, and
    operational tasks.
-   Dashboard metrics are calculated from persisted application data.
-   Users can generate basic reports and export transaction data.
-   AI recommendations use supplied business data and clearly
    distinguish facts from predictions.
-   CCTV uploads can be submitted into an analysis workflow without
    falsely claiming that Computer Vision processing has occurred.
-   Business data is isolated between separate business accounts.
-   Role-based access restrictions are enforced.

### 2.3 Suggested product KPIs

-   Number of registered businesses.
-   Number of active outlets.
-   Weekly active users.
-   Number of transactions processed.
-   POS transaction completion rate.
-   Inventory adjustment accuracy.
-   Percentage of transactions with successful stock deductions.
-   Number of AI insights viewed.
-   Number of CCTV analysis jobs submitted.
-   User retention and feature adoption.

------------------------------------------------------------------------

## 3. Target Users and Roles

### 3.1 Target market

Primary target market:

-   Independent coffee shops.
-   Cafés.
-   Restaurants.
-   Bakeries.
-   Beverage businesses.
-   Other Indonesian F&B UMKM.

The product must support both single-outlet businesses and businesses
operating multiple outlets.

### 3.2 User personas

  -----------------------------------------------------------------------
  Persona                             Needs
  ----------------------------------- -----------------------------------
  Business owner                      Business overview, sales, profit,
                                      inventory, and AI recommendations

  Outlet manager                      Daily operations, stock, employees,
                                      and outlet performance

  Cashier                             Fast and accurate transaction
                                      processing

  Operational staff                   Assigned tasks, schedules, and
                                      checklists

  Platform administrator              Demo environment and platform-level
                                      administration
  -----------------------------------------------------------------------

### 3.3 Roles and permissions

**SUPER_ADMIN** - Manage platform-level demo environments. - Manage
business accounts. - Access platform administration features. - Must not
automatically receive unrestricted access to private business data
without an authorized administrative workflow.

**OWNER** - Full access to their own business. - Manage outlets,
employees, finances, inventory, settings, and reports. - Invite and
manage business members.

**MANAGER** - Manage assigned outlets. - Monitor operations. - Manage
inventory and employees within assigned permissions. - View permitted
outlet reports.

**CASHIER** - Access POS. - Create and complete transactions. - View
permitted transaction history.

**STAFF** - View assigned tasks and schedules. - Update permitted
operational task statuses.

All permissions must be validated on the backend or through database
security rules, not only by hiding frontend elements.

------------------------------------------------------------------------

## 4. User Journeys

### 4.1 First-time registration and onboarding

1.  User opens EzFlow.
2.  User selects **Get Started**.
3.  User registers using name, email, password, and password
    confirmation.
4.  System validates the registration.
5.  User creates a business profile.
6.  User creates the first outlet.
7.  User configures business preferences.
8.  System creates the business workspace and assigns the registering
    user the OWNER role.
9.  User is directed to the business dashboard.

### 4.2 Returning user login

1.  User enters email and password.
2.  System authenticates the user.
3.  System loads the user's business memberships and permissions.
4.  User selects a business or outlet if multiple are available.
5.  User is directed to the appropriate dashboard.

### 4.3 POS transaction

1.  Cashier opens POS.
2.  Cashier searches or selects menu items.
3.  Cashier adds products to the cart and adjusts quantities.
4.  System calculates subtotal, discount, tax, service charge, and
    total.
5.  Cashier selects a payment method.
6.  System validates stock availability.
7.  Cashier confirms payment.
8.  System creates the transaction and transaction items.
9.  System deducts recipe ingredients atomically.
10. System updates sales and reporting data.
11. System displays a receipt and transaction confirmation.

### 4.4 Inventory restocking

1.  Owner or manager opens inventory.
2.  User selects an ingredient or product.
3.  User records stock received and relevant purchase details.
4.  System updates available stock.
5.  System records a stock movement.
6.  Dashboard and inventory alerts refresh.

### 4.5 AI business analysis

1.  User opens AI Insights.
2.  System retrieves relevant business data for the selected business
    and period.
3.  System calculates numerical metrics.
4.  System passes structured, authorized data to the AI service.
5.  AI generates explanations and recommendations.
6.  System displays supporting data, suggested actions, and confidence
    or limitations.
7.  User can review or save the insight.

### 4.6 CCTV video upload

1.  Authorized user opens CCTV Analytics.
2.  User selects an outlet and camera location.
3.  User uploads a supported video file.
4.  System validates file type and size.
5.  System stores the video securely.
6.  System creates an analysis job with status.
7.  If a Computer Vision processor is configured, the job is sent for
    processing.
8.  Results are displayed when processing completes.
9.  If no processor is configured, the job remains clearly marked as
    awaiting processing or demo-only.

------------------------------------------------------------------------

## 5. Functional Requirements

Priority definitions:

-   **P0:** Required for MVP launch.
-   **P1:** Important enhancement.
-   **P2:** Future capability.

### 5.1 Welcome, registration, and onboarding

**Priority: P0**

Requirements:

-   Welcome screen with EzFlow branding.
-   Get Started and Sign In actions.
-   Registration form with full name, email, password, confirm password,
    and terms acceptance.
-   Email format validation.
-   Password strength validation.
-   Password confirmation validation.
-   Duplicate email handling.
-   Secure authentication.
-   Forgot password and reset password.
-   Persistent authenticated sessions.
-   Protected routes.
-   Business profile setup.
-   First outlet setup.
-   Business preferences setup.
-   Onboarding completion screen.
-   Ability to continue setup if onboarding is interrupted.

Business profile fields:

-   Business name.
-   Business category.
-   Business description.
-   Owner name.
-   Business email.
-   Phone number.
-   Address.
-   City.
-   Country.
-   Currency; default IDR.
-   Timezone; default Asia/Makassar.
-   Number of outlets.
-   Operating hours.

Outlet fields:

-   Outlet name.
-   Outlet address.
-   Contact number.
-   Operating hours.
-   Number of tables.
-   Outlet capacity.

Business preferences:

-   Tax percentage.
-   Service charge.
-   Default payment methods.
-   Low-stock threshold.
-   Opening and closing hours.

### 5.2 Administrator initialization

**Priority: P0**

Provide a secure first-run administrator provisioning process for the
development/demo environment.

Demo account specification:

  Field      Value
  ---------- ----------------------
  Email      admin@ezflow.demo
  Password   EzFlowAdmin2026!
  Name       EzFlow Administrator
  Role       SUPER_ADMIN

Implementation requirements:

-   Provision the account through a secure seed script, backend
    initialization, or Firebase Authentication administrative process.
-   Do not hardcode the password in public frontend code.
-   Do not create a universal authentication bypass.
-   Ensure the account is created only once or handled idempotently.
-   Require password rotation before public production use.
-   Provide setup instructions if automatic provisioning is unavailable.

The demo credentials are development-only and must not be reused as
production credentials.

### 5.3 Dashboard

**Priority: P0**

Display:

-   Total revenue.
-   Transaction count.
-   Average order value.
-   Gross profit estimate.
-   Total expenses.
-   Inventory alerts.
-   Best-selling products.
-   Sales trends.
-   Revenue comparison.
-   Daily operational status.

Filters:

-   Today.
-   Yesterday.
-   Last 7 days.
-   Last 30 days.
-   Custom date range.
-   Outlet.

Requirements:

-   Metrics must be calculated from actual persisted data.
-   Date and outlet filters must update all relevant widgets.
-   Cancelled and refunded transactions must be excluded or accounted
    for according to financial reporting rules.
-   Clearly distinguish actual figures from estimates.

### 5.4 Point of Sale (POS)

**Priority: P0**

Features:

-   Product catalog and categories.
-   Product search.
-   Product images.
-   Add to cart.
-   Increase and decrease quantities.
-   Remove cart items.
-   Order notes.
-   Discounts.
-   Tax and service charge calculations.
-   Payment method selection.
-   Cash payment and change calculation.
-   QRIS payment recording.
-   Debit and transfer recording.
-   Checkout confirmation.
-   Receipt generation.
-   Transaction history.
-   Transaction details.

Transaction statuses:

-   Pending.
-   Completed.
-   Cancelled.
-   Refunded.

Business rules:

-   Only completed transactions contribute to recognized sales.
-   Validate inventory before checkout.
-   Prevent checkout when required inventory is insufficient.
-   Save transaction and line items.
-   Deduct recipe ingredients.
-   Update dashboard metrics and reports.
-   Record payment method, date, outlet, and responsible user.
-   Use atomic database operations to prevent partial transactions.
-   Cancellation and refund operations must preserve transaction history
    and create appropriate stock and financial adjustments.
-   Do not imply that QRIS or other payment gateways are connected
    unless a real provider integration exists.

### 5.5 Inventory management

**Priority: P0**

Features:

-   Ingredient management.
-   Raw material stock.
-   Finished product stock.
-   Units of measurement.
-   Stock-in.
-   Stock-out.
-   Stock adjustments.
-   Supplier records.
-   Purchase records.
-   Stock movement history.
-   Low-stock alerts.
-   Inventory valuation.
-   Restock recommendations.

Recipe-based inventory deduction is mandatory.

Example recipe for one Kopi Susu Gula Aren:

  Ingredient     Quantity
  ------------ ----------
  Espresso       18 grams
  Fresh milk       150 ml
  Palm sugar        20 ml
  Cup              1 unit

When one unit is sold, the system deducts the corresponding quantities
from each ingredient.

Stock movement records must include:

-   Timestamp.
-   Ingredient or product.
-   Quantity.
-   Movement type.
-   Related transaction or purchase.
-   Responsible user.

Prevent negative inventory and validate units of measurement.

### 5.6 Menu management

**Priority: P0**

Allow authorized users to:

-   Create products.
-   Edit products.
-   Archive or delete products safely.
-   Assign categories.
-   Upload product images.
-   Set selling prices.
-   Set recipe costs.
-   Configure ingredients and quantities.
-   Enable or disable products.

Display:

-   Selling price.
-   Cost of goods sold.
-   Gross profit.
-   Gross margin percentage.

Archived products must remain available in historical transaction
records.

### 5.7 Employee and shift management

**Priority: P1**

Features:

-   Employee profiles.
-   Contact details.
-   Job positions.
-   Employment status.
-   Outlet assignments.
-   Shift scheduling.
-   Attendance.
-   Clock-in and clock-out.
-   Work-hour records.
-   Employee activity logs.
-   Task assignments.

### 5.8 Financial management

**Priority: P0**

Features:

-   Revenue tracking.
-   Expense tracking.
-   Operating costs.
-   Ingredient costs.
-   Cost of goods sold.
-   Gross profit.
-   Net profit estimate.
-   Cash flow.
-   Payment method breakdown.
-   Expense categories.

Users can:

-   Create expenses.
-   Edit expenses.
-   Delete expenses with confirmation and audit history.
-   Filter financial records.
-   Export financial reports.

Business rules:

-   Revenue must not be confused with profit.
-   Actual expenses must be distinguished from estimated costs.
-   Cost of goods sold should use recipe and inventory data where
    available.
-   Financial summaries must reconcile with transaction records.

### 5.9 Operational management

**Priority: P1**

Features:

-   Opening checklist.
-   Closing checklist.
-   Cleaning checklist.
-   Equipment maintenance.
-   Task assignments.
-   Task deadlines.
-   Task status.
-   Completion tracking.

Managers can create, assign, edit, and delete tasks subject to
permissions.

### 5.10 AI Business Intelligence

**Priority: P1**

Use Google Gemini for natural-language explanations and recommendations.
Calculate numerical business metrics in application logic before sending
structured data to the AI service.

AI features:

**AI Business Assistant** - Answer questions about sales, inventory,
menu profitability, customer turnover, and operational performance. -
Ground responses in authorized business data. - State when there is
insufficient data.

**Sales Forecasting** - Historical sales trends. - Predicted sales. -
Peak sales periods. - Slow business periods. - Demand forecasts.

Predictions must be labeled as estimates and should include the data
period and limitations.

**Menu Intelligence** - Best-selling products. - Least-selling
products. - Most profitable products. - Low-margin products. - Category
performance. - Menu optimization recommendations. - Price and bundling
suggestions.

**Inventory Intelligence** - Ingredient consumption. - Stock
availability. - Restocking patterns. - Potential stockouts. - Inventory
waste. - Restock quantities based on consumption, lead time, and safety
stock where data exists.

**Promotion Recommendations** - Identify slow sales periods. - Suggest
happy-hour campaigns, bundles, discounts, and loyalty programs. -
Include supporting data, suggested action, expected benefit, and
confidence or limitations.

**AI Business Summary** - Daily, weekly, and monthly summaries.

AI requirements:

-   Never invent numerical metrics.
-   Do not expose data from another business.
-   Use server-side API calls for secret keys.
-   Handle API errors and rate limits.
-   Clearly distinguish facts, estimates, and recommendations.
-   Provide an understandable explanation of the data supporting each
    recommendation.

### 5.11 CCTV Analytics and Computer Vision

**Priority: P1 for upload workflow; P2 for live Computer Vision
processing**

CCTV upload workflow:

-   Upload recorded CCTV videos.
-   Assign videos to outlets.
-   Assign camera locations.
-   Store video metadata.
-   Display upload and processing status.
-   Create analysis jobs.
-   Display analysis results when available.

Target Computer Vision capabilities:

1.  Customer counting.
2.  Occupancy monitoring.
3.  Table utilization.
4.  Customer dwell time.
5.  Table turnover time.
6.  Queue duration.
7.  Table clearing duration.
8.  Peak-hour identification.
9.  Seating-area heatmaps.
10. Customer traffic patterns.

Analytics outputs:

-   Occupancy rate.
-   Average dwell time.
-   Average table clearing time.
-   Average table turnover.
-   Peak hours.
-   Underutilized seating areas.

Implementation requirements:

-   Do not claim that a video was analyzed unless an actual Computer
    Vision service processed it.
-   If no processor is connected, label outputs as sample/demo data.
-   Use an analysis job lifecycle, such as uploaded, queued, processing,
    completed, failed, or awaiting processor.
-   Store videos securely.
-   Validate file type and size.
-   Configure retention and deletion policies.
-   Do not perform facial recognition or identify individual customers.
-   Prefer anonymous object tracking and aggregate statistics.
-   Provide privacy and consent configuration.

### 5.12 Reports and analytics

**Priority: P1**

Reports:

-   Sales reports.
-   Transaction reports.
-   Product performance.
-   Inventory reports.
-   Employee reports.
-   Expense reports.
-   Profitability reports.
-   CCTV analytics reports.

Requirements:

-   Date filters.
-   Outlet filters.
-   CSV export.
-   PDF export where supported.
-   Respect user permissions and business boundaries.

### 5.13 Multi-outlet management

**Priority: P1**

Features:

-   Create outlet.
-   Edit outlet.
-   Archive outlet.
-   Switch active outlet.
-   Assign employees to outlets.
-   Track inventory per outlet.
-   Track transactions per outlet.
-   Compare outlet performance.

All data must be scoped to the correct business and, where relevant,
outlet.

### 5.14 Notifications

**Priority: P1**

Notification events:

-   Low inventory.
-   Completed transactions.
-   Stockouts.
-   Employee attendance.
-   Operational tasks.
-   AI recommendations.
-   CCTV analysis completion.

Provide a notification center with read/unread status.

------------------------------------------------------------------------

## 6. Non-Functional Requirements

### 6.1 Security

-   Use secure authentication.
-   Store passwords only through the authentication provider.
-   Never store plaintext passwords.
-   Keep API keys and secrets on the server.
-   Implement Firestore security rules or equivalent backend
    authorization.
-   Enforce tenant isolation.
-   Validate permissions on every sensitive operation.
-   Validate and sanitize user input.
-   Use secure file upload validation.
-   Maintain audit records for sensitive actions.
-   Do not expose private customer or employee data unnecessarily.

### 6.2 Performance

-   Optimize dashboard queries.
-   Use pagination for large transaction and inventory tables.
-   Avoid unnecessary database reads.
-   Provide loading indicators.
-   Use appropriate indexes.
-   Compress and optimize uploaded media where appropriate.

### 6.3 Reliability and data consistency

-   Use atomic operations for transactions and inventory deductions.
-   Handle failed database requests.
-   Prevent duplicate transaction submissions.
-   Preserve historical transaction data.
-   Provide clear error messages.
-   Avoid silent failures.

### 6.4 Usability and accessibility

-   Responsive desktop, tablet, and mobile layouts.
-   Consistent typography and spacing.
-   Clear visual hierarchy.
-   Accessible forms and labels.
-   Keyboard-friendly interactions where practical.
-   Clear loading, empty, success, and error states.

### 6.5 Data persistence

-   Use a persistent backend database for production-like behavior.
-   Do not rely on browser local storage as the primary production
    database.
-   Provide appropriate backup and recovery procedures.

------------------------------------------------------------------------

## 7. Technical Architecture

### 7.1 Preferred technology stack

  Layer            Preferred technology
  ---------------- ------------------------------------------------
  Frontend         React + TypeScript
  Build tooling    Vite or supported Google AI Studio environment
  Styling          Tailwind CSS
  Backend          Firebase
  Authentication   Firebase Authentication
  Database         Cloud Firestore
  File storage     Firebase Storage
  AI               Google Gemini API
  Charts           Recharts or equivalent

If the environment requires a different supported implementation,
preserve the product requirements and document the substitution.

### 7.2 Architecture principles

-   Modular and reusable components.
-   Centralized data access layer.
-   Clear separation of UI, business logic, and persistence.
-   Server-side validation for sensitive operations.
-   Environment-based configuration.
-   Secure API integrations.
-   Scalable multi-tenant data model.

### 7.3 Suggested data entities

-   users
-   businesses
-   outlets
-   memberships
-   employees
-   roles
-   products
-   categories
-   ingredients
-   recipes
-   suppliers
-   purchases
-   inventory
-   stock_movements
-   transactions
-   transaction_items
-   payments
-   expenses
-   shifts
-   attendance
-   operational_tasks
-   ai_insights
-   cctv_cameras
-   cctv_uploads
-   cctv_analysis_jobs
-   cctv_analytics
-   business_settings
-   notifications
-   audit_logs

Every relevant record should include:

-   Unique ID.
-   Business ID.
-   Outlet ID where applicable.
-   Created timestamp.
-   Updated timestamp.
-   Created-by user where applicable.

### 7.4 Tenant isolation

-   Every business-owned record must be associated with a business ID.
-   Outlet-specific records must also be associated with an outlet ID.
-   Users may only access businesses where they have valid membership.
-   Database rules must enforce the same access restrictions as the
    application.
-   Never rely exclusively on frontend filtering for tenant isolation.

------------------------------------------------------------------------

## 8. Initial Demo Environment

Create a fictional demonstration business.

**Business name:** EzFlow Café\
**Category:** Coffee Shop\
**Location:** Bali, Indonesia\
**Currency:** IDR\
**Timezone:** Asia/Makassar

### 8.1 Sample menu

  Product                 Selling price
  --------------------- ---------------
  Kopi Susu Gula Aren          Rp28.000
  Americano                    Rp22.000
  Café Latte                   Rp30.000
  Matcha Latte                 Rp32.000
  Chocolate                    Rp29.000
  Butter Croissant             Rp25.000
  Chicken Sandwich             Rp38.000
  Mineral Water                Rp10.000

### 8.2 Demo data

Create realistic sample data for:

-   Ingredients and inventory.
-   Product recipes.
-   Employee records.
-   Shift schedules.
-   Suppliers.
-   Historical transactions.
-   Expenses.
-   Operational tasks.
-   Historical sales records.

All generated historical records must be labeled as demo/sample data.

Demo data must be provisioned through a repeatable seed process.

------------------------------------------------------------------------

## 9. UI/UX Requirements

### 9.1 Design direction

-   Modern SaaS interface.
-   White and soft-grey backgrounds.
-   Primary blue: `#2563EB`.
-   Dark charcoal typography.
-   Subtle borders and shadows.
-   Rounded cards.
-   Minimalist icons.
-   Professional charts and data tables.

### 9.2 Main navigation

1.  Ringkasan
2.  Kasir / POS
3.  Inventaris
4.  Manajemen Menu
5.  Karyawan & Shift
6.  Keuangan
7.  Operasional
8.  AI Insights
9.  CCTV Analytics
10. Laporan
11. Pengaturan

### 9.3 Top navigation

-   Active outlet selector.
-   Notifications.
-   User profile.
-   Account settings.
-   Logout.

### 9.4 UX principles

Prioritize:

-   Easy navigation.
-   Readable typography.
-   Consistent spacing.
-   Clear data visualization.
-   Professional data tables.
-   Helpful tooltips.
-   Responsive layouts.
-   Accessible forms.
-   Clear error and success states.

Avoid excessive gradients, unnecessary animation, overcrowded
dashboards, and decorative controls without functionality.

------------------------------------------------------------------------

## 10. Acceptance Criteria and QA Plan

The application must be tested end-to-end before being considered
complete.

### 10.1 Authentication and onboarding

-   [ ] New user can register.
-   [ ] Invalid email is rejected.
-   [ ] Weak passwords are rejected according to configured policy.
-   [ ] Password confirmation is validated.
-   [ ] Duplicate accounts are handled.
-   [ ] User can log in and log out.
-   [ ] Password reset works.
-   [ ] Protected routes require authentication.
-   [ ] Onboarding creates the business and first outlet.
-   [ ] Registering owner receives the OWNER role.
-   [ ] Administrator provisioning is secure and repeatable.

### 10.2 POS and inventory

-   [ ] Products can be added to cart.
-   [ ] Cart quantities can be changed.
-   [ ] Items can be removed.
-   [ ] Discounts, taxes, and service charges calculate correctly.
-   [ ] Cash change calculates correctly.
-   [ ] Checkout creates a transaction.
-   [ ] Duplicate checkout submissions are prevented.
-   [ ] Recipe ingredients are deducted correctly.
-   [ ] Insufficient inventory prevents checkout.
-   [ ] Cancel and refund operations preserve history and reconcile
    stock.

### 10.3 Menu and inventory

-   [ ] Products can be created, edited, and archived.
-   [ ] Ingredient records can be managed.
-   [ ] Recipes can be configured.
-   [ ] Stock-in and stock-out work.
-   [ ] Stock adjustments create movement records.
-   [ ] Low-stock alerts work.
-   [ ] Inventory valuation uses the configured cost basis.

### 10.4 Finance and operations

-   [ ] Expenses can be created and edited.
-   [ ] Financial summaries reconcile with source records.
-   [ ] Revenue and profit are clearly distinguished.
-   [ ] Tasks can be created and assigned.
-   [ ] Task completion status persists.
-   [ ] Employee attendance changes persist.

### 10.5 AI and CCTV

-   [ ] AI receives only authorized business data.
-   [ ] AI does not invent numerical metrics.
-   [ ] AI identifies insufficient data.
-   [ ] Predictions are labeled as estimates.
-   [ ] CCTV uploads validate file type and size.
-   [ ] Upload status is visible.
-   [ ] Analysis job status is visible.
-   [ ] Demo analytics are clearly labeled.
-   [ ] No Computer Vision result is claimed without actual processing.

### 10.6 Multi-outlet and security

-   [ ] Users can switch between authorized outlets.
-   [ ] Outlet data is correctly filtered.
-   [ ] Users cannot access another business's data.
-   [ ] Role restrictions are enforced server-side.
-   [ ] Unauthorized database operations are rejected.

### 10.7 General quality

-   [ ] Every visible button has a working action.
-   [ ] Every form validates input.
-   [ ] Every modal opens and closes properly.
-   [ ] Search and filters work.
-   [ ] CRUD operations persist.
-   [ ] Dashboard updates after relevant changes.
-   [ ] Loading, empty, success, and error states exist.
-   [ ] CSV exports work.
-   [ ] Responsive layouts work on desktop, tablet, and mobile.

Testing must be executed using available tools. Do not claim tests
passed unless they were actually run.

------------------------------------------------------------------------

## 11. Development Roadmap

### Phase 1 --- Foundation

-   Project setup.
-   Design system.
-   Authentication.
-   Registration and login.
-   First-time onboarding.
-   Administrator provisioning.
-   Database architecture.
-   Tenant isolation and security rules.

### Phase 2 --- Core Business Management

-   Dashboard.
-   POS.
-   Menu management.
-   Ingredient inventory.
-   Recipe-based stock deduction.
-   Transaction history.

### Phase 3 --- Operations and Finance

-   Employee management.
-   Shift scheduling.
-   Attendance.
-   Financial management.
-   Operational checklists.
-   Notifications.

### Phase 4 --- Business Intelligence

-   Gemini integration.
-   AI Business Assistant.
-   Sales forecasting.
-   Menu intelligence.
-   Inventory intelligence.
-   Promotion recommendations.

### Phase 5 --- CCTV and Advanced Analytics

-   CCTV upload workflow.
-   Camera and outlet management.
-   Analysis job lifecycle.
-   Computer Vision processor integration.
-   Occupancy and table analytics.
-   Heatmaps.

### Phase 6 --- Reporting and Quality

-   Reports and exports.
-   Multi-outlet comparison.
-   Security review.
-   End-to-end testing.
-   Bug fixing.
-   Performance optimization.
-   Final UI/UX refinement.

------------------------------------------------------------------------

## 12. Risks, Dependencies, and Limitations

  -----------------------------------------------------------------------
  Area                    Dependency or risk      Mitigation
  ----------------------- ----------------------- -----------------------
  Authentication          Firebase configuration  Provide setup
                          and provider setup      instructions and test
                                                  account provisioning

  Database                Firestore configuration Use tenant-scoped rules
                          and security rules      and test unauthorized
                                                  access

  AI                      Gemini API              Server-side
                          availability, quota,    integration, error
                          and cost                handling, usage limits

  CCTV                    Video storage and       Separate upload
                          processing              workflow from Computer
                          infrastructure          Vision processing

  Computer Vision         Model, backend compute, Begin with a clearly
                          and tracking accuracy   labeled demo workflow

  Payments                External payment        Treat payment methods
                          provider integration    as records until a
                                                  provider is connected

  Financial accuracy      Missing or incomplete   Label estimates and
                          cost data               reconcile with actual
                                                  records

  Privacy                 CCTV footage and        Access controls,
                          employee data           retention policies, and
                                                  privacy safeguards
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 13. Final Product Definition

The completed EzFlow MVP must allow a new business owner to:

1.  Register an account.
2.  Create a business workspace.
3.  Set up one or more outlets.
4.  Invite or manage employees.
5.  Create menus and recipes.
6.  Manage ingredient inventory.
7.  Process sales through POS.
8.  Automatically deduct ingredients from completed sales.
9.  Record and monitor expenses.
10. Manage daily operations.
11. Review business performance.
12. Generate AI-powered recommendations based on actual data.
13. Upload CCTV footage into a traceable analysis workflow.
14. Export business reports.
15. Manage access through role-based permissions.

The first demonstration environment must be **EzFlow Café**.

The final product should be suitable for demonstration to business
competition judges, potential customers, and investors.

**Product priority:** Functionality, data consistency, security, and
user experience must take precedence over superficial visual appearance.
