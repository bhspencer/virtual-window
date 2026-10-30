// Where the sun is in the sky, for a time and place, and which way that is through the window.

const RAD = Math.PI / 180;

/**
 * The sun's elevation above the horizon and azimuth (clockwise from north), in degrees, at a time
 * and place. A low-precision almanac formula: good to a fraction of a degree, plenty for lighting.
 */
export function solarPosition(date, latitude, longitude) {
    const days = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
    const meanAnomaly = ((357.529 + 0.98560028 * days) % 360) * RAD;
    const meanLongitude = 280.459 + 0.98564736 * days;
    const eclipticLongitude = (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.020 * Math.sin(2 * meanAnomaly)) * RAD;
    const obliquity = (23.439 - 0.00000036 * days) * RAD;
    const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLongitude), Math.cos(eclipticLongitude));
    const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
    const siderealHours = (18.697374558 + 24.06570982441908 * days) % 24;
    const hourAngle = (siderealHours * 15 + longitude) * RAD - rightAscension;
    const lat = latitude * RAD;
    const elevation = Math.asin(Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle));
    const azimuth = Math.atan2(-Math.sin(hourAngle), Math.tan(declination) * Math.cos(lat) - Math.sin(lat) * Math.cos(hourAngle));
    return { elevation: elevation / RAD, azimuth: ((azimuth / RAD) + 360) % 360 };
}

/**
 * The direction towards the sun in the scene, as a unit vector: -z is the way the window faces
 * (`facing`, degrees clockwise from north), +x is to its right, +y up.
 */
export function sunDirection({ elevation, azimuth }, facing) {
    const relative = (azimuth - facing) * RAD;
    const e = elevation * RAD;
    return { x: Math.sin(relative) * Math.cos(e), y: Math.sin(e), z: -Math.cos(relative) * Math.cos(e) };
}
