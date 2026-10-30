"""OS-independent retry windows. Re-running a published market day is a no-op."""
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
from update_events import KRX_HOLIDAYS
from us_brief import HOLIDAYS

ROOT = Path(__file__).resolve().parent.parent


def session_date(now, market):
    local = now.astimezone(ZoneInfo('America/New_York' if market == 'US' else 'Asia/Seoul'))
    ready = (18, 0) if market == 'US' else (16, 40)
    day = local.date()
    if (local.hour, local.minute) < ready:
        day -= timedelta(days=1)
    holidays = HOLIDAYS if market == 'US' else KRX_HOLIDAYS
    while day.weekday() >= 5 or day.isoformat() in holidays:
        day -= timedelta(days=1)
    return day.strftime('%Y%m%d')


def main():
    market = os.environ.get('MKT', 'KR')
    now = datetime.now(timezone.utc)
    target = session_date(now, market)
    path = ROOT / ('feeds/stock-picks-us.json' if market == 'US' else 'feeds/stock-picks.json')
    data = json.loads(path.read_text()) if path.exists() else {}
    skip = data.get('date', '') >= target and os.environ.get('FORCE') != 'yes'
    result = f'target={target}\nskip={int(skip)}\n'
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
            f.write(result)
    print(f'{market}: expected session {target}; published {data.get("date")}; skip={skip}')


if __name__ == '__main__':
    main()
