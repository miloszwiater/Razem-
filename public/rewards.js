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
};
// slots that are "set" (Ustaw) rather than worn (Załóż)
export const SET_SLOTS = ['effect', 'decor', 'theme', 'pin'];

export const CATEGORIES = {
  nakrycia: 'Korony i nakrycia głowy',
  ozdoby: 'Kokardki i ozdoby',
  ubranka: 'Ubranka i szaliki',
  akcesoria: 'Skrzydełka i akcesoria',
  efekty: 'Efekty specjalne',
  odznaki: 'Odznaki i trofea',
  dekoracje: 'Dekoracje otoczenia',
};

export const TIERS = [
  { min: 0, name: 'Brązowy' },
  { min: 20, name: 'Srebrny' },
  { min: 50, name: 'Złoty' },
  { min: 100, name: 'Diamentowy' },
];
export const tierOf = at => TIERS.filter(t => at >= t.min).at(-1).name;

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
  { id: 'sunset', at: 40, cat: 'dekoracje', slot: 'theme', name: 'Motyw tła „Różowy zachód”', desc: 'Łąka skąpana w różowym świetle zachodu.' },
  { id: 'scarfMint', at: 42, cat: 'ubranka', slot: 'neck', name: 'Miętowy szalik', desc: 'Szalik w miętowo-błękitne paski na wiosenne dni.' },
  { id: 'wings', at: 45, cat: 'akcesoria', slot: 'back', name: 'Skrzydełka aniołka', desc: 'Małe białe skrzydełka, które delikatnie trzepoczą.' },
  { id: 'gift', at: 50, cat: 'efekty', name: 'Niespodzianka', desc: 'Prezent na 50 spotkań. Co jest w środku?', reveals: 'confetti', special: true },
  { id: 'confetti', at: 50, cat: 'efekty', slot: 'effect', name: 'Konfetti z serc', desc: 'Deszcz serduszkowego konfetti — zawartość niespodzianki.', hidden: 'gift' },
  { id: 'earFlower', at: 55, cat: 'ozdoby', slot: 'ear', name: 'Kwiatek za uszkiem', desc: 'Różowy kwiatek wpięty za uszko.' },
  { id: 'flowers', at: 60, cat: 'nakrycia', slot: 'head', name: 'Wianek z kwiatów', desc: 'Wianek z łąkowych kwiatków.' },
  { id: 'lanterns', at: 65, cat: 'dekoracje', slot: 'decor', name: 'Girlanda lampionów', desc: 'Ciepłe światełka rozwieszone nad łąką.' },
  { id: 'seventy5', at: 75, cat: 'odznaki', slot: 'pin', name: '75 spotkań', desc: 'Trzy ćwierćwiecza wspólnych chwil.' },
  { id: 'medal', at: 80, cat: 'odznaki', slot: 'neck', name: 'Złoty medal', desc: 'Trofeum do noszenia — medal za wytrwałość w byciu razem.', special: true },
  { id: 'lavender', at: 90, cat: 'dekoracje', slot: 'theme', name: 'Motyw „Lawendowy poranek”', desc: 'Łąka w chłodnym, lawendowym świetle poranka.' },
  { id: 'diamond', at: 100, cat: 'nakrycia', slot: 'head', name: 'Diamentowa korona', desc: 'Korona na setne spotkanie. Lśni jak wasze wspomnienia.', special: true },
  { id: 'hundred', at: 100, cat: 'odznaki', slot: 'pin', name: 'Setka', desc: 'Sto spotkań. Legenda.', special: true },
  { id: 'rainbow', at: 125, cat: 'akcesoria', slot: 'back', name: 'Tęczowe skrzydła', desc: 'Skrzydła mieniące się kolorami tęczy.', special: true },
  { id: 'bigGift', at: 150, cat: 'efekty', name: 'Wielka niespodzianka', desc: 'Prezent na 150 spotkań.', reveals: 'fireworks', special: true },
  { id: 'fireworks', at: 150, cat: 'efekty', slot: 'effect', name: 'Fajerwerki', desc: 'Pikselowe fajerwerki nad łąką.', hidden: 'bigGift' },
  { id: 'legend', at: 200, cat: 'odznaki', slot: 'pin', name: 'Legenda Razem', desc: 'Dwieście spotkań. Nic więcej nie trzeba mówić.', special: true },
];

export const BY_ID = Object.fromEntries(REWARDS.map(r => [r.id, r]));
// big milestones get a special Puszystek celebration
export const MILESTONES = [10, 25, 50, 100, 150, 200];
export const isSpecial = r => !!r && (r.special || MILESTONES.includes(r.at));

export const unlockedIds = n => REWARDS.filter(r => n >= r.at).map(r => r.id);
// surprise contents become visible (and claimable) once their gift is opened
export const isVisible = (r, opened = []) => !r.hidden || opened.includes(r.hidden);
export const claimable = (r, n, opened = []) => !!r && n >= r.at && isVisible(r, opened);

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
