# Groov glossary and transcreation rules

Every string in `src/i18n/locales/*.json` follows this file (UI/UX plan §0, DoD 9). Add a term here before you ship copy that uses it. Translations are written for each market (transcreated), not converted word for word: when an idiom doesn't exist in a locale, write what a native speaker would say in that moment.

`src/i18n/__tests__/glossary.test.js` enforces the "Don't say" list. When you retire a term here, add its regex there.

## 1. Voice

Groov is a calm friend who keeps time with you. It is short, warm and concrete, and it doesn't hype. The brand idea is musical: **rests are part of the rhythm**. Skips, unscheduled days, freezes and an unfinished today are on brand. They are not exceptions to apologise for.

- Talk to one person as a friend, in the informal form in every locale (see §4).
- Say what happened and what to do next. Keep sentences short.
- Give quiet praise. A finished day is "Day complete", not a party. Use at most one exclamation mark per screen, and none in ja.
- Use plain words, not productivity jargon: "habit", "done", "streak"; not "task", "KPI" or "grind".

## 2. Tone rules (plan §1.3)

1. Never say "lost", "broke", "failed" or "missed out", and never put an exclamation mark on a lapse.
2. Talk about the present and the next action, not the past.
3. Say "Back on beat" **only after the user has completed something** following a break, as recognition of what they just did. Never use it as a reaction to the break, and never write "You fell off the beat".
4. Numbers in loss messages are factual ("ended at 12 days"), never comparative ("only 12").
5. Rest and freeze copy uses "holds" or "keeps", never "saved you" (no rescue framing). In English, "holds" is reserved for rest and freeze copy.
6. A challenge that ends below platinum has "ended". It is not "complete" (CEL-5).

These rules apply in every locale through the transcreations in §5. A missed day is described neutrally: es "sin hacer", pt-BR "não feito" / "sem registro", ja "未達成" / "できなかった日". Avoid words that mean failure or loss: es "fallado" / "si fallas", pt-BR "perdido" / "perdeu", ja "失敗". Give a lapse a neutral image instead: es "Si un día no sale, sigue adelante", pt-BR "Se um dia não rolar, continue".

## 3. Terms

One term per concept, used the same way everywhere: tab, title, button, accessibility label and notification. Lower-case forms are shown; capitalise per §4. The keys listed are where each term lives today.

