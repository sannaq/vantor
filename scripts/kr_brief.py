#!/usr/bin/env python3
"""Fill the latest missing Korean briefing on GitHub, using dated source data only.
The original publisher keeps priority. Never invent a missed intraday snapshot.
"""
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from update_events import KRX_HOLIDAYS
from update_flow import get, n

ROOT = Path(__file__).resolve().parent.parent
KST = ZoneInfo('Asia/Seoul')
SLOTS = {'am': '개장', 'noon': '장중', 'pm': '장마감'}


def target(now):
    now = now.astimezone(KST)
    day = now.date()
    m = now.hour * 60 + now.minute
    if day.weekday() >= 5 or day.isoformat() in KRX_HOLIDAYS or m < 9 * 60 + 20:
        day -= timedelta(days=1)
        while day.weekday() >= 5 or day.isoformat() in KRX_HOLIDAYS:
            day -= timedelta(days=1)
        return day, 'pm'
    return day, ('pm' if m >= 16 * 60 else 'noon' if m >= 12 * 60 + 20 else 'am')


def build(now, day, slot):
    rows = [get('/index/' + code + '/basic') for code in ('KOSPI', 'KOSDAQ')]
    lines, pills, dates = [], [], []
    for row in rows:
        traded = datetime.fromisoformat(row['localTradedAt']).astimezone(KST)
        if traded.date() != day or n(row.get('closePrice')) <= 0:
            raise RuntimeError('브리핑 대상 거래일과 원본 시세 날짜가 다릅니다')
        change = n(row['fluctuationsRatio'])
        value = n(row['closePrice'])
        name = row['stockName']
        text = f'{name} {value:,.2f} ({change:+.2f}%)'
        lines.append(text)
        pills.append({'t': text, 'cls': 'g' if change >= 0 else 'r'})
        dates.append(traded.isoformat())
    summary = ' · '.join(lines) + '.\n\n'
    summary += f'원본 시세 기준 {max(dates)}. 네이버 증권에서 확인된 지수만 자동 요약했습니다. '
    summary += '개별 종목의 상승·하락 원인은 이 자료만으로 단정하지 않습니다.'
    title = f'{day.month}월 {day.day}일 {SLOTS[slot]} 브리핑'
    return {'date': day.isoformat(), 'slot': slot, 'title': title,
            'src': 'VANTOR · 네이버 증권 자동 요약', 'lead': summary,
            'generatedAt': now.isoformat(), 'sourceAsOf': dates,
            'kr': {'title': '한국 증시', 'pills': pills, 'body': summary},
            'core': {'title': '확인된 시장 흐름', 'body': summary},
            'checks': ['지수 등락과 종목별 차이를 구분해서 확인', '시세 기준 시각 확인'],
            'us': {'title': '미국장', 'tiles': [], 'note': '미장 브리핑에서 별도로 확인하세요.'}}


def main():
    now = datetime.now(KST)
    day, slot = target(now)
    name = f'{day.isoformat()}-{slot}.json'
    out = ROOT / 'briefs' / name
    needed = not out.exists()
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
            f.write(f'needed={int(needed)}\nfile=briefs/{name}\n')
    if '--check' in sys.argv or not needed:
        print('missing' if needed else 'already published', name)
        return
    d = build(now, day, slot)
    out.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
    idx_path = ROOT / 'briefs/index.json'
    idx = json.loads(idx_path.read_text())
    idx = [x for x in idx if not (x['date'] == d['date'] and x['slot'] == slot)]
    idx.append({'date': d['date'], 'slot': slot, 'title': d['title'], 'summary': d['lead'], 'data': f'briefs/{name}'})
    idx.sort(key=lambda x: (x['date'], ['am', 'noon', 'pm'].index(x['slot'])), reverse=True)
    idx_path.write_text(json.dumps(idx[:90], ensure_ascii=False, indent=2) + '\n')
    print('saved', name)


if __name__ == '__main__':
    main()
