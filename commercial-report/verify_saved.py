from pathlib import Path
import json
import re

root=Path(__file__).resolve().parent
saved=Path(r'C:\Users\RonnieJ\Downloads\Commercial_Supply_Tefal Demand_Supply_FCST_W0624 (1).html')
html=saved.read_text(encoding='utf-8')
state=json.loads(re.search(r'<script id="report-state" type="application/json">(.*?)</script>',html,re.S).group(1))
assert state['tab']=='new'
assert state['values']['category']=='KITCHENWARE & DINNER'
assert state['values']['fl1']=='KITCHEN KNIVES'
assert state['values']['search']=='2100133020'
assert 'pm' not in state['values']
data=json.loads(re.search(r'<script id="report-data" type="application/json">(.*?)</script>',html,re.S).group(1))
assert data['filename']=='Tefal Demand_Supply_FCST_W0624.xlsm'
(root/'preview'/'saved-revised.html').write_text(html,encoding='utf-8')
print('PASS: saved HTML preserves workbook data and selected filters.')
