"""Generate the reviewable institution coverage ledger from published data."""
from collections import Counter
from turkey_research import ROOT,read


def main():
    data=read(ROOT/'data/turkey-catalog-coverage-2026.json');us=data['universities']
    sources=read(ROOT/'data/turkey-catalog-sources-2026.json')
    areas=read(ROOT/'data/turkey-campus-areas-2026.json');area_counts={u['universityId']:u['nearbyAreas'] for u in areas['coverage']}
    total=sum(u['programCount'] for u in us);known=sum(u['structuredProgramCount'] for u in us)
    reasons=Counter(r for u in us for r in u['missingReasons'].values())
    lines=['# Türkiye katalog kapsamı — '+data['checkedAt'],'',
        f'{len(us)} kurum · {total:,} program · {known:,} programda ders kaydı · {total-known:,} programda ders listesi eksik.',
        f'Toplam {sum(u["courseCount"] for u in us):,} program-ders kaydı. {sum(bool(s["catalogs"]) for s in sources.values())} kurumda doğrulanmış katalog girişi.',
        f'{sum(bool(n) for n in area_counts.values())} kurum çevresinde {len(areas["places"]):,} kaynaklı yakın bölge kaydı. {sum(not n for n in area_counts.values())} kurumun doğrulanmış konumu bulunmadığı için yakın bölge eklenemedi.',
        '', 'Yeni listelerin tamamı kısmi kapsamlıdır. Bu rapor eksiksiz müfredat veya ülke genelinde tekil ders sayısı iddiası taşımaz. [Yöntem ve tekrar üretme](./TURKEY_CATALOG_2026.md).',
        '', '## Eksik listelerin nedenleri', '']
    labels={'programme-source-not-matched':'Resmî program eşleşmesi eksik','no-readable-curriculum':'Okunabilir ders listesi bulunamadı',
        'source-unavailable':'Ders kaynağına erişilemedi','ambiguous-programme-source':'Kaynakta program ayrımı doğrulanamadı'}
    lines += [f'- {labels.get(k,k)}: {n:,}' for k,n in reasons.most_common()]
    lines += ['', '## Kurumlar', '', '| Kurum | Program | Ders listesi olan | Eksik | Ders kaydı | Yakın bölge | Resmî katalog |', '|---|---:|---:|---:|---:|---:|---|']
    for u in us:
        refs=sources[u['universityId']]['catalogs'];links=' · '.join(f'[Kaynak {i+1}]({s["url"]})' for i,s in enumerate(refs)) or 'Doğrulanmış giriş yok'
        lines.append(f'| {u["name"]} | {u["programCount"]} | {u["structuredProgramCount"]} | {len(u["missingProgramIds"])} | {u["courseCount"]:,} | {area_counts[u["universityId"]]} | {links} |')
    path=ROOT/'docs/TURKEY_CATALOG_COVERAGE_2026.md';path.write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print(path)


if __name__=='__main__':main()
