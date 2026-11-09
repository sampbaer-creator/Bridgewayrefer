# Referral reporting and link opens

React `PatientForm` records visible card-page navigations with a random event UUID. Refreshes and history restores are excluded when detectable. Retries reuse the event UUID; Cosmos `open-{uuid}` IDs prevent duplicate counts. NFC, QR, shared links and staff tests cannot be distinguished. Tracking contains no contact fields.

`MonthlyReport.cs` aggregates all retained referral and link-open summaries in the authenticated business partition, independently of the 500-row inbox display limit. Counts use original creation timestamps converted to `America/Denver`, including daylight saving time. Inactive and former offices keep their history. Opens and completed forms are separate counts, not a matched conversion rate.

The React dashboard offers previous/next month controls, office bars, a 12-month trend, metric and office selectors, and accessible tables. It refreshes every 60 seconds while visible and on focus or page restore. A staff 401 or 403 clears private client state and stops further staff requests. Actual authorization is enforced by C# on every staff endpoint.
