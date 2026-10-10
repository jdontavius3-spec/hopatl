/**
 * Atlanta Nightlife Hotspots & 2-Driver Fleet Profile
 * Real coordinates for Midtown, Buckhead, Edgewood, Peter St, and West Midtown corridors.
 */

export const ATLANTA_NIGHTLIFE_PICKUPS = [
  {
    id: 'atl-pick-1',
    name: 'Loews Atlanta Hotel (Midtown)',
    address: '1065 Peachtree St NE, Atlanta, GA 30309',
    type: 'Midtown Hotel',
    lat: 33.7844,
    lng: -84.3837,
  },
  {
    id: 'atl-pick-2',
    name: 'The Whitley / St. Regis (Buckhead)',
    address: '3434 Peachtree Rd NE, Atlanta, GA 30326',
    type: 'Buckhead Luxury',
    lat: 33.8507,
    lng: -84.3625,
  },
  {
    id: 'atl-pick-3',
    name: 'The Starling / W Atlanta (Midtown)',
    address: '188 14th St NE, Atlanta, GA 30361',
    type: 'Midtown Strip',
    lat: 33.7865,
    lng: -84.3830,
  },
  {
    id: 'atl-pick-4',
    name: 'Twelve Downtown (Centennial Park)',
    address: '400 W Peachtree St NW, Atlanta, GA 30308',
    type: 'Downtown Suites',
    lat: 33.7656,
    lng: -84.3888,
  },
];

export const ATLANTA_NIGHTLIFE_DESTINATIONS = [
  {
    id: 'atl-dest-1',
    name: 'Peachtree Rd / Phipps Plaza VIP Strip',
    category: 'Buckhead Nightlife',
    miles: 4.2,
    recommendedWait: 30,
    lat: 33.8538,
    lng: -84.3619,
    description: 'Buckhead lounge and club corridor. Valet is $40+; driver parks on-site.',
  },
  {
    id: 'atl-dest-2',
    name: 'Peter Street Arts & Lounge District',
    category: 'Downtown Lounge',
    miles: 3.8,
    recommendedWait: 35,
    lat: 33.7483,
    lng: -84.4024,
    description: 'Castleberry Hill nightlife strip. Driver holds vehicle on curb.',
  },
  {
    id: 'atl-dest-3',
    name: 'Edgewood Ave / Old Fourth Ward (O4W)',
    category: 'O4W Nightlife',
    miles: 2.6,
    recommendedWait: 25,
    lat: 33.7547,
    lng: -84.3735,
    description: 'Bars, music venues, and food truck corridor. Fast turnarounds.',
  },
  {
    id: 'atl-dest-4',
    name: 'West Midtown / Howell Mill Corridor',
    category: 'Westside Lounges',
    miles: 3.1,
    recommendedWait: 30,
    lat: 33.7820,
    lng: -84.4109,
    description: 'Rooftops, dinner spots, and craft lounges.',
  },
  {
    id: 'atl-dest-5',
    name: 'Tower Beer, Wine & Spirits (Piedmont Rd)',
    category: 'Pre-Game / Liquor Stop',
    miles: 2.1,
    recommendedWait: 15,
    lat: 33.8164,
    lng: -84.3685,
    description: 'Quick grab before the club or after-hours. 15-minute express stop.',
  },
  {
    id: 'atl-dest-6',
    name: 'Late-Night Food: JR Crickets / Waffle House (10th St)',
    category: 'Post-Club Food Run',
    miles: 1.4,
    recommendedWait: 20,
    lat: 33.7818,
    lng: -84.3879,
    description: 'Hot lemon pepper wings or 3 AM scramble run without losing your ride.',
  },
];

export const WAIT_PRESETS = [
  { minutes: 15, label: '15 min', description: 'Quick pre-game liquor or ATM stop' },
  { minutes: 25, label: '25 min', description: 'Late-night wings or outfit change' },
  { minutes: 35, label: '35 min', description: 'VIP club check-in or meet friend' },
  { minutes: 45, label: '45 min', description: 'Lounge visit or full dinner pickup' },
];

/**
 * 2 Dedicated Atlanta Drivers for Pilot
 */
export const ATLANTA_DRIVERS = [
  {
    id: 'driver_1',
    name: 'Dohntay',
    vehicle: '2024 Toyota Camry Hybrid (Midnight Black)',
    licensePlate: 'ATL-PILOT',
    rating: 5.0,
    trips: 120,
    cashTag: '$2243Dohntay',
    zellePhone: '9432452611',
    zelleFormatted: '(943) 245-2611',
    phone: '(943) 245-2611',
    etaMinutes: 3,
    statusText: 'Midtown Atlanta · Dedicated Pilot Driver Online',
    photoInitials: 'DV',
    lat: 33.7815,
    lng: -84.3830,
    heading: 45,
  }
];

// Aliases for backward compatibility
export const PRESET_LOCATIONS = ATLANTA_NIGHTLIFE_PICKUPS;
export const PRESET_DESTINATIONS = ATLANTA_NIGHTLIFE_DESTINATIONS;
export const MOCK_DRIVERS = ATLANTA_DRIVERS;

/**
 * Popular Atlanta Venues & Landmarks for instant search / autocomplete
 */
