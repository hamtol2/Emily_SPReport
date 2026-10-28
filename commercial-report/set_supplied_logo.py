"""Download the exact logo supplied by the user, without modifying its artwork."""
from pathlib import Path
from urllib.request import Request,urlopen
from xml.etree import ElementTree as ET
import json

url='https://i.namu.wiki/i/xUkFarP7dHqtg9Fbv4jo7omoWMcwA1-5vZG0MW2HGDtE13LQdFRS0ysBC3zVtB83MYbIZu6k8iMXH6k9wmWCFVYL5fi7rBV-79uq3qEKQHpCpmm9xgYbVA_UKkC8IVhyrspdqYPGTXJ5wvhHDwo2kw.svg'
root=Path(__file__).resolve().parent
request=Request(url,headers={'User-Agent':'Mozilla/5.0'})
with urlopen(request,timeout=25) as response:
    data=response.read(2_000_001)
if len(data)>2_000_000: raise ValueError('Unexpectedly large logo')
svg=ET.fromstring(data)
if svg.tag.split('}')[-1]!='svg': raise ValueError('The URL did not return an SVG image')
assets=root/'assets'
assets.mkdir(exist_ok=True)
(assets/'tefal-logo.svg').write_bytes(data)
(assets/'tefal-logo-source.json').write_text(json.dumps({'image':url,'file':'tefal-logo.svg','bytes':len(data),'viewBox':svg.get('viewBox')},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'bytes':len(data),'width':svg.get('width'),'height':svg.get('height'),'viewBox':svg.get('viewBox')}))
