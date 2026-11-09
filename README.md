# Saratoga Springs Orthodontics — Referrals

Mobile referral intake and a staff inbox, built for Azure and GitHub. Fields: patient name, email, phone, optional notes. No DOB. Email and phone are labeled for a parent/guardian when the patient is a child. The form also requires permission to contact.

## What is ready

- Mobile form at `/` and doctor-specific NFC/QR links at `/r/<random-code>`.
- Staff dashboard: `/staff/login`. Statuses: New, Contacted, Scheduled, Completed, Closed.
- Add referring doctors, copy card links, deactivate lost cards and reactivate them.
- Entra tenant + explicit user object ID allowlist on every staff endpoint.
- Azure Table Storage accessed using managed identity; no storage account passwords.
- Audit events for inbox reads, status updates and doctor/card administration.
- Server validation, same-origin JSON writes, output escaping, idempotent submissions, basic persistent per-address/hour rate limit and honeypot.
- Dashboard checks for new referrals every 60 seconds while the tab is visible. Optional generic email alerts use authenticated SMTP over TLS; setup is below. No SMS messages are sent.
- Tests and a manual GitHub Actions deployment workflow.

This is an initial implementation, not a completed live installation or a HIPAA certification. Azure resources, sign-in, live storage, DNS, backups, and actual NFC cards still need configuration and acceptance testing.

## Local fictional-data preview

Requires Python 3.12+ (tests developed using 3.12).

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
DEMO_MODE=1 ACCEPT_REFERRALS=1 PUBLIC_ORIGIN=http://localhost:5000 flask --app 'app:create_app()' run --host 127.0.0.1
```

Open `http://localhost:5000` for the form and `/staff/login` for the local dashboard. Local demo staff access deliberately has no login: bind to loopback and use fictional information only. Data persists in the ignored `demo.sqlite3`. Demo mode refuses to start inside Azure App Service. Production never silently falls back to a local database.

```bash
python -m unittest discover -s tests -v
node --check static/app.js
```

## Azure setup — do this once

### 1. Verify your subscription and budget

In Azure Portal, open **Subscriptions**. Confirm your free subscription is active and note its Subscription ID. A Microsoft login alone is not a subscription. This project includes an F1 App Service option for evaluation where available, but Azure Storage and other services can incur charges. Check the current pricing and your credit balance; create a Cost Management budget alert. Budget alerts are not spending caps.

Use the default `*.azurewebsites.net` address for initial testing. App Service F1 does not support the intended custom domain. Before moving to `refer.saratogaspringsortho.com`, choose a suitable paid tier and review its price. F1 has shared resources, quotas and idle behavior; do not assume it is suitable for live referrals.

### 2. Create the staff sign-in registration

Azure Portal → Microsoft Entra ID → App registrations → New registration:

- Name: `SSO Referrals Staff`
- Supported accounts: **Accounts in this organizational directory only**
- Platform: **Web**
- Redirect URI: `https://YOUR-UNIQUE-APP-NAME.azurewebsites.net/.auth/login/aad/callback`

Choose a globally unique lowercase app name now, such as `sso-referrals-` followed by a unique suffix. Use that same name below. Copy the **Application (client) ID**. Under Certificates & secrets, create a client secret. Keep its **value** locally for the deployment prompt; never put it in GitHub or chat. Record its expiry and arrange rotation before it expires. The deployment stores it as an App Service setting; a Key Vault reference is a recommended later hardening step.

Under Entra ID → Users → your user, copy your **Object ID**. This is the staff user's ID, not the app registration's object ID. Additional staff must exist in the same tenant, be added to `STAFF_OBJECT_IDS`, and be covered by your MFA policy. Configure and verify MFA before using patient data.

### 3. Provision the resources

Download `infra/main.bicep` from this repository. Open Azure Cloud Shell (Bash) and upload the file. Cloud Shell may itself require storage or an account upgrade; check its current offering. A local Azure CLI installation is an alternative.

