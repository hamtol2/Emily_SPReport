"""Build an offline, self-contained report from the most recent source workbook."""
import argparse
import base64
import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def col_no(s):
    n = 0
    for c in s: n = n * 26 + ord(c) - 64
    return n

def compact(data):
    rows = data['sheets']['CMMF_Tefal']
    allowed = {'A','B','C','D','N','Q','V','W','X','CZ','DA'}
    for start,c in rows['6'].items():
        if not re.search(r"Q.?ty", str(c['v']), re.I): continue
        end = next(k for k,v in rows['7'].items() if col_no(start) <= col_no(k) < col_no(start)+12 and re.search(r'Closing\s*Qty', str(v['v']), re.I))
        allowed.update(k for r in rows.values() for k in r if col_no(start) <= col_no(k) <= col_no(end))
    data['sheets']['CMMF_Tefal'] = {
        rn: r if int(rn)<9 else {k:v for k,v in r.items() if k in allowed}
        for rn,r in rows.items() if int(rn)<9 or (re.fullmatch(r'(?:\d{6,14}|TBD\d+)',str(r.get('A',{}).get('v','')), re.I) and r.get('B',{}).get('v') is not None)
    }
    return data

def read_xlsx(path):
    with zipfile.ZipFile(path) as z:
        strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            strings = [''.join(t.text or '' for t in x.findall('.//m:t', NS))
                       for x in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)]
        rels = {x.attrib['Id']: x.attrib['Target'] for x in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        workbook = ET.fromstring(z.read('xl/workbook.xml'))
        result = {}
        for s in workbook.findall('m:sheets/m:sheet', NS):
            name = s.attrib['name']
            if name not in ('CMMF_Tefal', 'Phase In & Out'):
                continue
            target = rels[s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
            target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
            rows = {}
            for row in ET.fromstring(z.read(target)).findall('m:sheetData/m:row', NS):
                cells = {}
                for c in row.findall('m:c', NS):
                    ref = re.sub(r'\d', '', c.attrib['r'])
                    typ = c.attrib.get('t', 'n')
                    v = c.find('m:v', NS)
                    value = v.text if v is not None else None
                    if typ == 's' and value is not None:
                        value = strings[int(value)]
                    elif typ == 'inlineStr':
                        value = ''.join(t.text or '' for t in c.findall('.//m:t', NS))
                    elif typ in ('n', 'b') and value not in (None, ''):
                        value = float(value)
                        if value.is_integer(): value = int(value)
                    formula = c.find('m:f', NS)
                    if value is not None or formula is not None:
                        cells[ref] = {'v': value, 'f': formula is not None, 't': typ}
                rows[str(row.attrib['r'])] = cells
            result[name] = rows
        return {'filename': path.name, 'generatedAt': datetime.now(timezone.utc).isoformat(), 'sheets': result}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('workbook', nargs='?')
    args = parser.parse_args()
    candidates = [p for p in ROOT.parent.glob('*.xls*') if not p.name.startswith('~$')]
    source = Path(args.workbook).resolve() if args.workbook else max(candidates, key=lambda p: p.stat().st_mtime)
    data = read_xlsx(source)
    if 'CMMF_Tefal' not in data['sheets']:
        raise ValueError('CMMF_Tefal sheet is required')
    data = compact(data)
    html = (ROOT / 'template.html').read_text(encoding='utf-8')
    logo = base64.b64encode((ROOT / 'assets' / 'tefal-logo.svg').read_bytes()).decode('ascii')
    html = html.replace('__TEFAL_LOGO__', 'data:image/svg+xml;base64,' + logo)
    html = html.replace('/* REPORT_CSS */', (ROOT / 'style.css').read_text(encoding='utf-8'))
    html = html.replace('/* REPORT_JS */', (ROOT / 'app.js').read_text(encoding='utf-8'))
    html = html.replace('__REPORT_DATA__', json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c'))
    output = ROOT.parent / 'Commercial_Supply_Report.html'
    output.write_text(html, encoding='utf-8')
    (ROOT / 'source-data.json').write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    print(json.dumps({'output': str(output), 'source': source.name, 'size': output.stat().st_size}, ensure_ascii=False))

if __name__ == '__main__':
    main()
