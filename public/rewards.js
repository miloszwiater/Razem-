// Reward catalogue shared by the Worker (authoritative unlocks / equip checks)
// and the browser (presentation). A reward unlocks when the pair's shared
// meeting count reaches `at`; the pair then claims it into their one shared
// inventory. Rewards with a `slot` can be worn or set: one item per slot,
// items in different slots combine freely.

export const SLOTS = {
  head: 'Na głowę',
  ear: 'Na uszko',
  neck: 'Na szyję',
  back: 'Na plecy',
  held: 'W łapkach',
  effect: 'Efekt',
  decor: 'Dekoracja',
  theme: 'Motyw',
  pin: 'Odznaka pary',
  // Puszystek's house: one item per place in the room
  hBed: 'Łóżeczko', hRug: 'Dywan', hWall: 'Na ścianie', hWindow: 'Okno', hShelf: 'Półka', hPlant: 'Roślina',
  hLamp: 'Lampka', hToy: 'Kącik zabaw', hCushion: 'Poduszka', hLights: 'Pod sufitem', hPaper: 'Tapeta',
  hStand: 'Stolik', hArt: 'Obraz', hSeat: 'Siedzisko', hFloor: 'Podłoga',
};
// slots that are "set" (Ustaw) rather than worn (Załóż)
export const SET_SLOTS = ['effect', 'decor', 'theme', 'pin', 'hBed', 'hRug', 'hWall', 'hWindow', 'hShelf', 'hPlant', 'hLamp', 'hToy', 'hCushion', 'hLights', 'hPaper', 'hStand', 'hArt', 'hSeat', 'hFloor'];
export const isHouse = r => r?.cat === 'domek';
// the house inventory's own categories
export const HOUSE_CATS = { meble: 'Meble', sciany: 'Ściany i podłogi', dekoracje: 'Dekoracje', rosliny: 'Rośliny', swiatlo: 'Oświetlenie', specjalne: 'Specjalne' };
export const houseCat = r => r.hcat;

export const CATEGORIES = {
  nakrycia: 'Korony i nakrycia głowy',
  ozdoby: 'Kokardki i ozdoby',
  ubranka: 'Ubranka i szaliki',
  akcesoria: 'Skrzydełka i akcesoria',
  efekty: 'Efekty specjalne',
  odznaki: 'Odznaki i trofea',
  dekoracje: 'Dekoracje otoczenia',
  domek: 'Domek Puszystka',
};

export const TIERS = [
  { min: 0, name: 'Brązowy' },
  { min: 20, name: 'Srebrny' },
  { min: 50, name: 'Złoty' },
  { min: 100, name: 'Diamentowy' },
];
export const tierOf = at => TIERS.filter(t => at >= t.min).at(-1).name;
// Rarity: how a reward is presented (frame, metal, glow). Presentation only;
// unlocking still depends on `at` alone.
export const RARITY = {
  zwykla: 'Zwykła',
  brazowa: 'Brązowa',
  srebrna: 'Srebrna',
  zlota: 'Złota',
  wyjatkowa: 'Wyjątkowa',
};
export const rarityOf = r => r.special ? 'wyjatkowa' : r.at >= 50 ? 'zlota' : r.at >= 20 ? 'srebrna' : r.at >= 8 ? 'brazowa' : 'zwykla';

