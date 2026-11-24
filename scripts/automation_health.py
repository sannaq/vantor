"""Compare published signal/valuation dates; request bounded recovery, never edit accounts."""
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ACTIVE = {'queued', 'in_progress', 'waiting', 'pending', 'requested'}
TARGETS = [('국내 모의계좌', 'paper-kr', 'stock-picks', 'paper.yml'),
           ('미국 모의계좌', 'paper-us', 'stock-picks-us', 'paper.yml'),
           ('미국 공식 비교', 'formula-paper-us', 'stock-scores-us', 'formula-paper.yml')]


def assess(label, state, source):
    target = str(source.get('date') or '')
    actual = str(state.get('valuationDate') or '')
    signal = str(state.get('sourceDate') or state.get('lastSignalDate') or '')
    valid = lambda x: len(x) == 8 and x.isdigit()
    status = 'unknown'
    if valid(target) and valid(actual):
        status = 'delayed' if actual < target or not valid(signal) or signal < target or state.get('status') in {'update_failed', 'feed_stale', 'formula_feed_stale', 'error'} else 'current'
    return dict(label=label, status=status, sourceDate=target, valuationDate=actual,
                signalDate=signal, updatedAt=state.get('updatedAt'), accountStatus=state.get('status'))


def recovery_allowed(runs, now):
    if any(r.get('status') in ACTIVE for r in runs):
        return False, '실행 중이거나 대기 중'
    # Limit retries even when prices are unavailable. Completed runs count too.
    for run in runs:
        stamp = run.get('created_at')
        if stamp and (now - datetime.fromisoformat(stamp.replace('Z', '+00:00'))).total_seconds() < 3600:
            return False, '최근 1시간 안에 실행됨'
    return True, '갱신 재요청'


def api(path, method='GET', body=None):
    cmd = ['gh', 'api', path, '--method', method]
    if body is not None:
        cmd += ['--input', '-']
    r = subprocess.run(cmd, input=json.dumps(body) if body is not None else None,
                       capture_output=True, text=True, check=True, timeout=45)
    return json.loads(r.stdout) if r.stdout.strip() else None


def main():
    import base64
    repo = os.environ['GITHUB_REPOSITORY']
    now = datetime.now(timezone.utc)
    def feed(name):
        content = api(f'repos/{repo}/contents/feeds/{name}.json?ref=main')
        return json.loads(base64.b64decode(content['content']))
    rows, requests = [], {}
    for label, name, source, workflow in TARGETS:
        try:
            row = assess(label, feed(name), feed(source))
            if row['status'] == 'delayed':
                if workflow not in requests:
                    runs = api(f'repos/{repo}/actions/workflows/{workflow}/runs?per_page=10')['workflow_runs']
                    allowed, reason = recovery_allowed(runs, now)
                    if allowed:
                        api(f'repos/{repo}/actions/workflows/{workflow}/dispatches', 'POST', {'ref': 'main'})
                    requests[workflow] = reason
                row['recovery'] = requests[workflow]
            rows.append(row)
        except Exception as exc:
            # Public output contains no credentials, command output or private API payload.
            rows.append(dict(label=label, status='unknown', error=type(exc).__name__))
    report = dict(checkedAt=now.isoformat(), accounts=rows,
                  failureAlertConfigured=os.environ.get('ALERT_CONFIGURED') == 'true')
    Path('feeds/automation-health.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    for row in rows:
        print(row['label'], row['status'], row.get('valuationDate'), row.get('recovery', ''))
    print('실패 알림 설정:', '연결됨(전송 검증 별도)' if report['failureAlertConfigured'] else '미연결')
    if any(row['status'] == 'unknown' for row in rows):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
