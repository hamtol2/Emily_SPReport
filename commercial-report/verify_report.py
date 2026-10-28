"""Independent source controls: read only, never save the source workbook."""
import json
from pathlib import Path
import openpyxl

root = Path(__file__).resolve().parent
source = next(root.parent.glob('*.xlsm'))
wb = openpyxl.load_workbook(source, read_only=True, data_only=True)
rows = list(wb['CMMF_Tefal'].iter_rows(values_only=True))
products = [r for r in rows[8:] if r[0] is not None and r[1] is not None]
closing = [j for j,v in enumerate(rows[6]) if v and 'Closing' in str(v) and 'Qty' in str(v)]
result = {'products':len(products), 'monthlyNegativeCounts':[], 'monthlyNegativeQuantity':[], 'firstThreeUnique':0, 'firstThreeMaxSum':0}
for c in closing:
    negative = [r[c] for r in products if isinstance(r[c],(int,float)) and r[c]<0]
    result['monthlyNegativeCounts'].append(len(negative))
    result['monthlyNegativeQuantity'].append(sum(-x for x in negative))
for r in products:
    peak = max(0,*[-r[c] for c in closing[:3] if isinstance(r[c],(int,float))])
    result['firstThreeUnique'] += peak > 0
    result['firstThreeMaxSum'] += peak
(root/'verification-source.json').write_text(json.dumps(result),encoding='utf-8')
print(json.dumps(result))