export const REWARDS = [
  { id: 'first', at: 1, cat: 'odznaki', slot: 'pin', name: 'Pierwsze spotkanie', desc: 'Odznaka za wasze pierwsze wspólnie zaliczone spotkanie.' },
  { id: 'bow', at: 3, cat: 'ozdoby', slot: 'neck', name: 'Różowa kokardka', desc: 'Puszystek zawiązuje ją pod szyją na specjalne okazje.' },
  { id: 'hearts', at: 5, cat: 'efekty', slot: 'effect', name: 'Serduszka', desc: 'Wokół Puszystka unoszą się małe pikselowe serduszka.' },
  { id: 'tiara', at: 6, cat: 'nakrycia', slot: 'head', name: 'Różowa tiara', desc: 'Lekka tiara z serduszkiem — pierwsza korona na start.' },
  { id: 'week', at: 7, cat: 'odznaki', slot: 'pin', name: 'Siedem uśmiechów', desc: 'Siedem spotkań — prawdziwy tydzień radości.' },
  { id: 'earBow', at: 9, cat: 'ozdoby', slot: 'ear', name: 'Kokardka na uszko', desc: 'Malutka kokardka, która podskakuje razem z uszkiem.' },
  { id: 'plush', at: 10, cat: 'akcesoria', slot: 'held', name: 'Pluszowe serduszko', desc: 'Puszystek przytula je, gdy jest szczęśliwy.' },
  { id: 'beanie', at: 12, cat: 'nakrycia', slot: 'head', name: 'Czapeczka z pomponem', desc: 'Ciepła czapeczka na chłodniejsze randki.' },
  { id: 'collar', at: 14, cat: 'ubranka', slot: 'neck', name: 'Obróżka z dzwoneczkiem', desc: 'Dzwoneczek dzwoni cichutko przy każdym podskoku.' },
  { id: 'butterflies', at: 15, cat: 'efekty', slot: 'effect', name: 'Motylki', desc: 'Pastelowe motylki tańczą nad łąką.' },
  { id: 'bowLav', at: 17, cat: 'ozdoby', slot: 'neck', name: 'Lawendowa kokardka', desc: 'Kokardka w kolorze wieczornego nieba.' },
  { id: 'balloons', at: 18, cat: 'dekoracje', slot: 'decor', name: 'Baloniki', desc: 'Trzy baloniki przywiązane obok Puszystka.' },
  { id: 'crown', at: 20, cat: 'nakrycia', slot: 'head', name: 'Korona dla Puszystka', desc: 'Złota korona dla najpuszystszego króla łąki.' },
  { id: 'scarf', at: 25, cat: 'ubranka', slot: 'neck', name: 'Szalik w paski', desc: 'Miękki szalik w różowo-lawendowe paski.' },
  { id: 'lollipop', at: 28, cat: 'akcesoria', slot: 'held', name: 'Lizak w serduszka', desc: 'Słodki lizak na wspólne spacery.' },
  { id: 'badge', at: 30, cat: 'odznaki', slot: 'pin', name: 'Nowa odznaka', desc: 'Serduszkowa odznaka za 30 wspólnych spotkań.' },
  { id: 'garden', at: 33, cat: 'dekoracje', slot: 'decor', name: 'Kwiatowy ogródek', desc: 'Grządka kwiatków wokół łapek Puszystka.' },
  { id: 'stars', at: 35, cat: 'efekty', slot: 'effect', name: 'Gwiazdki', desc: 'Migoczące gwiazdki wokół Puszystka.' },
  { id: 'sunset', at: 40, cat: 'dekoracje', slot: 'theme', name: 'Różowy zachód', desc: 'Motyw tła: łąka skąpana w różowym świetle zachodu.' },
  { id: 'scarfMint', at: 42, cat: 'ubranka', slot: 'neck', name: 'Miętowy szalik', desc: 'Szalik w miętowo-błękitne paski na wiosenne dni.' },
  { id: 'wings', at: 45, cat: 'akcesoria', slot: 'back', name: 'Skrzydełka aniołka', desc: 'Małe białe skrzydełka, które delikatnie trzepoczą.' },
  { id: 'gift', at: 50, cat: 'efekty', name: 'Niespodzianka', desc: 'Prezent na 50 spotkań. Co jest w środku?', reveals: 'confetti', special: true },
  { id: 'confetti', at: 50, cat: 'efekty', slot: 'effect', name: 'Konfetti z serc', desc: 'Deszcz serduszkowego konfetti — zawartość niespodzianki.', hidden: 'gift' },
  { id: 'earFlower', at: 55, cat: 'ozdoby', slot: 'ear', name: 'Kwiatek za uszkiem', desc: 'Różowy kwiatek wpięty za uszko.' },
  { id: 'flowers', at: 60, cat: 'nakrycia', slot: 'head', name: 'Wianek z kwiatów', desc: 'Wianek z łąkowych kwiatków.' },
  { id: 'lanterns', at: 65, cat: 'dekoracje', slot: 'decor', name: 'Girlanda lampionów', desc: 'Ciepłe światełka rozwieszone nad łąką.' },
  { id: 'seventy5', at: 75, cat: 'odznaki', slot: 'pin', name: '75 spotkań', desc: 'Trzy ćwierćwiecza wspólnych chwil.' },
  { id: 'medal', at: 80, cat: 'odznaki', slot: 'neck', name: 'Złoty medal', desc: 'Trofeum do noszenia — medal za wytrwałość w byciu razem.', special: true },
  { id: 'lavender', at: 90, cat: 'dekoracje', slot: 'theme', name: 'Lawendowy poranek', desc: 'Motyw tła: łąka w chłodnym, lawendowym świetle poranka.' },
  { id: 'diamond', at: 100, cat: 'nakrycia', slot: 'head', name: 'Diamentowa korona', desc: 'Korona na setne spotkanie. Lśni jak wasze wspomnienia.', special: true },
  { id: 'hundred', at: 100, cat: 'odznaki', slot: 'pin', name: 'Setka', desc: 'Sto spotkań. Legenda.', special: true },
  { id: 'rainbow', at: 125, cat: 'akcesoria', slot: 'back', name: 'Tęczowe skrzydła', desc: 'Skrzydła mieniące się kolorami tęczy.', special: true },
  { id: 'bigGift', at: 150, cat: 'efekty', name: 'Wielka niespodzianka', desc: 'Prezent na 150 spotkań.', reveals: 'fireworks', special: true },
  { id: 'fireworks', at: 150, cat: 'efekty', slot: 'effect', name: 'Fajerwerki', desc: 'Pikselowe fajerwerki nad łąką.', hidden: 'bigGift' },
  { id: 'legend', at: 200, cat: 'odznaki', slot: 'pin', name: 'Legenda Razem', desc: 'Dwieście spotkań. Nic więcej nie trzeba mówić.', special: true },
  // Domek Puszystka: furniture and decorations for the shared room
  { id: 'garland', at: 1, cat: 'domek', hcat: 'dekoracje', slot: 'hWall', name: 'Girlanda serduszek', desc: 'Pierwsza dekoracja domku: kolorowe serduszka nad łóżeczkiem.' },
  { id: 'cushion', at: 3, cat: 'domek', hcat: 'meble', slot: 'hCushion', name: 'Poduszka-serduszko', desc: 'Miękka poduszka do siedzenia przy dywaniku.' },
  { id: 'plant', at: 5, cat: 'domek', hcat: 'rosliny', slot: 'hPlant', name: 'Roślinka w doniczce', desc: 'Mały zielony przyjaciel w różowej doniczce.' },
  { id: 'lamp', at: 8, cat: 'domek', hcat: 'swiatlo', slot: 'hLamp', name: 'Lampka-grzybek', desc: 'Ciepłe światło na wspólne wieczory.' },
  { id: 'rugHeart', at: 10, cat: 'domek', hcat: 'sciany', slot: 'hRug', name: 'Dywan w serduszko', desc: 'Nowy dywan w kształcie serca.' },
  { id: 'bedRoyal', at: 15, cat: 'domek', hcat: 'meble', slot: 'hBed', name: 'Łóżeczko z zagłówkiem', desc: 'Ulepszone łóżeczko z kołderką w serduszka.' },
  { id: 'curtains', at: 20, cat: 'domek', hcat: 'dekoracje', slot: 'hWindow', name: 'Zasłonki w kwiatki', desc: 'Zasłonki do okna z widokiem na ogród.' },
  { id: 'toys', at: 25, cat: 'domek', hcat: 'dekoracje', slot: 'hToy', name: 'Kącik zabawek', desc: 'Kłębek włóczki i klocki do zabawy.' },
  { id: 'shelf', at: 30, cat: 'domek', hcat: 'meble', slot: 'hShelf', name: 'Półka na pamiątki', desc: 'Specjalny mebel: ramka, puchar i słoik serduszek.', special: true },
  { id: 'monstera', at: 40, cat: 'domek', hcat: 'rosliny', slot: 'hPlant', name: 'Monstera', desc: 'Duża roślina dla zgranej pary.' },
  { id: 'starlights', at: 50, cat: 'domek', hcat: 'swiatlo', slot: 'hLights', name: 'Gwiezdne światełka', desc: 'Wyjątkowa dekoracja: gwiazdki migoczące pod sufitem.', special: true },
  { id: 'rugCloud', at: 75, cat: 'domek', hcat: 'sciany', slot: 'hRug', name: 'Dywan-chmurka', desc: 'Puszysty dywan miękki jak obłok.' },
  { id: 'wallLavender', at: 100, cat: 'domek', hcat: 'sciany', slot: 'hPaper', name: 'Lawendowa sypialnia', desc: 'Unikalny wystrój: lawendowe ściany w gwiazdki i nocny widok z okna.', special: true },
  { id: 'nightstand', at: 12, cat: 'domek', hcat: 'meble', slot: 'hStand', name: 'Stolik nocny', desc: 'Drewniany stolik z szufladkami. Lampka chętnie na nim stanie.' },
  { id: 'painting', at: 22, cat: 'domek', hcat: 'dekoracje', slot: 'hArt', name: 'Obrazek z łąki', desc: 'Dwa serduszka na łące — wasz pierwszy wspólny obraz.' },
  { id: 'floorHerring', at: 35, cat: 'domek', hcat: 'sciany', slot: 'hFloor', name: 'Parkiet w jodełkę', desc: 'Miodowa podłoga układana w jodełkę.' },
  { id: 'wallMint', at: 45, cat: 'domek', hcat: 'sciany', slot: 'hPaper', name: 'Miętowa tapeta', desc: 'Świeże, miętowe ściany w listki i różowa boazeria.' },
  { id: 'beanbag', at: 55, cat: 'domek', hcat: 'meble', slot: 'hSeat', name: 'Lawendowa pufa', desc: 'Miękka pufa do wspólnego leniuchowania.' },
];