```bash
az account list --output table
az account set --subscription YOUR_SUBSCRIPTION_ID
az group create --name sso-referrals-rg --location westus2
az deployment group create \
  --resource-group sso-referrals-rg \
  --template-file main.bicep \
  --parameters appName=YOUR_UNIQUE_APP_NAME \
               staffClientId=YOUR_APPLICATION_CLIENT_ID \
               staffObjectIds=YOUR_STAFF_USER_OBJECT_ID
```

The secure `staffClientSecret` parameter has no default: Azure CLI should prompt for it. Enter the secret value privately. Do not paste secrets into committed parameter files. If your tenant blocks app registrations, role assignments, or managed identities, an Azure administrator must grant the appropriate narrowly scoped access. No resources have been created by merely adding this code to GitHub.

The template creates Linux App Service, StorageV2 with a private-by-authorization table, managed identities, staff authentication and a GitHub OIDC trust scoped to `SS-Ortho/sso-referrals` on `main`. The storage endpoint is network-reachable but requires Entra authorization; it is not a private-network deployment. Shared-key access is disabled. Table Storage replaces a full SQL database for this small first version.

By default `ACCEPT_REFERRALS=0`: the form is closed until validation. Re-running this template resets that setting to closed and resets PUBLIC_ORIGIN to the Azure hostname. Reapply custom-domain settings afterward if appropriate.

### 4. Add GitHub deployment variables

After deployment, copy the four output values into this repository → Settings → Secrets and variables → Actions → **Variables**:

| GitHub variable | Azure deployment output |
|---|---|
| `AZURE_CLIENT_ID` | `azureClientId` (deployment managed identity, NOT staff client ID) |
| `AZURE_TENANT_ID` | `azureTenantId` |
| `AZURE_SUBSCRIPTION_ID` | `azureSubscriptionId` |
| `AZURE_WEBAPP_NAME` | `azureWebappName` |

These IDs are configuration, not passwords. No Azure deployment secret is needed. OIDC grants the identity Website Contributor on this app only. GitHub Actions must be enabled for this private repository. Tenant policy or account quotas may restrict available runners.

### 5. Deploy the code

Merge the implementation pull request into `main`. Open Actions → **Deploy to Azure** → Run workflow → main. Deployment is intentionally manual; code pushes run checks only. The workflow reruns tests before deploying. The first build and managed identity role propagation can take several minutes.

### 6. Test the installation with fictional data

- `/health` responds successfully.
- `/` loads without sign-in and says online requests are not open.
- `/api/staff/referrals` and `/api/staff/doctors` reject an anonymous browser; no patient data is returned.
- `/staff/login` signs in using the registered tenant, and only allowlisted staff can enter.
- Verify a signed-in, non-allowlisted account is denied.
- In App Service → Settings → Environment variables, set `ACCEPT_REFERRALS=1` **only for the fictional-data test**, save/restart, create a fictional doctor and submit a fictional referral using their link.
- Check name/email/phone/notes, doctor attribution, status updates, refresh behavior, duplicate retry handling, deactivation, mobile keyboard and success/error states.
- Restart the web app and confirm the referral persists in Azure Table Storage.
- Verify App Service Authentication remains enabled: the code trusts only headers injected by this platform. Do not run production behind another unauthenticated server or disable Easy Auth.
- Set `ACCEPT_REFERRALS=0` again until the live-data readiness steps below are complete.

### 7. Set up the custom domain and cards

For the final address `refer.saratogaspringsortho.com`:

1. Select an App Service tier that supports custom domains and the desired TLS certificate.
2. App Service → Custom domains → add `refer.saratogaspringsortho.com`. Use the **exact DNS records Azure provides**, including the ownership verification TXT record. This requires access to the domain's DNS provider, not just the website editor.
3. Bind and verify the TLS certificate; retain HTTPS-only.
4. Add `https://refer.saratogaspringsortho.com/.auth/login/aad/callback` to the Entra app's Web redirect URIs.
5. Set App Service `PUBLIC_ORIGIN=https://refer.saratogaspringsortho.com`. Use only that hostname for submissions, because same-origin writes are checked against it. Re-test login and form from that hostname.
6. Create each real referring doctor in the dashboard and copy the link. Encode that **same URL** as an NDEF HTTPS record and QR code. No patient details belong on the card, in a URL, or in a third-party redirect service.
7. Order a small test batch. For metal choose NFC hardware designed for metal. Test iPhone and Android scans before engraving a full batch. Lock the NFC tag against rewriting only after verifying its permanent URL.

