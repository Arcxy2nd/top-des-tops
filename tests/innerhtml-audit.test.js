'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const INDEX = path.join(__dirname, '..', 'Index.html');

/**
 * Liste d'exceptions auditee a la main. Chaque entree fige UNE affectation
 * innerHTML dont on a verifie qu'elle est sure, avec la raison.
 *
 * `snippet` doit apparaitre TEL QUEL et UNE SEULE FOIS dans Index.html : un
 * snippet ambigu ferait taire deux sites d'un coup, dont un non audite.
 *
 * Ajouter une entree ici est un acte d'audit, pas une formalite. Si la raison ne
 * tient pas en une ligne, c'est que le site doit etre corrige, pas allowliste.
 */
const AUDITED = [
  {
    snippet: "if (previewPane.style.display !== 'none') previewPane.innerHTML = renderMarkdown(textarea.value);",
    reason: 'renderMarkdown échappe le HTML brut et produit un arbre markdown sécurisé'
  },
  {
    snippet: "if (!showing) previewPane.innerHTML = renderMarkdown(textarea.value);",
    reason: 'renderMarkdown échappe le HTML brut et produit un arbre markdown sécurisé'
  },
  {
    snippet: "head.innerHTML =\n      '<span class=\"phrases-pool-emoji\">' + meta.emoji + '</span>' +",
    reason: 'meta vient du dictionnaire POOL_LABELS (constante) et entries.length est un entier'
  },
  {
    snippet: "container.innerHTML = introHtml + '<div class=\"card\" style=\"color:var(--text-muted); text-align:center; padding:36px 20px; border-radius:12px;\">'",
    reason: 'introHtml est construit via renderMarkdown() et le reste du fragment est un gabarit statique'
  },
  {
    snippet: "html += '</div></div>';\n    });\n\n    container.innerHTML = html;\n  }",
    reason: 'html agrège introHtml (renderMarkdown) et les cartes (buildChangelogVersionCard échappe ver et formate via renderMarkdown)'
  },
  {
    snippet: "body.innerHTML = renderMarkdown(msg.text);",
    reason: 'renderMarkdown échappe le texte du message et produit du HTML sécurisé'
  },
  {
    snippet: "for (let i = 0; i < rows; i++) {\n      html += '<' + tag + ' class=\"skeleton' + extraClass + '\" style=\"height:' + height + 'px;margin-bottom:8px;\"></' + tag + '>';\n    }\n    container.innerHTML = html;",
    reason: 'showSkeleton génère des div/tags de squelette avec des dimensions numériques'
  },
  {
    snippet: "function showTableSkeleton(tbody, colCount, rows) {\n    if (!tbody) return;\n    let html = '';\n    for (let i = 0; i < (rows || 5); i++) {\n      html += '<tr><td colspan=\"' + colCount + '\"><div class=\"skeleton\" style=\"height:32px;\"></div></td></tr>';\n    }\n    tbody.innerHTML = html;\n  }",
    reason: 'showTableSkeleton génère des lignes tr/td de squelette avec colCount numérique'
  },
  {
    snippet: "btn.innerHTML = btn.dataset.original || original;",
    reason: "restaure le HTML capturé avant le passage en état de chargement"
  },
  {
    snippet: "function flashSaved(btn) {\n    if (!btn) return;\n    const original = btn.dataset.original || btn.innerHTML;\n    btn.classList.add('saved');\n    btn.innerHTML = '✓';\n    setTimeout(() => {\n      btn.classList.remove('saved');\n      btn.innerHTML = original;\n    }, 900);\n  }",
    reason: "restaure le HTML capturé avant l'animation de confirmation flashSaved"
  },
  {
    snippet: "box.innerHTML =\n      '<h3>✅ Lot enregistré</h3>'",
    reason: 'totalEntries, plan.length, totalPts sont des entiers et rows est construit avec escapeHtml'
  },
  {
    snippet: "list.innerHTML = logs.length\n        ? logs.map(drilldownRowHtml).join('')",
    reason: "drilldownRowHtml échappe le joueur, la catégorie, l'avatar et passe la description par renderMarkdown"
  },
  {
    snippet: "box.innerHTML = `\n      <h3>⭐ Affecter des points au Top Alternatif</h3>",
    reason: 'interpole altOptionsHtml, playerOptionsHtml et catOptionsHtml tous construits avec escapeHtml'
  },
  {
    snippet: "html += `</tbody></table></div>`;\n        content.innerHTML = html;",
    reason: 'html du gestionnaire de Top Alternatif est construit avec escapeHtml sur chaque cellule'
  },
  {
    snippet: "meta.innerHTML = renderMarkdown(item.meta);",
    reason: 'renderMarkdown échappe la description de la catégorie et rend le markdown sécurisé'
  },
  {
    snippet: "p.innerHTML = isAltRow\n          ? '<div class=\"emoji\">⭐</div>",
    reason: 'chaîne littérale conditionnelle sans interpolation de variables'
  },
  {
    snippet: "td.innerHTML = emptyIllustration('🗒️', 'Aucune entrée dans le journal.');",
    reason: 'emptyIllustration échappe son message via escapeHtml'
  },
  {
    snippet: "td.innerHTML = emptyIllustration('📭', 'Aucune entrée trouvée.');",
    reason: 'emptyIllustration échappe son message via escapeHtml'
  },
  {
    snippet: "full.innerHTML = renderMarkdown(first.description);",
    reason: 'renderMarkdown échappe la description'
  },
  {
    snippet: "tbody.innerHTML = '<tr><td colspan=\"' + (histSelectMode ? 7 : 6) + '\" style=\"text-align:center;color:var(--text-muted);padding:24px;\">'",
    reason: "message d'erreur statique avec colspan numérique conditionnel"
  },
  {
    snippet: "full.innerHTML = renderMarkdown(log.description);",
    reason: 'renderMarkdown échappe la description'
  },
  {
    snippet: "container.innerHTML = emptyIllustration('🙋', 'Ajoutez d\\'abord des joueurs dans Paramètres.');",
    reason: 'emptyIllustration échappe son message via escapeHtml'
  },
  {
    snippet: "txt.className = 'note-text'; txt.innerHTML = renderMarkdown(note.text);",
    reason: 'renderMarkdown échappe le texte de la note'
  },
  {
    snippet: "grid.innerHTML = `\n        <div class=\"health-stat ok\">",
    reason: 'interpole des compteurs entiers et dupes.map(escapeHtml)'
  },
  {
    snippet: "if (desktopGroup) desktopGroup.innerHTML = html;",
    reason: 'html est construit depuis NAV_PAGES, liste fixe de pages statiques'
  },
  {
    snippet: "if (mobileGroup)  mobileGroup.innerHTML  = html;",
    reason: 'html est construit depuis NAV_PAGES, liste fixe de pages statiques'
  },
  {
    snippet: "diff.innerHTML = wordDiffHtml(r.before, r.after);",
    reason: 'wordDiffHtml échappe chaque token avant de l envelopper dans del ou ins'
  },
  {
    snippet: "catSelect.innerHTML = selectHtml;",
    reason: "selectHtml est construit à partir d'options échappées avec escapeHtml"
  },
  {
    snippet: "body.innerHTML = '<p class=\"bareme-empty\">' +\n        (query ? 'Aucune règle ne correspond à la recherche.' : 'Aucune règle définie.<br>Configurez le barème dans ⚙️ Paramètres.')",
    reason: 'chaîne littérale conditionnelle sans interpolation de variables'
  }
];