| Concept | en | es | de | fr | pt-BR | ja | Notes |
|---|---|---|---|---|---|---|---|
| habit | habit | hábito | Gewohnheit | habitude (f.) | hábito | 習慣 | de: always *Gewohnheit*. *Routine* is rejected: it clashes with "Gewohnheit hinzufügen" and the other ~80 strings. |
| Habits (tab) | Habits | Hábitos | Gewohnheiten | Habitudes | Hábitos | 習慣 | de fits the iPhone SE tab at 12 pt (§6). |
| Today (tab) | Today | Hoy | Heute | Aujourd'hui | Hoje | 今日 | |
| Progress (tab) | Progress | Progreso | Fortschritt | Progrès | Progresso | 進捗 | |
| Challenges (tab and title) | Challenges | Retos | Challenges | Défis | Desafios | チャレンジ | **Plural on the tab and the title.** en/de `app.tabs.challenge` still read "Challenge"; P-02 changes the value. de keeps the anglicism *die Challenge*. |
| Settings (tab and title) | Settings | Ajustes | Einstellungen | Réglages | Ajustes | 設定 | de: *Optionen* is rejected as unidiomatic. *Einstellungen* fits (§6). |
| done (a habit's state) | done | hecho | erledigt | fait / faite | concluído | 完了 | Habits are "done", never "completed" (P-07 sweeps en). ja: 完了 is a habit's state; 達成 is a goal or challenge reached. |
| check off / check-off (log a habit) | check off · check-off | marcar | abhaken · Abhaken | cocher · valider | marcar | チェックする | "Check-in" is reserved for the mood check-in and the evening Smart Check-in notification. |
| log | log | registrar | erfassen | valider | registrar | 記録する | Entering a count or a past day. |
| streak | streak | racha | Serie | série | sequência | 連続記録 · N日連続 | ja: never ストリーク. |
| freeze (noun) | streak freeze · freeze | congelación | Freeze (pl. Freezes) · Serien-Freeze | gel (de série) | congelamento | 連続記録フリーズ (introducing) · フリーズ | Two automatic freezes a month. pt-BR: never *pausa*, which reads as a rest. ja: a bare フリーズ first suggests a device hang. A string that **introduces** the concept or explains it on its own says 連続記録フリーズ (`onboarding.intro.streaks.body`, `progress.freezes`). Legends, labels and later mentions use plain フリーズ. |
| frozen (a day) | frozen | congelado | eingefroren | gelé | congelado | フリーズ | ❄ |
| rest day | rest day | día de descanso | Ruhetag | jour de repos | dia de descanso | 休みの日 (short: 休み) | An unscheduled day. ja: 休みの日, not お休みの日. |
| skip (a habit today) | skip · skipped | omitir · omitido | überspringen · übersprungen | sauter · sauté(e) | pular · pulado | スキップ | fr: *sauter*, because *passer*/*passée* reads as "past". The onboarding "Skip" button (skipping a step) stays fr *Passer*, es *Omitir*. |
| missed (a scheduled day not done) | missed | sin hacer | verpasst | manqué | não feito | 未達成 | See tone rule 1. |
| Mark the rest (done) | Mark the rest done | Marcar el resto como hecho | Den Rest abhaken | Cocher le reste | Marcar o resto como concluído | 残りを完了にする | "rest" here means the remainder. Translators must **not** use the rest-day word (descanso / Ruhe / repos / 休み). |
| habit types | Once a day · Volume goal · Timed · Quit habit · Limit | Una vez al día · Meta de cantidad · Con tiempo · Dejar un hábito · Límite | Einmal täglich · Mengenziel · Zeitbasiert · Abgewöhnen · Limit | Une fois par jour · Objectif chiffré · Chronométrée · Arrêter une habitude · Limite | Uma vez por dia · Meta de quantidade · Com tempo · Largar um hábito · Limite | 1日1回 · 数量目標 · 時間目標 · やめる習慣 · 上限 | Copy that refers to several types names them ("Volume, timed and limit habits"), never "counters and timers". |
| challenge | challenge | reto | Challenge (f.) | défi | desafio | チャレンジ | |
| Kickstart | 3-Day Kickstart | Arranque de 3 días | 3-Tage-Kickstart | Démarrage en 3 jours | Pontapé inicial de 3 dias | 3日間キックスタート | |
| challenge tiers | Platinum · Gold · Silver · Copper · Ended | Platino · Oro · Plata · Cobre · Terminado | Platin · Gold · Silber · Kupfer · Beendet | Platine · Or · Argent · Cuivre · Terminé | Platina · Ouro · Prata · Cobre · Encerrado | プラチナ · ゴールド · シルバー · ブロンズ · 終了 | ja uses ブロンズ on purpose: it is the natural third medal next to ゴールド/シルバー. |
| milestone | milestone | hito | Meilenstein | palier | marco | マイルストーン | Streaks of 7, 30, 100 and 365 days. |
| trophy / medal | trophy · medal | trofeo · medalla | Trophäe · Medaille | trophée · médaille | troféu · medalha | トロフィー · メダル | Trophy Case = Sala de trofeos / Trophäenschrank / Salle des trophées / Sala de troféus / トロフィーケース. |
| perfect day | perfect day | día perfecto | perfekter Tag | jour parfait | dia perfeito | パーフェクト日 | Every scheduled habit done. ja: the compact compound, because パーフェクトな日 wraps with a lone 日 on the SE stat tile. |
| reminder | reminder | recordatorio | Erinnerung | rappel | lembrete | リマインダー (verb: お知らせ) | |
| default reminders | Morning reminder · Evening reminder | Recordatorio de la mañana · Recordatorio de la noche | Morgenerinnerung · Abenderinnerung | Rappel du matin · Rappel du soir | Lembrete da manhã · Lembrete da noite | 朝のリマインダー · 夜のリマインダー | These are stored as data in `DEFAULT_REMINDERS` and still English in every locale; P-05/ST-01a make them translatable and use these terms. |
| Smart Check-in | Smart Check-in | Registro inteligente | Smarter Check-in | Bilan intelligent | Check-in inteligente | スマートチェックイン | The evening notification. |
| Groov Pro | Groov Pro | Groov Pro | Groov Pro | Groov Pro | o Groov Pro | Groov Pro | Never translated. pt-BR takes the article ("o Groov Pro"). |
| AI coach | AI Coach | Coach IA | KI-Coach | Coach IA | Coach de IA | AIコーチ | |
| Magic Fill | Magic Fill | Magic Fill | Magic Fill | Magic Fill | Magic Fill | Magic Fill | Feature name, not translated. |
| Sounds & haptics (P-07) | Sounds & haptics | Sonidos y vibración | Töne & Haptik | Sons et vibrations | Sons e vibração | サウンドと触覚 | Replaces the "FEEDBACK" section label. |

## 4. Per-locale rules

### All locales
- Placeholders (`%{name}`) and plural keys (`one` / `other`, ja included) must match `en.json`. `npx jest src/i18n` and `node scripts/i18n-check.mjs` enforce this.
- **Sentence case** for buttons, titles and labels in every locale ("Save changes", "Got it"). Only product and feature names are capitalised: Groov Pro, Magic Fill, Kickstart. Section labels may be rendered in caps by style, but the string itself stays in sentence case. The en Title Case strings and the pt-BR Title Case strings ("Salvar Alterações", "Meus Hábitos") are swept by P-07.
- No colons in titles ("This week", not "Habits Completed: Weekly"; P-07).
- Ellipsis is the single character `…`, not `...`.
- Numbers, percentages and times are formatted at render time with `Intl` (P-05). Don't hard-code `8:00 PM` or a decimal separator in a string.
- Length: translated UI labels aim to stay within **+30 % of the English length**. Tabs must fit at 12 pt on the iPhone SE (375 pt) without truncation.

### en
- US spelling for new strings. A few strings still say "Colour" / "behaviour"; P-07 picks up any it touches.
- Contractions are fine ("you're", "can't").
- 12-hour clock in en-US (`Intl` decides).

### es (neutral Spanish, leaning European: "añadir", "Ajustes", "mantén pulsado")
- **tú**, never usted ("Añade", "tu racha").
- Opening marks are required: ¿…? ¡…!
- Sentence case, including challenge names ("Reto de 30 días").
- Decimal comma and 24-hour time come from `Intl`.
- Double quotes `"…"` for quoted UI labels.

### de
- **du**, never Sie. Lower-case *du/dein* (current orthography). No formal imperatives: write "Tippe", not "Tippen Sie". Don't start a sentence with *Sie*, not even as the third-person pronoun, because it reads as formal address. Name the noun instead: "Die Gewohnheit verschwindet aus „Heute“". A sentence-initial *Ihre* meaning "its/their" is fine.
- Keep noun capitals. Compound nouns are hyphenated with numerals: "3-Tage-Kickstart", "12-Tage-Serie".
- Quotes are „…“ (low-high).
- 24-hour time ("20:00", "um 23 Uhr"), decimal comma, and a space before % ("20 %") via `Intl` (P-05).
- Abbreviations: "Min.", "Std.", "z. B." (with a narrow space). Never abbreviate a tab or the ring caption.
- Length is the main risk. Check every new label against the SE frame.

### fr
- **tu**, never vous: "Appuie", "Modifie-les", "ta série". The idiom *rendez-vous* is fine.
- **Non-breaking space (U+00A0) before `:` `;` `!` `?` `%` and inside « … »**. The existing strings use a normal space; P-07 converts them, and new strings use U+00A0.
- Quotes are « … ».
- 24-hour time with "h" ("23 h"), decimal comma, via `Intl`.
- Gender agreement follows the noun: *habitude* is feminine ("cochée", "sautée"), *défi* is masculine.

### pt-BR
- **você**, never o senhor / a senhora.
- Sentence case ("Salvar alterações", "Meus hábitos"). The current Title Case is P-07's job.
- "o app", "o Groov", "o Groov Pro" take the masculine article.
- 24-hour time ("23h"), decimal comma, via `Intl`.
- Double quotes `"…"`.

### ja
- です/ます politeness throughout. Short labels and buttons may end in the dictionary form or a noun (保存, 習慣を追加).
- **No exclamation marks.** End with 。 (P-07 removes the remaining ！ from older strings).
- **No metaphor stacking.** Prefer plain forms such as 続いています and 休みの日. A musical idiom is transcreated into one plain image ("Back on beat" becomes リズムが戻りました), not translated literally.
- Full-width punctuation: 、。「」（）：. Digits stay half-width (3日連続, 20:00).
- Counters: 個 for habits, 日 for days, 回 for times.
- 24-hour time, via `Intl`.
- **Line breaks:** Android does not apply kinsoku to every case. Keep titles within 11 full-width characters so they fit one line on the SE card (24 pt bold, about 287 pt wide). Avoid long katakana words that can split before ー (リマインダ/ー), and spell a counter that would sit at a line edge in kana (ひとつ, not 1つ). Check new onboarding copy on the emulator.

## 5. Brand phrases (transcreation table)

| en | es | de | fr | pt-BR | ja | Used by |
|---|---|---|---|---|---|---|
| Rest day | Día de descanso | Ruhetag | Jour de repos | Dia de descanso | 休みの日 | `today.restDay.title`, widget, heatmap |
| Rest day. Your rhythm holds. | Día de descanso. Tu ritmo sigue. | Ruhetag. Dein Rhythmus bleibt. | Jour de repos. Ton rythme tient. | Dia de descanso. Seu ritmo continua. | 休みの日です。リズムは続いています。 | C-04 (`today.restDay.*`) |
| Your rhythm holds | Tu ritmo sigue | Dein Rhythmus bleibt | Ton rythme tient | Seu ritmo continua | リズムは続いています | C-04, C-09 |
| Back on beat. | De vuelta al ritmo. | Wieder im Takt. | Te revoilà dans le rythme. | De volta ao ritmo. | リズムが戻りました。 | C-09 (only after a completion) |
| Day complete | Día completo | Tag geschafft | Journée bouclée | Dia completo | 今日は完了です | C-04 ("Day complete · 12-day streak") |
| Day complete · 12-day streak | Día completo · racha de 12 días | Tag geschafft · 12-Tage-Serie | Journée bouclée · série de 12 jours | Dia completo · sequência de 12 dias | 今日は完了 · 12日連続 | C-04 |
| Small habits, steady rhythm. | Hábitos pequeños, ritmo constante. | Kleine Gewohnheiten, fester Rhythmus. | Petites habitudes, rythme régulier. | Pequenos hábitos, ritmo constante. | 小さな習慣を、いつものリズムで。 | O-01a welcome |
| A freeze covered Tuesday. Your 12-day streak holds. | Una congelación cubrió el martes. Tu racha de 12 días sigue. | Ein Freeze hat Dienstag abgedeckt. Deine 12-Tage-Serie bleibt. | Un gel a couvert mardi. Ta série de 12 jours tient. | Um congelamento cobriu a terça. Sua sequência de 12 dias continua. | フリーズが火曜日をカバーしました。12日連続の記録は続いています。 | C-09 |
| Your streak ended at 12 days. Today starts a new one. | Tu racha terminó en 12 días. Hoy empieza una nueva. | Deine Serie endete bei 12 Tagen. Heute beginnt eine neue. | Ta série s'est arrêtée à 12 jours. Une nouvelle commence aujourd'hui. | Sua sequência terminou em 12 dias. Hoje começa uma nova. | 連続記録は12日で区切りがつきました。今日から新しく始まります。 | C-09 |
| Start today's first habit | Empieza el primer hábito de hoy | Starte die erste Gewohnheit von heute | Commence la première habitude du jour | Comece o primeiro hábito de hoje | 今日の最初の習慣を始める | C-09 action |
| Streaks that forgive | Rachas que perdonan | Serien mit Nachsicht | Des séries indulgentes | Sequências que perdoam | やさしい連続記録 | onboarding (existing) |

Brand phrases keep their meaning but not necessarily their words: "holds" is *sigue* / *bleibt* / *tient* / *continua* / 続いています because each locale's literal "hold" sounds wrong. Day names and numbers are filled in at runtime (`%{day}`, `%{count}`); the table shows sample values.

## 6. German tab bar decision (carry-forward from D-00)

The D-00 frame tried the shortened labels **Routinen** (Habits) and **Optionen** (Settings), because "Gewohnheiten" (~80 pt) and "Einstellungen" (~84 pt) overflow an equal fifth of a 375 pt bar. Since F-03, the tab bar sizes tabs by label width whenever any label is over 10 characters (`App.js`, `TAB_LABEL_EQUAL_MAX`). G-01 checked it on the iPhone SE mockup at 12 pt (`research_notes/uiux/shots/G-01/se-de-*.png`): all five German labels fit, the bold active "Einstellungen" included, with about 8 pt to spare at the right edge.

- **Decision:** keep the full words **Gewohnheiten** and **Einstellungen**. No `app.tabsShort.*` keys are needed.
- **Fallback**, if a future change (a sixth tab, a larger caption, the P-02 font-scale check) makes them overflow: use **"Mehr"** for Settings, Apple's own German label for an overflow tab, and only once Settings has become that kind of hub (ST tickets). Habits keeps *Gewohnheiten*; never abbreviate ("Gewohnh.") and never use *Routinen*.
- The ring caption uses the full word as well ("Gewohnheiten"; C-04 can switch to "erledigt").

## 7. Don't say

| Don't say | Say instead | Why |
|---|---|---|
| lost / broke / failed your streak, "you fell off", "missed out" | "Your streak ended at N days", "Back on beat" | Tone rules 1 and 3 |
| saved you, rescued | holds, keeps | Tone rule 5 |
| only N days | N days | Tone rule 4 |
| completed (for a habit) | done | One term (P-07) |
| check-in (for logging a habit) | check-off, log | "Check-in" is the mood check-in and the Smart Check-in |
| counters and timers | volume, timed and limit habits | Use the type names |
| Challenge (singular as the screen or tab name) | Challenges | Tab matches title (P-02) |
| task | habit | Product term |
| es: usted, fallado, si fallas | tú, sin hacer, si un día no sale | Formality; tone |
| de: Sie/Ihr (formal address), "Tippen Sie" and other formal imperatives, sentence-initial *Sie*, Routinen, Optionen (as tab labels) | du/dein, Tippe, the noun ("Die Gewohnheit …"), Gewohnheiten, Einstellungen | Formality; §6 |
| fr: vous/votre, vous imperatives (Appuyez, Touchez, Modifiez, Modifiez-les), passer/passée (for skipping a habit), pauses (for skips), "à limite" | tu, Appuie, Modifie-les, sauter/sautée, jours sautés, "avec limite" | Formality; skip is not "past"; idiom |
| pt-BR: o senhor, pausa de sequência, dia perdido, perdeu um dia | você, congelamento, dia sem registro / não feito, se um dia não rolar | Formality; a freeze is not a pause; tone |
| ja: ストリーク, お休みの日, パーフェクトな日, ！, 失敗 (for a lapse), カウンターとタイマー, clipped endings (…いつでも。) | 連続記録 / 連続記録フリーズ, 休みの日, パーフェクト日, 。, うまくいかない日, 数量目標・時間目標・上限, です/ます (…できます。) | One term; politeness; tone |

`glossary.test.js` checks the rows that a regex can catch reliably. Each term has its own named rule (for example `de.formalImperative`, `ja.perfectDayLong`), tested with positive and negative examples. The exclamation mark in ja and the en "completed" are left to P-07's sweep and are not tested yet.