A public card link attributes the source; it does not authenticate a referring doctor or provide them access to records. Anyone with the URL can submit. The patient/parent must still tap the phone's notification to open it on supported devices.

## Before accepting real patient data

Confirm the applicable Microsoft BAA and services, office privacy/contact language, staff permissions and MFA, retention/deletion rules, monitoring, and a tested backup/restore procedure. Azure Table Storage in this template uses LRS replication; **replication is not a backup**. Automated backups and a retention/deletion job are not implemented in this first version. Configure a protected scheduled export or other approved recovery process and test restoration before launch. Use lifecycle management for exports under the practice's retention policy.

Audit rows and anonymous rate-limit buckets persist until explicitly purged by an administrator. Establish a retention/maintenance process. Do not log request bodies or enable patient-bearing telemetry. Keep real patient data out of GitHub, screenshots, testing, workflow logs and chat. Review dependencies and deployment permissions. App Service log/diagnostic configuration must be reviewed to ensure it does not capture sensitive query strings or payloads.

The dashboard lists the newest 500 referrals from a bounded query of up to 10,001 referral rows. This is suitable for initial low-volume use; add indexed pagination, archiving and export before larger volumes. Doctor listing is bounded at 501 entries. Basic address-based rate limits can affect shared networks and do not replace WAF/bot protection. Test proxy address handling in the actual Azure environment and add edge protection if needed.

No patient details are sent by email. Configured alerts contain only a generic new-referral notice and a sign-in link. Automated texts, insurance collection, attachments, online scheduling and integration with practice software are outside this initial version.

## Configuration

| Setting | Purpose |
|---|---|
| `PUBLIC_ORIGIN` | Exact HTTPS origin allowed to submit forms and staff writes |
| `TABLE_ENDPOINT` | Provisioned Azure table service endpoint |
| `TENANT_ID` | Staff Entra tenant ID |
| `STAFF_OBJECT_IDS` | Comma-separated, lowercase staff user object IDs |
| `STAFF_CLIENT_SECRET` | Entra login client secret; rotate before expiry |
| `ACCEPT_REFERRALS` | `0` closed, `1` open |
| `DEMO_MODE` | `1` only for local fictional-data development; forbidden in App Service |

## References

- https://learn.microsoft.com/azure/app-service/configure-authentication-user-identities
- https://learn.microsoft.com/azure/app-service/deploy-github-actions
- https://learn.microsoft.com/azure/developer/github/connect-from-azure-openid-connect
- https://learn.microsoft.com/python/api/azure-data-tables/azure.data.tables.tableclient
- https://learn.microsoft.com/compliance/regulatory/offering-hipaa-hitech


## Email alerts (optional)

Recipient for this practice: `saratogaspringsorthodontics@gmail.com`.

Alerts contain the fixed subject "New referral received - Saratoga Springs Orthodontics" and a link to the staff sign-in page. Patient names, email addresses, phone numbers, notes, referral IDs and referring doctors are never included. The sender is configured separately; supplying a recipient alone does not authorize or configure access to that mailbox.

A referral and its pending email alert are saved in one Azure Table transaction when `ALERT_EMAIL_ENABLED=1`. Sending happens in a background worker, outside the request. Failures retain the referral and retry the alert after 1 minute, with increasing delays up to 1 hour. App restarts recover pending alerts. Two Gunicorn workers use conditional ETag updates and five-minute leases to coordinate. Delivery is at least once: a crash after SMTP acceptance but before recording success can cause a duplicate. A stable Message-ID may help mail clients group it. SMTP acceptance does not prove delivery into Gmail's inbox; check spam/bounces and sender account health. Old referrals created before email was enabled do not receive alerts retroactively.

