// Reward catalogue shared by the Worker (authoritative unlocks / equip checks)
// and the browser (presentation). A reward unlocks when the pair's shared
// meeting count reaches `at`. Wearable rewards have a `slot`; only one item
// per slot can be worn, items in different slots combine freely.

export const SLOTS = {
  head: 'Na głowę',
  neck: 'Na szyję',
  back: 'Na plecy',
  held: 'W łapkach',
  effect: 'Efekt',
  theme: 'Motyw',
};

export const CATEGORIES = {
  korony: 'Korony',
  akcesoria: 'Akcesoria',
  odznaki: 'Odznaki',
  efekty: 'Efekty',
  niespodzianki: 'Niespodzianki',
};

export const TIERS = [
  { min: 0, name: 'Brązowy' },
  { min: 20, name: 'Srebrny' },
  { min: 50, name: 'Złoty' },
  { min: 100, name: 'Diamentowy' },
];
export const tierOf = at => TIERS.filter(t => at >= t.min).at(-1).name;

export const REWARDS = [
  { id: 'first', at: 1, cat: 'odznaki', name: 'Pierwsze spotkanie', desc: 'Odznaka za wasze pierwsze wspólnie zaliczone spotkanie.' },
  { id: 'bow', at: 3, cat: 'akcesoria', slot: 'neck', name: 'Różowa kokardka', desc: 'Puszystek zawiązuje ją pod szyją na specjalne okazje.' },
  { id: 'hearts', at: 5, cat: 'efekty', slot: 'effect', name: 'Serduszka', desc: 'Wokół Puszystka unoszą się małe pikselowe serduszka.' },
  { id: 'week', at: 7, cat: 'odznaki', name: 'Siedem uśmiechów', desc: 'Siedem spotkań — prawdziwy tydzień radości.' },
  { id: 'plush', at: 10, cat: 'akcesoria', slot: 'held', name: 'Pluszowe serduszko', desc: 'Puszystek przytula je, gdy jest szczęśliwy.' },
  { id: 'beanie', at: 12, cat: 'akcesoria', slot: 'head', name: 'Czapeczka z pomponem', desc: 'Ciepła czapeczka na chłodniejsze randki.' },
  { id: 'butterflies', at: 15, cat: 'efekty', slot: 'effect', name: 'Motylki', desc: 'Pastelowe motylki tańczą nad łąką.' },
  { id: 'crown', at: 20, cat: 'korony', slot: 'head', name: 'Korona dla Puszystka', desc: 'Złota korona dla najpuszystszego króla łąki.' },
  { id: 'scarf', at: 25, cat: 'akcesoria', slot: 'neck', name: 'Szalik w paski', desc: 'Miękki szalik w różowo-lawendowe paski.' },
  { id: 'badge', at: 30, cat: 'odznaki', name: 'Nowa odznaka', desc: 'Serduszkowa odznaka za 30 wspólnych spotkań.' },
  { id: 'stars', at: 35, cat: 'efekty', slot: 'effect', name: 'Gwiazdki', desc: 'Migoczące gwiazdki wokół Puszystka.' },
  { id: 'sunset', at: 40, cat: 'efekty', slot: 'theme', name: 'Motyw tła „Różowy zachód”', desc: 'Łąka skąpana w różowym świetle zachodu.' },
  { id: 'wings', at: 45, cat: 'akcesoria', slot: 'back', name: 'Skrzydełka aniołka', desc: 'Małe białe skrzydełka, które delikatnie trzepoczą.' },
  { id: 'gift', at: 50, cat: 'niespodzianki', name: 'Niespodzianka', desc: 'Prezent na 50 spotkań. Co jest w środku?', reveals: 'confetti' },
  { id: 'confetti', at: 50, cat: 'efekty', slot: 'effect', name: 'Konfetti z serc', desc: 'Deszcz serduszkowego konfetti — zawartość niespodzianki.', hidden: 'gift' },
  { id: 'flowers', at: 60, cat: 'korony', slot: 'head', name: 'Wianek z kwiatów', desc: 'Wianek z łąkowych kwiatków.' },
  { id: 'seventy5', at: 75, cat: 'odznaki', name: '75 spotkań', desc: 'Trzy ćwierćwiecza wspólnych chwil.' },
  { id: 'medal', at: 80, cat: 'akcesoria', slot: 'neck', name: 'Złoty medal', desc: 'Medal za wytrwałość w byciu razem.' },
  { id: 'diamond', at: 100, cat: 'korony', slot: 'head', name: 'Diamentowa korona', desc: 'Korona na setne spotkanie. Lśni jak wasze wspomnienia.' },
  { id: 'hundred', at: 100, cat: 'odznaki', name: 'Setka', desc: 'Sto spotkań. Legenda.' },
  { id: 'rainbow', at: 125, cat: 'akcesoria', slot: 'back', name: 'Tęczowe skrzydła', desc: 'Skrzydła mieniące się kolorami tęczy.' },
  { id: 'bigGift', at: 150, cat: 'niespodzianki', name: 'Wielka niespodzianka', desc: 'Prezent na 150 spotkań.', reveals: 'fireworks' },
  { id: 'fireworks', at: 150, cat: 'efekty', slot: 'effect', name: 'Fajerwerki', desc: 'Pikselowe fajerwerki nad łąką.', hidden: 'bigGift' },
  { id: 'legend', at: 200, cat: 'odznaki', name: 'Legenda Razem', desc: 'Dwieście spotkań. Nic więcej nie trzeba mówić.' },
];

export const BY_ID = Object.fromEntries(REWARDS.map(r => [r.id, r]));
// big milestones get a special Puszystek celebration
export const MILESTONES = [10, 25, 50, 100, 150, 200];

export const unlockedIds = n => REWARDS.filter(r => n >= r.at).map(r => r.id);

// Validate a requested outfit against the pair's progress: unknown, locked,
// non-wearable and still-wrapped surprise ids are dropped; last item wins per slot.
export function sanitizeOutfit(ids, n, opened = []) {
  const bySlot = {};
  for (const id of Array.isArray(ids) ? ids : []) {
    const r = BY_ID[id];
    if (!r || !r.slot || n < r.at || (r.hidden && !opened.includes(r.hidden))) continue;
    bySlot[r.slot] = id;
  }
  return Object.values(bySlot);
}
