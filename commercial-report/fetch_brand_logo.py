"""Fetch the actual header logo from Tefal's public official website."""
import json
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

root=Path(__file__).resolve().parent
page='https://www.tefal.com/home'
def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=30).read()

class LogoParser(HTMLParser):
    src=None
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='img' and attrs.get('alt')=='Tefal' and self.src is None:
            self.src=attrs.get('src')

parser=LogoParser()
parser.feed(fetch(page).decode('utf-8'))
if not parser.src: raise RuntimeError('Official logo image not found')
url=urljoin(page,parser.src)
data=fetch(url)
if not data.startswith(b'\x89PNG\r\n\x1a\n'): raise RuntimeError('Expected a PNG logo')
assets=root/'assets'
assets.mkdir(exist_ok=True)
(assets/'tefal-logo.png').write_bytes(data)
(assets/'tefal-logo-source.json').write_text(json.dumps({'page':page,'image':url,'bytes':len(data)},indent=2),encoding='utf-8')
print(json.dumps({'file':str(assets/'tefal-logo.png'),'bytes':len(data)}))
