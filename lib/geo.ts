// Shared by the client (live "am I close enough?" indicator) and the
// server (the actual check-in gate — never trust the client's own math).
export function distanceInMeters(
  latitude: number,
  longitude: number,
  siteLatitude: number,
  siteLongitude: number
) {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(siteLatitude - latitude);
  const dLon = toRad(siteLongitude - longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latitude)) * Math.cos(toRad(siteLatitude)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// A little slack on top of the location's configured radius, to absorb GPS
// drift — matches the accuracy ceiling the client already enforces (60m).
export const GPS_ACCURACY_SLACK_METERS = 60;
