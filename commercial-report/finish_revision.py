from pathlib import Path
root=Path(__file__).resolve().parent
p=root/'template.html'
s=p.read_text(encoding='utf-8-sig')
s=s.replace('각 SKU의 선택 기간 중 최대 부족수량을 더한 값은 ‘SKU별 최대 부족 합계’입니다. 서로 다른 월의 최대값이므로 같은 시점의 추가 발주 필요량으로 해석하지 않습니다. 월별 음수 잔량은 기간 전체에 걸쳐 합산하지 않습니다.', '제품별 월별 부족수량은 음수 월말재고의 절댓값입니다. 부족이 없으면 —로 표시합니다. 카테고리별 그래프와 부족수량 요약은 선택 종료월 기준이며, 여러 달의 부족 잔량을 합산하지 않습니다.')
s=s.replace('전환·단종','EOL').replace('신제품·단종','신제품·EOL').replace('단종일','EOL일')
p.write_text(s,encoding='utf-8')
print('Report wording updated.')
