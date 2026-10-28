"""Apply the requested view revision to the retained report source."""
from pathlib import Path
root=Path(__file__).resolve().parent
p=root/'app.js'
s=p.read_text(encoding='utf-8-sig')
start=s.index('function render(){')
end=s.index('function download(',start)
s=s[:start]+(root/'views.js').read_text(encoding='utf-8')+'\n'+s[end:]
start=s.index("for(const el of ['start'")
s=s[:start]+(root/'events.js').read_text(encoding='utf-8')
s=s.replace("out:'전환·단종'", "out:'EOL'")
s=s.replace("pages={shortage:1,lifecycle:1}, shownShort=[],shownLife=[]", "pages={shortage:1,new:1,eol:1}, shownShort=[],shownNew=[],shownEol=[]")
s=s.replace("pm:text(row,'L')||'미입력',",'')
s=s.replace("family:text(row,'Q'),", "family:text(row,'Q')||'미입력',")
s=s.replace("['A','B','C','D','L','N','Q','V','W','X','CZ','DA']", "['A','B','C','D','N','Q','V','W','X','CZ','DA']")
s=s.replace("[['category','category','전체 카테고리'],['pm','pm','전체 PM']]", "[['category','category','전체 카테고리'],['fl1','family','전체 FL1']]")
s=s.replace("(!$('pm').value||p.pm===$('pm').value)", "(!$('fl1').value||p.family===$('fl1').value)")
s=s.replace("pages={shortage:1,lifecycle:1};render();", "pages={shortage:1,new:1,eol:1};render();")
s=s.replace('단종 대상 입고계획 확인','EOL 입고계획 확인')
p.write_text(s,encoding='utf-8')
p=root/'build_report.py'
s=p.read_text(encoding='utf-8').replace("{'A','B','C','D','L','N','Q','V','W','X','CZ','DA'}", "{'A','B','C','D','N','Q','V','W','X','CZ','DA'}")
p.write_text(s,encoding='utf-8')
print('Report views revised.')
