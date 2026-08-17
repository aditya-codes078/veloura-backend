/* Veloura — the 16-flavour counter. Colours drive the 3D model directly. */
export const FLAVOURS = [
  {
    id: 'dubai', name: 'Dubai Chocolate Kunafa', image: 'https://images.pexels.com/photos/13715795/pexels-photo-13715795.jpeg?auto=compress&cs=tinysrgb&w=208&h=208&fit=crop', base: 0x9FBE6A, swirl: 0x5A3517, sheen: 0xE7F0C6,
    accentHex: '#7FA24A', tag: 'trending', badge: '🔥 Most ordered', premium: true,
    inclusionName: 'Kataifi Crunch', swirlName: 'Milk Chocolate',
    note: 'Pistachio cream shot through with toasted kataifi and a milk-chocolate ribbon.',
    line2: 'The one everybody films before they eat it.',
  },
  {
    id: 'pistachio', name: 'Roasted Pistachio (Sicilian)', image: 'https://images.pexels.com/photos/13715795/pexels-photo-13715795.jpeg?auto=compress&cs=tinysrgb&w=208&h=208&fit=crop', base: 0xBBCB86, swirl: 0x6E7F3C, sheen: 0xEAF2CE,
    accentHex: '#7E8F45', tag: 'trending', premium: true,
    inclusionName: 'Bronte Pistachio', swirlName: 'Pistachio Paste',
    note: 'Bronte pistachios roasted dark, ground with the skins still on.',
    line2: 'Savoury, faintly salted, nothing green about it except the taste.',
  },
  {
    id: 'pistiramisu', name: 'Pistachio Tiramisu', image: 'https://images.pexels.com/photos/21922586/pexels-photo-21922586.jpeg?auto=compress&cs=tinysrgb&w=208&h=208&fit=crop', base: 0xD8CFA6, swirl: 0x6B4A2F, sheen: 0xF2E9CA,
    accentHex: '#8C6A44', tag: 'trending', premium: true,
    inclusionName: 'Coffee-soaked Savoiardi', swirlName: 'Espresso Mascarpone',
    note: 'Mascarpone base, espresso-soaked savoiardi and a pistachio ripple.',
    line2: 'The viral mashup that turned out to actually work.',
  },
  {
    id: 'matcha', name: 'Matcha White Chocolate', image: 'https://images.pexels.com/photos/13715795/pexels-photo-13715795.jpeg?auto=compress&cs=tinysrgb&w=208&h=208&fit=crop', base: 0x9CBE92, swirl: 0xF6EFDC, sheen: 0xE3F0DC,
    accentHex: '#6F9A63', tag: 'trending',
    inclusionName: 'White Chocolate Shards', swirlName: 'White Chocolate',
    note: 'Ceremonial-grade Uji matcha cut with melted white chocolate.',
    line2: 'Grassy and bitter first, then unreasonably creamy.',
  },
  {
    id: 'biscoff', name: 'Biscoff Cookie Butter', image: 'https://images.pexels.com/photos/14132776/pexels-photo-14132776.jpeg?auto=compress&cs=tinysrgb&w=208&h=208&fit=crop', base: 0xD9A45E, swirl: 0x8A4E22, sheen: 0xF3D3A4,
    accentHex: '#A8642B', tag: 'trending',
    inclusionName: 'Speculoos Rubble', swirlName: 'Cookie Butter',
    note: 'Caramelised speculoos blended into the base and rippled again on top.',
    line2: 'Cinnamon, burnt sugar, and a texture that borders on illegal.',
  },
  {
    id: 'mangohab', name: 'Mango Habanero', image: 'https://images.pexels.com/photos/16962444/pexels-photo-16962444.jpeg?auto=compress&cs=tinysrgb&w=208&h=208&fit=crop', base: 0xF2A83C, swirl: 0xC53A22, sheen: 0xFBD79A,
    accentHex: '#D9531F', tag: 'trending', heat: '🌶 Sweet-heat',
    inclusionName: 'Chilli Flake', swirlName: 'Habanero Caramel',
    note: 'Ripe mango purée with a habanero caramel that arrives three seconds late.',
    line2: 'Swicy. Sweet on the tongue, warm at the back of the throat.',
  },
  {
    id: 'miso', name: 'Miso Salted Caramel', image: 'https://images.pexels.com/photos/14132776/pexels-photo-14132776.jpeg?auto=compress&cs=tinysrgb&w=208&h=208&fit=crop', base: 0xE0BC84, swirl: 0x9A5A20, sheen: 0xF6DDB4,
    accentHex: '#9A5A20', tag: 'trending',
    inclusionName: 'Caramel Shards', swirlName: 'Miso Caramel',
    note: 'White miso stirred into caramel cooked to 178°C, finished with flaked salt.',
    line2: 'Salty-sweet with a savoury depth that keeps you going back.',
  },
  {
    id: 'ube', name: 'Ube Cheesecake', base: 0x9B7BD1, swirl: 0xF4EDE0, sheen: 0xE0D3F5,
    accentHex: '#7C5CB8', tag: 'trending', premium: true,
    inclusionName: 'Cheesecake Chunks', swirlName: 'Cream Cheese',
    note: 'Purple yam cooked down with coconut milk, folded through cheesecake batter.',
    line2: 'Nutty, vanilla-ish, and the best-looking scoop on the counter.',
  },
  {
    id: 'alphonso', name: 'Alphonso Mango', image: 'https://images.pexels.com/photos/16015237/pexels-photo-16015237.jpeg?auto=compress&cs=tinysrgb&w=208&h=208&fit=crop', base: 0xF6B93B, swirl: 0xE07A18, sheen: 0xFDDFA0,
    accentHex: '#E08A17', tag: 'seasonal',
    inclusionName: 'Mango Chunks', swirlName: 'Mango Purée',
    note: 'Ratnagiri Alphonso, pulped by hand in April and frozen the same week.',
    line2: 'India\'s number one, and it is not close.',
  },
  {
    id: 'kesarpista', name: 'Kesar Pista Kulfi', image: 'https://images.pexels.com/photos/16962444/pexels-photo-16962444.jpeg?auto=compress&cs=tinysrgb&w=208&h=208&fit=crop', base: 0xF0DDA4, swirl: 0x7E8F45, sheen: 0xFBEFCB,
    accentHex: '#C79A28', tag: 'classic',
    inclusionName: 'Pistachio Slivers', swirlName: 'Saffron Rabdi',
    note: 'Milk reduced four hours with Kashmiri saffron and slivered pistachio.',
    line2: 'Dense, unwhipped, and best eaten off a stick on a hot evening.',
  },
  {
    id: 'rose', name: 'Rose Gulkand', image: 'https://images.pexels.com/photos/13010794/pexels-photo-13010794.jpeg?auto=compress&cs=tinysrgb&w=208&h=208&fit=crop', base: 0xF0C3CB, swirl: 0x9C2F4A, sheen: 0xFBDCE1,
    accentHex: '#B3436A', tag: 'trending',
    inclusionName: 'Gulkand Petals', swirlName: 'Rose Preserve',
    note: 'Damask rose petals preserved in sugar, folded through cold cream.',
    line2: 'Floral without turning into perfume — the gulkand keeps it honest.',
  },
  {
    id: 'rabdi', name: 'Rabdi Malai Kesar', image: 'https://images.pexels.com/photos/4725715/pexels-photo-4725715.jpeg?auto=compress&cs=tinysrgb&w=208&h=208&fit=crop', base: 0xF7E7C0, swirl: 0xD9A23C, sheen: 0xFCF0D6,
    accentHex: '#C08A24', tag: 'classic',
    inclusionName: 'Malai Flakes', swirlName: 'Saffron Rabdi',
    note: 'Slow-reduced rabdi with clotted malai flakes and threads of kesar.',
    line2: 'Tastes like a wedding you were happy to be invited to.',
  },
  {
    id: 'kalakhatta', name: 'Kala Khatta', base: 0x8E4A9B, swirl: 0x3A1742, sheen: 0xD9B6E4,
    accentHex: '#5C2F63', tag: 'trending', heat: '⚡ Tangy · chatpata',
    inclusionName: 'Black Salt Crystals', swirlName: 'Jamun Syrup',
    note: 'Jamun syrup, black salt and a squeeze of lime, straight off the gola cart.',
    line2: 'Sweet, sour, salty, and it will stain your tongue. Worth it.',
  },
  {
    id: 'coconut', name: 'Tender Coconut', image: 'https://images.pexels.com/photos/4725715/pexels-photo-4725715.jpeg?auto=compress&cs=tinysrgb&w=208&h=208&fit=crop', base: 0xF4F1E4, swirl: 0xE3E0CB, sheen: 0xFFFFFF,
    accentHex: '#8FA37E', tag: 'vegan',
    inclusionName: 'Coconut Malai', swirlName: 'Coconut Cream',
    note: 'Nothing but tender coconut water, its own soft malai and cane sugar.',
    line2: 'Vegan, dairy-free, and somehow the creamiest thing we make.',
  },
  {
    id: 'vanilla', name: 'Madagascar Vanilla Bean', image: 'https://images.pexels.com/photos/4725715/pexels-photo-4725715.jpeg?auto=compress&cs=tinysrgb&w=208&h=208&fit=crop', base: 0xFFF6E0, swirl: 0x2A1E17, sheen: 0xFFE9C4,
    accentHex: '#B47F22', tag: 'classic',
    inclusionName: 'Vanilla Bean Specks', swirlName: 'Vanilla Cream',
    note: 'Bourbon pods from Sava, steeped 72 hours, roughly 1,100 seeds a litre.',
    line2: 'The original hero flavour. Still the one we are judged on.',
  },
  {
    id: 'brownie', name: 'Choco Brownie Fudge', image: 'https://images.pexels.com/photos/22484697/pexels-photo-22484697.jpeg?auto=compress&cs=tinysrgb&w=208&h=208&fit=crop', base: 0x5B3520, swirl: 0x2E1A0F, sheen: 0xB98A5F,
    accentHex: '#5B3520', tag: 'classic',
    inclusionName: 'Brownie Chunks', swirlName: 'Fudge Ripple',
    note: '58% Idukki dark chocolate with warm brownie chunks and a fudge ripple.',
    line2: 'For the table that says "we\'ll share one" and then does not.',
  },
];

export const FLAVOUR_BY_ID = Object.fromEntries(FLAVOURS.map((f) => [f.id, f]));

export const TAG_LABEL = {
  trending: 'Trending',
  classic: 'Classic',
  seasonal: 'Seasonal',
  vegan: 'Vegan',
};