B1 **Always On must be enabled** for the in-process worker to run while the app has no visitors. The setup script enables it. Restarts and deployments pause sending briefly but do not remove the outbox. This lightweight worker is designed for low referral volume; a separately hosted queue worker is appropriate if scale or stronger availability requirements grow.

### Activate using a Gmail sender

1. Decide which Gmail account will send the generic alerts (it can be the recipient account). This needs the account owner's approval and access.
2. In that Google account, enable 2-Step Verification, then create an **App password** named `SSO Referral Alerts` at https://myaccount.google.com/apppasswords. App passwords may be unavailable for some accounts or security policies; use another approved SMTP provider if needed. Do not use the normal Google password.
3. Deploy the latest code using a **new** Run workflow on `main` in GitHub Actions → Deploy to Azure. The application package must include `notifications.py`.
4. Download `infra/configure-email.sh` from this private repository and upload it to Azure Cloud Shell. Run `bash configure-email.sh`. Enter the sending account and the app password at the hidden prompt. Never paste the password into chat, GitHub, screenshots or a shell command. The script stores the password in Azure App Service settings using a temporary private file and suppresses settings output. A Key Vault reference can be substituted for the password setting in a hardened installation.
5. After the app restarts, open the dashboard. The **Email alerts** panel should show the configured recipient. Click **Send test alert** and check that inbox and spam folder. This sends a generic alert without creating a fictional patient referral.
6. Submit a fictional referral using a doctor's link on the final custom domain, confirm it appears in the dashboard, and confirm the generic email arrives. Submission availability (`ACCEPT_REFERRALS`) is independent of email configuration.

The setup script changes only email settings and Always On. It preserves the current custom domain, origin, authentication and referral intake setting. **Do not rerun `infra/main.bicep` to configure email**: that initial provisioning template resets app settings and still defaults to F1. Use the focused email script for this existing B1 installation.

To disable future alerts and pause pending sends, set `ALERT_EMAIL_ENABLED=0` in App Service settings. Re-enabling resumes the existing pending queue. This does not delete referrals or pending alerts. Rotate/revoke the Google app password when staff access changes or it is no longer needed. Google can revoke app passwords after the Google account's password changes.

| Setting | Value / purpose |
|---|---|
| `ALERT_EMAIL_ENABLED` | `1` enables queuing and sending; default is `0` |
| `ALERT_RECIPIENT` | Office inbox receiving the generic alerts |
| `SMTP_HOST` | `smtp.gmail.com`, or approved SMTP provider |
| `SMTP_PORT` | `465` for implicit TLS |
| `SMTP_USERNAME` | Authorized sending account, also used as From |
| `SMTP_PASSWORD` | Sender's app password; store only in Azure settings or a Key Vault reference |
| `PUBLIC_ORIGIN` | Final HTTPS origin used to build the sign-in link |

Email configuration never appears in public APIs. The staff-only `/api/staff/alerts` route returns status and recipient, never passwords. The staff-only test-email route requires same-origin JSON and has a per-staff rate limit. Pending and accepted alert entries share the protected referrals table and need the practice's retention policy.

References: https://support.google.com/accounts/answer/185833 and https://developers.google.com/workspace/gmail/imap/imap-smtp . Azure Communication Services Email was deliberately not selected for this new integration because of its announced retirement and onboarding limitations: https://learn.microsoft.com/azure/communication-services/acs-retirement-and-breaking-changes-guide .

## Branding and monthly reporting

The application uses the practice’s original logo downloaded from its official website (https://www.saratogaspringsortho.com/wp-content/uploads/sites/41/2018/04/unnamed-2.png), bundled locally with a navy, off-white, and silver interface. Staff authentication remains unchanged.

The dashboard provides monthly office totals and a 12-month trend chart with an office selector, a month selector for historical counts, a previous-month comparison, and a 60-second refresh while visible. Counts use the original submission date in America/Denver, regardless of subsequent status changes. Reports query all retained referral summaries, independently of the inbox display limit, and include inactive offices. Create one referral link per referring office for consistent reporting. The reporting endpoint is staff-only and returns aggregate counts without patient contact details.
