"""Office referral counts based on submission date in the practice's timezone."""
import calendar
import re
from collections import defaultdict
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

PRACTICE_TIMEZONE = ZoneInfo('America/Denver')


def month_date(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}', value):
        raise ValueError('Choose a valid month')
    parsed = date.fromisoformat(value + '-01')
    if not 2000 <= parsed.year <= 9998:
        raise ValueError('Choose a valid month')
    return parsed


def build_month_report(referrals, doctors, month=None, current=None, opens=None):
    current = current or datetime.now(PRACTICE_TIMEZONE).date()
    selected = month_date(month or current.strftime('%Y-%m'))
    selected_key = selected.strftime('%Y-%m')
    current_key = current.strftime('%Y-%m')
    totals = defaultdict(lambda: defaultdict(int))
    daily = defaultdict(lambda: defaultdict(int))
    offices = {}
    for doctor in doctors:
        offices[doctor['RowKey']] = {'officeId': doctor['RowKey'], 'name': doctor['name'],
                                     'active': bool(doctor.get('active', True))}
    invalid = 0
    for referral in referrals:
        try:
            submitted = datetime.fromisoformat(referral['createdAt'].replace('Z', '+00:00'))
            if submitted.tzinfo is None:
                submitted = submitted.replace(tzinfo=timezone.utc)
            submitted = submitted.astimezone(PRACTICE_TIMEZONE)
            if not 2000 <= submitted.year <= current.year + 1:
                raise ValueError('Invalid reporting date')
        except (KeyError, TypeError, ValueError, AttributeError):
            invalid += 1
            continue
        office_id = referral.get('doctorCode') or 'direct'
        if office_id not in offices:
            offices[office_id] = {'officeId': office_id,
                'name': 'Direct requests' if office_id == 'direct' else referral.get('doctorName', 'Former referring office'),
                'active': office_id == 'direct'}
        key = submitted.strftime('%Y-%m')
        totals[key][office_id] += 1
        if key == selected_key:
            daily[office_id][submitted.day] += 1
    open_totals = defaultdict(lambda: defaultdict(int))
    for event in opens or ():
        try:
            stamp = datetime.fromisoformat(event['createdAt'].replace('Z', '+00:00'))
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=timezone.utc)
            stamp = stamp.astimezone(PRACTICE_TIMEZONE)
            if not 2000 <= stamp.year <= current.year + 1:
                raise ValueError('Invalid reporting date')
            office_id = event['doctorCode']
            if not office_id:
                continue
        except (KeyError, TypeError, ValueError, AttributeError):
            invalid += 1
            continue
        if office_id not in offices:
            offices[office_id] = {'officeId': office_id, 'name': event.get('doctorName', 'Former referring office'), 'active': False}
        open_totals[stamp.strftime('%Y-%m')][office_id] += 1
    month_totals = totals[selected_key]
    calendar_days = calendar.monthrange(selected.year, selected.month)[1]
    elapsed_days = current.day if selected_key == current_key else calendar_days
    rows = []
    for office_id, office in offices.items():
        cumulative = []
        count = 0
        for day in range(1, elapsed_days + 1):
            count += daily[office_id].get(day, 0)
            cumulative.append(count)
        rows.append(dict(office, count=month_totals.get(office_id, 0), opens=open_totals[selected_key].get(office_id, 0), cumulative=cumulative))
    rows.sort(key=lambda row: (-row['count'], row['name'].casefold(), row['officeId']))
    known = sorted({key for key, values in totals.items() if values} | {key for key, values in open_totals.items() if values} | {current_key})
    month_index = current.year * 12 + current.month - 1 - 11
    recent_start = date(month_index // 12, month_index % 12 + 1, 1)
    first = min(month_date(known[0]), recent_start); last = month_date(known[-1])
    months = []
    cursor = first
    while cursor <= last:
        months.append(cursor.strftime('%Y-%m'))
        cursor = date(cursor.year + (cursor.month == 12), 1 if cursor.month == 12 else cursor.month + 1, 1)
    if selected_key not in months:
        months.append(selected_key)
    months.sort(reverse=True)
    selected_index = selected.year * 12 + selected.month - 1
    trend_months = []
    for index in range(selected_index - 11, selected_index + 1):
        trend_months.append(f'{index // 12:04d}-{index % 12 + 1:02d}')
    previous_index = selected_index - 1
    previous_key = f'{previous_index // 12:04d}-{previous_index % 12 + 1:02d}'
    previous_total = sum(totals[previous_key].values())
    trend = [{'month': key, 'total': sum(totals[key].values()),
              'offices': {office_id: totals[key].get(office_id, 0) for office_id in offices},
              'opens': sum(open_totals[key].values()),
              'officeOpens': {office_id: open_totals[key].get(office_id, 0) for office_id in offices}}
             for key in trend_months]
    return {'month': selected_key, 'monthLabel': selected.strftime('%B %Y'),
            'timezone': 'America/Denver', 'availableMonths': months,
            'days': list(range(1, elapsed_days + 1)), 'calendarDays': calendar_days,
            'isCurrentMonth': selected_key == current_key,
            'total': sum(row['count'] for row in rows),
            'linkOpens': sum(row['opens'] for row in rows),
            'referringOffices': sum(row['count'] > 0 and row['officeId'] != 'direct' for row in rows),
            'offices': rows, 'invalidDates': invalid, 'previousTotal': previous_total,
            'trend': trend}

