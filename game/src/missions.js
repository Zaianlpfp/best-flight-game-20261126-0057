// The three sorties on the title screen. A mission is data, not code: the world
// builder reads it to lay out terrain, rings, villages and the runway, and the
// flight model reads it for fuel, wind and the win condition. Each one asks for
// a different kind of flying: rings reward line and throttle, the island hop
// rewards patience and a clean landing, the mail run rewards flying low and slow
// through a pass that punishes climbing over the ridge.
export const MISSIONS = [
  {
    id: 'rings',
    name: 'RING RUN',
    place: 'Coral Valley',
    tagline: 'Eight rings down the valley. Fast is fun; fuel is final.',
    brief: [
      'Fly the valley and thread all 8 rings.',
      'A ring gives +150 score and a splash of fuel.',
      'Finish past the last ring with fuel to spare.',
    ],
    profile: 'valley',
    length: 420,
    rings: 8,
    fuel: 100,
    burn: 0.62,
    maxSpeed: 210,
    cruiseSpeed: 150,
    wind: 4,
    landing: false,
    villages: 0,
    palette: 'day',
  },
  {
    id: 'island',
    name: 'ISLAND HOP',
    place: 'Merapi Runway',
    tagline: 'Cross the strait, then put her down on the strip.',
    brief: [
      'Cross open water to the far island.',
      'Line up on the runway, slow and level.',
      'Touch down under 95 knots, wings level.',
    ],
    profile: 'coast',
    length: 560,
    rings: 3,
    fuel: 100,
    burn: 0.5,
    maxSpeed: 210,
    cruiseSpeed: 155,
    wind: 9,
    landing: true,
    villages: 0,
    palette: 'gold',
  },
  {
    id: 'mail',
    name: 'STORM MAIL',
    place: 'Three Villages Pass',
    tagline: 'Low mail through the mountains. The ridge is not a shortcut.',
    brief: [
      'Drop mail over all 3 villages in the pass.',
      'Fly low: a drop only counts under 220 feet.',
      'Land on the strip at the far end to finish.',
    ],
    profile: 'pass',
    length: 520,
    rings: 2,
    fuel: 100,
    burn: 0.55,
    maxSpeed: 200,
    cruiseSpeed: 140,
    wind: 12,
    landing: true,
    villages: 3,
    palette: 'storm',
  },
];

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || MISSIONS[0];
}
