# Office link opens and staff sessions

An office's NFC cards, QR codes and shared referral URL all reach the same page. A visible browser navigation records an anonymous link-open event; this is not proof of a physical NFC tap or a unique person. Ordinary refreshes and back/forward restores are excluded when the browser exposes navigation type. Browser blocking, lost connectivity, automated browsers and staff tests can affect totals. Repeat taps that produce new navigations can count again.

The client posts only an office code and random event ID. Storage retains the office code/name, UTC timestamp and event ID; it does not store the visitor's contact information, browser identifier or IP in traffic records. Retry requests reuse the ID and cannot double-count. The public endpoint validates active offices, same-origin JSON writes and a separate hourly request limit. Tracking failures do not block the referral form.

Reports show opens and completed forms separately, by event/submission month in America/Denver. Historical opens before deployment cannot be reconstructed. Monthly counts are not a matched funnel: a form can be submitted in a different month from its opening. Existing referrals and inactive-office history are retained. No extra storage service or permission is required.

Missing staff sessions on /staff receive a sign-in page. Staff API 401 responses replace dashboard content with a reauthentication button, clear patient details and stop further staff requests until sign-in. Permission failures and service errors are not treated as expired sessions. Session checks run on focus, visibility changes, page restore and once per minute while visible. Authentication duration and the existing single-user allowlist are unchanged.

Deployment remains manual on main and retains the packaged-dependency script and live-form health check.