export const BY_ID = Object.fromEntries(REWARDS.map(r => [r.id, r]));

// Achievements are moments of shared progress ("10 wspólnych spotkań"); each
// one grants one or more rewards (for Puszystek and/or the house). A reward
// belongs to the achievement of its source and threshold.
const ACH_NAMES = { 1: 'Pierwsze spotkanie', 3: 'Trzecia randka', 5: 'Piątka razem', 7: 'Pierwszy tydzień', 10: 'Dziesięć spotkań', 20: 'Dwadzieścia spotkań', 25: 'Ćwierć setki', 30: 'Trzydzieści spotkań', 50: 'Pięćdziesiątka', 75: 'Siedemdziesiąt pięć', 100: 'Setka razem', 150: 'Sto pięćdziesiąt', 200: 'Legenda Razem' };
export const achievementOf = r => `${r.source || 'meetings'}-${r.at}`;
export const ACHIEVEMENTS = [...new Map(REWARDS.filter(r => !r.hidden).map(r => [achievementOf(r), r])).values()]
  .map(r => ({ id: achievementOf(r), source: r.source || 'meetings', at: r.at, name: ACH_NAMES[r.at] || `${r.at} wspólnych spotkań`, rewards: REWARDS.filter(x => !x.hidden && achievementOf(x) === achievementOf(r)).map(x => x.id) }))
  .sort((a, b) => a.at - b.at);