/** Affectations `X.innerHTML =` ou `X.innerHTML +=`, avec leur expression source. */
function collectAssignments(html) {
  const out = [];
  const lines = html.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/\.innerHTML\s*\+?=/.test(lines[i])) continue;
    // L'expression peut courir sur plusieurs lignes (concatenations longues) :
    // on agrege jusqu'au point-virgule de fin d'instruction.
    let expr = lines[i];
    let j = i;
    while (!/;\s*(\/\/.*)?$/.test(expr.trim()) && j - i < 200 && j + 1 < lines.length) {
      j++;
      expr += '\n' + lines[j];
    }
    out.push({ line: i + 1, expr });
  }
  return out;
}

/**
 * Une affectation est "sure par construction" si son expression n'interpole
 * aucune donnee : soit une chaine vide/litterale, soit uniquement des litteraux
 * concatenes. Tout le reste demande soit escapeHtml(), soit un audit explicite.
 */
function isLiteralOnly(expr) {
  const rhs = expr.slice(expr.indexOf('=') + 1);
  // Retire les chaines litterales, les commentaires et les espaces.
  const stripped = rhs
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '')
    .replace(/`(?:[^`\\$]|\\.|\$(?!\{))*`/g, '')
    .replace(/[\s+;]/g, '');
  return stripped === '';
}

/** Interpole-t-elle quelque chose sans jamais passer par un echappeur ? */
function looksUnsafe(expr) {
  if (isLiteralOnly(expr)) return false;
  return !/escapeHtml\s*\(|encodeURIComponent\s*\(/.test(expr);
}

test('chaque snippet audite est present et unique dans Index.html', () => {
  const html = fs.readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');
  AUDITED.forEach(entry => {
    const count = html.split(entry.snippet).length - 1;
    assert.strictEqual(count, 1,
      'snippet audite present ' + count + ' fois (attendu 1) : ' + JSON.stringify(entry.snippet));
    assert.ok(entry.reason && entry.reason.trim().length >= 10,
      'raison manquante ou trop courte pour : ' + JSON.stringify(entry.snippet));
  });
});

test('aucune affectation innerHTML n interpole de donnee sans echappement', () => {
  const html = fs.readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');
  const audited = AUDITED.map(e => e.snippet);
  const offenders = collectAssignments(html)
    .filter(a => looksUnsafe(a.expr))
    .filter(a => !audited.some(s => s.indexOf(a.expr.trim()) !== -1 || a.expr.indexOf(s) !== -1));

  const report = offenders
    .map(a => '  Index.html:' + a.line + '\n' + a.expr.split('\n').map(l => '    ' + l.trim()).join('\n'))
    .join('\n\n');

  assert.strictEqual(offenders.length, 0,
    offenders.length + ' affectation(s) innerHTML interpolent une donnee sans escapeHtml() :\n\n' + report);
});
