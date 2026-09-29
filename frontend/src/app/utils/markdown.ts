const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Minimal, safe markdown: escapes everything first, then bold, inline code, lists and tables. */
export function renderMarkdown(text: string): string {
  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(
        /`([^`]+)`/g,
        '<code class="px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 text-[0.85em]">$1</code>',
      );
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let table: string[][] | null = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  const closeTable = () => {
    if (!table) return;
    const [head, ...rows] = table;
    out.push(
      '<div class="overflow-x-auto my-2"><table class="text-xs border-collapse w-full">' +
        `<thead><tr>${head.map((c) => `<th class="border border-violet-100 bg-violet-50 px-2 py-1 text-left">${inline(c)}</th>`).join('')}</tr></thead>` +
        `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td class="border border-violet-100 px-2 py-1">${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,
    );
    table = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (/^\|.*\|$/.test(line)) {
      closeList();
      if (/^\|[\s:|-]+\|$/.test(line)) continue; // separator row
      (table ??= []).push(
        line
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim()),
      );
      continue;
    }
    closeTable();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        list = kind;
        out.push(
          kind === 'ul'
            ? '<ul class="list-disc pl-5 space-y-0.5">'
            : '<ol class="list-decimal pl-5 space-y-0.5">',
        );
      }
      out.push(`<li>${inline((bullet ?? numbered)![1])}</li>`);
      continue;
    }
    closeList();
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) out.push(`<p class="font-semibold mt-2">${inline(heading[1])}</p>`);
    else if (line) out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  closeTable();
  return out.join('');
}
