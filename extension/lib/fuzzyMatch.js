// Scorer simples de busca fuzzy: prioriza substring contígua (mais cedo no
// texto = melhor); se não achar substring, cai pra subsequência (letras da
// busca aparecendo em ordem, não precisa ser contíguo).
export function fuzzyScore(query, text) {
    if (!query)
        return 0;
    const q = query.toLowerCase();
    const t = text.toLowerCase();

    const idx = t.indexOf(q);
    if (idx !== -1)
        return 1000 - idx;

    let ti = 0, score = 0, streak = 0;
    for (let qi = 0; qi < q.length; qi++) {
        const found = t.indexOf(q[qi], ti);
        if (found === -1)
            return -1; // não bate
        streak = found === ti ? streak + 1 : 1;
        score += 10 - Math.min(9, found - ti) + streak;
        ti = found + 1;
    }
    return score;
}

export function fuzzyFilter(query, items, getText) {
    if (!query)
        return items;
    return items
        .map(item => ({ item, score: fuzzyScore(query, getText(item)) }))
        .filter(r => r.score >= 0)
        .sort((a, b) => b.score - a.score)
        .map(r => r.item);
}
