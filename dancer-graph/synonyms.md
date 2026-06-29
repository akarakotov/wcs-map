# Справочник имён фигур WCS — синонимы и «ложные друзья»

В WCS **нет единого силлабуса** (Maria Ford: «no international syllabus»), поэтому одну фигуру
зовут по-разному в round-dance / социальном WCS / у чемпионов, а похожие имена иногда значат
разное. Этот файл — свод, чтобы имена не плодили путаницу. Дополняет строки «Синонимы: …» в
описаниях узлов (`graph.txt`).

**Статусы:**
- ✅ **подтверждён источником** — первоисточник прямо приравнивает.
- 👤 **подтверждён практиком** (экспертиза владельца школы).
- ❓ **вероятно** — нужно сверить (dancelib / практика).

## Синонимы (одно и то же под разными именами)

| Узел в графе | Другие имена | Статус | Где сказано |
|---|---|---|---|
| Sugar Push (`phr-sugar-push`) | Push Break | ✅ | Country Dance Pros: «Push Break = Sugar Push» (рисёрч `findings.md`) |
| Underarm Turn (`phr-uat`) | Right Side Pass (RSP) | ✅ | `findings.md`: «UAT = Right Side Pass in older GSDTA terms» |
| Sugar Tuck (`phr-sugar-tuck`) | Lazy Man Tuck | ✅ | JT Swing (`tv.jtswing.com`): «Lazy Man Tuck = Sugar Tuck» |
| Starter Step (`phr-starter`) | Throwout · Triple Rhythm Break | ✅ | `findings.md` (Skippy Blair); JT: «Rotating Starter Step and Throw Out» |
| roll-in / roll-out (`phr-roll`) | Sweetheart · Cuddle · Wrap · Inside Roll | 👤 (+✅) | JT: «Roll In Roll Out **Cuddle**» рядом со Sweetheart; практик: «одно и то же» |
| Behind-the-back Whip (`phr-whip-behind`) | Texas Tommy | ✅ | round-dance глоссарий: «sometimes cued as a Texas Tommy» |
| Passing Tuck (`phr-passing-tuck`) | Traveling Tuck | ❓ | McKeever (Passing) vs WCS Online (Traveling) — вероятно одно |

## Вариации = отдельные узлы (новая фраза на базе, НЕ синоним базы)

Связь «вариация → нужна база» в графе — ребром `needs`.

| База | Вариации (отдельные узлы) |
|---|---|
| Starter Step | Rotating Starter |
| Left Side Pass | Inside Turn (Spinning LSP) |
| Underarm Turn | Side Pass с hand-change |
| First Whip | Inside · Outside · Open · Behind-the-back (Texas Tommy) · Stalker Whip · Basket Whip · Reverse Whip |
| Basket Whip | Boomerang Basket |
| turning technique | Free Spin · Turning Basic · Double Spins |
| roll-in / roll-out | YoYo · Sugar Roll |
| Sugar Tuck | Passing Tuck · Tuck Throwout · Closed Tuck · Sugar Tuck Double |

## «Ложные друзья» — похоже звучит, но это РАЗНОЕ

- **Free Spin ≠ Inside Turn / Spinning LSP.** Во Free Spin **разрыв связи** (рука отпускается); в Inside Turn связь сохраняется. 👤
- **Whip ≠ Slingshot.** Обе про «уехал-вернулся», но это разные фигуры. 👤
- **Три разных «roll»:** 👤
  1. *действие* вращения внутри фигур (triple-travel-with-**roll**, tuck-and-**roll**);
  2. *фигура* **roll-in / roll-out** (= sweetheart / cuddle / wrap);
  3. **roll в YoYo** — вариация roll-in/roll-out.
- **Shadow ≠ Sweetheart / Wrap.** Shadow — отдельная позиция. 👤
- **Tandem** — в нашей практике не используется (встречается в round-dance). 👤

## Источники
- ✅ — цитаты из: `research/DeepRootCurriculum.txt` (McKeever), `research/wcs-curriculum-2026/`
  (репорт/findings + deep-read школ: JT Swing, OLL, Country Dance Pros, WCS Online),
  `https://www.rounddancing.net/dance/figures/westcoast.html` (round-dance глоссарий).
- ❓ — моя группировка по описаниям; добить через `https://app.dancelib.com` (нужен Chrome) или практику.

> При расхождении имён в графе и здесь — правда за практикой школы; этот файл фиксирует, какие
> внешние имена соответствуют нашим узлам.