// big milestones get a special Puszystek celebration
export const MILESTONES = [10, 25, 50, 100, 150, 200];
export const isSpecial = r => !!r && (r.special || MILESTONES.includes(r.at));

// Where a reward is earned. Today only shared meetings count; future sources
// (streaks of days, anniversaries, couple quizzes, challenges, events) plug in
// here with their own progress value, e.g. { id, source: 'quiz', at: 3 }.
export const SOURCES = { meetings: (r, p) => (p.meetings ?? 0) >= r.at };
export const earned = (r, progress) => (SOURCES[r.source || 'meetings'] || (() => false))(r, typeof progress === 'number' ? { meetings: progress } : progress);
export const unlockedIds = n => REWARDS.filter(r => earned(r, n)).map(r => r.id);
// surprise contents become visible (and claimable) once their gift is opened
export const isVisible = (r, opened = []) => !r.hidden || opened.includes(r.hidden);
export const claimable = (r, n, opened = []) => !!r && earned(r, n) && isVisible(r, opened);

// Validate a requested outfit against the pair's progress: unknown, locked,
// non-wearable, still-wrapped and (when `claimed` is given) unclaimed ids are
// dropped; last item wins per slot.
export function sanitizeOutfit(ids, n, opened = [], claimed = null) {
  const bySlot = {};
  for (const id of Array.isArray(ids) ? ids : []) {
    const r = BY_ID[id];
    if (!r || !r.slot || !claimable(r, n, opened) || (claimed && !claimed.includes(id))) continue;
    bySlot[r.slot] = id;
  }
  return Object.values(bySlot);
}