export const ATLANTA_CUSTOM_SUGGESTIONS = [
  { name: 'Ponce City Market (Old Fourth Ward)', category: 'Dining & Drinks', miles: 2.3, wait: 30, lat: 33.7719, lng: -84.3665 },
  { name: 'Magic City (Downtown)', category: 'Nightclub & Lounge', miles: 3.5, wait: 35, lat: 33.7505, lng: -84.3970 },
  { name: 'The Battery Atlanta (Truist Park)', category: 'Entertainment Complex', miles: 11.0, wait: 45, lat: 33.8904, lng: -84.4677 },
  { name: 'Krog Street Market (Inman Park)', category: 'Food Hall & Bars', miles: 2.8, wait: 25, lat: 33.7580, lng: -84.3644 },
  { name: 'Clermont Lounge (Ponce de Leon)', category: 'Historic Dive & Lounge', miles: 2.1, wait: 30, lat: 33.7733, lng: -84.3597 },
  { name: 'Fox Theatre (Midtown)', category: 'Venue / Performance', miles: 0.8, wait: 20, lat: 33.7725, lng: -84.3857 },
  { name: 'Whole Foods Market (14th St Midtown)', category: 'Quick Grocery Run', miles: 0.6, wait: 15, lat: 33.7860, lng: -84.3880 },
  { name: 'CVS Pharmacy 24h (Peachtree St NE)', category: 'Late-Night Pharmacy', miles: 0.7, wait: 15, lat: 33.7830, lng: -84.3840 },
  { name: 'Waffle House (Tech Square / Spring St)', category: 'Late-Night Food', miles: 0.9, wait: 20, lat: 33.7766, lng: -84.3892 },
  { name: 'Midtown Bowl (Piedmont Ave)', category: 'Lounge & Games', miles: 1.7, wait: 30, lat: 33.8055, lng: -84.3688 },
  { name: 'State Farm Arena (Centennial Park)', category: 'Concert & Sports Arena', miles: 2.4, wait: 25, lat: 33.7573, lng: -84.3963 },
];

export const CUSTOM_DISTANCE_PRESETS = [
  { miles: 1.0, label: '1.0 mi', desc: 'Local run' },
  { miles: 2.5, label: '2.5 mi', desc: 'Midtown / Inman' },
  { miles: 4.5, label: '4.5 mi', desc: 'Buckhead / Downtown' },
  { miles: 7.5, label: '7.5 mi', desc: 'Cross-town / Perimeter' },
];

/**
 * Resolve GPS coordinates for any location name or custom address.
 * Matches against known Atlanta locations or deterministically hashes custom addresses into Atlanta metro area.
 */
export function getCoordinatesForLocation(locationInput) {
  if (!locationInput) {
    return { lat: 33.7844, lng: -84.3837, name: 'Midtown Atlanta', category: 'City Center' };
  }

  if (typeof locationInput === 'object' && locationInput.lat && locationInput.lng) {
    return {
      lat: Number(locationInput.lat),
      lng: Number(locationInput.lng),
      name: locationInput.name || 'Location',
      category: locationInput.category || 'Stop',
    };
  }

  const query = String(locationInput).trim().toLowerCase();

  // 1. Search Pickups
  const foundPickup = ATLANTA_NIGHTLIFE_PICKUPS.find(p => 
    p.name.toLowerCase().includes(query) || query.includes(p.name.toLowerCase())
  );
  if (foundPickup) {
    return { lat: foundPickup.lat, lng: foundPickup.lng, name: foundPickup.name, category: foundPickup.type };
  }

  // 2. Search Preset Destinations
  const foundDest = ATLANTA_NIGHTLIFE_DESTINATIONS.find(d => 
    d.name.toLowerCase().includes(query) || query.includes(d.name.toLowerCase())
  );
  if (foundDest) {
    return { lat: foundDest.lat, lng: foundDest.lng, name: foundDest.name, category: foundDest.category };
  }

  // 3. Search Suggestions
  const foundSugg = ATLANTA_CUSTOM_SUGGESTIONS.find(s => 
    s.name.toLowerCase().includes(query) || query.includes(s.name.toLowerCase())
  );
  if (foundSugg) {
    return { lat: foundSugg.lat, lng: foundSugg.lng, name: foundSugg.name, category: foundSugg.category };
  }

  // 4. Deterministic hash for custom addresses within Atlanta core (33.74 to 33.86 N, -84.35 to -84.42 W)
  let hash = 0;
  for (let i = 0; i < query.length; i++) {
    hash = ((hash << 5) - hash) + query.charCodeAt(i);
    hash |= 0;
  }
  const normLat = Math.abs((hash % 1000) / 1000);
  const normLng = Math.abs(((hash >> 8) % 1000) / 1000);
  const lat = 33.7500 + (normLat * 0.1000);
  const lng = -84.4100 + (normLng * 0.0500);

  return {
    lat: Number(lat.toFixed(5)),
    lng: Number(lng.toFixed(5)),
    name: locationInput,
    category: 'Custom Location',
  };
}

/**
 * Calculate driving distance between two coordinates in miles.
 * Uses Haversine spherical distance scaled by Atlanta road curvature factor (1.28x).
 */
export function calculateHaversineDistanceMiles(pointA, pointB) {
  const coordsA = typeof pointA === 'object' && pointA.lat ? pointA : getCoordinatesForLocation(pointA);
  const coordsB = typeof pointB === 'object' && pointB.lat ? pointB : getCoordinatesForLocation(pointB);

  const R = 3958.8; // Earth radius in miles
  const dLat = (coordsB.lat - coordsA.lat) * Math.PI / 180;
  const dLng = (coordsB.lng - coordsA.lng) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(coordsA.lat * Math.PI / 180) * Math.cos(coordsB.lat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightMiles = R * c;

  // Road factor: urban street grid is ~1.28x straight line distance
  const drivingMiles = Math.max(0.6, Math.round(straightMiles * 1.28 * 10) / 10);
  return drivingMiles;
}
