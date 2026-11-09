#!/usr/bin/env bash
# Run privately in Azure Cloud Shell. Never paste credentials into chat or GitHub.
set +x
set -euo pipefail
az account set --subscription '201130be-c04a-4326-937f-f0d9413a7fab'
read -r -p 'Sending Gmail address [saratogaspringsorthodontics@gmail.com]: ' SSO_SMTP_USERNAME
SSO_SMTP_USERNAME="${SSO_SMTP_USERNAME:-saratogaspringsorthodontics@gmail.com}"
read -r -s -p 'Paste the Google app password (input is hidden): ' SSO_SMTP_PASSWORD
printf '\n'
export SSO_SMTP_USERNAME SSO_SMTP_PASSWORD
python3 <<'PY'
import json, os, subprocess, tempfile
username=os.environ['SSO_SMTP_USERNAME'].strip()
password=''.join(os.environ['SSO_SMTP_PASSWORD'].split())
if '@' not in username or '\r' in username or '\n' in username or len(password)!=16:
    raise SystemExit('Invalid Gmail address or app password. No configuration was changed.')
base=['az','webapp','config']
app=['--resource-group','sso-referrals-rg','--name','sso-referrals-093141a1']
# B1 has already been selected. Always On keeps the retry worker running when idle.
subprocess.run(base+['set']+app+['--always-on','true','--output','none'],check=True)
settings={'ALERT_EMAIL_ENABLED':'1','ALERT_RECIPIENT':'saratogaspringsorthodontics@gmail.com',
          'SMTP_HOST':'smtp.gmail.com','SMTP_PORT':'465','SMTP_USERNAME':username,
          'SMTP_PASSWORD':password}
with tempfile.NamedTemporaryFile(mode='w',suffix='.json') as f:
    json.dump(settings,f);f.flush()
    subprocess.run(base+['appsettings','set']+app+['--settings','@'+f.name,'--output','none'],check=True)
print('Email settings saved. No test message has been sent yet.')
PY
unset SSO_SMTP_PASSWORD SSO_SMTP_USERNAME
