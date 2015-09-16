/*! geolib 2.0.9 by Manuel Bieh
* Library to provide geo functions like distance calculation,
* conversion of decimal coordinates to sexagesimal and vice versa, etc.
* WGS 84 (World Geodetic System 1984)
* 
* @author Manuel Bieh
* @url http://www.manuelbieh.com/
* @version 2.0.9
* @license MIT 
**/;(function(global, undefined) {

	"use strict";

	function Geolib() {}

	// Setting readonly defaults
	var geolib = Object.create(Geolib.prototype, {
		version: {
			value: "2.0.9"
		},
		radius: {
			value: 6378137
		},
		minLat: {
			value: -90
		},
		maxLat: {
			value: 90
		},
		minLon: {
			value: -180
		},
		maxLon: {
			value: 180
		},
		sexagesimalPattern: {
			value: /^([0-9]{1,3})°\s*([0-9]{1,3}(?:\.(?:[0-9]{1,2}))?)'\s*(([0-9]{1,3}(\.([0-9]{1,2}))?)"\s*)?([NEOSW]?)$/
		},
		measures: {
			value: Object.create(Object.prototype, {
				"m" : {value: 1},
				"km": {value: 0.001},
				"cm": {value: 100},
				"mm": {value: 1000},
				"mi": {value: (1 / 1609.344)},
				"sm": {value: (1 / 1852.216)},
				"ft": {value: (100 / 30.48)},
				"in": {value: (100 / 2.54)},
				"yd": {value: (1 / 0.9144)}
			})
		},
		prototype: {
			value: Geolib.prototype
		},
		extend: {
			value: function(methods, overwrite) {
				for(var prop in methods) {
					if(typeof geolib.prototype[prop] === 'undefined' || overwrite === true) {
						geolib.prototype[prop] = methods[prop];
					}
				}
			}
		}
	});

	if (typeof(Number.prototype.toRad) === "undefined") {
		Number.prototype.toRad = function() {
			return this * Math.PI / 180;
		};
	}

	if (typeof(Number.prototype.toDeg) === "undefined") {
		Number.prototype.toDeg = function() {
			return this * 180 / Math.PI;
		};
	}

	// Here comes the magic
	geolib.extend({

		decimal: {},

		sexagesimal: {},

		distance: null,

		getKeys: function(point) {

			// GeoJSON Array [longitude, latitude(, elevation)]
			if(Object.prototype.toString.call(point) == '[object Array]') {

				return {
					longitude: point.length >= 1 ? 0 : undefined,
					latitude: point.length >= 2 ? 1 : undefined,
					elevation: point.length >= 3 ? 2 : undefined
				};

			}

			var getKey = function(possibleValues) {

				var key;

				possibleValues.every(function(val) {
					// TODO: check if point is an object
					if(typeof point != 'object') {
						return true;
					}
					return point.hasOwnProperty(val) ? (function() { key = val; return false; }()) : true;
				});

				return key;

			};

			var longitude = getKey(['lng', 'lon', 'longitude']);
			var latitude = getKey(['lat', 'latitude']);
			var elevation = getKey(['alt', 'altitude', 'elevation', 'elev']);

			// return undefined if not at least one valid property was found
			if(typeof latitude == 'undefined' && 
				typeof longitude == 'undefined' && 
				typeof elevation == 'undefined') {
				return undefined;
			}

			return {
				latitude: latitude,
				longitude: longitude,
				elevation: elevation
			};

		},

		// returns latitude of a given point, converted to decimal
		// set raw to true to avoid conversion
		getLat: function(point, raw) {
			return raw === true ? point[this.getKeys(point).latitude] : this.useDecimal(point[this.getKeys(point).latitude]);
		},

		// Alias for getLat
		latitude: function(point) {
			return this.getLat.call(this, point);
		},

		// returns longitude of a given point, converted to decimal
		// set raw to true to avoid conversion
		getLon: function(point, raw) {
			return raw === true ? point[this.getKeys(point).longitude] : this.useDecimal(point[this.getKeys(point).longitude]);
		},

		// Alias for getLon
		longitude: function(point) {
			return this.getLon.call(this, point);
		},

		getElev: function(point) {
			return point[this.getKeys(point).elevation];
		},

		// Alias for getElev
		elevation: function(point) {
			return this.getElev.call(this, point);
		},

		coords: function(point, raw) {

			var retval = {
				latitude: raw === true ? point[this.getKeys(point).latitude] : this.useDecimal(point[this.getKeys(point).latitude]),
				longitude: raw === true ? point[this.getKeys(point).longitude] : this.useDecimal(point[this.getKeys(point).longitude])
			};

			var elev = point[this.getKeys(point).elevation];

			if(typeof elev !== 'undefined') {
				retval['elevation'] = elev;
			}

			return retval;

		},

		// checks if a variable contains a valid latlong object
		validate: function(point) {

			var keys = this.getKeys(point);

			if(typeof keys === 'undefined' || typeof keys.latitude === 'undefined' || keys.longitude === 'undefined') {
				return false;
			}

			var lat = point[keys.latitude];
			var lng = point[keys.longitude];

			if(typeof lat === 'undefined' || !this.isDecimal(lat) && !this.isSexagesimal(lat)) {
				return false;
			}

			if(typeof lng === 'undefined' || !this.isDecimal(lng) && !this.isSexagesimal(lng)) {
				return false;
			}

			lat = this.useDecimal(lat);
			lng = this.useDecimal(lng);

			if(lat < this.minLat || lat > this.maxLat || lng < this.minLon || lng > this.maxLon) {
				return false;
			}

			return true;

		},

		/**
		* Calculates geodetic distance between two points specified by latitude/longitude using 
		* Vincenty inverse formula for ellipsoids
		* Vincenty Inverse Solution of Geodesics on the Ellipsoid (c) Chris Veness 2002-2010
		* (Licensed under CC BY 3.0)
		*
		* @param    object    Start position {latitude: 123, longitude: 123}
		* @param    object    End position {latitude: 123, longitude: 123}
		* @param    integer   Accuracy (in meters)
		* @return   integer   Distance (in meters)
		*/
		getDistance: function(start, end, accuracy) {

			accuracy = Math.floor(accuracy) || 1;

			var s = this.coords(start);
			var e = this.coords(end);

			var a = 6378137, b = 6356752.314245,  f = 1/298.257223563;  // WGS-84 ellipsoid params
			var L = (e['longitude']-s['longitude']).toRad();

			var cosSigma, sigma, sinAlpha, cosSqAlpha, cos2SigmaM, sinSigma;

			var U1 = Math.atan((1-f) * Math.tan(parseFloat(s['latitude']).toRad()));
			var U2 = Math.atan((1-f) * Math.tan(parseFloat(e['latitude']).toRad()));
			var sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
			var sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);

			var lambda = L, lambdaP, iterLimit = 100;
			do {
				var sinLambda = Math.sin(lambda), cosLambda = Math.cos(lambda);
				sinSigma = (
					Math.sqrt(
						(
							cosU2 * sinLambda
						) * (
							cosU2 * sinLambda
						) + (
							cosU1 * sinU2 - sinU1 * cosU2 * cosLambda
						) * (
							cosU1 * sinU2 - sinU1 * cosU2 * cosLambda
						)
					)
				);
				if (sinSigma === 0) {
					return geolib.distance = 0;  // co-incident points
				}

				cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
				sigma = Math.atan2(sinSigma, cosSigma);
				sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma;
				cosSqAlpha = 1 - sinAlpha * sinAlpha;
				cos2SigmaM = cosSigma - 2 * sinU1 * sinU2 / cosSqAlpha;

				if (isNaN(cos2SigmaM)) {
					cos2SigmaM = 0;  // equatorial line: cosSqAlpha=0 (§6)
				}
				var C = (
					f / 16 * cosSqAlpha * (
						4 + f * (
							4 - 3 * cosSqAlpha
						)
					)
				);
				lambdaP = lambda;
				lambda = (
					L + (
						1 - C
					) * f * sinAlpha * (
						sigma + C * sinSigma * (
							cos2SigmaM + C * cosSigma * (
								-1 + 2 * cos2SigmaM * cos2SigmaM
							)
						)
					)
				);

			} while (Math.abs(lambda-lambdaP) > 1e-12 && --iterLimit>0);

			if (iterLimit === 0) {
				return NaN;  // formula failed to converge
			}

			var uSq = (
				cosSqAlpha * (
					a * a - b * b
				) / (
					b*b
				)
			);

			var A = (
				1 + uSq / 16384 * (
					4096 + uSq * (
						-768 + uSq * (
							320 - 175 * uSq
						)
					)
				)
			);

			var B = (
				uSq / 1024 * (
					256 + uSq * (
						-128 + uSq * (
							74-47 * uSq
						)
					)
				)
			);

			var deltaSigma = (
				B * sinSigma * (
					cos2SigmaM + B / 4 * (
						cosSigma * (
							-1 + 2 * cos2SigmaM * cos2SigmaM
						) -B / 6 * cos2SigmaM * (
							-3 + 4 * sinSigma * sinSigma
						) * (
							-3 + 4 * cos2SigmaM * cos2SigmaM
						)
					)
				)
			);

			var distance = b * A * (sigma - deltaSigma);

			distance = distance.toFixed(3); // round to 1mm precision

			//if (start.hasOwnProperty(elevation) && end.hasOwnProperty(elevation)) {
			if (typeof this.elevation(start) !== 'undefined' && typeof this.elevation(end) !== 'undefined') {
				var climb = Math.abs(this.elevation(start) - this.elevation(end));
				distance = Math.sqrt(distance * distance + climb * climb);
			}

			return this.distance = Math.floor(
				Math.round(distance / accuracy) * accuracy
			);

			/*
			// note: to return initial/final bearings in addition to distance, use something like:
			var fwdAz = Math.atan2(cosU2*sinLambda,  cosU1*sinU2-sinU1*cosU2*cosLambda);
			var revAz = Math.atan2(cosU1*sinLambda, -sinU1*cosU2+cosU1*sinU2*cosLambda);

			return { distance: s, initialBearing: fwdAz.toDeg(), finalBearing: revAz.toDeg() };
			*/

		},


		/**
		* Calculates the distance between two spots. 
		* This method is more simple but also far more inaccurate
		*
		* @param    object    Start position {latitude: 123, longitude: 123}
		* @param    object    End position {latitude: 123, longitude: 123}
		* @param    integer   Accuracy (in meters)
		* @return   integer   Distance (in meters)
		*/
		getDistanceSimple: function(start, end, accuracy) {

			accuracy = Math.floor(accuracy) || 1;

			var distance = 
				Math.round(
					Math.acos(
						Math.sin(
							this.latitude(end).toRad()
						) * 
						Math.sin(
							this.latitude(start).toRad()
						) + 
						Math.cos(
							this.latitude(end).toRad()
						) * 
						Math.cos(
							this.latitude(start).toRad()
						) * 
						Math.cos(
							this.longitude(start).toRad() - this.longitude(end).toRad()
						) 
					) * this.radius
				);

			return geolib.distance = Math.floor(Math.round(distance/accuracy)*accuracy);

		},


		/**
		* Calculates the center of a collection of geo coordinates
		*
		* @param		array		Collection of coords [{latitude: 51.510, longitude: 7.1321}, {latitude: 49.1238, longitude: "8° 30' W"}, ...]
		* @return		object		{latitude: centerLat, longitude: centerLng, distance: diagonalDistance}
		*/
		getCenter: function(coords) {

			if (!coords.length) {
				return false;
			}

			var max = function( array ){
				return Math.max.apply( Math, array );
			};

			var min = function( array ){
				return Math.min.apply( Math, array );
			};

			var	latitude;
			var longitude;
			var splitCoords = {latitude: [], longitude: []};

			for(var coord in coords) {

				splitCoords.latitude.push(
					this.latitude(coords[coord])
				);

				splitCoords.longitude.push(
					this.longitude(coords[coord])
				);

			}

			var minLat = min(splitCoords.latitude);
			var minLon = min(splitCoords.longitude);
			var maxLat = max(splitCoords.latitude);
			var maxLon = max(splitCoords.longitude);

			latitude = ((minLat + maxLat)/2).toFixed(6);
			longitude = ((minLon + maxLon)/2).toFixed(6);

			// distance from the deepest left to the highest right point (diagonal distance)
			var distance = this.convertUnit('km', this.getDistance({latitude: minLat, longitude: minLon}, {latitude: maxLat, longitude: maxLon}));

			return {
				latitude: latitude, 
				longitude: longitude, 
				distance: distance
			};

		},



		/**
		* Gets the max and min, latitude, longitude, and elevation (if provided).
		* @param		array		array with coords e.g. [{latitude: 51.5143, longitude: 7.4138}, {latitude: 123, longitude: 123}, ...] 
		* @return	object		{maxLat: maxLat,
		*                     minLat: minLat		
		*                     maxLng: maxLng,
		*                     minLng: minLng,
		*                     maxElev: maxElev,
		*                     minElev: minElev}
		*/
		getBounds: function(coords) {

			if (!coords.length) {
				return false;
			}

			var useElevation = this.elevation(coords[0]);

			var stats = {
				maxLat: -Infinity,
				minLat: Infinity,
				maxLng: -Infinity,
				minLng: Infinity
			};

			if (typeof useElevation != 'undefined') {
				stats.maxElev = 0;
				stats.minElev = Infinity;
			}

			for (var i = 0, l = coords.length; i < l; ++i) {

				stats.maxLat = Math.max(this.latitude(coords[i]), stats.maxLat);
				stats.minLat = Math.min(this.latitude(coords[i]), stats.minLat);
				stats.maxLng = Math.max(this.longitude(coords[i]), stats.maxLng);
				stats.minLng = Math.min(this.longitude(coords[i]), stats.minLng);

				if (useElevation) {
					stats.maxElev = Math.max(this.elevation(coords[i]), stats.maxElev);
					stats.minElev = Math.min(this.elevation(coords[i]), stats.minElev);
				}

			}

			return stats;

		},


		/**
		* Computes the bounding coordinates of all points on the surface
		* of the earth less than or equal to the specified great circle
		* distance.
		*
		* @param object Point position {latitude: 123, longitude: 123}
		* @param number Distance (in meters).
		* @return array Collection of two points defining the SW and NE corners.
		*/
		getBoundsOfDistance: function(point, distance) {

			var latitude = this.latitude(point);
			var longitude = this.longitude(point);

			var radLat = latitude.toRad();
			var radLon = longitude.toRad();

			var radDist = distance / this.radius;
			var minLat = radLat - radDist;
			var maxLat = radLat + radDist;

			var MAX_LAT_RAD = this.maxLat.toRad();
			var MIN_LAT_RAD = this.minLat.toRad();
			var MAX_LON_RAD = this.maxLon.toRad();
			var MIN_LON_RAD = this.minLon.toRad();

			var minLon;
			var maxLon;

			if (minLat > MIN_LAT_RAD && maxLat < MAX_LAT_RAD) {

				var deltaLon = Math.asin(Math.sin(radDist) / Math.cos(radLat));
				minLon = radLon - deltaLon;

				if (minLon < MIN_LON_RAD) {
					minLon += 2 * Math.PI;
				}

				maxLon = radLon + deltaLon;

				if (maxLon > MAX_LON_RAD) {
					maxLon -= 2 * Math.PI;
				}

			} else {
				// A pole is within the distance.
				minLat = Math.max(minLat, MIN_LAT_RAD);
				maxLat = Math.min(maxLat, MAX_LAT_RAD);
				minLon = MIN_LON_RAD;
				maxLon = MAX_LON_RAD;
			}

			return [
				// Southwest
				{
					latitude: minLat.toDeg(), 
					longitude: minLon.toDeg()
				},
				// Northeast
				{
					latitude: maxLat.toDeg(), 
					longitude: maxLon.toDeg()
				}
			];

		},


		/**
		* Checks whether a point is inside of a polygon or not.
		* Note that the polygon coords must be in correct order!
		*
		* @param		object		coordinate to check e.g. {latitude: 51.5023, longitude: 7.3815}
		* @param		array		array with coords e.g. [{latitude: 51.5143, longitude: 7.4138}, {latitude: 123, longitude: 123}, ...] 
		* @return		bool		true if the coordinate is inside the given polygon
		*/
		isPointInside: function(latlng, coords) {

			for(var c = false, i = -1, l = coords.length, j = l - 1; ++i < l; j = i) {

				if(
					(
						(this.longitude(coords[i]) <= this.longitude(latlng) && this.longitude(latlng) < this.longitude(coords[j])) ||
						(this.longitude(coords[j]) <= this.longitude(latlng) && this.longitude(latlng) < this.longitude(coords[i]))
					) && 
					(
						this.latitude(latlng) < (this.latitude(coords[j]) - this.latitude(coords[i])) * 
						(this.longitude(latlng) - this.longitude(coords[i])) / 
						(this.longitude(coords[j]) - this.longitude(coords[i])) + 
						this.latitude(coords[i])
					)
				) {
					c = !c;
				}

			}

			return c;

		},


		/**
		* Shortcut for geolib.isPointInside()
		*/
		isInside: function() {
			return this.isPointInside.apply(this, arguments);
		},


		/**
		* Checks whether a point is inside of a circle or not.
		*
		* @param		object		coordinate to check (e.g. {latitude: 51.5023, longitude: 7.3815})
		* @param		object		coordinate of the circle's center (e.g. {latitude: 51.4812, longitude: 7.4025})
		* @param		integer		maximum radius in meters 
		* @return		bool		true if the coordinate is within the given radius
		*/
		isPointInCircle: function(latlng, center, radius) {
			return this.getDistance(latlng, center) < radius;
		},


		/**
		* Shortcut for geolib.isPointInCircle()
		*/
		withinRadius: function() {
			return this.isPointInCircle.apply(this, arguments);
		},


		/**
		* Gets rhumb line bearing of two points. Find out about the difference between rhumb line and 
		* great circle bearing on Wikipedia. It's quite complicated. Rhumb line should be fine in most cases:
		*
		* http://en.wikipedia.org/wiki/Rhumb_line#General_and_mathematical_description
		* 
		* Function heavily based on Doug Vanderweide's great PHP version (licensed under GPL 3.0)
		* http://www.dougv.com/2009/07/13/calculating-the-bearing-and-compass-rose-direction-between-two-latitude-longitude-coordinates-in-php/
		*
		* @param		object		origin coordinate (e.g. {latitude: 51.5023, longitude: 7.3815})
		* @param		object		destination coordinate
		* @return		integer		calculated bearing
		*/
		getRhumbLineBearing: function(originLL, destLL) {

			// difference of longitude coords
			var diffLon = this.longitude(destLL).toRad() - this.longitude(originLL).toRad();

			// difference latitude coords phi
			var diffPhi = Math.log(
				Math.tan(
					this.latitude(destLL).toRad() / 2 + Math.PI / 4
				) / 
				Math.tan(
					this.latitude(originLL).toRad() / 2 + Math.PI / 4
				)
			);

			// recalculate diffLon if it is greater than pi
			if(Math.abs(diffLon) > Math.PI) {
				if(diffLon > 0) {
					diffLon = (2 * Math.PI - diffLon) * -1;
				}
				else {
					diffLon = 2 * Math.PI + diffLon;
				}
			}

			//return the angle, normalized
			return (Math.atan2(diffLon, diffPhi).toDeg() + 360) % 360;

		},


		/**
		* Gets great circle bearing of two points. See description of getRhumbLineBearing for more information
		*
		* @param		object		origin coordinate (e.g. {latitude: 51.5023, longitude: 7.3815})
		* @param		object		destination coordinate
		* @return		integer		calculated bearing
		*/
		getBearing: function(originLL, destLL) {

			destLL['latitude'] = this.latitude(destLL);
			destLL['longitude'] = this.longitude(destLL);
			originLL['latitude'] = this.latitude(originLL);
			originLL['longitude'] = this.longitude(originLL);

			var bearing = (
				(
					Math.atan2(
						Math.sin(
							destLL['longitude'].toRad() - 
							originLL['longitude'].toRad()
						) * 
						Math.cos(
							destLL['latitude'].toRad()
						), 
						Math.cos(
							originLL['latitude'].toRad()
						) * 
						Math.sin(
							destLL['latitude'].toRad()
						) - 
						Math.sin(
							originLL['latitude'].toRad()
						) * 
						Math.cos(
							destLL['latitude'].toRad()
						) * 
						Math.cos(
							destLL['longitude'].toRad() - originLL['longitude'].toRad()
						)
					)
				).toDeg() + 360
			) % 360;

			return bearing;

		},


		/**
		* Gets the compass direction from an origin coordinate to a destination coordinate.
		*
		* @param		object		origin coordinate (e.g. {latitude: 51.5023, longitude: 7.3815})
		* @param		object		destination coordinate
		* @param		string		Bearing mode. Can be either circle or rhumbline
		* @return		object		Returns an object with a rough (NESW) and an exact direction (NNE, NE, ENE, E, ESE, etc).
		*/
		getCompassDirection: function(originLL, destLL, bearingMode) {

			var direction;
			var bearing;

			if(bearingMode == 'circle') { 
				// use great circle bearing
				bearing = this.getBearing(originLL, destLL);
			} else { 
				// default is rhumb line bearing
				bearing = this.getRhumbLineBearing(originLL, destLL);
			}

			switch(Math.round(bearing/22.5)) {
				case 1:
					direction = {exact: "NNE", rough: "N"};
					break;
				case 2:
					direction = {exact: "NE", rough: "N"};
					break;
				case 3:
					direction = {exact: "ENE", rough: "E"};
					break;
				case 4:
					direction = {exact: "E", rough: "E"};
					break;
				case 5:
					direction = {exact: "ESE", rough: "E"};
					break;
				case 6:
					direction = {exact: "SE", rough: "E"};
					break;
				case 7:
					direction = {exact: "SSE", rough: "S"};
					break;
				case 8:
					direction = {exact: "S", rough: "S"};
					break;
				case 9:
					direction = {exact: "SSW", rough: "S"};
					break;
				case 10:
					direction = {exact: "SW", rough: "S"};
					break;
				case 11:
					direction = {exact: "WSW", rough: "W"};
					break;
				case 12:
					direction = {exact: "W", rough: "W"};
					break;
				case 13:
					direction = {exact: "WNW", rough: "W"};
					break;
				case 14:
					direction = {exact: "NW", rough: "W"};
					break;
				case 15:
					direction = {exact: "NNW", rough: "N"}; 
					break;
				default:
					direction = {exact: "N", rough: "N"};
			}

			direction['bearing'] = bearing;
			return direction;

		},


		/**
		* Shortcut for getCompassDirection
		*/
		getDirection: function(originLL, destLL, bearingMode) {
			return this.getCompassDirection.apply(this, arguments);
		},


		/**
		* Sorts an array of coords by distance from a reference coordinate
		*
		* @param		object		reference coordinate e.g. {latitude: 51.5023, longitude: 7.3815}
		* @param		mixed		array or object with coords [{latitude: 51.5143, longitude: 7.4138}, {latitude: 123, longitude: 123}, ...] 
		* @return		array		ordered array
		*/
		orderByDistance: function(latlng, coords) {

			var coordsArray = [];

			for(var coord in coords) {

				var d = this.getDistance(latlng, coords[coord]);

				coordsArray.push({
					key: coord, 
					latitude: this.latitude(coords[coord]), 
					longitude: this.longitude(coords[coord]), 
					distance: d
				});

			}

			return coordsArray.sort(function(a, b) { return a.distance - b.distance; });

		},


		/**
		* Finds the nearest coordinate to a reference coordinate
		*
		* @param		object		reference coordinate e.g. {latitude: 51.5023, longitude: 7.3815}
		* @param		mixed		array or object with coords [{latitude: 51.5143, longitude: 7.4138}, {latitude: 123, longitude: 123}, ...] 
		* @return		array		ordered array
		*/
		findNearest: function(latlng, coords, offset, limit) {

			offset = offset || 0;
			limit = limit || 1;
			var ordered = this.orderByDistance(latlng, coords);

			if(limit === 1) {
				return ordered[offset];
			} else {
				return ordered.splice(offset, limit);
			}

		},


		/**
		* Calculates the length of a given path
		*
		* @param		mixed		array or object with coords [{latitude: 51.5143, longitude: 7.4138}, {latitude: 123, longitude: 123}, ...] 
		* @return		integer		length of the path (in meters)
		*/
		getPathLength: function(coords) {

			var dist = 0;
			var last;

			for (var i = 0, l = coords.length; i < l; ++i) {
				if(last) {
					//console.log(coords[i], last, this.getDistance(coords[i], last));
					dist += this.getDistance(this.coords(coords[i]), last);
				}
				last = this.coords(coords[i]);
			}

			return dist;

		},


		/**
		* Calculates the speed between to points within a given time span.
		*
		* @param		object		coords with javascript timestamp {latitude: 51.5143, longitude: 7.4138, time: 1360231200880}
		* @param		object		coords with javascript timestamp {latitude: 51.5502, longitude: 7.4323, time: 1360245600460}
		* @param		object		options (currently "unit" is the only option. Default: km(h));
		* @return		float		speed in unit per hour
		*/
		getSpeed: function(start, end, options) {

			var unit = options && options.unit || 'km';

			if(unit == 'mph') {
				unit = 'mi';
			} else if(unit == 'kmh') {
				unit = 'km';
			}

			var distance = geolib.getDistance(start, end);
			var time = ((end.time*1)/1000) - ((start.time*1)/1000);
			var mPerHr = (distance/time)*3600;
			var speed = Math.round(mPerHr * this.measures[unit] * 10000)/10000;
			return speed;

		},


		/**
		* Converts a distance from meters to km, mm, cm, mi, ft, in or yd
		*
		* @param		string		Format to be converted in
		* @param		float		Distance in meters
		* @param		float		Decimal places for rounding (default: 4)
		* @return		float		Converted distance
		*/
		convertUnit: function(unit, distance, round) {

			if(distance === 0 || typeof distance === 'undefined') {

				if(this.distance === 0) {
					// throw 'No distance given.';
					return 0;
				} else {
					distance = this.distance;
				}

			}

			unit = unit || 'm';
			round = (null == round ? 4 : round);

			if(typeof this.measures[unit] !== 'undefined') {
				return this.round(distance * this.measures[unit], round);
			} else {
				throw new Error('Unknown unit for conversion.');
			}

		},


		/**
		* Checks if a value is in decimal format or, if neccessary, converts to decimal
		*
		* @param		mixed		Value(s) to be checked/converted (array of latlng objects, latlng object, sexagesimal string, float)
		* @return		float		Input data in decimal format
		*/
		useDecimal: function(value) {

			if(Object.prototype.toString.call(value) === '[object Array]') {

				var geolib = this;

				value = value.map(function(val) {

					//if(!isNaN(parseFloat(val))) {
					if(geolib.isDecimal(val)) {

						return geolib.useDecimal(val);

					} else if(typeof val == 'object') {

						if(geolib.validate(val)) {

							return geolib.coords(val);

						} else {

							for(var prop in val) {
								val[prop] = geolib.useDecimal(val[prop]);
							}

							return val;

						}

					} else if(geolib.isSexagesimal(val)) {

						return geolib.sexagesimal2decimal(val);

					} else {

						return val;

					}

				});

				return value;

			} else if(typeof value === 'object' && this.validate(value)) {

				return this.coords(value);

			} else if(typeof value === 'object') {

				for(var prop in value) {
					value[prop] = this.useDecimal(value[prop]);
				}

				return value;

			}


			if (this.isDecimal(value)) {

				return parseFloat(value);

			} else if(this.isSexagesimal(value) === true) {

				return parseFloat(this.sexagesimal2decimal(value));

			}

			throw new Error('Unknown format.');

		},

		/**
		* Converts a decimal coordinate value to sexagesimal format
		*
		* @param		float		decimal
		* @return		string		Sexagesimal value (XX° YY' ZZ")
		*/
		decimal2sexagesimal: function(dec) {

			if (dec in this.sexagesimal) {
				return this.sexagesimal[dec];
			}

			var tmp = dec.toString().split('.');

			var deg = Math.abs(tmp[0]);
			var min = ('0.' + tmp[1])*60;
			var sec = min.toString().split('.');

			min = Math.floor(min);
			sec = (('0.' + sec[1]) * 60).toFixed(2);

			this.sexagesimal[dec] = (deg + '° ' + min + "' " + sec + '"');

			return this.sexagesimal[dec];

		},


		/**
		* Converts a sexagesimal coordinate to decimal format
		*
		* @param		float		Sexagesimal coordinate
		* @return		string		Decimal value (XX.XXXXXXXX)
		*/
		sexagesimal2decimal: function(sexagesimal) {

			if (sexagesimal in this.decimal) {
				return this.decimal[sexagesimal];
			}

			var	regEx = new RegExp(this.sexagesimalPattern);
			var	data = regEx.exec(sexagesimal);
			var min = 0, sec = 0;

			if(data) {
				min = parseFloat(data[2]/60);
				sec = parseFloat(data[4]/3600) || 0;
			}

			var	dec = ((parseFloat(data[1]) + min + sec)).toFixed(8);
			//var	dec = ((parseFloat(data[1]) + min + sec));

				// South and West are negative decimals
				dec = (data[7] == 'S' || data[7] == 'W') ? parseFloat(-dec) : parseFloat(dec);
				//dec = (data[7] == 'S' || data[7] == 'W') ? -dec : dec;

			this.decimal[sexagesimal] = dec;

			return dec;

		},


		/**
		* Checks if a value is in decimal format
		*
		* @param		string		Value to be checked
		* @return		bool		True if in sexagesimal format
		*/
		isDecimal: function(value) {

			value = value.toString().replace(/\s*/, '');

			// looks silly but works as expected
			// checks if value is in decimal format
			return (!isNaN(parseFloat(value)) && parseFloat(value) == value);

		},


		/**
		* Checks if a value is in sexagesimal format
		*
		* @param		string		Value to be checked
		* @return		bool		True if in sexagesimal format
		*/
		isSexagesimal: function(value) {

			value = value.toString().replace(/\s*/, '');

			return this.sexagesimalPattern.test(value);

		},

		round: function(value, n) {
			var decPlace = Math.pow(10, n);
			return Math.round(value * decPlace)/decPlace;
		}

	});

	// Node module
	if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {

		global.geolib = module.exports = geolib;

	// AMD module
	} else if (typeof define === "function" && define.amd) {

		define("geolib", [], function () {
			return geolib; 
		});

	// we're in a browser
	} else {

		global.geolib = geolib;

	}

}(this));
//     Underscore.js 1.6.0
//     http://underscorejs.org
//     (c) 2009-2014 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `exports` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var
    push             = ArrayProto.push,
    slice            = ArrayProto.slice,
    concat           = ArrayProto.concat,
    toString         = ObjProto.toString,
    hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.6.0';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return obj;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, length = obj.length; i < length; i++) {
        if (iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      var keys = _.keys(obj);
      for (var i = 0, length = keys.length; i < length; i++) {
        if (iterator.call(context, obj[keys[i]], keys[i], obj) === breaker) return;
      }
    }
    return obj;
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results.push(iterator.call(context, value, index, list));
    });
    return results;
  };

  var reduceError = 'Reduce of empty array with no initial value';

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var length = obj.length;
    if (length !== +length) {
      var keys = _.keys(obj);
      length = keys.length;
    }
    each(obj, function(value, index, list) {
      index = keys ? keys[--length] : --length;
      if (!initial) {
        memo = obj[index];
        initial = true;
      } else {
        memo = iterator.call(context, memo, obj[index], index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, predicate, context) {
    var result;
    any(obj, function(value, index, list) {
      if (predicate.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, predicate, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(predicate, context);
    each(obj, function(value, index, list) {
      if (predicate.call(context, value, index, list)) results.push(value);
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, predicate, context) {
    return _.filter(obj, function(value, index, list) {
      return !predicate.call(context, value, index, list);
    }, context);
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, predicate, context) {
    predicate || (predicate = _.identity);
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(predicate, context);
    each(obj, function(value, index, list) {
      if (!(result = result && predicate.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, predicate, context) {
    predicate || (predicate = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(predicate, context);
    each(obj, function(value, index, list) {
      if (result || (result = predicate.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if the array or object contains a given value (using `===`).
  // Aliased as `include`.
  _.contains = _.include = function(obj, target) {
    if (obj == null) return false;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    return any(obj, function(value) {
      return value === target;
    });
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    var isFunc = _.isFunction(method);
    return _.map(obj, function(value) {
      return (isFunc ? method : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, _.property(key));
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // containing specific `key:value` pairs.
  _.where = function(obj, attrs) {
    return _.filter(obj, _.matches(attrs));
  };

  // Convenience version of a common use case of `find`: getting the first object
  // containing specific `key:value` pairs.
  _.findWhere = function(obj, attrs) {
    return _.find(obj, _.matches(attrs));
  };

  // Return the maximum element or (element-based computation).
  // Can't optimize arrays of integers longer than 65,535 elements.
  // See [WebKit Bug 80797](https://bugs.webkit.org/show_bug.cgi?id=80797)
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.max.apply(Math, obj);
    }
    var result = -Infinity, lastComputed = -Infinity;
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      if (computed > lastComputed) {
        result = value;
        lastComputed = computed;
      }
    });
    return result;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.min.apply(Math, obj);
    }
    var result = Infinity, lastComputed = Infinity;
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      if (computed < lastComputed) {
        result = value;
        lastComputed = computed;
      }
    });
    return result;
  };

  // Shuffle an array, using the modern version of the
  // [Fisher-Yates shuffle](http://en.wikipedia.org/wiki/Fisher–Yates_shuffle).
  _.shuffle = function(obj) {
    var rand;
    var index = 0;
    var shuffled = [];
    each(obj, function(value) {
      rand = _.random(index++);
      shuffled[index - 1] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // Sample **n** random values from a collection.
  // If **n** is not specified, returns a single random element.
  // The internal `guard` argument allows it to work with `map`.
  _.sample = function(obj, n, guard) {
    if (n == null || guard) {
      if (obj.length !== +obj.length) obj = _.values(obj);
      return obj[_.random(obj.length - 1)];
    }
    return _.shuffle(obj).slice(0, Math.max(0, n));
  };

  // An internal function to generate lookup iterators.
  var lookupIterator = function(value) {
    if (value == null) return _.identity;
    if (_.isFunction(value)) return value;
    return _.property(value);
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, iterator, context) {
    iterator = lookupIterator(iterator);
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value: value,
        index: index,
        criteria: iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index - right.index;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  var group = function(behavior) {
    return function(obj, iterator, context) {
      var result = {};
      iterator = lookupIterator(iterator);
      each(obj, function(value, index) {
        var key = iterator.call(context, value, index, obj);
        behavior(result, key, value);
      });
      return result;
    };
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = group(function(result, key, value) {
    _.has(result, key) ? result[key].push(value) : result[key] = [value];
  });

  // Indexes the object's values by a criterion, similar to `groupBy`, but for
  // when you know that your index values will be unique.
  _.indexBy = group(function(result, key, value) {
    result[key] = value;
  });

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = group(function(result, key) {
    _.has(result, key) ? result[key]++ : result[key] = 1;
  });

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator, context) {
    iterator = lookupIterator(iterator);
    var value = iterator.call(context, obj);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >>> 1;
      iterator.call(context, array[mid]) < value ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely create a real, live array from anything iterable.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (_.isArray(obj)) return slice.call(obj);
    if (obj.length === +obj.length) return _.map(obj, _.identity);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    if (obj == null) return 0;
    return (obj.length === +obj.length) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n == null) || guard) return array[0];
    if (n < 0) return [];
    return slice.call(array, 0, n);
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n == null) || guard) return array[array.length - 1];
    return slice.call(array, Math.max(array.length - n, 0));
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, (n == null) || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, _.identity);
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, output) {
    if (shallow && _.every(input, _.isArray)) {
      return concat.apply(output, input);
    }
    each(input, function(value) {
      if (_.isArray(value) || _.isArguments(value)) {
        shallow ? push.apply(output, value) : flatten(value, shallow, output);
      } else {
        output.push(value);
      }
    });
    return output;
  };

  // Flatten out an array, either recursively (by default), or just one level.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Split an array into two arrays: one whose elements all satisfy the given
  // predicate, and one whose elements all do not satisfy the predicate.
  _.partition = function(array, predicate) {
    var pass = [], fail = [];
    each(array, function(elem) {
      (predicate(elem) ? pass : fail).push(elem);
    });
    return [pass, fail];
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator, context) {
    if (_.isFunction(isSorted)) {
      context = iterator;
      iterator = isSorted;
      isSorted = false;
    }
    var initial = iterator ? _.map(array, iterator, context) : array;
    var results = [];
    var seen = [];
    each(initial, function(value, index) {
      if (isSorted ? (!index || seen[seen.length - 1] !== value) : !_.contains(seen, value)) {
        seen.push(value);
        results.push(array[index]);
      }
    });
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(_.flatten(arguments, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.contains(other, item);
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = concat.apply(ArrayProto, slice.call(arguments, 1));
    return _.filter(array, function(value){ return !_.contains(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var length = _.max(_.pluck(arguments, 'length').concat(0));
    var results = new Array(length);
    for (var i = 0; i < length; i++) {
      results[i] = _.pluck(arguments, '' + i);
    }
    return results;
  };

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values.
  _.object = function(list, values) {
    if (list == null) return {};
    var result = {};
    for (var i = 0, length = list.length; i < length; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i = 0, length = array.length;
    if (isSorted) {
      if (typeof isSorted == 'number') {
        i = (isSorted < 0 ? Math.max(0, length + isSorted) : isSorted);
      } else {
        i = _.sortedIndex(array, item);
        return array[i] === item ? i : -1;
      }
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item, isSorted);
    for (; i < length; i++) if (array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item, from) {
    if (array == null) return -1;
    var hasIndex = from != null;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) {
      return hasIndex ? array.lastIndexOf(item, from) : array.lastIndexOf(item);
    }
    var i = (hasIndex ? from : array.length);
    while (i--) if (array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var length = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(length);

    while(idx < length) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  _.bind = function(func, context) {
    var args, bound;
    if (nativeBind && func.bind === nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      ctor.prototype = null;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context. _ acts
  // as a placeholder, allowing any combination of arguments to be pre-filled.
  _.partial = function(func) {
    var boundArgs = slice.call(arguments, 1);
    return function() {
      var position = 0;
      var args = boundArgs.slice();
      for (var i = 0, length = args.length; i < length; i++) {
        if (args[i] === _) args[i] = arguments[position++];
      }
      while (position < arguments.length) args.push(arguments[position++]);
      return func.apply(this, args);
    };
  };

  // Bind a number of an object's methods to that object. Remaining arguments
  // are the method names to be bound. Useful for ensuring that all callbacks
  // defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length === 0) throw new Error('bindAll must be passed function names');
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time. Normally, the throttled function will run
  // as much as it can, without ever going more than once per `wait` duration;
  // but if you'd like to disable the execution on the leading edge, pass
  // `{leading: false}`. To disable execution on the trailing edge, ditto.
  _.throttle = function(func, wait, options) {
    var context, args, result;
    var timeout = null;
    var previous = 0;
    options || (options = {});
    var later = function() {
      previous = options.leading === false ? 0 : _.now();
      timeout = null;
      result = func.apply(context, args);
      context = args = null;
    };
    return function() {
      var now = _.now();
      if (!previous && options.leading === false) previous = now;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0) {
        clearTimeout(timeout);
        timeout = null;
        previous = now;
        result = func.apply(context, args);
        context = args = null;
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout, args, context, timestamp, result;

    var later = function() {
      var last = _.now() - timestamp;
      if (last < wait) {
        timeout = setTimeout(later, wait - last);
      } else {
        timeout = null;
        if (!immediate) {
          result = func.apply(context, args);
          context = args = null;
        }
      }
    };

    return function() {
      context = this;
      args = arguments;
      timestamp = _.now();
      var callNow = immediate && !timeout;
      if (!timeout) {
        timeout = setTimeout(later, wait);
      }
      if (callNow) {
        result = func.apply(context, args);
        context = args = null;
      }

      return result;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      memo = func.apply(this, arguments);
      func = null;
      return memo;
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return _.partial(wrapper, func);
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = function(obj) {
    if (!_.isObject(obj)) return [];
    if (nativeKeys) return nativeKeys(obj);
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys.push(key);
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var values = new Array(length);
    for (var i = 0; i < length; i++) {
      values[i] = obj[keys[i]];
    }
    return values;
  };

  // Convert an object into a list of `[key, value]` pairs.
  _.pairs = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var pairs = new Array(length);
    for (var i = 0; i < length; i++) {
      pairs[i] = [keys[i], obj[keys[i]]];
    }
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    var keys = _.keys(obj);
    for (var i = 0, length = keys.length; i < length; i++) {
      result[obj[keys[i]]] = keys[i];
    }
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    each(keys, function(key) {
      if (key in obj) copy[key] = obj[key];
    });
    return copy;
  };

   // Return a copy of the object without the blacklisted properties.
  _.omit = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    for (var key in obj) {
      if (!_.contains(keys, key)) copy[key] = obj[key];
    }
    return copy;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          if (obj[prop] === void 0) obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function for `isEqual`.
  var eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] == a) return bStack[length] == b;
    }
    // Objects with different constructors are not equivalent, but `Object`s
    // from different frames are.
    var aCtor = a.constructor, bCtor = b.constructor;
    if (aCtor !== bCtor && !(_.isFunction(aCtor) && (aCtor instanceof aCtor) &&
                             _.isFunction(bCtor) && (bCtor instanceof bCtor))
                        && ('constructor' in a && 'constructor' in b)) {
      return false;
    }
    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          if (!(result = eq(a[size], b[size], aStack, bStack))) break;
        }
      }
    } else {
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], aStack, bStack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return result;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, [], []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp.
  each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) == '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Optimize `isFunction` if appropriate.
  if (typeof (/./) !== 'function') {
    _.isFunction = function(obj) {
      return typeof obj === 'function';
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`? (NaN is the only number which does not equal itself).
  _.isNaN = function(obj) {
    return _.isNumber(obj) && obj != +obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  _.constant = function(value) {
    return function () {
      return value;
    };
  };

  _.property = function(key) {
    return function(obj) {
      return obj[key];
    };
  };

  // Returns a predicate for checking whether an object has a given set of `key:value` pairs.
  _.matches = function(attrs) {
    return function(obj) {
      if (obj === attrs) return true; //avoid comparing an object to itself.
      for (var key in attrs) {
        if (attrs[key] !== obj[key])
          return false;
      }
      return true;
    }
  };

  // Run a function **n** times.
  _.times = function(n, iterator, context) {
    var accum = Array(Math.max(0, n));
    for (var i = 0; i < n; i++) accum[i] = iterator.call(context, i);
    return accum;
  };

  // Return a random integer between min and max (inclusive).
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  // A (possibly faster) way to get the current timestamp as an integer.
  _.now = Date.now || function() { return new Date().getTime(); };

  // List of HTML entities for escaping.
  var entityMap = {
    escape: {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;'
    }
  };
  entityMap.unescape = _.invert(entityMap.escape);

  // Regexes containing the keys and values listed immediately above.
  var entityRegexes = {
    escape:   new RegExp('[' + _.keys(entityMap.escape).join('') + ']', 'g'),
    unescape: new RegExp('(' + _.keys(entityMap.unescape).join('|') + ')', 'g')
  };

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  _.each(['escape', 'unescape'], function(method) {
    _[method] = function(string) {
      if (string == null) return '';
      return ('' + string).replace(entityRegexes[method], function(match) {
        return entityMap[method][match];
      });
    };
  });

  // If the value of the named `property` is a function then invoke it with the
  // `object` as context; otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return void 0;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name) {
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return result.call(this, func.apply(_, args));
      };
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = ++idCounter + '';
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'":      "'",
    '\\':     '\\',
    '\r':     'r',
    '\n':     'n',
    '\t':     't',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    var render;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = new RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset)
        .replace(escaper, function(match) { return '\\' + escapes[match]; });

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      }
      if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      }
      if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }
      index = offset + match.length;
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + "return __p;\n";

    try {
      render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var result = function(obj) {
    return this._chain ? _(obj).chain() : obj;
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name == 'shift' || name == 'splice') && obj.length === 0) delete obj[0];
      return result.call(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return result.call(this, method.apply(this._wrapped, arguments));
    };
  });

  _.extend(_.prototype, {

    // Start chaining a wrapped Underscore object.
    chain: function() {
      this._chain = true;
      return this;
    },

    // Extracts the result from a wrapped and chained object.
    value: function() {
      return this._wrapped;
    }

  });

  // AMD registration happens at the end for compatibility with AMD loaders
  // that may not enforce next-turn semantics on modules. Even though general
  // practice for AMD registration is to be anonymous, underscore registers
  // as a named module because, like jQuery, it is a base library that is
  // popular enough to be bundled in a third party lib, but not be part of
  // an AMD load request. Those cases could generate an error when an
  // anonymous define() is called outside of a loader request.
  if (typeof define === 'function' && define.amd) {
    define('underscore', [], function() {
      return _;
    });
  }
}).call(this);

//! moment.js
//! version : 2.6.0
//! authors : Tim Wood, Iskren Chernev, Moment.js contributors
//! license : MIT
//! momentjs.com

(function (undefined) {

    /************************************
        Constants
    ************************************/

    var moment,
        VERSION = "2.6.0",
        // the global-scope this is NOT the global object in Node.js
        globalScope = typeof global !== 'undefined' ? global : this,
        oldGlobalMoment,
        round = Math.round,
        i,

        YEAR = 0,
        MONTH = 1,
        DATE = 2,
        HOUR = 3,
        MINUTE = 4,
        SECOND = 5,
        MILLISECOND = 6,

        // internal storage for language config files
        languages = {},

        // moment internal properties
        momentProperties = {
            _isAMomentObject: null,
            _i : null,
            _f : null,
            _l : null,
            _strict : null,
            _isUTC : null,
            _offset : null,  // optional. Combine with _isUTC
            _pf : null,
            _lang : null  // optional
        },

        // check for nodeJS
        hasModule = (typeof module !== 'undefined' && module.exports),

        // ASP.NET json date format regex
        aspNetJsonRegex = /^\/?Date\((\-?\d+)/i,
        aspNetTimeSpanJsonRegex = /(\-)?(?:(\d*)\.)?(\d+)\:(\d+)(?:\:(\d+)\.?(\d{3})?)?/,

        // from http://docs.closure-library.googlecode.com/git/closure_goog_date_date.js.source.html
        // somewhat more in line with 4.4.3.2 2004 spec, but allows decimal anywhere
        isoDurationRegex = /^(-)?P(?:(?:([0-9,.]*)Y)?(?:([0-9,.]*)M)?(?:([0-9,.]*)D)?(?:T(?:([0-9,.]*)H)?(?:([0-9,.]*)M)?(?:([0-9,.]*)S)?)?|([0-9,.]*)W)$/,

        // format tokens
        formattingTokens = /(\[[^\[]*\])|(\\)?(Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|Q|YYYYYY|YYYYY|YYYY|YY|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|mm?|ss?|S{1,4}|X|zz?|ZZ?|.)/g,
        localFormattingTokens = /(\[[^\[]*\])|(\\)?(LT|LL?L?L?|l{1,4})/g,

        // parsing token regexes
        parseTokenOneOrTwoDigits = /\d\d?/, // 0 - 99
        parseTokenOneToThreeDigits = /\d{1,3}/, // 0 - 999
        parseTokenOneToFourDigits = /\d{1,4}/, // 0 - 9999
        parseTokenOneToSixDigits = /[+\-]?\d{1,6}/, // -999,999 - 999,999
        parseTokenDigits = /\d+/, // nonzero number of digits
        parseTokenWord = /[0-9]*['a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+|[\u0600-\u06FF\/]+(\s*?[\u0600-\u06FF]+){1,2}/i, // any word (or two) characters or numbers including two/three word month in arabic.
        parseTokenTimezone = /Z|[\+\-]\d\d:?\d\d/gi, // +00:00 -00:00 +0000 -0000 or Z
        parseTokenT = /T/i, // T (ISO separator)
        parseTokenTimestampMs = /[\+\-]?\d+(\.\d{1,3})?/, // 123456789 123456789.123
        parseTokenOrdinal = /\d{1,2}/,

        //strict parsing regexes
        parseTokenOneDigit = /\d/, // 0 - 9
        parseTokenTwoDigits = /\d\d/, // 00 - 99
        parseTokenThreeDigits = /\d{3}/, // 000 - 999
        parseTokenFourDigits = /\d{4}/, // 0000 - 9999
        parseTokenSixDigits = /[+-]?\d{6}/, // -999,999 - 999,999
        parseTokenSignedNumber = /[+-]?\d+/, // -inf - inf

        // iso 8601 regex
        // 0000-00-00 0000-W00 or 0000-W00-0 + T + 00 or 00:00 or 00:00:00 or 00:00:00.000 + +00:00 or +0000 or +00)
        isoRegex = /^\s*(?:[+-]\d{6}|\d{4})-(?:(\d\d-\d\d)|(W\d\d$)|(W\d\d-\d)|(\d\d\d))((T| )(\d\d(:\d\d(:\d\d(\.\d+)?)?)?)?([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?$/,

        isoFormat = 'YYYY-MM-DDTHH:mm:ssZ',

        isoDates = [
            ['YYYYYY-MM-DD', /[+-]\d{6}-\d{2}-\d{2}/],
            ['YYYY-MM-DD', /\d{4}-\d{2}-\d{2}/],
            ['GGGG-[W]WW-E', /\d{4}-W\d{2}-\d/],
            ['GGGG-[W]WW', /\d{4}-W\d{2}/],
            ['YYYY-DDD', /\d{4}-\d{3}/]
        ],

        // iso time formats and regexes
        isoTimes = [
            ['HH:mm:ss.SSSS', /(T| )\d\d:\d\d:\d\d\.\d+/],
            ['HH:mm:ss', /(T| )\d\d:\d\d:\d\d/],
            ['HH:mm', /(T| )\d\d:\d\d/],
            ['HH', /(T| )\d\d/]
        ],

        // timezone chunker "+10:00" > ["10", "00"] or "-1530" > ["-15", "30"]
        parseTimezoneChunker = /([\+\-]|\d\d)/gi,

        // getter and setter names
        proxyGettersAndSetters = 'Date|Hours|Minutes|Seconds|Milliseconds'.split('|'),
        unitMillisecondFactors = {
            'Milliseconds' : 1,
            'Seconds' : 1e3,
            'Minutes' : 6e4,
            'Hours' : 36e5,
            'Days' : 864e5,
            'Months' : 2592e6,
            'Years' : 31536e6
        },

        unitAliases = {
            ms : 'millisecond',
            s : 'second',
            m : 'minute',
            h : 'hour',
            d : 'day',
            D : 'date',
            w : 'week',
            W : 'isoWeek',
            M : 'month',
            Q : 'quarter',
            y : 'year',
            DDD : 'dayOfYear',
            e : 'weekday',
            E : 'isoWeekday',
            gg: 'weekYear',
            GG: 'isoWeekYear'
        },

        camelFunctions = {
            dayofyear : 'dayOfYear',
            isoweekday : 'isoWeekday',
            isoweek : 'isoWeek',
            weekyear : 'weekYear',
            isoweekyear : 'isoWeekYear'
        },

        // format function strings
        formatFunctions = {},

        // tokens to ordinalize and pad
        ordinalizeTokens = 'DDD w W M D d'.split(' '),
        paddedTokens = 'M D H h m s w W'.split(' '),

        formatTokenFunctions = {
            M    : function () {
                return this.month() + 1;
            },
            MMM  : function (format) {
                return this.lang().monthsShort(this, format);
            },
            MMMM : function (format) {
                return this.lang().months(this, format);
            },
            D    : function () {
                return this.date();
            },
            DDD  : function () {
                return this.dayOfYear();
            },
            d    : function () {
                return this.day();
            },
            dd   : function (format) {
                return this.lang().weekdaysMin(this, format);
            },
            ddd  : function (format) {
                return this.lang().weekdaysShort(this, format);
            },
            dddd : function (format) {
                return this.lang().weekdays(this, format);
            },
            w    : function () {
                return this.week();
            },
            W    : function () {
                return this.isoWeek();
            },
            YY   : function () {
                return leftZeroFill(this.year() % 100, 2);
            },
            YYYY : function () {
                return leftZeroFill(this.year(), 4);
            },
            YYYYY : function () {
                return leftZeroFill(this.year(), 5);
            },
            YYYYYY : function () {
                var y = this.year(), sign = y >= 0 ? '+' : '-';
                return sign + leftZeroFill(Math.abs(y), 6);
            },
            gg   : function () {
                return leftZeroFill(this.weekYear() % 100, 2);
            },
            gggg : function () {
                return leftZeroFill(this.weekYear(), 4);
            },
            ggggg : function () {
                return leftZeroFill(this.weekYear(), 5);
            },
            GG   : function () {
                return leftZeroFill(this.isoWeekYear() % 100, 2);
            },
            GGGG : function () {
                return leftZeroFill(this.isoWeekYear(), 4);
            },
            GGGGG : function () {
                return leftZeroFill(this.isoWeekYear(), 5);
            },
            e : function () {
                return this.weekday();
            },
            E : function () {
                return this.isoWeekday();
            },
            a    : function () {
                return this.lang().meridiem(this.hours(), this.minutes(), true);
            },
            A    : function () {
                return this.lang().meridiem(this.hours(), this.minutes(), false);
            },
            H    : function () {
                return this.hours();
            },
            h    : function () {
                return this.hours() % 12 || 12;
            },
            m    : function () {
                return this.minutes();
            },
            s    : function () {
                return this.seconds();
            },
            S    : function () {
                return toInt(this.milliseconds() / 100);
            },
            SS   : function () {
                return leftZeroFill(toInt(this.milliseconds() / 10), 2);
            },
            SSS  : function () {
                return leftZeroFill(this.milliseconds(), 3);
            },
            SSSS : function () {
                return leftZeroFill(this.milliseconds(), 3);
            },
            Z    : function () {
                var a = -this.zone(),
                    b = "+";
                if (a < 0) {
                    a = -a;
                    b = "-";
                }
                return b + leftZeroFill(toInt(a / 60), 2) + ":" + leftZeroFill(toInt(a) % 60, 2);
            },
            ZZ   : function () {
                var a = -this.zone(),
                    b = "+";
                if (a < 0) {
                    a = -a;
                    b = "-";
                }
                return b + leftZeroFill(toInt(a / 60), 2) + leftZeroFill(toInt(a) % 60, 2);
            },
            z : function () {
                return this.zoneAbbr();
            },
            zz : function () {
                return this.zoneName();
            },
            X    : function () {
                return this.unix();
            },
            Q : function () {
                return this.quarter();
            }
        },

        lists = ['months', 'monthsShort', 'weekdays', 'weekdaysShort', 'weekdaysMin'];

    function defaultParsingFlags() {
        // We need to deep clone this object, and es5 standard is not very
        // helpful.
        return {
            empty : false,
            unusedTokens : [],
            unusedInput : [],
            overflow : -2,
            charsLeftOver : 0,
            nullInput : false,
            invalidMonth : null,
            invalidFormat : false,
            userInvalidated : false,
            iso: false
        };
    }

    function deprecate(msg, fn) {
        var firstTime = true;
        function printMsg() {
            if (moment.suppressDeprecationWarnings === false &&
                    typeof console !== 'undefined' && console.warn) {
                console.warn("Deprecation warning: " + msg);
            }
        }
        return extend(function () {
            if (firstTime) {
                printMsg();
                firstTime = false;
            }
            return fn.apply(this, arguments);
        }, fn);
    }

    function padToken(func, count) {
        return function (a) {
            return leftZeroFill(func.call(this, a), count);
        };
    }
    function ordinalizeToken(func, period) {
        return function (a) {
            return this.lang().ordinal(func.call(this, a), period);
        };
    }

    while (ordinalizeTokens.length) {
        i = ordinalizeTokens.pop();
        formatTokenFunctions[i + 'o'] = ordinalizeToken(formatTokenFunctions[i], i);
    }
    while (paddedTokens.length) {
        i = paddedTokens.pop();
        formatTokenFunctions[i + i] = padToken(formatTokenFunctions[i], 2);
    }
    formatTokenFunctions.DDDD = padToken(formatTokenFunctions.DDD, 3);


    /************************************
        Constructors
    ************************************/

    function Language() {

    }

    // Moment prototype object
    function Moment(config) {
        checkOverflow(config);
        extend(this, config);
    }

    // Duration Constructor
    function Duration(duration) {
        var normalizedInput = normalizeObjectUnits(duration),
            years = normalizedInput.year || 0,
            quarters = normalizedInput.quarter || 0,
            months = normalizedInput.month || 0,
            weeks = normalizedInput.week || 0,
            days = normalizedInput.day || 0,
            hours = normalizedInput.hour || 0,
            minutes = normalizedInput.minute || 0,
            seconds = normalizedInput.second || 0,
            milliseconds = normalizedInput.millisecond || 0;

        // representation for dateAddRemove
        this._milliseconds = +milliseconds +
            seconds * 1e3 + // 1000
            minutes * 6e4 + // 1000 * 60
            hours * 36e5; // 1000 * 60 * 60
        // Because of dateAddRemove treats 24 hours as different from a
        // day when working around DST, we need to store them separately
        this._days = +days +
            weeks * 7;
        // It is impossible translate months into days without knowing
        // which months you are are talking about, so we have to store
        // it separately.
        this._months = +months +
            quarters * 3 +
            years * 12;

        this._data = {};

        this._bubble();
    }

    /************************************
        Helpers
    ************************************/


    function extend(a, b) {
        for (var i in b) {
            if (b.hasOwnProperty(i)) {
                a[i] = b[i];
            }
        }

        if (b.hasOwnProperty("toString")) {
            a.toString = b.toString;
        }

        if (b.hasOwnProperty("valueOf")) {
            a.valueOf = b.valueOf;
        }

        return a;
    }

    function cloneMoment(m) {
        var result = {}, i;
        for (i in m) {
            if (m.hasOwnProperty(i) && momentProperties.hasOwnProperty(i)) {
                result[i] = m[i];
            }
        }

        return result;
    }

    function absRound(number) {
        if (number < 0) {
            return Math.ceil(number);
        } else {
            return Math.floor(number);
        }
    }

    // left zero fill a number
    // see http://jsperf.com/left-zero-filling for performance comparison
    function leftZeroFill(number, targetLength, forceSign) {
        var output = '' + Math.abs(number),
            sign = number >= 0;

        while (output.length < targetLength) {
            output = '0' + output;
        }
        return (sign ? (forceSign ? '+' : '') : '-') + output;
    }

    // helper function for _.addTime and _.subtractTime
    function addOrSubtractDurationFromMoment(mom, duration, isAdding, updateOffset) {
        var milliseconds = duration._milliseconds,
            days = duration._days,
            months = duration._months;
        updateOffset = updateOffset == null ? true : updateOffset;

        if (milliseconds) {
            mom._d.setTime(+mom._d + milliseconds * isAdding);
        }
        if (days) {
            rawSetter(mom, 'Date', rawGetter(mom, 'Date') + days * isAdding);
        }
        if (months) {
            rawMonthSetter(mom, rawGetter(mom, 'Month') + months * isAdding);
        }
        if (updateOffset) {
            moment.updateOffset(mom, days || months);
        }
    }

    // check if is an array
    function isArray(input) {
        return Object.prototype.toString.call(input) === '[object Array]';
    }

    function isDate(input) {
        return  Object.prototype.toString.call(input) === '[object Date]' ||
                input instanceof Date;
    }

    // compare two arrays, return the number of differences
    function compareArrays(array1, array2, dontConvert) {
        var len = Math.min(array1.length, array2.length),
            lengthDiff = Math.abs(array1.length - array2.length),
            diffs = 0,
            i;
        for (i = 0; i < len; i++) {
            if ((dontConvert && array1[i] !== array2[i]) ||
                (!dontConvert && toInt(array1[i]) !== toInt(array2[i]))) {
                diffs++;
            }
        }
        return diffs + lengthDiff;
    }

    function normalizeUnits(units) {
        if (units) {
            var lowered = units.toLowerCase().replace(/(.)s$/, '$1');
            units = unitAliases[units] || camelFunctions[lowered] || lowered;
        }
        return units;
    }

    function normalizeObjectUnits(inputObject) {
        var normalizedInput = {},
            normalizedProp,
            prop;

        for (prop in inputObject) {
            if (inputObject.hasOwnProperty(prop)) {
                normalizedProp = normalizeUnits(prop);
                if (normalizedProp) {
                    normalizedInput[normalizedProp] = inputObject[prop];
                }
            }
        }

        return normalizedInput;
    }

    function makeList(field) {
        var count, setter;

        if (field.indexOf('week') === 0) {
            count = 7;
            setter = 'day';
        }
        else if (field.indexOf('month') === 0) {
            count = 12;
            setter = 'month';
        }
        else {
            return;
        }

        moment[field] = function (format, index) {
            var i, getter,
                method = moment.fn._lang[field],
                results = [];

            if (typeof format === 'number') {
                index = format;
                format = undefined;
            }

            getter = function (i) {
                var m = moment().utc().set(setter, i);
                return method.call(moment.fn._lang, m, format || '');
            };

            if (index != null) {
                return getter(index);
            }
            else {
                for (i = 0; i < count; i++) {
                    results.push(getter(i));
                }
                return results;
            }
        };
    }

    function toInt(argumentForCoercion) {
        var coercedNumber = +argumentForCoercion,
            value = 0;

        if (coercedNumber !== 0 && isFinite(coercedNumber)) {
            if (coercedNumber >= 0) {
                value = Math.floor(coercedNumber);
            } else {
                value = Math.ceil(coercedNumber);
            }
        }

        return value;
    }

    function daysInMonth(year, month) {
        return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    }

    function weeksInYear(year, dow, doy) {
        return weekOfYear(moment([year, 11, 31 + dow - doy]), dow, doy).week;
    }

    function daysInYear(year) {
        return isLeapYear(year) ? 366 : 365;
    }

    function isLeapYear(year) {
        return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    }

    function checkOverflow(m) {
        var overflow;
        if (m._a && m._pf.overflow === -2) {
            overflow =
                m._a[MONTH] < 0 || m._a[MONTH] > 11 ? MONTH :
                m._a[DATE] < 1 || m._a[DATE] > daysInMonth(m._a[YEAR], m._a[MONTH]) ? DATE :
                m._a[HOUR] < 0 || m._a[HOUR] > 23 ? HOUR :
                m._a[MINUTE] < 0 || m._a[MINUTE] > 59 ? MINUTE :
                m._a[SECOND] < 0 || m._a[SECOND] > 59 ? SECOND :
                m._a[MILLISECOND] < 0 || m._a[MILLISECOND] > 999 ? MILLISECOND :
                -1;

            if (m._pf._overflowDayOfYear && (overflow < YEAR || overflow > DATE)) {
                overflow = DATE;
            }

            m._pf.overflow = overflow;
        }
    }

    function isValid(m) {
        if (m._isValid == null) {
            m._isValid = !isNaN(m._d.getTime()) &&
                m._pf.overflow < 0 &&
                !m._pf.empty &&
                !m._pf.invalidMonth &&
                !m._pf.nullInput &&
                !m._pf.invalidFormat &&
                !m._pf.userInvalidated;

            if (m._strict) {
                m._isValid = m._isValid &&
                    m._pf.charsLeftOver === 0 &&
                    m._pf.unusedTokens.length === 0;
            }
        }
        return m._isValid;
    }

    function normalizeLanguage(key) {
        return key ? key.toLowerCase().replace('_', '-') : key;
    }

    // Return a moment from input, that is local/utc/zone equivalent to model.
    function makeAs(input, model) {
        return model._isUTC ? moment(input).zone(model._offset || 0) :
            moment(input).local();
    }

    /************************************
        Languages
    ************************************/


    extend(Language.prototype, {

        set : function (config) {
            var prop, i;
            for (i in config) {
                prop = config[i];
                if (typeof prop === 'function') {
                    this[i] = prop;
                } else {
                    this['_' + i] = prop;
                }
            }
        },

        _months : "January_February_March_April_May_June_July_August_September_October_November_December".split("_"),
        months : function (m) {
            return this._months[m.month()];
        },

        _monthsShort : "Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec".split("_"),
        monthsShort : function (m) {
            return this._monthsShort[m.month()];
        },

        monthsParse : function (monthName) {
            var i, mom, regex;

            if (!this._monthsParse) {
                this._monthsParse = [];
            }

            for (i = 0; i < 12; i++) {
                // make the regex if we don't have it already
                if (!this._monthsParse[i]) {
                    mom = moment.utc([2000, i]);
                    regex = '^' + this.months(mom, '') + '|^' + this.monthsShort(mom, '');
                    this._monthsParse[i] = new RegExp(regex.replace('.', ''), 'i');
                }
                // test the regex
                if (this._monthsParse[i].test(monthName)) {
                    return i;
                }
            }
        },

        _weekdays : "Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split("_"),
        weekdays : function (m) {
            return this._weekdays[m.day()];
        },

        _weekdaysShort : "Sun_Mon_Tue_Wed_Thu_Fri_Sat".split("_"),
        weekdaysShort : function (m) {
            return this._weekdaysShort[m.day()];
        },

        _weekdaysMin : "Su_Mo_Tu_We_Th_Fr_Sa".split("_"),
        weekdaysMin : function (m) {
            return this._weekdaysMin[m.day()];
        },

        weekdaysParse : function (weekdayName) {
            var i, mom, regex;

            if (!this._weekdaysParse) {
                this._weekdaysParse = [];
            }

            for (i = 0; i < 7; i++) {
                // make the regex if we don't have it already
                if (!this._weekdaysParse[i]) {
                    mom = moment([2000, 1]).day(i);
                    regex = '^' + this.weekdays(mom, '') + '|^' + this.weekdaysShort(mom, '') + '|^' + this.weekdaysMin(mom, '');
                    this._weekdaysParse[i] = new RegExp(regex.replace('.', ''), 'i');
                }
                // test the regex
                if (this._weekdaysParse[i].test(weekdayName)) {
                    return i;
                }
            }
        },

        _longDateFormat : {
            LT : "h:mm A",
            L : "MM/DD/YYYY",
            LL : "MMMM D YYYY",
            LLL : "MMMM D YYYY LT",
            LLLL : "dddd, MMMM D YYYY LT"
        },
        longDateFormat : function (key) {
            var output = this._longDateFormat[key];
            if (!output && this._longDateFormat[key.toUpperCase()]) {
                output = this._longDateFormat[key.toUpperCase()].replace(/MMMM|MM|DD|dddd/g, function (val) {
                    return val.slice(1);
                });
                this._longDateFormat[key] = output;
            }
            return output;
        },

        isPM : function (input) {
            // IE8 Quirks Mode & IE7 Standards Mode do not allow accessing strings like arrays
            // Using charAt should be more compatible.
            return ((input + '').toLowerCase().charAt(0) === 'p');
        },

        _meridiemParse : /[ap]\.?m?\.?/i,
        meridiem : function (hours, minutes, isLower) {
            if (hours > 11) {
                return isLower ? 'pm' : 'PM';
            } else {
                return isLower ? 'am' : 'AM';
            }
        },

        _calendar : {
            sameDay : '[Today at] LT',
            nextDay : '[Tomorrow at] LT',
            nextWeek : 'dddd [at] LT',
            lastDay : '[Yesterday at] LT',
            lastWeek : '[Last] dddd [at] LT',
            sameElse : 'L'
        },
        calendar : function (key, mom) {
            var output = this._calendar[key];
            return typeof output === 'function' ? output.apply(mom) : output;
        },

        _relativeTime : {
            future : "in %s",
            past : "%s ago",
            s : "a few seconds",
            m : "a minute",
            mm : "%d minutes",
            h : "an hour",
            hh : "%d hours",
            d : "a day",
            dd : "%d days",
            M : "a month",
            MM : "%d months",
            y : "a year",
            yy : "%d years"
        },
        relativeTime : function (number, withoutSuffix, string, isFuture) {
            var output = this._relativeTime[string];
            return (typeof output === 'function') ?
                output(number, withoutSuffix, string, isFuture) :
                output.replace(/%d/i, number);
        },
        pastFuture : function (diff, output) {
            var format = this._relativeTime[diff > 0 ? 'future' : 'past'];
            return typeof format === 'function' ? format(output) : format.replace(/%s/i, output);
        },

        ordinal : function (number) {
            return this._ordinal.replace("%d", number);
        },
        _ordinal : "%d",

        preparse : function (string) {
            return string;
        },

        postformat : function (string) {
            return string;
        },

        week : function (mom) {
            return weekOfYear(mom, this._week.dow, this._week.doy).week;
        },

        _week : {
            dow : 0, // Sunday is the first day of the week.
            doy : 6  // The week that contains Jan 1st is the first week of the year.
        },

        _invalidDate: 'Invalid date',
        invalidDate: function () {
            return this._invalidDate;
        }
    });

    // Loads a language definition into the `languages` cache.  The function
    // takes a key and optionally values.  If not in the browser and no values
    // are provided, it will load the language file module.  As a convenience,
    // this function also returns the language values.
    function loadLang(key, values) {
        values.abbr = key;
        if (!languages[key]) {
            languages[key] = new Language();
        }
        languages[key].set(values);
        return languages[key];
    }

    // Remove a language from the `languages` cache. Mostly useful in tests.
    function unloadLang(key) {
        delete languages[key];
    }

    // Determines which language definition to use and returns it.
    //
    // With no parameters, it will return the global language.  If you
    // pass in a language key, such as 'en', it will return the
    // definition for 'en', so long as 'en' has already been loaded using
    // moment.lang.
    function getLangDefinition(key) {
        var i = 0, j, lang, next, split,
            get = function (k) {
                if (!languages[k] && hasModule) {
                    try {
                        require('./lang/' + k);
                    } catch (e) { }
                }
                return languages[k];
            };

        if (!key) {
            return moment.fn._lang;
        }

        if (!isArray(key)) {
            //short-circuit everything else
            lang = get(key);
            if (lang) {
                return lang;
            }
            key = [key];
        }

        //pick the language from the array
        //try ['en-au', 'en-gb'] as 'en-au', 'en-gb', 'en', as in move through the list trying each
        //substring from most specific to least, but move to the next array item if it's a more specific variant than the current root
        while (i < key.length) {
            split = normalizeLanguage(key[i]).split('-');
            j = split.length;
            next = normalizeLanguage(key[i + 1]);
            next = next ? next.split('-') : null;
            while (j > 0) {
                lang = get(split.slice(0, j).join('-'));
                if (lang) {
                    return lang;
                }
                if (next && next.length >= j && compareArrays(split, next, true) >= j - 1) {
                    //the next array item is better than a shallower substring of this one
                    break;
                }
                j--;
            }
            i++;
        }
        return moment.fn._lang;
    }

    /************************************
        Formatting
    ************************************/


    function removeFormattingTokens(input) {
        if (input.match(/\[[\s\S]/)) {
            return input.replace(/^\[|\]$/g, "");
        }
        return input.replace(/\\/g, "");
    }

    function makeFormatFunction(format) {
        var array = format.match(formattingTokens), i, length;

        for (i = 0, length = array.length; i < length; i++) {
            if (formatTokenFunctions[array[i]]) {
                array[i] = formatTokenFunctions[array[i]];
            } else {
                array[i] = removeFormattingTokens(array[i]);
            }
        }

        return function (mom) {
            var output = "";
            for (i = 0; i < length; i++) {
                output += array[i] instanceof Function ? array[i].call(mom, format) : array[i];
            }
            return output;
        };
    }

    // format date using native date object
    function formatMoment(m, format) {

        if (!m.isValid()) {
            return m.lang().invalidDate();
        }

        format = expandFormat(format, m.lang());

        if (!formatFunctions[format]) {
            formatFunctions[format] = makeFormatFunction(format);
        }

        return formatFunctions[format](m);
    }

    function expandFormat(format, lang) {
        var i = 5;

        function replaceLongDateFormatTokens(input) {
            return lang.longDateFormat(input) || input;
        }

        localFormattingTokens.lastIndex = 0;
        while (i >= 0 && localFormattingTokens.test(format)) {
            format = format.replace(localFormattingTokens, replaceLongDateFormatTokens);
            localFormattingTokens.lastIndex = 0;
            i -= 1;
        }

        return format;
    }


    /************************************
        Parsing
    ************************************/


    // get the regex to find the next token
    function getParseRegexForToken(token, config) {
        var a, strict = config._strict;
        switch (token) {
        case 'Q':
            return parseTokenOneDigit;
        case 'DDDD':
            return parseTokenThreeDigits;
        case 'YYYY':
        case 'GGGG':
        case 'gggg':
            return strict ? parseTokenFourDigits : parseTokenOneToFourDigits;
        case 'Y':
        case 'G':
        case 'g':
            return parseTokenSignedNumber;
        case 'YYYYYY':
        case 'YYYYY':
        case 'GGGGG':
        case 'ggggg':
            return strict ? parseTokenSixDigits : parseTokenOneToSixDigits;
        case 'S':
            if (strict) { return parseTokenOneDigit; }
            /* falls through */
        case 'SS':
            if (strict) { return parseTokenTwoDigits; }
            /* falls through */
        case 'SSS':
            if (strict) { return parseTokenThreeDigits; }
            /* falls through */
        case 'DDD':
            return parseTokenOneToThreeDigits;
        case 'MMM':
        case 'MMMM':
        case 'dd':
        case 'ddd':
        case 'dddd':
            return parseTokenWord;
        case 'a':
        case 'A':
            return getLangDefinition(config._l)._meridiemParse;
        case 'X':
            return parseTokenTimestampMs;
        case 'Z':
        case 'ZZ':
            return parseTokenTimezone;
        case 'T':
            return parseTokenT;
        case 'SSSS':
            return parseTokenDigits;
        case 'MM':
        case 'DD':
        case 'YY':
        case 'GG':
        case 'gg':
        case 'HH':
        case 'hh':
        case 'mm':
        case 'ss':
        case 'ww':
        case 'WW':
            return strict ? parseTokenTwoDigits : parseTokenOneOrTwoDigits;
        case 'M':
        case 'D':
        case 'd':
        case 'H':
        case 'h':
        case 'm':
        case 's':
        case 'w':
        case 'W':
        case 'e':
        case 'E':
            return parseTokenOneOrTwoDigits;
        case 'Do':
            return parseTokenOrdinal;
        default :
            a = new RegExp(regexpEscape(unescapeFormat(token.replace('\\', '')), "i"));
            return a;
        }
    }

    function timezoneMinutesFromString(string) {
        string = string || "";
        var possibleTzMatches = (string.match(parseTokenTimezone) || []),
            tzChunk = possibleTzMatches[possibleTzMatches.length - 1] || [],
            parts = (tzChunk + '').match(parseTimezoneChunker) || ['-', 0, 0],
            minutes = +(parts[1] * 60) + toInt(parts[2]);

        return parts[0] === '+' ? -minutes : minutes;
    }

    // function to convert string input to date
    function addTimeToArrayFromToken(token, input, config) {
        var a, datePartArray = config._a;

        switch (token) {
        // QUARTER
        case 'Q':
            if (input != null) {
                datePartArray[MONTH] = (toInt(input) - 1) * 3;
            }
            break;
        // MONTH
        case 'M' : // fall through to MM
        case 'MM' :
            if (input != null) {
                datePartArray[MONTH] = toInt(input) - 1;
            }
            break;
        case 'MMM' : // fall through to MMMM
        case 'MMMM' :
            a = getLangDefinition(config._l).monthsParse(input);
            // if we didn't find a month name, mark the date as invalid.
            if (a != null) {
                datePartArray[MONTH] = a;
            } else {
                config._pf.invalidMonth = input;
            }
            break;
        // DAY OF MONTH
        case 'D' : // fall through to DD
        case 'DD' :
            if (input != null) {
                datePartArray[DATE] = toInt(input);
            }
            break;
        case 'Do' :
            if (input != null) {
                datePartArray[DATE] = toInt(parseInt(input, 10));
            }
            break;
        // DAY OF YEAR
        case 'DDD' : // fall through to DDDD
        case 'DDDD' :
            if (input != null) {
                config._dayOfYear = toInt(input);
            }

            break;
        // YEAR
        case 'YY' :
            datePartArray[YEAR] = moment.parseTwoDigitYear(input);
            break;
        case 'YYYY' :
        case 'YYYYY' :
        case 'YYYYYY' :
            datePartArray[YEAR] = toInt(input);
            break;
        // AM / PM
        case 'a' : // fall through to A
        case 'A' :
            config._isPm = getLangDefinition(config._l).isPM(input);
            break;
        // 24 HOUR
        case 'H' : // fall through to hh
        case 'HH' : // fall through to hh
        case 'h' : // fall through to hh
        case 'hh' :
            datePartArray[HOUR] = toInt(input);
            break;
        // MINUTE
        case 'm' : // fall through to mm
        case 'mm' :
            datePartArray[MINUTE] = toInt(input);
            break;
        // SECOND
        case 's' : // fall through to ss
        case 'ss' :
            datePartArray[SECOND] = toInt(input);
            break;
        // MILLISECOND
        case 'S' :
        case 'SS' :
        case 'SSS' :
        case 'SSSS' :
            datePartArray[MILLISECOND] = toInt(('0.' + input) * 1000);
            break;
        // UNIX TIMESTAMP WITH MS
        case 'X':
            config._d = new Date(parseFloat(input) * 1000);
            break;
        // TIMEZONE
        case 'Z' : // fall through to ZZ
        case 'ZZ' :
            config._useUTC = true;
            config._tzm = timezoneMinutesFromString(input);
            break;
        case 'w':
        case 'ww':
        case 'W':
        case 'WW':
        case 'd':
        case 'dd':
        case 'ddd':
        case 'dddd':
        case 'e':
        case 'E':
            token = token.substr(0, 1);
            /* falls through */
        case 'gg':
        case 'gggg':
        case 'GG':
        case 'GGGG':
        case 'GGGGG':
            token = token.substr(0, 2);
            if (input) {
                config._w = config._w || {};
                config._w[token] = input;
            }
            break;
        }
    }

    // convert an array to a date.
    // the array should mirror the parameters below
    // note: all values past the year are optional and will default to the lowest possible value.
    // [year, month, day , hour, minute, second, millisecond]
    function dateFromConfig(config) {
        var i, date, input = [], currentDate,
            yearToUse, fixYear, w, temp, lang, weekday, week;

        if (config._d) {
            return;
        }

        currentDate = currentDateArray(config);

        //compute day of the year from weeks and weekdays
        if (config._w && config._a[DATE] == null && config._a[MONTH] == null) {
            fixYear = function (val) {
                var intVal = parseInt(val, 10);
                return val ?
                  (val.length < 3 ? (intVal > 68 ? 1900 + intVal : 2000 + intVal) : intVal) :
                  (config._a[YEAR] == null ? moment().weekYear() : config._a[YEAR]);
            };

            w = config._w;
            if (w.GG != null || w.W != null || w.E != null) {
                temp = dayOfYearFromWeeks(fixYear(w.GG), w.W || 1, w.E, 4, 1);
            }
            else {
                lang = getLangDefinition(config._l);
                weekday = w.d != null ?  parseWeekday(w.d, lang) :
                  (w.e != null ?  parseInt(w.e, 10) + lang._week.dow : 0);

                week = parseInt(w.w, 10) || 1;

                //if we're parsing 'd', then the low day numbers may be next week
                if (w.d != null && weekday < lang._week.dow) {
                    week++;
                }

                temp = dayOfYearFromWeeks(fixYear(w.gg), week, weekday, lang._week.doy, lang._week.dow);
            }

            config._a[YEAR] = temp.year;
            config._dayOfYear = temp.dayOfYear;
        }

        //if the day of the year is set, figure out what it is
        if (config._dayOfYear) {
            yearToUse = config._a[YEAR] == null ? currentDate[YEAR] : config._a[YEAR];

            if (config._dayOfYear > daysInYear(yearToUse)) {
                config._pf._overflowDayOfYear = true;
            }

            date = makeUTCDate(yearToUse, 0, config._dayOfYear);
            config._a[MONTH] = date.getUTCMonth();
            config._a[DATE] = date.getUTCDate();
        }

        // Default to current date.
        // * if no year, month, day of month are given, default to today
        // * if day of month is given, default month and year
        // * if month is given, default only year
        // * if year is given, don't default anything
        for (i = 0; i < 3 && config._a[i] == null; ++i) {
            config._a[i] = input[i] = currentDate[i];
        }

        // Zero out whatever was not defaulted, including time
        for (; i < 7; i++) {
            config._a[i] = input[i] = (config._a[i] == null) ? (i === 2 ? 1 : 0) : config._a[i];
        }

        // add the offsets to the time to be parsed so that we can have a clean array for checking isValid
        input[HOUR] += toInt((config._tzm || 0) / 60);
        input[MINUTE] += toInt((config._tzm || 0) % 60);

        config._d = (config._useUTC ? makeUTCDate : makeDate).apply(null, input);
    }

    function dateFromObject(config) {
        var normalizedInput;

        if (config._d) {
            return;
        }

        normalizedInput = normalizeObjectUnits(config._i);
        config._a = [
            normalizedInput.year,
            normalizedInput.month,
            normalizedInput.day,
            normalizedInput.hour,
            normalizedInput.minute,
            normalizedInput.second,
            normalizedInput.millisecond
        ];

        dateFromConfig(config);
    }

    function currentDateArray(config) {
        var now = new Date();
        if (config._useUTC) {
            return [
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate()
            ];
        } else {
            return [now.getFullYear(), now.getMonth(), now.getDate()];
        }
    }

    // date from string and format string
    function makeDateFromStringAndFormat(config) {

        config._a = [];
        config._pf.empty = true;

        // This array is used to make a Date, either with `new Date` or `Date.UTC`
        var lang = getLangDefinition(config._l),
            string = '' + config._i,
            i, parsedInput, tokens, token, skipped,
            stringLength = string.length,
            totalParsedInputLength = 0;

        tokens = expandFormat(config._f, lang).match(formattingTokens) || [];

        for (i = 0; i < tokens.length; i++) {
            token = tokens[i];
            parsedInput = (string.match(getParseRegexForToken(token, config)) || [])[0];
            if (parsedInput) {
                skipped = string.substr(0, string.indexOf(parsedInput));
                if (skipped.length > 0) {
                    config._pf.unusedInput.push(skipped);
                }
                string = string.slice(string.indexOf(parsedInput) + parsedInput.length);
                totalParsedInputLength += parsedInput.length;
            }
            // don't parse if it's not a known token
            if (formatTokenFunctions[token]) {
                if (parsedInput) {
                    config._pf.empty = false;
                }
                else {
                    config._pf.unusedTokens.push(token);
                }
                addTimeToArrayFromToken(token, parsedInput, config);
            }
            else if (config._strict && !parsedInput) {
                config._pf.unusedTokens.push(token);
            }
        }

        // add remaining unparsed input length to the string
        config._pf.charsLeftOver = stringLength - totalParsedInputLength;
        if (string.length > 0) {
            config._pf.unusedInput.push(string);
        }

        // handle am pm
        if (config._isPm && config._a[HOUR] < 12) {
            config._a[HOUR] += 12;
        }
        // if is 12 am, change hours to 0
        if (config._isPm === false && config._a[HOUR] === 12) {
            config._a[HOUR] = 0;
        }

        dateFromConfig(config);
        checkOverflow(config);
    }

    function unescapeFormat(s) {
        return s.replace(/\\(\[)|\\(\])|\[([^\]\[]*)\]|\\(.)/g, function (matched, p1, p2, p3, p4) {
            return p1 || p2 || p3 || p4;
        });
    }

    // Code from http://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
    function regexpEscape(s) {
        return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }

    // date from string and array of format strings
    function makeDateFromStringAndArray(config) {
        var tempConfig,
            bestMoment,

            scoreToBeat,
            i,
            currentScore;

        if (config._f.length === 0) {
            config._pf.invalidFormat = true;
            config._d = new Date(NaN);
            return;
        }

        for (i = 0; i < config._f.length; i++) {
            currentScore = 0;
            tempConfig = extend({}, config);
            tempConfig._pf = defaultParsingFlags();
            tempConfig._f = config._f[i];
            makeDateFromStringAndFormat(tempConfig);

            if (!isValid(tempConfig)) {
                continue;
            }

            // if there is any input that was not parsed add a penalty for that format
            currentScore += tempConfig._pf.charsLeftOver;

            //or tokens
            currentScore += tempConfig._pf.unusedTokens.length * 10;

            tempConfig._pf.score = currentScore;

            if (scoreToBeat == null || currentScore < scoreToBeat) {
                scoreToBeat = currentScore;
                bestMoment = tempConfig;
            }
        }

        extend(config, bestMoment || tempConfig);
    }

    // date from iso format
    function makeDateFromString(config) {
        var i, l,
            string = config._i,
            match = isoRegex.exec(string);

        if (match) {
            config._pf.iso = true;
            for (i = 0, l = isoDates.length; i < l; i++) {
                if (isoDates[i][1].exec(string)) {
                    // match[5] should be "T" or undefined
                    config._f = isoDates[i][0] + (match[6] || " ");
                    break;
                }
            }
            for (i = 0, l = isoTimes.length; i < l; i++) {
                if (isoTimes[i][1].exec(string)) {
                    config._f += isoTimes[i][0];
                    break;
                }
            }
            if (string.match(parseTokenTimezone)) {
                config._f += "Z";
            }
            makeDateFromStringAndFormat(config);
        }
        else {
            moment.createFromInputFallback(config);
        }
    }

    function makeDateFromInput(config) {
        var input = config._i,
            matched = aspNetJsonRegex.exec(input);

        if (input === undefined) {
            config._d = new Date();
        } else if (matched) {
            config._d = new Date(+matched[1]);
        } else if (typeof input === 'string') {
            makeDateFromString(config);
        } else if (isArray(input)) {
            config._a = input.slice(0);
            dateFromConfig(config);
        } else if (isDate(input)) {
            config._d = new Date(+input);
        } else if (typeof(input) === 'object') {
            dateFromObject(config);
        } else if (typeof(input) === 'number') {
            // from milliseconds
            config._d = new Date(input);
        } else {
            moment.createFromInputFallback(config);
        }
    }

    function makeDate(y, m, d, h, M, s, ms) {
        //can't just apply() to create a date:
        //http://stackoverflow.com/questions/181348/instantiating-a-javascript-object-by-calling-prototype-constructor-apply
        var date = new Date(y, m, d, h, M, s, ms);

        //the date constructor doesn't accept years < 1970
        if (y < 1970) {
            date.setFullYear(y);
        }
        return date;
    }

    function makeUTCDate(y) {
        var date = new Date(Date.UTC.apply(null, arguments));
        if (y < 1970) {
            date.setUTCFullYear(y);
        }
        return date;
    }

    function parseWeekday(input, language) {
        if (typeof input === 'string') {
            if (!isNaN(input)) {
                input = parseInt(input, 10);
            }
            else {
                input = language.weekdaysParse(input);
                if (typeof input !== 'number') {
                    return null;
                }
            }
        }
        return input;
    }

    /************************************
        Relative Time
    ************************************/


    // helper function for moment.fn.from, moment.fn.fromNow, and moment.duration.fn.humanize
    function substituteTimeAgo(string, number, withoutSuffix, isFuture, lang) {
        return lang.relativeTime(number || 1, !!withoutSuffix, string, isFuture);
    }

    function relativeTime(milliseconds, withoutSuffix, lang) {
        var seconds = round(Math.abs(milliseconds) / 1000),
            minutes = round(seconds / 60),
            hours = round(minutes / 60),
            days = round(hours / 24),
            years = round(days / 365),
            args = seconds < 45 && ['s', seconds] ||
                minutes === 1 && ['m'] ||
                minutes < 45 && ['mm', minutes] ||
                hours === 1 && ['h'] ||
                hours < 22 && ['hh', hours] ||
                days === 1 && ['d'] ||
                days <= 25 && ['dd', days] ||
                days <= 45 && ['M'] ||
                days < 345 && ['MM', round(days / 30)] ||
                years === 1 && ['y'] || ['yy', years];
        args[2] = withoutSuffix;
        args[3] = milliseconds > 0;
        args[4] = lang;
        return substituteTimeAgo.apply({}, args);
    }


    /************************************
        Week of Year
    ************************************/


    // firstDayOfWeek       0 = sun, 6 = sat
    //                      the day of the week that starts the week
    //                      (usually sunday or monday)
    // firstDayOfWeekOfYear 0 = sun, 6 = sat
    //                      the first week is the week that contains the first
    //                      of this day of the week
    //                      (eg. ISO weeks use thursday (4))
    function weekOfYear(mom, firstDayOfWeek, firstDayOfWeekOfYear) {
        var end = firstDayOfWeekOfYear - firstDayOfWeek,
            daysToDayOfWeek = firstDayOfWeekOfYear - mom.day(),
            adjustedMoment;


        if (daysToDayOfWeek > end) {
            daysToDayOfWeek -= 7;
        }

        if (daysToDayOfWeek < end - 7) {
            daysToDayOfWeek += 7;
        }

        adjustedMoment = moment(mom).add('d', daysToDayOfWeek);
        return {
            week: Math.ceil(adjustedMoment.dayOfYear() / 7),
            year: adjustedMoment.year()
        };
    }

    //http://en.wikipedia.org/wiki/ISO_week_date#Calculating_a_date_given_the_year.2C_week_number_and_weekday
    function dayOfYearFromWeeks(year, week, weekday, firstDayOfWeekOfYear, firstDayOfWeek) {
        var d = makeUTCDate(year, 0, 1).getUTCDay(), daysToAdd, dayOfYear;

        weekday = weekday != null ? weekday : firstDayOfWeek;
        daysToAdd = firstDayOfWeek - d + (d > firstDayOfWeekOfYear ? 7 : 0) - (d < firstDayOfWeek ? 7 : 0);
        dayOfYear = 7 * (week - 1) + (weekday - firstDayOfWeek) + daysToAdd + 1;

        return {
            year: dayOfYear > 0 ? year : year - 1,
            dayOfYear: dayOfYear > 0 ?  dayOfYear : daysInYear(year - 1) + dayOfYear
        };
    }

    /************************************
        Top Level Functions
    ************************************/

    function makeMoment(config) {
        var input = config._i,
            format = config._f;

        if (input === null || (format === undefined && input === '')) {
            return moment.invalid({nullInput: true});
        }

        if (typeof input === 'string') {
            config._i = input = getLangDefinition().preparse(input);
        }

        if (moment.isMoment(input)) {
            config = cloneMoment(input);

            config._d = new Date(+input._d);
        } else if (format) {
            if (isArray(format)) {
                makeDateFromStringAndArray(config);
            } else {
                makeDateFromStringAndFormat(config);
            }
        } else {
            makeDateFromInput(config);
        }

        return new Moment(config);
    }

    moment = function (input, format, lang, strict) {
        var c;

        if (typeof(lang) === "boolean") {
            strict = lang;
            lang = undefined;
        }
        // object construction must be done this way.
        // https://github.com/moment/moment/issues/1423
        c = {};
        c._isAMomentObject = true;
        c._i = input;
        c._f = format;
        c._l = lang;
        c._strict = strict;
        c._isUTC = false;
        c._pf = defaultParsingFlags();

        return makeMoment(c);
    };

    moment.suppressDeprecationWarnings = false;

    moment.createFromInputFallback = deprecate(
            "moment construction falls back to js Date. This is " +
            "discouraged and will be removed in upcoming major " +
            "release. Please refer to " +
            "https://github.com/moment/moment/issues/1407 for more info.",
            function (config) {
        config._d = new Date(config._i);
    });

    // creating with utc
    moment.utc = function (input, format, lang, strict) {
        var c;

        if (typeof(lang) === "boolean") {
            strict = lang;
            lang = undefined;
        }
        // object construction must be done this way.
        // https://github.com/moment/moment/issues/1423
        c = {};
        c._isAMomentObject = true;
        c._useUTC = true;
        c._isUTC = true;
        c._l = lang;
        c._i = input;
        c._f = format;
        c._strict = strict;
        c._pf = defaultParsingFlags();

        return makeMoment(c).utc();
    };

    // creating with unix timestamp (in seconds)
    moment.unix = function (input) {
        return moment(input * 1000);
    };

    // duration
    moment.duration = function (input, key) {
        var duration = input,
            // matching against regexp is expensive, do it on demand
            match = null,
            sign,
            ret,
            parseIso;

        if (moment.isDuration(input)) {
            duration = {
                ms: input._milliseconds,
                d: input._days,
                M: input._months
            };
        } else if (typeof input === 'number') {
            duration = {};
            if (key) {
                duration[key] = input;
            } else {
                duration.milliseconds = input;
            }
        } else if (!!(match = aspNetTimeSpanJsonRegex.exec(input))) {
            sign = (match[1] === "-") ? -1 : 1;
            duration = {
                y: 0,
                d: toInt(match[DATE]) * sign,
                h: toInt(match[HOUR]) * sign,
                m: toInt(match[MINUTE]) * sign,
                s: toInt(match[SECOND]) * sign,
                ms: toInt(match[MILLISECOND]) * sign
            };
        } else if (!!(match = isoDurationRegex.exec(input))) {
            sign = (match[1] === "-") ? -1 : 1;
            parseIso = function (inp) {
                // We'd normally use ~~inp for this, but unfortunately it also
                // converts floats to ints.
                // inp may be undefined, so careful calling replace on it.
                var res = inp && parseFloat(inp.replace(',', '.'));
                // apply sign while we're at it
                return (isNaN(res) ? 0 : res) * sign;
            };
            duration = {
                y: parseIso(match[2]),
                M: parseIso(match[3]),
                d: parseIso(match[4]),
                h: parseIso(match[5]),
                m: parseIso(match[6]),
                s: parseIso(match[7]),
                w: parseIso(match[8])
            };
        }

        ret = new Duration(duration);

        if (moment.isDuration(input) && input.hasOwnProperty('_lang')) {
            ret._lang = input._lang;
        }

        return ret;
    };

    // version number
    moment.version = VERSION;

    // default format
    moment.defaultFormat = isoFormat;

    // Plugins that add properties should also add the key here (null value),
    // so we can properly clone ourselves.
    moment.momentProperties = momentProperties;

    // This function will be called whenever a moment is mutated.
    // It is intended to keep the offset in sync with the timezone.
    moment.updateOffset = function () {};

    // This function will load languages and then set the global language.  If
    // no arguments are passed in, it will simply return the current global
    // language key.
    moment.lang = function (key, values) {
        var r;
        if (!key) {
            return moment.fn._lang._abbr;
        }
        if (values) {
            loadLang(normalizeLanguage(key), values);
        } else if (values === null) {
            unloadLang(key);
            key = 'en';
        } else if (!languages[key]) {
            getLangDefinition(key);
        }
        r = moment.duration.fn._lang = moment.fn._lang = getLangDefinition(key);
        return r._abbr;
    };

    // returns language data
    moment.langData = function (key) {
        if (key && key._lang && key._lang._abbr) {
            key = key._lang._abbr;
        }
        return getLangDefinition(key);
    };

    // compare moment object
    moment.isMoment = function (obj) {
        return obj instanceof Moment ||
            (obj != null &&  obj.hasOwnProperty('_isAMomentObject'));
    };

    // for typechecking Duration objects
    moment.isDuration = function (obj) {
        return obj instanceof Duration;
    };

    for (i = lists.length - 1; i >= 0; --i) {
        makeList(lists[i]);
    }

    moment.normalizeUnits = function (units) {
        return normalizeUnits(units);
    };

    moment.invalid = function (flags) {
        var m = moment.utc(NaN);
        if (flags != null) {
            extend(m._pf, flags);
        }
        else {
            m._pf.userInvalidated = true;
        }

        return m;
    };

    moment.parseZone = function () {
        return moment.apply(null, arguments).parseZone();
    };

    moment.parseTwoDigitYear = function (input) {
        return toInt(input) + (toInt(input) > 68 ? 1900 : 2000);
    };

    /************************************
        Moment Prototype
    ************************************/


    extend(moment.fn = Moment.prototype, {

        clone : function () {
            return moment(this);
        },

        valueOf : function () {
            return +this._d + ((this._offset || 0) * 60000);
        },

        unix : function () {
            return Math.floor(+this / 1000);
        },

        toString : function () {
            return this.clone().lang('en').format("ddd MMM DD YYYY HH:mm:ss [GMT]ZZ");
        },

        toDate : function () {
            return this._offset ? new Date(+this) : this._d;
        },

        toISOString : function () {
            var m = moment(this).utc();
            if (0 < m.year() && m.year() <= 9999) {
                return formatMoment(m, 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
            } else {
                return formatMoment(m, 'YYYYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
            }
        },

        toArray : function () {
            var m = this;
            return [
                m.year(),
                m.month(),
                m.date(),
                m.hours(),
                m.minutes(),
                m.seconds(),
                m.milliseconds()
            ];
        },

        isValid : function () {
            return isValid(this);
        },

        isDSTShifted : function () {

            if (this._a) {
                return this.isValid() && compareArrays(this._a, (this._isUTC ? moment.utc(this._a) : moment(this._a)).toArray()) > 0;
            }

            return false;
        },

        parsingFlags : function () {
            return extend({}, this._pf);
        },

        invalidAt: function () {
            return this._pf.overflow;
        },

        utc : function () {
            return this.zone(0);
        },

        local : function () {
            this.zone(0);
            this._isUTC = false;
            return this;
        },

        format : function (inputString) {
            var output = formatMoment(this, inputString || moment.defaultFormat);
            return this.lang().postformat(output);
        },

        add : function (input, val) {
            var dur;
            // switch args to support add('s', 1) and add(1, 's')
            if (typeof input === 'string') {
                dur = moment.duration(+val, input);
            } else {
                dur = moment.duration(input, val);
            }
            addOrSubtractDurationFromMoment(this, dur, 1);
            return this;
        },

        subtract : function (input, val) {
            var dur;
            // switch args to support subtract('s', 1) and subtract(1, 's')
            if (typeof input === 'string') {
                dur = moment.duration(+val, input);
            } else {
                dur = moment.duration(input, val);
            }
            addOrSubtractDurationFromMoment(this, dur, -1);
            return this;
        },

        diff : function (input, units, asFloat) {
            var that = makeAs(input, this),
                zoneDiff = (this.zone() - that.zone()) * 6e4,
                diff, output;

            units = normalizeUnits(units);

            if (units === 'year' || units === 'month') {
                // average number of days in the months in the given dates
                diff = (this.daysInMonth() + that.daysInMonth()) * 432e5; // 24 * 60 * 60 * 1000 / 2
                // difference in months
                output = ((this.year() - that.year()) * 12) + (this.month() - that.month());
                // adjust by taking difference in days, average number of days
                // and dst in the given months.
                output += ((this - moment(this).startOf('month')) -
                        (that - moment(that).startOf('month'))) / diff;
                // same as above but with zones, to negate all dst
                output -= ((this.zone() - moment(this).startOf('month').zone()) -
                        (that.zone() - moment(that).startOf('month').zone())) * 6e4 / diff;
                if (units === 'year') {
                    output = output / 12;
                }
            } else {
                diff = (this - that);
                output = units === 'second' ? diff / 1e3 : // 1000
                    units === 'minute' ? diff / 6e4 : // 1000 * 60
                    units === 'hour' ? diff / 36e5 : // 1000 * 60 * 60
                    units === 'day' ? (diff - zoneDiff) / 864e5 : // 1000 * 60 * 60 * 24, negate dst
                    units === 'week' ? (diff - zoneDiff) / 6048e5 : // 1000 * 60 * 60 * 24 * 7, negate dst
                    diff;
            }
            return asFloat ? output : absRound(output);
        },

        from : function (time, withoutSuffix) {
            return moment.duration(this.diff(time)).lang(this.lang()._abbr).humanize(!withoutSuffix);
        },

        fromNow : function (withoutSuffix) {
            return this.from(moment(), withoutSuffix);
        },

        calendar : function () {
            // We want to compare the start of today, vs this.
            // Getting start-of-today depends on whether we're zone'd or not.
            var sod = makeAs(moment(), this).startOf('day'),
                diff = this.diff(sod, 'days', true),
                format = diff < -6 ? 'sameElse' :
                    diff < -1 ? 'lastWeek' :
                    diff < 0 ? 'lastDay' :
                    diff < 1 ? 'sameDay' :
                    diff < 2 ? 'nextDay' :
                    diff < 7 ? 'nextWeek' : 'sameElse';
            return this.format(this.lang().calendar(format, this));
        },

        isLeapYear : function () {
            return isLeapYear(this.year());
        },

        isDST : function () {
            return (this.zone() < this.clone().month(0).zone() ||
                this.zone() < this.clone().month(5).zone());
        },

        day : function (input) {
            var day = this._isUTC ? this._d.getUTCDay() : this._d.getDay();
            if (input != null) {
                input = parseWeekday(input, this.lang());
                return this.add({ d : input - day });
            } else {
                return day;
            }
        },

        month : makeAccessor('Month', true),

        startOf: function (units) {
            units = normalizeUnits(units);
            // the following switch intentionally omits break keywords
            // to utilize falling through the cases.
            switch (units) {
            case 'year':
                this.month(0);
                /* falls through */
            case 'quarter':
            case 'month':
                this.date(1);
                /* falls through */
            case 'week':
            case 'isoWeek':
            case 'day':
                this.hours(0);
                /* falls through */
            case 'hour':
                this.minutes(0);
                /* falls through */
            case 'minute':
                this.seconds(0);
                /* falls through */
            case 'second':
                this.milliseconds(0);
                /* falls through */
            }

            // weeks are a special case
            if (units === 'week') {
                this.weekday(0);
            } else if (units === 'isoWeek') {
                this.isoWeekday(1);
            }

            // quarters are also special
            if (units === 'quarter') {
                this.month(Math.floor(this.month() / 3) * 3);
            }

            return this;
        },

        endOf: function (units) {
            units = normalizeUnits(units);
            return this.startOf(units).add((units === 'isoWeek' ? 'week' : units), 1).subtract('ms', 1);
        },

        isAfter: function (input, units) {
            units = typeof units !== 'undefined' ? units : 'millisecond';
            return +this.clone().startOf(units) > +moment(input).startOf(units);
        },

        isBefore: function (input, units) {
            units = typeof units !== 'undefined' ? units : 'millisecond';
            return +this.clone().startOf(units) < +moment(input).startOf(units);
        },

        isSame: function (input, units) {
            units = units || 'ms';
            return +this.clone().startOf(units) === +makeAs(input, this).startOf(units);
        },

        min: function (other) {
            other = moment.apply(null, arguments);
            return other < this ? this : other;
        },

        max: function (other) {
            other = moment.apply(null, arguments);
            return other > this ? this : other;
        },

        // keepTime = true means only change the timezone, without affecting
        // the local hour. So 5:31:26 +0300 --[zone(2, true)]--> 5:31:26 +0200
        // It is possible that 5:31:26 doesn't exist int zone +0200, so we
        // adjust the time as needed, to be valid.
        //
        // Keeping the time actually adds/subtracts (one hour)
        // from the actual represented time. That is why we call updateOffset
        // a second time. In case it wants us to change the offset again
        // _changeInProgress == true case, then we have to adjust, because
        // there is no such time in the given timezone.
        zone : function (input, keepTime) {
            var offset = this._offset || 0;
            if (input != null) {
                if (typeof input === "string") {
                    input = timezoneMinutesFromString(input);
                }
                if (Math.abs(input) < 16) {
                    input = input * 60;
                }
                this._offset = input;
                this._isUTC = true;
                if (offset !== input) {
                    if (!keepTime || this._changeInProgress) {
                        addOrSubtractDurationFromMoment(this,
                                moment.duration(offset - input, 'm'), 1, false);
                    } else if (!this._changeInProgress) {
                        this._changeInProgress = true;
                        moment.updateOffset(this, true);
                        this._changeInProgress = null;
                    }
                }
            } else {
                return this._isUTC ? offset : this._d.getTimezoneOffset();
            }
            return this;
        },

        zoneAbbr : function () {
            return this._isUTC ? "UTC" : "";
        },

        zoneName : function () {
            return this._isUTC ? "Coordinated Universal Time" : "";
        },

        parseZone : function () {
            if (this._tzm) {
                this.zone(this._tzm);
            } else if (typeof this._i === 'string') {
                this.zone(this._i);
            }
            return this;
        },

        hasAlignedHourOffset : function (input) {
            if (!input) {
                input = 0;
            }
            else {
                input = moment(input).zone();
            }

            return (this.zone() - input) % 60 === 0;
        },

        daysInMonth : function () {
            return daysInMonth(this.year(), this.month());
        },

        dayOfYear : function (input) {
            var dayOfYear = round((moment(this).startOf('day') - moment(this).startOf('year')) / 864e5) + 1;
            return input == null ? dayOfYear : this.add("d", (input - dayOfYear));
        },

        quarter : function (input) {
            return input == null ? Math.ceil((this.month() + 1) / 3) : this.month((input - 1) * 3 + this.month() % 3);
        },

        weekYear : function (input) {
            var year = weekOfYear(this, this.lang()._week.dow, this.lang()._week.doy).year;
            return input == null ? year : this.add("y", (input - year));
        },

        isoWeekYear : function (input) {
            var year = weekOfYear(this, 1, 4).year;
            return input == null ? year : this.add("y", (input - year));
        },

        week : function (input) {
            var week = this.lang().week(this);
            return input == null ? week : this.add("d", (input - week) * 7);
        },

        isoWeek : function (input) {
            var week = weekOfYear(this, 1, 4).week;
            return input == null ? week : this.add("d", (input - week) * 7);
        },

        weekday : function (input) {
            var weekday = (this.day() + 7 - this.lang()._week.dow) % 7;
            return input == null ? weekday : this.add("d", input - weekday);
        },

        isoWeekday : function (input) {
            // behaves the same as moment#day except
            // as a getter, returns 7 instead of 0 (1-7 range instead of 0-6)
            // as a setter, sunday should belong to the previous week.
            return input == null ? this.day() || 7 : this.day(this.day() % 7 ? input : input - 7);
        },

        isoWeeksInYear : function () {
            return weeksInYear(this.year(), 1, 4);
        },

        weeksInYear : function () {
            var weekInfo = this._lang._week;
            return weeksInYear(this.year(), weekInfo.dow, weekInfo.doy);
        },

        get : function (units) {
            units = normalizeUnits(units);
            return this[units]();
        },

        set : function (units, value) {
            units = normalizeUnits(units);
            if (typeof this[units] === 'function') {
                this[units](value);
            }
            return this;
        },

        // If passed a language key, it will set the language for this
        // instance.  Otherwise, it will return the language configuration
        // variables for this instance.
        lang : function (key) {
            if (key === undefined) {
                return this._lang;
            } else {
                this._lang = getLangDefinition(key);
                return this;
            }
        }
    });

    function rawMonthSetter(mom, value) {
        var dayOfMonth;

        // TODO: Move this out of here!
        if (typeof value === 'string') {
            value = mom.lang().monthsParse(value);
            // TODO: Another silent failure?
            if (typeof value !== 'number') {
                return mom;
            }
        }

        dayOfMonth = Math.min(mom.date(),
                daysInMonth(mom.year(), value));
        mom._d['set' + (mom._isUTC ? 'UTC' : '') + 'Month'](value, dayOfMonth);
        return mom;
    }

    function rawGetter(mom, unit) {
        return mom._d['get' + (mom._isUTC ? 'UTC' : '') + unit]();
    }

    function rawSetter(mom, unit, value) {
        if (unit === 'Month') {
            return rawMonthSetter(mom, value);
        } else {
            return mom._d['set' + (mom._isUTC ? 'UTC' : '') + unit](value);
        }
    }

    function makeAccessor(unit, keepTime) {
        return function (value) {
            if (value != null) {
                rawSetter(this, unit, value);
                moment.updateOffset(this, keepTime);
                return this;
            } else {
                return rawGetter(this, unit);
            }
        };
    }

    moment.fn.millisecond = moment.fn.milliseconds = makeAccessor('Milliseconds', false);
    moment.fn.second = moment.fn.seconds = makeAccessor('Seconds', false);
    moment.fn.minute = moment.fn.minutes = makeAccessor('Minutes', false);
    // Setting the hour should keep the time, because the user explicitly
    // specified which hour he wants. So trying to maintain the same hour (in
    // a new timezone) makes sense. Adding/subtracting hours does not follow
    // this rule.
    moment.fn.hour = moment.fn.hours = makeAccessor('Hours', true);
    // moment.fn.month is defined separately
    moment.fn.date = makeAccessor('Date', true);
    moment.fn.dates = deprecate("dates accessor is deprecated. Use date instead.", makeAccessor('Date', true));
    moment.fn.year = makeAccessor('FullYear', true);
    moment.fn.years = deprecate("years accessor is deprecated. Use year instead.", makeAccessor('FullYear', true));

    // add plural methods
    moment.fn.days = moment.fn.day;
    moment.fn.months = moment.fn.month;
    moment.fn.weeks = moment.fn.week;
    moment.fn.isoWeeks = moment.fn.isoWeek;
    moment.fn.quarters = moment.fn.quarter;

    // add aliased format methods
    moment.fn.toJSON = moment.fn.toISOString;

    /************************************
        Duration Prototype
    ************************************/


    extend(moment.duration.fn = Duration.prototype, {

        _bubble : function () {
            var milliseconds = this._milliseconds,
                days = this._days,
                months = this._months,
                data = this._data,
                seconds, minutes, hours, years;

            // The following code bubbles up values, see the tests for
            // examples of what that means.
            data.milliseconds = milliseconds % 1000;

            seconds = absRound(milliseconds / 1000);
            data.seconds = seconds % 60;

            minutes = absRound(seconds / 60);
            data.minutes = minutes % 60;

            hours = absRound(minutes / 60);
            data.hours = hours % 24;

            days += absRound(hours / 24);
            data.days = days % 30;

            months += absRound(days / 30);
            data.months = months % 12;

            years = absRound(months / 12);
            data.years = years;
        },

        weeks : function () {
            return absRound(this.days() / 7);
        },

        valueOf : function () {
            return this._milliseconds +
              this._days * 864e5 +
              (this._months % 12) * 2592e6 +
              toInt(this._months / 12) * 31536e6;
        },

        humanize : function (withSuffix) {
            var difference = +this,
                output = relativeTime(difference, !withSuffix, this.lang());

            if (withSuffix) {
                output = this.lang().pastFuture(difference, output);
            }

            return this.lang().postformat(output);
        },

        add : function (input, val) {
            // supports only 2.0-style add(1, 's') or add(moment)
            var dur = moment.duration(input, val);

            this._milliseconds += dur._milliseconds;
            this._days += dur._days;
            this._months += dur._months;

            this._bubble();

            return this;
        },

        subtract : function (input, val) {
            var dur = moment.duration(input, val);

            this._milliseconds -= dur._milliseconds;
            this._days -= dur._days;
            this._months -= dur._months;

            this._bubble();

            return this;
        },

        get : function (units) {
            units = normalizeUnits(units);
            return this[units.toLowerCase() + 's']();
        },

        as : function (units) {
            units = normalizeUnits(units);
            return this['as' + units.charAt(0).toUpperCase() + units.slice(1) + 's']();
        },

        lang : moment.fn.lang,

        toIsoString : function () {
            // inspired by https://github.com/dordille/moment-isoduration/blob/master/moment.isoduration.js
            var years = Math.abs(this.years()),
                months = Math.abs(this.months()),
                days = Math.abs(this.days()),
                hours = Math.abs(this.hours()),
                minutes = Math.abs(this.minutes()),
                seconds = Math.abs(this.seconds() + this.milliseconds() / 1000);

            if (!this.asSeconds()) {
                // this is the same as C#'s (Noda) and python (isodate)...
                // but not other JS (goog.date)
                return 'P0D';
            }

            return (this.asSeconds() < 0 ? '-' : '') +
                'P' +
                (years ? years + 'Y' : '') +
                (months ? months + 'M' : '') +
                (days ? days + 'D' : '') +
                ((hours || minutes || seconds) ? 'T' : '') +
                (hours ? hours + 'H' : '') +
                (minutes ? minutes + 'M' : '') +
                (seconds ? seconds + 'S' : '');
        }
    });

    function makeDurationGetter(name) {
        moment.duration.fn[name] = function () {
            return this._data[name];
        };
    }

    function makeDurationAsGetter(name, factor) {
        moment.duration.fn['as' + name] = function () {
            return +this / factor;
        };
    }

    for (i in unitMillisecondFactors) {
        if (unitMillisecondFactors.hasOwnProperty(i)) {
            makeDurationAsGetter(i, unitMillisecondFactors[i]);
            makeDurationGetter(i.toLowerCase());
        }
    }

    makeDurationAsGetter('Weeks', 6048e5);
    moment.duration.fn.asMonths = function () {
        return (+this - this.years() * 31536e6) / 2592e6 + this.years() * 12;
    };


    /************************************
        Default Lang
    ************************************/


    // Set default language, other languages will inherit from English.
    moment.lang('en', {
        ordinal : function (number) {
            var b = number % 10,
                output = (toInt(number % 100 / 10) === 1) ? 'th' :
                (b === 1) ? 'st' :
                (b === 2) ? 'nd' :
                (b === 3) ? 'rd' : 'th';
            return number + output;
        }
    });

    /* EMBED_LANGUAGES */

    /************************************
        Exposing Moment
    ************************************/

    function makeGlobal(shouldDeprecate) {
        /*global ender:false */
        if (typeof ender !== 'undefined') {
            return;
        }
        oldGlobalMoment = globalScope.moment;
        if (shouldDeprecate) {
            globalScope.moment = deprecate(
                    "Accessing Moment through the global scope is " +
                    "deprecated, and will be removed in an upcoming " +
                    "release.",
                    moment);
        } else {
            globalScope.moment = moment;
        }
    }

    // CommonJS module is defined
    if (hasModule) {
        module.exports = moment;
    } else if (typeof define === "function" && define.amd) {
        define("moment", function (require, exports, module) {
            if (module.config && module.config() && module.config().noGlobal === true) {
                // release the global variable
                globalScope.moment = oldGlobalMoment;
            }

            return moment;
        });
        makeGlobal(true);
    } else {
        makeGlobal();
    }
}).call(this);

//! moment-timezone.js
//! version : 0.2.5
//! author : Tim Wood
//! license : MIT
//! github.com/moment/moment-timezone

(function (root, factory) {
	"use strict";

	/*global define*/
	if (typeof define === 'function' && define.amd) {
		define(['moment'], factory);                 // AMD
	} else if (typeof exports === 'object') {
		module.exports = factory(require('moment')); // Node
	} else {
		factory(root.moment);                        // Browser
	}
}(this, function (moment) {
	"use strict";

	// Do not load moment-timezone a second time.
	if (moment.tz !== undefined) { return moment; }

	var VERSION = "0.2.5",
		zones = {},
		links = {},

		momentVersion = moment.version.split('.'),
		major = +momentVersion[0],
		minor = +momentVersion[1];

	// Moment.js version check
	if (major < 2 || (major === 2 && minor < 6)) {
		logError('Moment Timezone requires Moment.js >= 2.6.0. You are using Moment.js ' + moment.version + '. See momentjs.com');
	}

	/************************************
		Unpacking
	************************************/

	function charCodeToInt(charCode) {
		if (charCode > 96) {
			return charCode - 87;
		} else if (charCode > 64) {
			return charCode - 29;
		}
		return charCode - 48;
	}

	function unpackBase60(string) {
		var i = 0,
			parts = string.split('.'),
			whole = parts[0],
			fractional = parts[1] || '',
			multiplier = 1,
			num,
			out = 0,
			sign = 1;

		// handle negative numbers
		if (string.charCodeAt(0) === 45) {
			i = 1;
			sign = -1;
		}

		// handle digits before the decimal
		for (i; i < whole.length; i++) {
			num = charCodeToInt(whole.charCodeAt(i));
			out = 60 * out + num;
		}

		// handle digits after the decimal
		for (i = 0; i < fractional.length; i++) {
			multiplier = multiplier / 60;
			num = charCodeToInt(fractional.charCodeAt(i));
			out += num * multiplier;
		}

		return out * sign;
	}

	function arrayToInt (array) {
		for (var i = 0; i < array.length; i++) {
			array[i] = unpackBase60(array[i]);
		}
	}

	function intToUntil (array, length) {
		for (var i = 0; i < length; i++) {
			array[i] = Math.round((array[i - 1] || 0) + (array[i] * 60000)); // minutes to milliseconds
		}

		array[length - 1] = Infinity;
	}

	function mapIndices (source, indices) {
		var out = [], i;

		for (i = 0; i < indices.length; i++) {
			out[i] = source[indices[i]];
		}

		return out;
	}

	function unpack (string) {
		var data = string.split('|'),
			offsets = data[2].split(' '),
			indices = data[3].split(''),
			untils  = data[4].split(' ');

		arrayToInt(offsets);
		arrayToInt(indices);
		arrayToInt(untils);

		intToUntil(untils, indices.length);

		return {
			name    : data[0],
			abbrs   : mapIndices(data[1].split(' '), indices),
			offsets : mapIndices(offsets, indices),
			untils  : untils
		};
	}

	/************************************
		Zone object
	************************************/

	function Zone (packedString) {
		if (packedString) {
			this._set(unpack(packedString));
		}
	}

	Zone.prototype = {
		_set : function (unpacked) {
			this.name    = unpacked.name;
			this.abbrs   = unpacked.abbrs;
			this.untils  = unpacked.untils;
			this.offsets = unpacked.offsets;
		},

		_index : function (timestamp) {
			var target = +timestamp,
				untils = this.untils,
				i;

			for (i = 0; i < untils.length; i++) {
				if (target < untils[i]) {
					return i;
				}
			}
		},

		parse : function (timestamp) {
			var target  = +timestamp,
				offsets = this.offsets,
				untils  = this.untils,
				max     = untils.length - 1,
				offset, offsetNext, offsetPrev, i;

			for (i = 0; i < max; i++) {
				offset     = offsets[i];
				offsetNext = offsets[i + 1];
				offsetPrev = offsets[i ? i - 1 : i];

				if (offset < offsetNext && tz.moveAmbiguousForward) {
					offset = offsetNext;
				} else if (offset > offsetPrev && tz.moveInvalidForward) {
					offset = offsetPrev;
				}

				if (target < untils[i] - (offset * 60000)) {
					return offsets[i];
				}
			}

			return offsets[max];
		},

		abbr : function (mom) {
			return this.abbrs[this._index(mom)];
		},

		offset : function (mom) {
			return this.offsets[this._index(mom)];
		}
	};

	/************************************
		Global Methods
	************************************/

	function normalizeName (name) {
		return (name || '').toLowerCase().replace(/\//g, '_');
	}

	function addZone (packed) {
		var i, zone, zoneName;

		if (typeof packed === "string") {
			packed = [packed];
		}

		for (i = 0; i < packed.length; i++) {
			zone = new Zone(packed[i]);
			zoneName = normalizeName(zone.name);
			zones[zoneName] = zone;
			upgradeLinksToZones(zoneName);
		}
	}

	function getZone (name) {
		return zones[normalizeName(name)] || null;
	}

	function getNames () {
		var i, out = [];

		for (i in zones) {
			if (zones.hasOwnProperty(i) && zones[i]) {
				out.push(zones[i].name);
			}
		}

		return out.sort();
	}

	function addLink (aliases) {
		var i, alias;

		if (typeof aliases === "string") {
			aliases = [aliases];
		}

		for (i = 0; i < aliases.length; i++) {
			alias = aliases[i].split('|');
			pushLink(alias[0], alias[1]);
			pushLink(alias[1], alias[0]);
		}
	}

	function upgradeLinksToZones (zoneName) {
		if (!links[zoneName]) {
			return;
		}

		var i,
			zone = zones[zoneName],
			linkNames = links[zoneName];

		for (i = 0; i < linkNames.length; i++) {
			copyZoneWithName(zone, linkNames[i]);
		}

		links[zoneName] = null;
	}

	function copyZoneWithName (zone, name) {
		var linkZone = zones[normalizeName(name)] = new Zone();
		linkZone._set(zone);
		linkZone.name = name;
	}

	function pushLink (zoneName, linkName) {
		zoneName = normalizeName(zoneName);

		if (zones[zoneName]) {
			copyZoneWithName(zones[zoneName], linkName);
		} else {
			links[zoneName] = links[zoneName] || [];
			links[zoneName].push(linkName);
		}
	}

	function loadData (data) {
		addZone(data.zones);
		addLink(data.links);
		tz.dataVersion = data.version;
	}

	function zoneExists (name) {
		if (!zoneExists.didShowError) {
			zoneExists.didShowError = true;
				logError("moment.tz.zoneExists('" + name + "') has been deprecated in favor of !moment.tz.zone('" + name + "')");
		}
		return !!getZone(name);
	}

	function needsOffset (m) {
		return !!(m._a && (m._tzm === undefined));
	}

	function logError (message) {
		if (typeof console !== 'undefined' && typeof console.error === 'function') {
			console.error(message);
		}
	}

	/************************************
		moment.tz namespace
	************************************/

	function tz () {
		var args = Array.prototype.slice.call(arguments, 0, -1),
			name = arguments[arguments.length - 1],
			zone = getZone(name),
			out  = moment.utc.apply(null, args);

		if (zone && needsOffset(out)) {
			out.add(zone.parse(out), 'minutes');
		}

		out.tz(name);

		return out;
	}

	tz.version      = VERSION;
	tz.dataVersion  = '';
	tz._zones       = zones;
	tz._links       = links;
	tz.add          = addZone;
	tz.link         = addLink;
	tz.load         = loadData;
	tz.zone         = getZone;
	tz.zoneExists   = zoneExists; // deprecated in 0.1.0
	tz.names        = getNames;
	tz.Zone         = Zone;
	tz.unpack       = unpack;
	tz.unpackBase60 = unpackBase60;
	tz.needsOffset  = needsOffset;
	tz.moveInvalidForward   = true;
	tz.moveAmbiguousForward = false;

	/************************************
		Interface with Moment.js
	************************************/

	var fn = moment.fn;

	moment.tz = tz;

	moment.updateOffset = function (mom, keepTime) {
		var offset;
		if (mom._z) {
			offset = mom._z.offset(mom);
			if (Math.abs(offset) < 16) {
				offset = offset / 60;
			}
			mom.zone(offset, keepTime);
		}
	};

	fn.tz = function (name) {
		if (name) {
			this._z = getZone(name);
			if (this._z) {
				moment.updateOffset(this);
			} else {
				logError("Moment Timezone has no data for " + name + ". See http://momentjs.com/timezone/docs/#/data-loading/.");
			}
			return this;
		}
		if (this._z) { return this._z.name; }
	};

	function abbrWrap (old) {
		return function () {
			if (this._z) { return this._z.abbr(this); }
			return old.call(this);
		};
	}

	function resetZoneWrap (old) {
		return function () {
			this._z = null;
			return old.apply(this, arguments);
		};
	}

	fn.zoneName = abbrWrap(fn.zoneName);
	fn.zoneAbbr = abbrWrap(fn.zoneAbbr);
	fn.utc      = resetZoneWrap(fn.utc);

	// Cloning a moment should include the _z property.
	var momentProperties = moment.momentProperties;
	if (Object.prototype.toString.call(momentProperties) === '[object Array]') {
		// moment 2.8.1+
		momentProperties.push('_z');
		momentProperties.push('_a');
	} else if (momentProperties) {
		// moment 2.7.0
		momentProperties._z = null;
	}

	// INJECT DATA

	return moment;
}));

/*!
 * ngCordova
 * v0.1.17-alpha
 * Copyright 2014 Drifty Co. http://drifty.com/
 * See LICENSE in this repository for license information
 */
(function(){

angular.module('ngCordova', [
  'ngCordova.plugins'
]);

// install  :     cordova plugin add https://github.com/EddyVerbruggen/cordova-plugin-actionsheet.git
// link     :     https://github.com/EddyVerbruggen/cordova-plugin-actionsheet

angular.module('ngCordova.plugins.actionSheet', [])

  .factory('$cordovaActionSheet', ['$q', '$window', function ($q, $window) {

    return {
      show: function (options) {
        var q = $q.defer();

        $window.plugins.actionsheet.show(options, function (result) {
          q.resolve(result);
        });

        return q.promise;
      },

      hide: function () {
        return $window.plugins.actionsheet.hide();
      }
    };
  }]);

// install  :     cordova plugin add https://github.com/floatinghotpot/cordova-plugin-admob.git
// link     :     https://github.com/floatinghotpot/cordova-plugin-admob

angular.module('ngCordova.plugins.adMob', [])

  .factory('$cordovaAdMob', ['$q', '$window', function ($q, $window) {

    return {
      createBannerView: function (options) {
        var d = $q.defer();

        $window.plugins.AdMob.createBannerView(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      createInterstitialView: function (options) {
        var d = $q.defer();

        $window.plugins.AdMob.createInterstitialView(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      requestAd: function (options) {
        var d = $q.defer();

        $window.plugins.AdMob.requestAd(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showAd: function (options) {
        var d = $q.defer();

        $window.plugins.AdMob.showAd(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      requestInterstitialAd: function (options) {
        var d = $q.defer();

        $window.plugins.AdMob.requestInterstitialAd(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      }
    };
  }]);

// install  :     cordova plugin add https://github.com/ohh2ahh/AppAvailability.git
// link     :     https://github.com/ohh2ahh/AppAvailability

angular.module('ngCordova.plugins.appAvailability', [])

  .factory('$cordovaAppAvailability', ['$q', function ($q) {

    return {
      check: function (urlScheme) {
        var q = $q.defer();

        appAvailability.check(urlScheme, function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      }
    };
  }]);

// install  :     cordova plugin add https://github.com/pushandplay/cordova-plugin-apprate.git
// link     :     https://github.com/pushandplay/cordova-plugin-apprate

angular.module('ngCordova.plugins.appRate', [])

  .provider("$cordovaAppRate", [function () {

    this.setPreferences = function (defaults) {
      if (!defaults || !angular.isObject(defaults)) {
        return;
      }

      AppRate.preferences.useLanguage = defaults.language || null;
      AppRate.preferences.displayAppName = defaults.appName || "";
      AppRate.preferences.promptAgainForEachNewVersion = defaults.promptForNewVersion || true;
      AppRate.preferences.openStoreInApp = defaults.openStoreInApp || false;
      AppRate.preferences.usesUntilPrompt = defaults.usesUntilPrompt || 3;
      AppRate.preferences.useCustomRateDialog = defaults.useCustomRateDialog || false;
      AppRate.preferences.storeAppURL.ios = defaults.iosURL || null;
      AppRate.preferences.storeAppURL.android = defaults.androidURL || null;
      AppRate.preferences.storeAppURL.blackberry = defaults.blackberryURL || null;
      AppRate.preferences.storeAppURL.windows8 = defaults.windowsURL || null;
    };

    this.setCustomLocale = function (customObj) {
      var strings = {
        title: 'Rate %@',
        message: 'If you enjoy using %@, would you mind taking a moment to rate it? It won’t take more than a minute. Thanks for your support!',
        cancelButtonLabel: 'No, Thanks',
        laterButtonLabel: 'Remind Me Later',
        rateButtonLabel: 'Rate It Now'
      };

      strings = angular.extend(strings, customObj);

      AppRate.preferences.customLocale = strings;
    };

    this.$get = ['$q', function ($q) {
      return {
        promptForRating: function (immediate) {
          var q = $q.defer();
          var prompt = AppRate.promptForRating(immediate);
          q.resolve(prompt);

          return q.promise;
        },

        navigateToAppStore: function () {
          var q = $q.defer();
          var navigate = AppRate.navigateToAppStore();
          q.resolve(navigate);

          return q.promise;
        },

        onButtonClicked: function (cb) {
          AppRate.onButtonClicked = function (buttonIndex) {
            cb.call(this, buttonIndex);
          };
        },

        onRateDialogShow: function (cb) {
          AppRate.onRateDialogShow = cb();
        }
      };
    }];
  }]);

// install   :     cordova plugin add https://github.com/whiteoctober/cordova-plugin-app-version.git
// link      :     https://github.com/whiteoctober/cordova-plugin-app-version

angular.module('ngCordova.plugins.appVersion', [])

  .factory('$cordovaAppVersion', ['$q', function ($q) {

    return {
      getAppVersion: function () {
        var q = $q.defer();
        cordova.getAppVersion(function (version) {
          q.resolve(version);
        });

        return q.promise;
      }
    };
  }]);

// install   :     cordova plugin add https://github.com/christocracy/cordova-plugin-background-geolocation.git
// link      :     https://github.com/christocracy/cordova-plugin-background-geolocation

angular.module('ngCordova.plugins.backgroundGeolocation', [])

  .factory('$cordovaBackgroundGeolocation', ['$q', '$window', function ($q, $window) {

    return {

      init: function () {
        $window.navigator.geolocation.getCurrentPosition(function (location) {
          return location;
        });
      },

      configure: function (options) {

        this.init();
        var q = $q.defer();

        $window.plugins.backgroundGeoLocation.configure(
          function (result) {
            q.notify(result);
            $window.plugins.backgroundGeoLocation.finish();
          },
          function (err) {
            q.reject(err);
          }, options);

        this.start();

        return q.promise;
      },

      start: function () {
        var q = $q.defer();

        $window.plugins.backgroundGeoLocation.start(
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          });

        return q.promise;
      },

      stop: function () {
        var q = $q.defer();

        $window.plugins.backgroundGeoLocation.stop(
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          });

        return q.promise;
      }
    };
  }

  ]);

// install  :     cordova plugin add https://github.com/katzer/cordova-plugin-badge.git
// link     :     https://github.com/katzer/cordova-plugin-badge

angular.module('ngCordova.plugins.badge', [])

  .factory('$cordovaBadge', ['$q', function ($q) {

    return {
      hasPermission: function () {
        var q = $q.defer();
        cordova.plugins.notification.badge.hasPermission(function (permission) {
          if (permission) {
            q.resolve(true);
          } else {
            q.reject("You do not have permission");
          }
        });

        return q.promise;
      },

      promptForPermission: function () {
        return cordova.plugins.notification.badge.promptForPermission();
      },

      set: function (number) {
        var q = $q.defer();

        cordova.plugins.notification.badge.hasPermission(function (permission) {
          if (permission) {
            q.resolve(cordova.plugins.notification.badge.set(number));
          } else {
            q.reject("You do not have permission to set Badge");
          }
        });
        return q.promise;
      },

      get: function () {
        var q = $q.defer();
        cordova.plugins.notification.badge.hasPermission(function (permission) {
          if (permission) {
            cordova.plugins.notification.badge.get(function (badge) {
              q.resolve(badge);
            });
          } else {
            q.reject("You do not have permission to get Badge");
          }
        });

        return q.promise;
      },

      clear: function () {
        var q = $q.defer();

        cordova.plugins.notification.badge.hasPermission(function (permission) {
          if (permission) {
            q.resolve(cordova.plugins.notification.badge.clear());
          } else {
            q.reject("You do not have permission to clear Badge");
          }
        });
        return q.promise;
      },

      configure: function (config) {
        return cordova.plugins.notification.badge.configure(config);
      }
    };
  }]);

// install  :    cordova plugin add https://github.com/wildabeast/BarcodeScanner.git
// link     :    https://github.com/wildabeast/BarcodeScanner

angular.module('ngCordova.plugins.barcodeScanner', [])

  .factory('$cordovaBarcodeScanner', ['$q', function ($q) {

    return {
      scan: function (config) {
        var q = $q.defer();

        cordova.plugins.barcodeScanner.scan(function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        }, config);

        return q.promise;
      },

      encode: function (type, data) {
        var q = $q.defer();
        type = type || "TEXT_TYPE";

        cordova.plugins.barcodeScanner.encode(type, data, function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      }
    };
  }]);

//  install   :   cordova plugin add cordova-plugin-battery-status
//  link      :   https://github.com/apache/cordova-plugin-battery-status

angular.module('ngCordova.plugins.batteryStatus', [])

  .factory('$cordovaBatteryStatus', ['$rootScope', '$window', '$timeout', function ($rootScope, $window, $timeout) {

    var batteryStatus = function (status) {
      $timeout(function () {
        $rootScope.$broadcast('$cordovaBatteryStatus:status', status);
      });
    };

    var batteryCritical = function (status) {
      $timeout(function () {
        $rootScope.$broadcast('$cordovaBatteryStatus:critical', status);
      });
    };

    var batteryLow = function (status) {
      $timeout(function () {
        $rootScope.$broadcast('$cordovaBatteryStatus:low', status);
      });
    };

    document.addEventListener("deviceready", function () {
      if (navigator.battery) {
        $window.addEventListener('batterystatus', batteryStatus, false);
        $window.addEventListener('batterycritical', batteryCritical, false);
        $window.addEventListener('batterylow', batteryLow, false);

      }
    }, false);
    return true;
  }])
  .run(['$cordovaBatteryStatus', function ($cordovaBatteryStatus) {
  }]);

//  install   :   cordova plugin add https://github.com/don/cordova-plugin-ble-central.git
//  link      :   https://github.com/don/cordova-plugin-ble-central

angular.module('ngCordova.plugins.ble', [])

  .factory('$cordovaBLE', ['$q', function ($q) {

    return {
      scan: function (services, seconds) {
        var q = $q.defer();
        ble.scan(services, seconds, function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      connect: function (deviceID) {
        var q = $q.defer();
        ble.connect(deviceID, function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      disconnect: function (deviceID) {
        var q = $q.defer();
        ble.disconnect(deviceID, function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      read: function (deviceID, serviceUUID, characteristicUUID) {
        var q = $q.defer();
        ble.read(deviceID, serviceUUID, characteristicUUID, function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      write: function (deviceID, serviceUUID, characteristicUUID, data) {
        var q = $q.defer();
        ble.write(deviceID, serviceUUID, characteristicUUID, data, function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      writeCommand: function (deviceID, serviceUUID, characteristicUUID, data) {
        var q = $q.defer();
        ble.writeCommand(deviceID, serviceUUID, characteristicUUID, data, function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      startNotification: function (deviceID, serviceUUID, characteristicUUID) {
        var q = $q.defer();
        ble.startNotification(deviceID, serviceUUID, characteristicUUID, function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      stopNotification: function (deviceID, serviceUUID, characteristicUUID) {
        var q = $q.defer();
        ble.stopNotification(deviceID, serviceUUID, characteristicUUID, function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      isConnected: function (deviceID) {
        var q = $q.defer();
        ble.isConnected(deviceID, function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      isEnabled: function () {
        var q = $q.defer();
        ble.isEnabled(function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      }
    };
  }]);

// install   :     cordova plugin add https://github.com/don/BluetoothSerial.git
// link      :     https://github.com/don/BluetoothSerial

angular.module('ngCordova.plugins.bluetoothSerial', [])

  .factory('$cordovaBluetoothSerial', ['$q', '$window', function ($q, $window) {

    return {
      connect: function (address) {
        var q = $q.defer();
        $window.bluetoothSerial.connect(address, function () {
          q.resolve();
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      // not supported on iOS
      connectInsecure: function (address) {
        var q = $q.defer();
        $window.bluetoothSerial.connectInsecure(address, function () {
          q.resolve();
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      disconnect: function () {
        var q = $q.defer();
        $window.bluetoothSerial.disconnect(function () {
          q.resolve();
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      list: function () {
        var q = $q.defer();
        $window.bluetoothSerial.list(function (data) {
          q.resolve(data);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      discoverUnpaired: function () {
        var q = $q.defer();
        $window.bluetoothSerial.discoverUnpaired(function (data) {
          q.resolve(data);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      setDeviceDiscoveredListener: function () {
        var q = $q.defer();
        $window.bluetoothSerial.setDeviceDiscoveredListener(function (data) {
          q.notify(data);
        });
        return q.promise;
      },

      clearDeviceDiscoveredListener: function () {
        $window.bluetoothSerial.clearDeviceDiscoveredListener();
      },

      showBluetoothSettings: function () {
        var q = $q.defer();
        $window.bluetoothSerial.showBluetoothSettings(function () {
          q.resolve();
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      isEnabled: function () {
        var q = $q.defer();
        $window.bluetoothSerial.isEnabled(function () {
          q.resolve();
        }, function () {
          q.reject();
        });
        return q.promise;
      },

      enable: function () {
        var q = $q.defer();
        $window.bluetoothSerial.enable(function () {
          q.resolve();
        }, function () {
          q.reject();
        });
        return q.promise;
      },

      isConnected: function () {
        var q = $q.defer();
        $window.bluetoothSerial.isConnected(function () {
          q.resolve();
        }, function () {
          q.reject();
        });
        return q.promise;
      },

      available: function () {
        var q = $q.defer();
        $window.bluetoothSerial.available(function (data) {
          q.resolve(data);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      read: function () {
        var q = $q.defer();
        $window.bluetoothSerial.read(function (data) {
          q.resolve(data);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      readUntil: function (delimiter) {
        var q = $q.defer();
        $window.bluetoothSerial.readUntil(delimiter, function (data) {
          q.resolve(data);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      write: function (data) {
        var q = $q.defer();
        $window.bluetoothSerial.write(data, function () {
          q.resolve();
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      subscribe: function (delimiter) {
        var q = $q.defer();
        $window.bluetoothSerial.subscribe(delimiter, function (data) {
          q.notify(data);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      subscribeRawData: function () {
        var q = $q.defer();
        $window.bluetoothSerial.subscribeRawData(function (data) {
          q.notify(data);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      unsubscribe: function () {
        var q = $q.defer();
        $window.bluetoothSerial.unsubscribe(function () {
          q.resolve();
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      unsubscribeRawData: function () {
        var q = $q.defer();
        $window.bluetoothSerial.unsubscribeRawData(function () {
          q.resolve();
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      clear: function () {
        var q = $q.defer();
        $window.bluetoothSerial.clear(function () {
          q.resolve();
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      readRSSI: function () {
        var q = $q.defer();
        $window.bluetoothSerial.readRSSI(function (data) {
          q.resolve(data);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      }
    };
  }]);

// install  :    cordova plugin add https://github.com/fiscal-cliff/phonegap-plugin-brightness.git
// link     :    https://github.com/fiscal-cliff/phonegap-plugin-brightness

angular.module('ngCordova.plugins.brightness', [])

  .factory('$cordovaBrightness', ['$q', '$window', function ($q, $window) {

    return {
      get: function () {
        var q = $q.defer();

        $window.cordova.plugins.brightness.getBrightness(function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      set: function (data) {
        var q = $q.defer();

        $window.cordova.plugins.brightness.setBrightness(data, function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      setKeepScreenOn: function (bool) {
        var q = $q.defer();

        $window.cordova.plugins.brightness.setKeepScreenOn(bool, function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      }
    };
  }]);


// install  :     cordova plugin add https://github.com/EddyVerbruggen/Calendar-PhoneGap-Plugin.git
// link     :     https://github.com/EddyVerbruggen/Calendar-PhoneGap-Plugin

angular.module('ngCordova.plugins.calendar', [])

  .factory('$cordovaCalendar', ['$q', '$window', function ($q, $window) {
    return {
      createCalendar: function (options) {
        var d = $q.defer(),
          createCalOptions = $window.plugins.calendar.getCreateCalendarOptions();

        if (typeof options === 'string') {
          createCalOptions.calendarName = options;
        } else {
          createCalOptions = angular.extend(createCalOptions, options);
        }

        $window.plugins.calendar.createCalendar(createCalOptions, function (message) {
          d.resolve(message);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      deleteCalendar: function (calendarName) {
        var d = $q.defer();

        $window.plugins.calendar.deleteCalendar(calendarName, function (message) {
          d.resolve(message);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      createEvent: function (options) {
        var d = $q.defer(),
          defaultOptions = {
            title: null,
            location: null,
            notes: null,
            startDate: null,
            endDate: null
          };

        defaultOptions = angular.extend(defaultOptions, options);

        $window.plugins.calendar.createEvent(
          defaultOptions.title,
          defaultOptions.location,
          defaultOptions.notes,
          new Date(defaultOptions.startDate),
          new Date(defaultOptions.endDate),
          function (message) {
            d.resolve(message);
          }, function (error) {
            d.reject(error);
          }
        );

        return d.promise;
      },

      createEventWithOptions: function (options) {
        var d = $q.defer(),
          defaultOptionKeys = [],
          calOptions = window.plugins.calendar.getCalendarOptions(),
          defaultOptions = {
            title: null,
            location: null,
            notes: null,
            startDate: null,
            endDate: null
          };

        defaultOptionKeys = Object.keys(defaultOptions);

        for (var key in options) {
          if (defaultOptionKeys.indexOf(key) === -1) {
            calOptions[key] = options[key];
          } else {
            defaultOptions[key] = options[key];
          }
        }

        $window.plugins.calendar.createEventWithOptions(
          defaultOptions.title,
          defaultOptions.location,
          defaultOptions.notes,
          new Date(defaultOptions.startDate),
          new Date(defaultOptions.endDate),
          calOptions,
          function (message) {
            d.resolve(message);
          }, function (error) {
            d.reject(error);
          }
        );

        return d.promise;
      },

      createEventInteractively: function (options) {
        var d = $q.defer(),
          defaultOptions = {
            title: null,
            location: null,
            notes: null,
            startDate: null,
            endDate: null
          };

        defaultOptions = angular.extend(defaultOptions, options);

        $window.plugins.calendar.createEventInteractively(
          defaultOptions.title,
          defaultOptions.location,
          defaultOptions.notes,
          new Date(defaultOptions.startDate),
          new Date(defaultOptions.endDate),
          function (message) {
            d.resolve(message);
          }, function (error) {
            d.reject(error);
          }
        );

        return d.promise;
      },

      createEventInNamedCalendar: function (options) {
        var d = $q.defer(),
          defaultOptions = {
            title: null,
            location: null,
            notes: null,
            startDate: null,
            endDate: null,
            calendarName: null
          };

        defaultOptions = angular.extend(defaultOptions, options);

        $window.plugins.calendar.createEventInNamedCalendar(
          defaultOptions.title,
          defaultOptions.location,
          defaultOptions.notes,
          new Date(defaultOptions.startDate),
          new Date(defaultOptions.endDate),
          defaultOptions.calendarName,
          function (message) {
            d.resolve(message);
          }, function (error) {
            d.reject(error);
          }
        );

        return d.promise;
      },

      findEvent: function (options) {
        var d = $q.defer(),
          defaultOptions = {
            title: null,
            location: null,
            notes: null,
            startDate: null,
            endDate: null
          };

        defaultOptions = angular.extend(defaultOptions, options);

        $window.plugins.calendar.findEvent(
          defaultOptions.title,
          defaultOptions.location,
          defaultOptions.notes,
          new Date(defaultOptions.startDate),
          new Date(defaultOptions.endDate),
          function (foundEvent) {
            d.resolve(foundEvent);
          }, function (error) {
            d.reject(error);
          }
        );

        return d.promise;
      },

      listEventsInRange: function (startDate, endDate) {
        var d = $q.defer();

        $window.plugins.calendar.listEventsInRange(startDate, endDate, function (events) {
          d.resolve(events);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      listCalendars: function () {
        var d = $q.defer();

        $window.plugins.calendar.listCalendars(function (calendars) {
          d.resolve(calendars);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      findAllEventsInNamedCalendar: function (calendarName) {
        var d = $q.defer();

        $window.plugins.calendar.findAllEventsInNamedCalendar(calendarName, function (events) {
          d.resolve(events);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      modifyEvent: function (options) {
        var d = $q.defer(),
          defaultOptions = {
            title: null,
            location: null,
            notes: null,
            startDate: null,
            endDate: null,
            newTitle: null,
            newLocation: null,
            newNotes: null,
            newStartDate: null,
            newEndDate: null
          };

        defaultOptions = angular.extend(defaultOptions, options);

        $window.plugins.calendar.modifyEvent(
          defaultOptions.title,
          defaultOptions.location,
          defaultOptions.notes,
          new Date(defaultOptions.startDate),
          new Date(defaultOptions.endDate),
          defaultOptions.newTitle,
          defaultOptions.newLocation,
          defaultOptions.newNotes,
          new Date(defaultOptions.newStartDate),
          new Date(defaultOptions.newEndDate),
          function (message) {
            d.resolve(message);
          }, function (error) {
            d.reject(error);
          }
        );

        return d.promise;
      },

      deleteEvent: function (options) {
        var d = $q.defer(),
          defaultOptions = {
            newTitle: null,
            location: null,
            notes: null,
            startDate: null,
            endDate: null
          };

        defaultOptions = angular.extend(defaultOptions, options);

        $window.plugins.calendar.deleteEvent(
          defaultOptions.newTitle,
          defaultOptions.location,
          defaultOptions.notes,
          new Date(defaultOptions.startDate),
          new Date(defaultOptions.endDate),
          function (message) {
            d.resolve(message);
          }, function (error) {
            d.reject(error);
          }
        );

        return d.promise;
      }
    };
  }]);

// install   :   cordova plugin add cordova-plugin-camera
// link      :   https://github.com/apache/cordova-plugin-camera

angular.module('ngCordova.plugins.camera', [])

  .factory('$cordovaCamera', ['$q', function ($q) {

    return {
      getPicture: function (options) {
        var q = $q.defer();

        if (!navigator.camera) {
          q.resolve(null);
          return q.promise;
        }

        navigator.camera.getPicture(function (imageData) {
          q.resolve(imageData);
        }, function (err) {
          q.reject(err);
        }, options);

        return q.promise;
      },

      cleanup: function () {
        var q = $q.defer();

        navigator.camera.cleanup(function () {
          q.resolve();
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      }
    };
  }]);

// install   :    cordova plugin add cordova-plugin-media-capture
// link      :    https://github.com/apache/cordova-plugin-media-capture

angular.module('ngCordova.plugins.capture', [])

  .factory('$cordovaCapture', ['$q', function ($q) {

    return {
      captureAudio: function (options) {
        var q = $q.defer();

        if (!navigator.device.capture) {
          q.resolve(null);
          return q.promise;
        }

        navigator.device.capture.captureAudio(function (audioData) {
          q.resolve(audioData);
        }, function (err) {
          q.reject(err);
        }, options);

        return q.promise;
      },
      captureImage: function (options) {
        var q = $q.defer();

        if (!navigator.device.capture) {
          q.resolve(null);
          return q.promise;
        }

        navigator.device.capture.captureImage(function (imageData) {
          q.resolve(imageData);
        }, function (err) {
          q.reject(err);
        }, options);

        return q.promise;
      },
      captureVideo: function (options) {
        var q = $q.defer();

        if (!navigator.device.capture) {
          q.resolve(null);
          return q.promise;
        }

        navigator.device.capture.captureVideo(function (videoData) {
          q.resolve(videoData);
        }, function (err) {
          q.reject(err);
        }, options);

        return q.promise;
      }
    };
  }]);

// install   :     cordova plugin add https://github.com/VersoSolutions/CordovaClipboard.git
// link      :     https://github.com/VersoSolutions/CordovaClipboard

angular.module('ngCordova.plugins.clipboard', [])

  .factory('$cordovaClipboard', ['$q', '$window', function ($q, $window) {

    return {
      copy: function (text) {
        var q = $q.defer();

        $window.cordova.plugins.clipboard.copy(text,
          function () {
            q.resolve();
          }, function () {
            q.reject();
          });

        return q.promise;
      },

      paste: function () {
        var q = $q.defer();

        $window.cordova.plugins.clipboard.paste(function (text) {
          q.resolve(text);
        }, function () {
          q.reject();
        });

        return q.promise;
      }
    };
  }]);

// install   :     cordova plugin add cordova-plugin-contacts
// link      :     https://github.com/apache/cordova-plugin-contacts

angular.module('ngCordova.plugins.contacts', [])

  .factory('$cordovaContacts', ['$q', function ($q) {

    return {
      save: function (contact) {
        var q = $q.defer();
        var deviceContact = navigator.contacts.create(contact);

        deviceContact.save(function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });
        return q.promise;
      },

      remove: function (contact) {
        var q = $q.defer();
        var deviceContact = navigator.contacts.create(contact);

        deviceContact.remove(function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });
        return q.promise;
      },

      clone: function (contact) {
        var deviceContact = navigator.contacts.create(contact);
        return deviceContact.clone(contact);
      },

      find: function (options) {
        var q = $q.defer();
        var fields = options.fields || ['id', 'displayName'];
        delete options.fields;

        navigator.contacts.find(fields, function (results) {
          q.resolve(results);
        }, function (err) {
          q.reject(err);
        }, options);

        return q.promise;
      },

      pickContact: function () {
        var q = $q.defer();

        navigator.contacts.pickContact(function (contact) {
          q.resolve(contact);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      }

      // TODO: method to set / get ContactAddress
      // TODO: method to set / get ContactError
      // TODO: method to set / get ContactField
      // TODO: method to set / get ContactName
      // TODO: method to set / get ContactOrganization
    };
  }]);

// install   :      cordova plugin add https://github.com/VitaliiBlagodir/cordova-plugin-datepicker.git
// link      :      https://github.com/VitaliiBlagodir/cordova-plugin-datepicker

angular.module('ngCordova.plugins.datePicker', [])
  .factory('$cordovaDatePicker', ['$window', '$q', function ($window, $q) {
    return {
      show: function (options) {
        var q = $q.defer();
        options = options || {date: new Date(), mode: 'date'};
        $window.datePicker.show(options, function (date) {
          q.resolve(date);
        });
        return q.promise;
      }
    };
  }]);

// install   :     cordova plugin add cordova-plugin-device
// link      :     https://github.com/apache/cordova-plugin-device

angular.module('ngCordova.plugins.device', [])

  .factory('$cordovaDevice', [function () {

    return {
      /**
       * Returns the whole device object.
       * @see https://github.com/apache/cordova-plugin-device
       * @returns {Object} The device object.
       */
      getDevice: function () {
        return device;
      },

      /**
       * Returns the Cordova version.
       * @see https://github.com/apache/cordova-plugin-device#devicecordova
       * @returns {String} The Cordova version.
       */
      getCordova: function () {
        return device.cordova;
      },

      /**
       * Returns the name of the device's model or product.
       * @see https://github.com/apache/cordova-plugin-device#devicemodel
       * @returns {String} The name of the device's model or product.
       */
      getModel: function () {
        return device.model;
      },

      /**
       * @deprecated device.name is deprecated as of version 2.3.0. Use device.model instead.
       * @returns {String}
       */
      getName: function () {
        return device.name;
      },

      /**
       * Returns the device's operating system name.
       * @see https://github.com/apache/cordova-plugin-device#deviceplatform
       * @returns {String} The device's operating system name.
       */
      getPlatform: function () {
        return device.platform;
      },

      /**
       * Returns the device's Universally Unique Identifier.
       * @see https://github.com/apache/cordova-plugin-device#deviceuuid
       * @returns {String} The device's Universally Unique Identifier
       */
      getUUID: function () {
        return device.uuid;
      },

      /**
       * Returns the operating system version.
       * @see https://github.com/apache/cordova-plugin-device#deviceversion
       * @returns {String}
       */
      getVersion: function () {
        return device.version;
      }
    };
  }]);

// install   :     cordova plugin add cordova-plugin-device-motion
// link      :     https://github.com/apache/cordova-plugin-device-motion

angular.module('ngCordova.plugins.deviceMotion', [])

  .factory('$cordovaDeviceMotion', ['$q', function ($q) {

    return {
      getCurrentAcceleration: function () {
        var q = $q.defer();

        navigator.accelerometer.getCurrentAcceleration(function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      watchAcceleration: function (options) {
        var q = $q.defer();

        var watchID = navigator.accelerometer.watchAcceleration(function (result) {
          q.notify(result);
        }, function (err) {
          q.reject(err);
        }, options);

        q.promise.cancel = function () {
          navigator.accelerometer.clearWatch(watchID);
        };

        q.promise.clearWatch = function (id) {
          navigator.accelerometer.clearWatch(id || watchID);
        };

        q.promise.watchID = watchID;

        return q.promise;
      },

      clearWatch: function (watchID) {
        return navigator.accelerometer.clearWatch(watchID);
      }
    };
  }]);

// install   :     cordova plugin add cordova-plugin-device-orientation
// link      :     https://github.com/apache/cordova-plugin-device-orientation

angular.module('ngCordova.plugins.deviceOrientation', [])

  .factory('$cordovaDeviceOrientation', ['$q', function ($q) {
    var defaultOptions = {
      frequency: 3000 // every 3s
    };
    return {
      getCurrentHeading: function () {
        var q = $q.defer();

        navigator.compass.getCurrentHeading(function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      watchHeading: function (options) {
        var q = $q.defer();

        var _options = angular.extend(defaultOptions, options);
        var watchID = navigator.compass.watchHeading(function (result) {
          q.notify(result);
        }, function (err) {
          q.reject(err);
        }, _options);

        q.promise.cancel = function () {
          navigator.compass.clearWatch(watchID);
        };

        q.promise.clearWatch = function (id) {
          navigator.compass.clearWatch(id || watchID);
        };

        q.promise.watchID = watchID;

        return q.promise;
      },

      clearWatch: function (watchID) {
        return navigator.compass.clearWatch(watchID);
      }
    };
  }]);

// install   :     cordova plugin add cordova-plugin-dialogs
// link      :     https://github.com/apache/cordova-plugin-dialogs

angular.module('ngCordova.plugins.dialogs', [])

  .factory('$cordovaDialogs', ['$q', '$window', function ($q, $window) {

    return {
      alert: function (message, title, buttonName) {
        var q = $q.defer();

        if (!$window.navigator.notification) {
          $window.alert(message);
          q.resolve();
        } else {
          navigator.notification.alert(message, function () {
            q.resolve();
          }, title, buttonName);
        }

        return q.promise;
      },

      confirm: function (message, title, buttonLabels) {
        var q = $q.defer();

        if (!$window.navigator.notification) {
          if ($window.confirm(message)) {
            q.resolve(1);
          } else {
            q.resolve(2);
          }
        } else {
          navigator.notification.confirm(message, function (buttonIndex) {
            q.resolve(buttonIndex);
          }, title, buttonLabels);
        }

        return q.promise;
      },

      prompt: function (message, title, buttonLabels, defaultText) {
        var q = $q.defer();

        if (!$window.navigator.notification) {
          var res = $window.prompt(message, defaultText);
          if (res !== null) {
            q.resolve({input1: res, buttonIndex: 1});
          } else {
            q.resolve({input1: res, buttonIndex: 2});
          }
        } else {
          navigator.notification.prompt(message, function (result) {
            q.resolve(result);
          }, title, buttonLabels, defaultText);
        }
        return q.promise;
      },

      beep: function (times) {
        return navigator.notification.beep(times);
      }
    };
  }]);

// install  :     cordova plugin add https://github.com/katzer/cordova-plugin-email-composer.git
// link     :     https://github.com/katzer/cordova-plugin-email-composer

angular.module('ngCordova.plugins.emailComposer', [])

  .factory('$cordovaEmailComposer', ['$q', function ($q) {

    return {
      isAvailable: function () {
        var q = $q.defer();

        cordova.plugins.email.isAvailable(function (isAvailable) {
          if (isAvailable) {
            q.resolve();
          } else {
            q.reject();
          }
        });

        return q.promise;
      },

      open: function (properties) {
        var q = $q.defer();

        cordova.plugins.email.open(properties, function () {
          q.reject(); // user closed email composer
        });

        return q.promise;
      },

      addAlias: function (app, schema) {
        cordova.plugins.email.addAlias(app, schema);
      }
    };
  }]);

// install   :   cordova -d plugin add https://github.com/Wizcorp/phonegap-facebook-plugin.git --variable APP_ID="123456789" --variable APP_NAME="myApplication"
// link      :   https://github.com/Wizcorp/phonegap-facebook-plugin

angular.module('ngCordova.plugins.facebook', [])

  .provider('$cordovaFacebook', [function () {

    this.browserInit = function (id, version) {
      this.appID = id;
      this.appVersion = version || "v2.0";
      facebookConnectPlugin.browserInit(this.appID, this.appVersion);
    };

    this.$get = ['$q', function ($q) {
      return {
        login: function (permissions) {
          var q = $q.defer();
          facebookConnectPlugin.login(permissions, function (res) {
            q.resolve(res);
          }, function (res) {
            q.reject(res);
          });

          return q.promise;
        },

        showDialog: function (options) {
          var q = $q.defer();
          facebookConnectPlugin.showDialog(options, function (res) {
            q.resolve(res);
          }, function (err) {
            q.reject(err);
          });
          return q.promise;
        },

        api: function (path, permissions) {
          var q = $q.defer();
          facebookConnectPlugin.api(path, permissions, function (res) {
            q.resolve(res);
          }, function (err) {
            q.reject(err);
          });
          return q.promise;
        },

        getAccessToken: function () {
          var q = $q.defer();
          facebookConnectPlugin.getAccessToken(function (res) {
            q.resolve(res);
          }, function (err) {
            q.reject(err);
          });
          return q.promise;
        },

        getLoginStatus: function () {
          var q = $q.defer();
          facebookConnectPlugin.getLoginStatus(function (res) {
            q.resolve(res);
          }, function (err) {
            q.reject(err);
          });
          return q.promise;
        },

        logout: function () {
          var q = $q.defer();
          facebookConnectPlugin.logout(function (res) {
            q.resolve(res);
          }, function (err) {
            q.reject(err);
          });
          return q.promise;
        }
      };
    }];
  }]);

// install  :     cordova plugin add https://github.com/floatinghotpot/cordova-plugin-facebookads.git
// link     :     https://github.com/floatinghotpot/cordova-plugin-facebookads

angular.module('ngCordova.plugins.facebookAds', [])
  .factory('$cordovaFacebookAds', ['$q', '$window', function ($q, $window) {

    return {
      setOptions: function (options) {
        var d = $q.defer();

        $window.FacebookAds.setOptions(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      createBanner: function (options) {
        var d = $q.defer();

        $window.FacebookAds.createBanner(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      removeBanner: function () {
        var d = $q.defer();

        $window.FacebookAds.removeBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBanner: function (position) {
        var d = $q.defer();

        $window.FacebookAds.showBanner(position, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBannerAtXY: function (x, y) {
        var d = $q.defer();

        $window.FacebookAds.showBannerAtXY(x, y, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      hideBanner: function () {
        var d = $q.defer();

        $window.FacebookAds.hideBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      prepareInterstitial: function (options) {
        var d = $q.defer();

        $window.FacebookAds.prepareInterstitial(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showInterstitial: function () {
        var d = $q.defer();

        $window.FacebookAds.showInterstitial(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      }
    };
  }]);

// install   :     cordova plugin add cordova-plugin-file
// link      :     https://github.com/apache/cordova-plugin-file

angular.module('ngCordova.plugins.file', [])

  .constant("$cordovaFileError", {
    1: 'NOT_FOUND_ERR',
    2: 'SECURITY_ERR',
    3: 'ABORT_ERR',
    4: 'NOT_READABLE_ERR',
    5: 'ENCODING_ERR',
    6: 'NO_MODIFICATION_ALLOWED_ERR',
    7: 'INVALID_STATE_ERR',
    8: 'SYNTAX_ERR',
    9: 'INVALID_MODIFICATION_ERR',
    10: 'QUOTA_EXCEEDED_ERR',
    11: 'TYPE_MISMATCH_ERR',
    12: 'PATH_EXISTS_ERR'
  })

  .provider('$cordovaFile', [function () {

    this.$get = ['$q', '$window', '$cordovaFileError', function ($q, $window, $cordovaFileError) {

      return {

        getFreeDiskSpace: function () {
          var q = $q.defer();
          cordova.exec(function (result) {
            q.resolve(result);
          }, function (error) {
            q.reject(error);
          }, "File", "getFreeDiskSpace", []);
          return q.promise;
        },

        checkDir: function (path, dir) {
          var q = $q.defer();

          if ((/^\//.test(dir))) {
            q.reject("directory cannot start with \/");
          }

          try {
            var directory = path + dir;
            $window.resolveLocalFileSystemURL(directory, function (fileSystem) {
              if (fileSystem.isDirectory === true) {
                q.resolve(fileSystem);
              } else {
                q.reject({code: 13, message: "input is not a directory"});
              }
            }, function (error) {
              error.message = $cordovaFileError[error.code];
              q.reject(error);
            });
          } catch (err) {
            err.message = $cordovaFileError[err.code];
            q.reject(err);
          }

          return q.promise;
        },

        checkFile: function (path, file) {
          var q = $q.defer();

          if ((/^\//.test(file))) {
            q.reject("directory cannot start with \/");
          }

          try {
            var directory = path + file;
            $window.resolveLocalFileSystemURL(directory, function (fileSystem) {
              if (fileSystem.isFile === true) {
                q.resolve(fileSystem);
              } else {
                q.reject({code: 13, message: "input is not a file"});
              }
            }, function (error) {
              error.message = $cordovaFileError[error.code];
              q.reject(error);
            });
          } catch (err) {
            err.message = $cordovaFileError[err.code];
            q.reject(err);
          }

          return q.promise;
        },

        createDir: function (path, dirName, replaceBool) {
          var q = $q.defer();

          if ((/^\//.test(dirName))) {
            q.reject("directory cannot start with \/");
          }

          replaceBool = replaceBool ? false : true;

          var options = {
            create: true,
            exclusive: replaceBool
          };

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getDirectory(dirName, options, function (result) {
                q.resolve(result);
              }, function (error) {
                error.message = $cordovaFileError[error.code];
                q.reject(error);
              });
            }, function (err) {
              err.message = $cordovaFileError[err.code];
              q.reject(err);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }

          return q.promise;
        },

        createFile: function (path, fileName, replaceBool) {
          var q = $q.defer();

          if ((/^\//.test(fileName))) {
            q.reject("file-name cannot start with \/");
          }

          replaceBool = replaceBool ? false : true;

          var options = {
            create: true,
            exclusive: replaceBool
          };

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getFile(fileName, options, function (result) {
                q.resolve(result);
              }, function (error) {
                error.message = $cordovaFileError[error.code];
                q.reject(error);
              });
            }, function (err) {
              err.message = $cordovaFileError[err.code];
              q.reject(err);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }
          return q.promise;
        },

        removeDir: function (path, dirName) {
          var q = $q.defer();

          if ((/^\//.test(dirName))) {
            q.reject("file-name cannot start with \/");
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getDirectory(dirName, {create: false}, function (dirEntry) {
                dirEntry.remove(function () {
                  q.resolve({success: true, fileRemoved: dirEntry});
                }, function (error) {
                  error.message = $cordovaFileError[error.code];
                  q.reject(error);
                });
              }, function (err) {
                err.message = $cordovaFileError[err.code];
                q.reject(err);
              });
            }, function (er) {
              er.message = $cordovaFileError[er.code];
              q.reject(er);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }
          return q.promise;
        },

        removeFile: function (path, fileName) {
          var q = $q.defer();

          if ((/^\//.test(fileName))) {
            q.reject("file-name cannot start with \/");
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getFile(fileName, {create: false}, function (fileEntry) {
                fileEntry.remove(function () {
                  q.resolve({success: true, fileRemoved: fileEntry});
                }, function (error) {
                  error.message = $cordovaFileError[error.code];
                  q.reject(error);
                });
              }, function (err) {
                err.message = $cordovaFileError[err.code];
                q.reject(err);
              });
            }, function (er) {
              er.message = $cordovaFileError[er.code];
              q.reject(er);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }
          return q.promise;
        },

        removeRecursively: function (path, dirName) {
          var q = $q.defer();

          if ((/^\//.test(dirName))) {
            q.reject("file-name cannot start with \/");
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getDirectory(dirName, {create: false}, function (dirEntry) {
                dirEntry.removeRecursively(function () {
                  q.resolve({success: true, fileRemoved: dirEntry});
                }, function (error) {
                  error.message = $cordovaFileError[error.code];
                  q.reject(error);
                });
              }, function (err) {
                err.message = $cordovaFileError[err.code];
                q.reject(err);
              });
            }, function (er) {
              er.message = $cordovaFileError[er.code];
              q.reject(er);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }
          return q.promise;
        },

        writeFile: function (path, fileName, text, replaceBool) {
          var q = $q.defer();

          if ((/^\//.test(fileName))) {
            q.reject("file-name cannot start with \/");
          }

          replaceBool = replaceBool ? false : true;

          var options = {
            create: true,
            exclusive: replaceBool
          };

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getFile(fileName, options, function (fileEntry) {
                fileEntry.createWriter(function (writer) {
                  if (options.append === true) {
                    writer.seek(writer.length);
                  }

                  if (options.truncate) {
                    writer.truncate(options.truncate);
                  }

                  writer.onwriteend = function (evt) {
                    if (this.error) {
                      q.reject(this.error);
                    } else {
                      q.resolve(evt);
                    }
                  };

                  writer.write(text);

                  q.promise.abort = function () {
                    writer.abort();
                  };
                });
              }, function (error) {
                error.message = $cordovaFileError[error.code];
                q.reject(error);
              });
            }, function (err) {
              err.message = $cordovaFileError[err.code];
              q.reject(err);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }

          return q.promise;
        },

        writeExistingFile: function (path, fileName, text) {
          var q = $q.defer();

          if ((/^\//.test(fileName))) {
            q.reject("file-name cannot start with \/");
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getFile(fileName, {create: false}, function (fileEntry) {
                fileEntry.createWriter(function (writer) {
                  writer.seek(writer.length);

                  writer.onwriteend = function (evt) {
                    if (this.error) {
                      q.reject(this.error);
                    } else {
                      q.resolve(evt);
                    }
                  };

                  writer.write(text);

                  q.promise.abort = function () {
                    writer.abort();
                  };
                });
              }, function (error) {
                error.message = $cordovaFileError[error.code];
                q.reject(error);
              });
            }, function (err) {
              err.message = $cordovaFileError[err.code];
              q.reject(err);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }

          return q.promise;
        },

        readAsText: function (path, file) {
          var q = $q.defer();

          if ((/^\//.test(file))) {
            q.reject("file-name cannot start with \/");
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getFile(file, {create: false}, function (fileEntry) {
                fileEntry.file(function (fileData) {
                  var reader = new FileReader();

                  reader.onloadend = function (evt) {
                    if (evt.target.result !== undefined || evt.target.result !== null) {
                      q.resolve(evt.target.result);
                    } else if (evt.target.error !== undefined || evt.target.error !== null) {
                      q.reject(evt.target.error);
                    } else {
                      q.reject({code: null, message: 'READER_ONLOADEND_ERR'});
                    }
                  };

                  reader.readAsText(fileData);
                });
              }, function (error) {
                error.message = $cordovaFileError[error.code];
                q.reject(error);
              });
            }, function (err) {
              err.message = $cordovaFileError[err.code];
              q.reject(err);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }

          return q.promise;
        },

        readAsDataURL: function (path, file) {
          var q = $q.defer();

          if ((/^\//.test(file))) {
            q.reject("file-name cannot start with \/");
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getFile(file, {create: false}, function (fileEntry) {
                fileEntry.file(function (fileData) {
                  var reader = new FileReader();
                  reader.onloadend = function (evt) {
                    if (evt.target.result !== undefined || evt.target.result !== null) {
                      q.resolve(evt.target.result);
                    } else if (evt.target.error !== undefined || evt.target.error !== null) {
                      q.reject(evt.target.error);
                    } else {
                      q.reject({code: null, message: 'READER_ONLOADEND_ERR'});
                    }
                  };
                  reader.readAsDataURL(fileData);
                });
              }, function (error) {
                error.message = $cordovaFileError[error.code];
                q.reject(error);
              });
            }, function (err) {
              err.message = $cordovaFileError[err.code];
              q.reject(err);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }

          return q.promise;
        },

        readAsBinaryString: function (path, file) {
          var q = $q.defer();

          if ((/^\//.test(file))) {
            q.reject("file-name cannot start with \/");
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getFile(file, {create: false}, function (fileEntry) {
                fileEntry.file(function (fileData) {
                  var reader = new FileReader();
                  reader.onloadend = function (evt) {
                    if (evt.target.result !== undefined || evt.target.result !== null) {
                      q.resolve(evt.target.result);
                    } else if (evt.target.error !== undefined || evt.target.error !== null) {
                      q.reject(evt.target.error);
                    } else {
                      q.reject({code: null, message: 'READER_ONLOADEND_ERR'});
                    }
                  };
                  reader.readAsBinaryString(fileData);
                });
              }, function (error) {
                error.message = $cordovaFileError[error.code];
                q.reject(error);
              });
            }, function (err) {
              err.message = $cordovaFileError[err.code];
              q.reject(err);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }

          return q.promise;
        },

        readAsArrayBuffer: function (path, file) {
          var q = $q.defer();

          if ((/^\//.test(file))) {
            q.reject("file-name cannot start with \/");
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getFile(file, {create: false}, function (fileEntry) {
                fileEntry.file(function (fileData) {
                  var reader = new FileReader();
                  reader.onloadend = function (evt) {
                    if (evt.target.result !== undefined || evt.target.result !== null) {
                      q.resolve(evt.target.result);
                    } else if (evt.target.error !== undefined || evt.target.error !== null) {
                      q.reject(evt.target.error);
                    } else {
                      q.reject({code: null, message: 'READER_ONLOADEND_ERR'});
                    }
                  };
                  reader.readAsArrayBuffer(fileData);
                });
              }, function (error) {
                error.message = $cordovaFileError[error.code];
                q.reject(error);
              });
            }, function (err) {
              err.message = $cordovaFileError[err.code];
              q.reject(err);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }

          return q.promise;
        },

        moveFile: function (path, fileName, newPath, newFileName) {
          var q = $q.defer();

          newFileName = newFileName || fileName;

          if ((/^\//.test(fileName)) || (/^\//.test(newFileName))) {
            q.reject("file-name cannot start with \/");
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getFile(fileName, {create: false}, function (fileEntry) {
                $window.resolveLocalFileSystemURL(newPath, function (newFileEntry) {
                  fileEntry.moveTo(newFileEntry, newFileName, function (result) {
                    q.resolve(result);
                  }, function (error) {
                    q.reject(error);
                  });
                }, function (err) {
                  q.reject(err);
                });
              }, function (err) {
                q.reject(err);
              });
            }, function (er) {
              q.reject(er);
            });
          } catch (e) {
            q.reject(e);
          }
          return q.promise;
        },

        moveDir: function (path, dirName, newPath, newDirName) {
          var q = $q.defer();

          newDirName = newDirName || dirName;

          if (/^\//.test(dirName) || (/^\//.test(newDirName))) {
            q.reject("file-name cannot start with \/");
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getDirectory(dirName, {create: false}, function (dirEntry) {
                $window.resolveLocalFileSystemURL(newPath, function (newDirEntry) {
                  dirEntry.moveTo(newDirEntry, newDirName, function (result) {
                    q.resolve(result);
                  }, function (error) {
                    q.reject(error);
                  });
                }, function (erro) {
                  q.reject(erro);
                });
              }, function (err) {
                q.reject(err);
              });
            }, function (er) {
              q.reject(er);
            });
          } catch (e) {
            q.reject(e);
          }
          return q.promise;
        },

        copyDir: function (path, dirName, newPath, newDirName) {
          var q = $q.defer();

          newDirName = newDirName || dirName;

          if (/^\//.test(dirName) || (/^\//.test(newDirName))) {
            q.reject("file-name cannot start with \/");
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getDirectory(dirName, {create: false, exclusive: false}, function (dirEntry) {

                $window.resolveLocalFileSystemURL(newPath, function (newDirEntry) {
                  dirEntry.copyTo(newDirEntry, newDirName, function (result) {
                    q.resolve(result);
                  }, function (error) {
                    error.message = $cordovaFileError[error.code];
                    q.reject(error);
                  });
                }, function (erro) {
                  erro.message = $cordovaFileError[erro.code];
                  q.reject(erro);
                });
              }, function (err) {
                err.message = $cordovaFileError[err.code];
                q.reject(err);
              });
            }, function (er) {
              er.message = $cordovaFileError[er.code];
              q.reject(er);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }
          return q.promise;
        },

        copyFile: function (path, fileName, newPath, newFileName) {
          var q = $q.defer();

          newFileName = newFileName || fileName;

          if ((/^\//.test(fileName))) {
            q.reject("file-name cannot start with \/");
          }

          try {
            $window.resolveLocalFileSystemURL(path, function (fileSystem) {
              fileSystem.getFile(fileName, {create: false, exclusive: false}, function (fileEntry) {

                $window.resolveLocalFileSystemURL(newPath, function (newFileEntry) {
                  fileEntry.copyTo(newFileEntry, newFileName, function (result) {
                    q.resolve(result);
                  }, function (error) {
                    error.message = $cordovaFileError[error.code];
                    q.reject(error);
                  });
                }, function (erro) {
                  erro.message = $cordovaFileError[erro.code];
                  q.reject(erro);
                });
              }, function (err) {
                err.message = $cordovaFileError[err.code];
                q.reject(err);
              });
            }, function (er) {
              er.message = $cordovaFileError[er.code];
              q.reject(er);
            });
          } catch (e) {
            e.message = $cordovaFileError[e.code];
            q.reject(e);
          }
          return q.promise;
        }

        /*
         listFiles: function (path, dir) {

         },

         listDir: function (path, dirName) {
         var q = $q.defer();

         try {
         $window.resolveLocalFileSystemURL(path, function (fileSystem) {
         fileSystem.getDirectory(dirName, options, function (parent) {
         var reader = parent.createReader();
         reader.readEntries(function (entries) {
         q.resolve(entries);
         }, function () {
         q.reject('DIR_READ_ERROR : ' + path + dirName);
         });
         }, function (error) {
         error.message = $cordovaFileError[error.code];
         q.reject(error);
         });
         }, function (err) {
         err.message = $cordovaFileError[err.code];
         q.reject(err);
         });
         } catch (e) {
         e.message = $cordovaFileError[e.code];
         q.reject(e);
         }

         return q.promise;
         },

         readFileMetadata: function (filePath) {
         //return getFile(filePath, {create: false});
         }
         */
      };

    }];
  }]);

// install   :      cordova plugin add https://github.com/pwlin/cordova-plugin-file-opener2.git
// link      :      https://github.com/pwlin/cordova-plugin-file-opener2

angular.module('ngCordova.plugins.fileOpener2', [])

  .factory('$cordovaFileOpener2', ['$q', function ($q) {

    return {
      open: function (file, type) {
        var q = $q.defer();
        cordova.plugins.fileOpener2.open(file, type, {
          error: function (e) {
            q.reject(e);
          }, success: function () {
            q.resolve();
          }
        });
        return q.promise;
      },

      uninstall: function (pack) {
        var q = $q.defer();
        cordova.plugins.fileOpener2.uninstall(pack, {
          error: function (e) {
            q.reject(e);
          }, success: function () {
            q.resolve();
          }
        });
        return q.promise;
      },

      appIsInstalled: function (pack) {
        var q = $q.defer();
        cordova.plugins.fileOpener2.appIsInstalled(pack, {
          success: function (res) {
            q.resolve(res);
          }
        });
        return q.promise;
      }
    };
  }]);

// install   :     cordova plugin add cordova-plugin-file-transfer
// link      :     https://github.com/apache/cordova-plugin-file-transfer

angular.module('ngCordova.plugins.fileTransfer', [])

  .factory('$cordovaFileTransfer', ['$q', '$timeout', function ($q, $timeout) {
    return {
      download: function (source, filePath, options, trustAllHosts) {
        var q = $q.defer();
        var ft = new FileTransfer();
        var uri = (options && options.encodeURI === false) ? source : encodeURI(source);

        if (options && options.timeout !== undefined && options.timeout !== null) {
          $timeout(function () {
            ft.abort();
          }, options.timeout);
          options.timeout = null;
        }

        ft.onprogress = function (progress) {
          q.notify(progress);
        };

        q.promise.abort = function () {
          ft.abort();
        };

        ft.download(uri, filePath, q.resolve, q.reject, trustAllHosts, options);
        return q.promise;
      },

      upload: function (server, filePath, options, trustAllHosts) {
        var q = $q.defer();
        var ft = new FileTransfer();
        var uri = (options && options.encodeURI === false) ? server : encodeURI(server);

        if (options && options.timeout !== undefined && options.timeout !== null) {
          $timeout(function () {
            ft.abort();
          }, options.timeout);
          options.timeout = null;
        }

        ft.onprogress = function (progress) {
          q.notify(progress);
        };

        q.promise.abort = function () {
          ft.abort();
        };

        ft.upload(filePath, uri, q.resolve, q.reject, options, trustAllHosts);
        return q.promise;
      }
    };
  }]);

// install   :     cordova plugin add https://github.com/EddyVerbruggen/Flashlight-PhoneGap-Plugin.git
// link      :     https://github.com/EddyVerbruggen/Flashlight-PhoneGap-Plugin

angular.module('ngCordova.plugins.flashlight', [])

  .factory('$cordovaFlashlight', ['$q', '$window', function ($q, $window) {

    return {
      available: function () {
        var q = $q.defer();
        $window.plugins.flashlight.available(function (isAvailable) {
          q.resolve(isAvailable);
        });
        return q.promise;
      },

      switchOn: function () {
        var q = $q.defer();
        $window.plugins.flashlight.switchOn(function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      switchOff: function () {
        var q = $q.defer();
        $window.plugins.flashlight.switchOff(function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      toggle: function () {
        var q = $q.defer();
        $window.plugins.flashlight.toggle(function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      }
    };
  }]);

// install  :     cordova plugin add https://github.com/floatinghotpot/cordova-plugin-flurry.git
// link     :     https://github.com/floatinghotpot/cordova-plugin-flurry

angular.module('ngCordova.plugins.flurryAds', [])
  .factory('$cordovaFlurryAds', ['$q', '$window', function ($q, $window) {

    return {
      setOptions: function (options) {
        var d = $q.defer();

        $window.FlurryAds.setOptions(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      createBanner: function (options) {
        var d = $q.defer();

        $window.FlurryAds.createBanner(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      removeBanner: function () {
        var d = $q.defer();

        $window.FlurryAds.removeBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBanner: function (position) {
        var d = $q.defer();

        $window.FlurryAds.showBanner(position, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBannerAtXY: function (x, y) {
        var d = $q.defer();

        $window.FlurryAds.showBannerAtXY(x, y, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      hideBanner: function () {
        var d = $q.defer();

        $window.FlurryAds.hideBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      prepareInterstitial: function (options) {
        var d = $q.defer();

        $window.FlurryAds.prepareInterstitial(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showInterstitial: function () {
        var d = $q.defer();

        $window.FlurryAds.showInterstitial(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      }
    };
  }]);

// install   :     cordova plugin add https://github.com/phonegap-build/GAPlugin.git
// link      :     https://github.com/phonegap-build/GAPlugin

angular.module('ngCordova.plugins.ga', [])

  .factory('$cordovaGA', ['$q', '$window', function ($q, $window) {

    return {
      init: function (id, mingap) {
        var q = $q.defer();
        mingap = (mingap >= 0) ? mingap : 10;
        $window.plugins.gaPlugin.init(function (result) {
            q.resolve(result);
          },
          function (error) {
            q.reject(error);
          },
          id, mingap);
        return q.promise;
      },

      trackEvent: function (success, fail, category, eventAction, eventLabel, eventValue) {
        var q = $q.defer();
        $window.plugins.gaPlugin.trackEvent(function (result) {
            q.resolve(result);
          },
          function (error) {
            q.reject(error);
          },
          category, eventAction, eventLabel, eventValue);
        return q.promise;
      },

      trackPage: function (success, fail, pageURL) {
        var q = $q.defer();
        $window.plugins.gaPlugin.trackPage(function (result) {
            q.resolve(result);
          },
          function (error) {
            q.reject(error);
          },
          pageURL);
        return q.promise;
      },

      setVariable: function (success, fail, index, value) {
        var q = $q.defer();
        $window.plugins.gaPlugin.setVariable(function (result) {
            q.resolve(result);
          },
          function (error) {
            q.reject(error);
          },
          index, value);
        return q.promise;
      },

      exit: function (success, fail) {
        var q = $q.defer();
        $window.plugins.gaPlugin.exit(function (result) {
            q.resolve(result);
          },
          function (error) {
            q.reject(error);
          });
        return q.promise;
      }
    };
  }]);

// install   :     cordova plugin add cordova-plugin-geolocation
// link      :     https://github.com/apache/cordova-plugin-geolocation

angular.module('ngCordova.plugins.geolocation', [])

  .factory('$cordovaGeolocation', ['$q', function ($q) {

    return {
      getCurrentPosition: function (options) {
        var q = $q.defer();

        navigator.geolocation.getCurrentPosition(function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        }, options);

        return q.promise;
      },

      watchPosition: function (options) {
        var q = $q.defer();

        var watchID = navigator.geolocation.watchPosition(function (result) {
          q.notify(result);
        }, function (err) {
          q.reject(err);
        }, options);

        q.promise.cancel = function () {
          navigator.geolocation.clearWatch(watchID);
        };

        q.promise.clearWatch = function (id) {
          navigator.geolocation.clearWatch(id || watchID);
        };

        q.promise.watchID = watchID;

        return q.promise;
      },

      clearWatch: function (watchID) {
        return navigator.geolocation.clearWatch(watchID);
      }
    };
  }]);

// install   :      cordova plugin add cordova-plugin-globalization
// link      :      https://github.com/apache/cordova-plugin-globalization

angular.module('ngCordova.plugins.globalization', [])

  .factory('$cordovaGlobalization', ['$q', function ($q) {

    return {
      getPreferredLanguage: function () {
        var q = $q.defer();

        navigator.globalization.getPreferredLanguage(function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          });
        return q.promise;
      },

      getLocaleName: function () {
        var q = $q.defer();

        navigator.globalization.getLocaleName(function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          });
        return q.promise;
      },

      getFirstDayOfWeek: function () {
        var q = $q.defer();

        navigator.globalization.getFirstDayOfWeek(function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          });
        return q.promise;
      },

      // "date" parameter must be a JavaScript Date Object.
      dateToString: function (date, options) {
        var q = $q.defer();

        navigator.globalization.dateToString(
          date,
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          },
          options);
        return q.promise;
      },

      stringToDate: function (dateString, options) {
        var q = $q.defer();

        navigator.globalization.stringToDate(
          dateString,
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          },
          options);
        return q.promise;
      },

      getDatePattern: function (options) {
        var q = $q.defer();

        navigator.globalization.getDatePattern(
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          },
          options);
        return q.promise;
      },

      getDateNames: function (options) {
        var q = $q.defer();

        navigator.globalization.getDateNames(
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          },
          options);
        return q.promise;
      },

      // "date" parameter must be a JavaScript Date Object.
      isDayLightSavingsTime: function (date) {
        var q = $q.defer();

        navigator.globalization.isDayLightSavingsTime(
          date,
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          });
        return q.promise;
      },

      numberToString: function (number, options) {
        var q = $q.defer();

        navigator.globalization.numberToString(
          number,
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          },
          options);
        return q.promise;
      },

      stringToNumber: function (numberString, options) {
        var q = $q.defer();

        navigator.globalization.stringToNumber(
          numberString,
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          },
          options);
        return q.promise;
      },

      getNumberPattern: function (options) {
        var q = $q.defer();

        navigator.globalization.getNumberPattern(
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          },
          options);
        return q.promise;
      },

      getCurrencyPattern: function (currencyCode) {
        var q = $q.defer();

        navigator.globalization.getCurrencyPattern(
          currencyCode,
          function (result) {
            q.resolve(result);
          },
          function (err) {
            q.reject(err);
          });
        return q.promise;
      }

    };
  }]);

// install  :     cordova plugin add https://github.com/floatinghotpot/cordova-admob-pro.git
// link     :     https://github.com/floatinghotpot/cordova-admob-pro

angular.module('ngCordova.plugins.googleAds', [])
  .factory('$cordovaGoogleAds', ['$q', '$window', function ($q, $window) {

    return {
      setOptions: function (options) {
        var d = $q.defer();

        $window.AdMob.setOptions(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      createBanner: function (options) {
        var d = $q.defer();

        $window.AdMob.createBanner(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      removeBanner: function () {
        var d = $q.defer();

        $window.AdMob.removeBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBanner: function (position) {
        var d = $q.defer();

        $window.AdMob.showBanner(position, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBannerAtXY: function (x, y) {
        var d = $q.defer();

        $window.AdMob.showBannerAtXY(x, y, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      hideBanner: function () {
        var d = $q.defer();

        $window.AdMob.hideBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      prepareInterstitial: function (options) {
        var d = $q.defer();

        $window.AdMob.prepareInterstitial(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showInterstitial: function () {
        var d = $q.defer();

        $window.AdMob.showInterstitial(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      }
    };
  }]);

// install   :     cordova plugin add https://github.com/danwilson/google-analytics-plugin.git
// link      :     https://github.com/danwilson/google-analytics-plugin

angular.module('ngCordova.plugins.googleAnalytics', [])

  .factory('$cordovaGoogleAnalytics', ['$q', '$window', function ($q, $window) {

    return {
      startTrackerWithId: function (id) {
        var d = $q.defer();

        $window.analytics.startTrackerWithId(id, function (response) {
          d.resolve(response);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      setUserId: function (id) {
        var d = $q.defer();

        $window.analytics.setUserId(id, function (response) {
          d.resolve(response);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      debugMode: function () {
        var d = $q.defer();

        $window.analytics.debugMode(function (response) {
          d.resolve(response);
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      trackView: function (screenName) {
        var d = $q.defer();

        $window.analytics.trackView(screenName, function (response) {
          d.resolve(response);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      addCustomDimension: function (key, value) {
        var d = $q.defer();

        $window.analytics.addCustomDimension(key, value, function () {
          d.resolve();
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      trackEvent: function (category, action, label, value) {
        var d = $q.defer();

        $window.analytics.trackEvent(category, action, label, value, function (response) {
          d.resolve(response);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      trackException: function (description, fatal) {
        var d = $q.defer();

        $window.analytics.trackException(description, fatal, function (response) {
          d.resolve(response);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      trackTiming: function (category, milliseconds, variable, label) {
        var d = $q.defer();

        $window.analytics.trackTiming(category, milliseconds, variable, label, function (response) {
          d.resolve(response);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      addTransaction: function (transactionId, affiliation, revenue, tax, shipping, currencyCode) {
        var d = $q.defer();

        $window.analytics.addTransaction(transactionId, affiliation, revenue, tax, shipping, currencyCode, function (response) {
          d.resolve(response);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      },

      addTransactionItem: function (transactionId, name, sku, category, price, quantity, currencyCode) {
        var d = $q.defer();

        $window.analytics.addTransactionItem(transactionId, name, sku, category, price, quantity, currencyCode, function (response) {
          d.resolve(response);
        }, function (error) {
          d.reject(error);
        });

        return d.promise;
      }
    };
  }]);

// install   :
// link      :

// Google Maps needs ALOT of work!
// Not for production use

angular.module('ngCordova.plugins.googleMap', [])

  .factory('$cordovaGoogleMap', ['$q', '$window', function ($q, $window) {

    var map = null;

    return {
      getMap: function (options) {
        var q = $q.defer();

        if (!$window.plugin.google.maps) {
          q.reject(null);
        } else {
          var div = document.getElementById("map_canvas");
          map = $window.plugin.google.maps.Map.getMap(options);
          map.setDiv(div);
          q.resolve(map);
        }
        return q.promise;
      },

      isMapLoaded: function () { // check if an instance of the map exists
        return !!map;
      },
      addMarker: function (markerOptions) { // add a marker to the map with given markerOptions
        var q = $q.defer();
        map.addMarker(markerOptions, function (marker) {
          q.resolve(marker);
        });

        return q.promise;
      },
      getMapTypeIds: function () {
        return $window.plugin.google.maps.mapTypeId;
      },
      setVisible: function (isVisible) {
        var q = $q.defer();
        map.setVisible(isVisible);
        return q.promise;
      },
      // I don't know how to deallocate te map and the google map plugin.
      cleanup: function () {
        map = null;
        // delete map;
      }
    };
  }]);

// install   :   cordova plugin add https://github.com/ptgamr/cordova-google-play-game.git --variable APP_ID=123456789
// link      :   https://github.com/ptgamr/cordova-google-play-game

angular.module('ngCordova.plugins.googlePlayGame', [])

  .factory('$cordovaGooglePlayGame', ['$q', function ($q) {

    return {

      auth: function () {
        var q = $q.defer();

        googleplaygame.auth(function (success) {
          return q.resolve(success);
        }, function (err) {
          return q.reject(err);
        });

        return q.promise;
      },
      signout: function () {
        var q = $q.defer();

        googleplaygame.signout(function (success) {
          return q.resolve(success);
        }, function (err) {
          return q.reject(err);
        });

        return q.promise;
      },
      isSignedIn: function () {
        var q = $q.defer();

        googleplaygame.isSignedIn(function (success) {
          return q.resolve(success);
        }, function (err) {
          return q.reject(err);
        });

        return q.promise;
      },
      showPlayer: function () {
        var q = $q.defer();

        googleplaygame.showPlayer(function (success) {
          return q.resolve(success);
        }, function (err) {
          return q.reject(err);
        });

        return q.promise;
      },
      submitScore: function (data) {
        var q = $q.defer();

        googleplaygame.submitScore(data, function (success) {
          return q.resolve(success);
        }, function (err) {
          return q.reject(err);
        });

        return q.promise;
      },
      showAllLeaderboards: function () {
        var q = $q.defer();

        googleplaygame.showAllLeaderboards(function (success) {
          return q.resolve(success);
        }, function (err) {
          return q.reject(err);
        });

        return q.promise;
      },
      showLeaderboard: function (data) {
        var q = $q.defer();

        googleplaygame.showLeaderboard(data, function (success) {
          return q.resolve(success);
        }, function (err) {
          return q.reject(err);
        });

        return q.promise;
      },
      unlockAchievement: function (data) {
        var q = $q.defer();

        googleplaygame.unlockAchievement(data, function (success) {
          return q.resolve(success);
        }, function (err) {
          return q.reject(err);
        });

        return q.promise;
      },
      incrementAchievement: function (data) {
        var q = $q.defer();

        googleplaygame.incrementAchievement(data, function (success) {
          return q.resolve(success);
        }, function (err) {
          return q.reject(err);
        });

        return q.promise;
      },
      showAchievements: function () {
        var q = $q.defer();

        googleplaygame.showAchievements(function (success) {
          return q.resolve(success);
        }, function (err) {
          return q.reject(err);
        });

        return q.promise;
      }
    };

  }]);

// install  :     cordova plugin add https://github.com/EddyVerbruggen/cordova-plugin-googleplus.git
// link     :     https://github.com/EddyVerbruggen/cordova-plugin-googleplus

angular.module('ngCordova.plugins.googleplus', [])

  .factory('$cordovaGooglePlus', ['$q', '$window', function ($q, $window) {

    return {
      login: function (iosKey) {
        var q = $q.defer();

        if (iosKey === undefined) {
          iosKey = {};
        }
        $window.plugins.googleplus.login({'iOSApiKey': iosKey}, function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });

        return q.promise;
      },

      silentLogin: function (iosKey) {
        var q = $q.defer();

        if (iosKey === undefined) {
          iosKey = {};
        }
        $window.plugins.googleplus.trySilentLogin({'iOSApiKey': iosKey}, function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });

        return q.promise;
      },

      logout: function () {
        var q = $q.defer();
        $window.plugins.googleplus.logout(function (response) {
          q.resolve(response);
        });
      },

      disconnect: function () {
        var q = $q.defer();
        $window.plugins.googleplus.disconnect(function (response) {
          q.resolve(response);
        });
      }
    };

  }]);

// install   :      cordova plugin add https://github.com/Telerik-Verified-Plugins/HealthKit.git
// link      :      https://github.com/Telerik-Verified-Plugins/HealthKit

angular.module('ngCordova.plugins.healthKit', [])

  .factory('$cordovaHealthKit', ['$q', '$window', function ($q, $window) {

    return {
      isAvailable: function () {
        var q = $q.defer();

        $window.plugins.healthkit.available(function (success) {
          q.resolve(success);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      /**
       * Check whether or not the user granted your app access to a specific HealthKit type.
       * Reference for possible types:
       * https://developer.apple.com/library/ios/documentation/HealthKit/Reference/HealthKit_Constants/
       */
      checkAuthStatus: function (type) {
        var q = $q.defer();

        type = type || 'HKQuantityTypeIdentifierHeight';

        $window.plugins.healthkit.checkAuthStatus({
          'type': type
        }, function (success) {
          q.resolve(success);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      /**
       * Request authorization to access HealthKit data. See the full HealthKit constants
       * reference for possible read and write types:
       * https://developer.apple.com/library/ios/documentation/HealthKit/Reference/HealthKit_Constants/
       */
      requestAuthorization: function (readTypes, writeTypes) {
        var q = $q.defer();

        readTypes = readTypes || [
          'HKCharacteristicTypeIdentifierDateOfBirth', 'HKQuantityTypeIdentifierActiveEnergyBurned', 'HKQuantityTypeIdentifierHeight'
        ];
        writeTypes = writeTypes || [
          'HKQuantityTypeIdentifierActiveEnergyBurned', 'HKQuantityTypeIdentifierHeight', 'HKQuantityTypeIdentifierDistanceCycling'
        ];

        $window.plugins.healthkit.requestAuthorization({
          'readTypes': readTypes,
          'writeTypes': writeTypes
        }, function (success) {
          q.resolve(success);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      readDateOfBirth: function () {
        var q = $q.defer();
        $window.plugins.healthkit.readDateOfBirth(
          function (success) {
            q.resolve(success);
          },
          function (err) {
            q.resolve(err);
          }
        );

        return q.promise;
      },

      readGender: function () {
        var q = $q.defer();
        $window.plugins.healthkit.readGender(
          function (success) {
            q.resolve(success);
          },
          function (err) {
            q.resolve(err);
          }
        );

        return q.promise;
      },

      saveWeight: function (value, units, date) {
        var q = $q.defer();
        $window.plugins.healthkit.saveWeight({
            'unit': units || 'lb',
            'amount': value,
            'date': date || new Date()
          },
          function (success) {
            q.resolve(success);
          },
          function (err) {
            q.resolve(err);
          }
        );
        return q.promise;
      },

      readWeight: function (units) {
        var q = $q.defer();
        $window.plugins.healthkit.readWeight({
            'unit': units || 'lb'
          },
          function (success) {
            q.resolve(success);
          },
          function (err) {
            q.resolve(err);
          }
        );

        return q.promise;
      },
      saveHeight: function (value, units, date) {
        var q = $q.defer();
        $window.plugins.healthkit.saveHeight({
            'unit': units || 'in',
            'amount': value,
            'date': date || new Date()
          },
          function (success) {
            q.resolve(success);
          },
          function (err) {
            q.resolve(err);
          }
        );
        return q.promise;
      },
      readHeight: function (units) {
        var q = $q.defer();
        $window.plugins.healthkit.readHeight({
            'unit': units || 'in'
          },
          function (success) {
            q.resolve(success);
          },
          function (err) {
            q.resolve(err);
          }
        );

        return q.promise;
      },

      findWorkouts: function () {
        var q = $q.defer();
        $window.plugins.healthkit.findWorkouts({},
          function (success) {
            q.resolve(success);
          },
          function (err) {
            q.resolve(err);
          }
        );
        return q.promise;
      },

      /**
       * Save a workout.
       *
       * Workout param should be of the format:
       {
         'activityType': 'HKWorkoutActivityTypeCycling', // HKWorkoutActivityType constant (https://developer.apple.com/library/ios/documentation/HealthKit/Reference/HKWorkout_Class/#//apple_ref/c/tdef/HKWorkoutActivityType)
         'quantityType': 'HKQuantityTypeIdentifierDistanceCycling',
         'startDate': new Date(), // mandatory
         'endDate': null, // optional, use either this or duration
         'duration': 3600, // in seconds, optional, use either this or endDate
         'energy': 300, //
         'energyUnit': 'kcal', // J|cal|kcal
         'distance': 11, // optional
         'distanceUnit': 'km' // probably useful with the former param
         // 'extraData': "", // Not sure how necessary this is
       },
       */
      saveWorkout: function (workout) {
        var q = $q.defer();
        $window.plugins.healthkit.saveWorkout(workout,
          function (success) {
            q.resolve(success);
          },
          function (err) {
            q.resolve(err);
          }
        );
        return q.promise;
      },

      /**
       * Sample any kind of health data through a given date range.
       * sampleQuery of the format:
       {
									'startDate': yesterday, // mandatory
									'endDate': tomorrow, // mandatory
									'sampleType': 'HKQuantityTypeIdentifierHeight',
									'unit' : 'cm'
							},
       */
      querySampleType: function (sampleQuery) {
        var q = $q.defer();
        $window.plugins.healthkit.querySampleType(sampleQuery,
          function (success) {
            q.resolve(success);
          },
          function (err) {
            q.resolve(err);
          }
        );
        return q.promise;
      }
    };
  }]);

// install  :     cordova plugin add https://github.com/floatinghotpot/cordova-httpd.git
// link     :     https://github.com/floatinghotpot/cordova-httpd

angular.module('ngCordova.plugins.httpd', [])
  .factory('$cordovaHttpd', ['$q', function ($q) {

    return {
      startServer: function (options) {
        var d = $q.defer();

        cordova.plugins.CorHttpd.startServer(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      stopServer: function () {
        var d = $q.defer();

        cordova.plugins.CorHttpd.stopServer(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      getURL: function () {
        var d = $q.defer();

        cordova.plugins.CorHttpd.getURL(function (url) {
          d.resolve(url);
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      getLocalPath: function () {
        var d = $q.defer();

        cordova.plugins.CorHttpd.getLocalPath(function (path) {
          d.resolve(path);
        }, function () {
          d.reject();
        });

        return d.promise;
      }

    };
  }]);

// install  :     cordova plugin add https://github.com/floatinghotpot/cordova-plugin-iad.git
// link     :     https://github.com/floatinghotpot/cordova-plugin-iad

angular.module('ngCordova.plugins.iAd', [])
  .factory('$cordovaiAd', ['$q', '$window', function ($q, $window) {

    return {
      setOptions: function (options) {
        var d = $q.defer();

        $window.iAd.setOptions(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      createBanner: function (options) {
        var d = $q.defer();

        $window.iAd.createBanner(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      removeBanner: function () {
        var d = $q.defer();

        $window.iAd.removeBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBanner: function (position) {
        var d = $q.defer();

        $window.iAd.showBanner(position, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBannerAtXY: function (x, y) {
        var d = $q.defer();

        $window.iAd.showBannerAtXY(x, y, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      hideBanner: function () {
        var d = $q.defer();

        $window.iAd.hideBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      prepareInterstitial: function (options) {
        var d = $q.defer();

        $window.iAd.prepareInterstitial(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showInterstitial: function () {
        var d = $q.defer();

        $window.iAd.showInterstitial(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      }
    };
  }]);

// install  :     cordova plugin add https://github.com/wymsee/cordova-imagePicker.git
// link     :     https://github.com/wymsee/cordova-imagePicker

angular.module('ngCordova.plugins.imagePicker', [])

  .factory('$cordovaImagePicker', ['$q', '$window', function ($q, $window) {

    return {
      getPictures: function (options) {
        var q = $q.defer();

        $window.imagePicker.getPictures(function (results) {
          q.resolve(results);
        }, function (error) {
          q.reject(error);
        }, options);

        return q.promise;
      }
    };
  }]);

// install   :     cordova plugin add cordova-plugin-inappbrowser
// link      :     https://github.com/apache/cordova-plugin-inappbrowser

angular.module('ngCordova.plugins.inAppBrowser', [])

  .provider('$cordovaInAppBrowser', [function () {

    var ref;
    var defaultOptions = this.defaultOptions = {};

    this.setDefaultOptions = function (config) {
      defaultOptions = angular.extend(defaultOptions, config);
    };

    this.$get = ['$rootScope', '$q', '$window', '$timeout', function ($rootScope, $q, $window, $timeout) {
      return {
        open: function (url, target, requestOptions) {
          var q = $q.defer();

          if (requestOptions && !angular.isObject(requestOptions)) {
            q.reject("options must be an object");
            return q.promise;
          }

          var options = angular.extend({}, defaultOptions, requestOptions);

          var opt = [];
          angular.forEach(options, function (value, key) {
            opt.push(key + '=' + value);
          });
          var optionsString = opt.join();

          ref = $window.open(url, target, optionsString);

          ref.addEventListener('loadstart', function (event) {
            $timeout(function () {
              $rootScope.$broadcast('$cordovaInAppBrowser:loadstart', event);
            });
          }, false);

          ref.addEventListener('loadstop', function (event) {
            q.resolve(event);
            $timeout(function () {
              $rootScope.$broadcast('$cordovaInAppBrowser:loadstop', event);
            });
          }, false);

          ref.addEventListener('loaderror', function (event) {
            q.reject(event);
            $timeout(function () {
              $rootScope.$broadcast('$cordovaInAppBrowser:loaderror', event);
            });
          }, false);

          ref.addEventListener('exit', function (event) {
            $timeout(function () {
              $rootScope.$broadcast('$cordovaInAppBrowser:exit', event);
            });
          }, false);

          return q.promise;
        },

        close: function () {
          ref.close();
          ref = null;
        },

        show: function () {
          ref.show();
        },

        executeScript: function (details) {
          var q = $q.defer();

          ref.executeScript(details, function (result) {
            q.resolve(result);
          });

          return q.promise;
        },

        insertCSS: function (details) {
          var q = $q.defer();

          ref.insertCSS(details, function (result) {
            q.resolve(result);
          });

          return q.promise;
        }
      };
    }];
  }]);

// install  :     cordova plugin add https://github.com/EddyVerbruggen/Insomnia-PhoneGap-Plugin.git
// link     :     https://github.com/EddyVerbruggen/Insomnia-PhoneGap-Plugin
angular.module('ngCordova.plugins.insomnia', [])

  .factory('$cordovaInsomnia', ['$window', function ($window) {

    return {
      keepAwake: function () {
        return $window.plugins.insomnia.keepAwake();
      },
      allowSleepAgain: function () {
        return $window.plugins.insomnia.allowSleepAgain();
      }
    };

  }]);

// install   :   cordova plugins add https://github.com/vstirbu/InstagramPlugin.git
// link      :   https://github.com/vstirbu/InstagramPlugin

angular.module('ngCordova.plugins.instagram', [])

.factory('$cordovaInstagram', ['$q', function ($q) {

  return {
    share: function (options) {
      var q = $q.defer();

      if (!window.Instagram) {
        console.error('Tried to call Instagram.share but the Instagram plugin isn\'t installed!');
        q.resolve(null);
        return q.promise;
      }

      Instagram.share(options.image, options.caption, function (err) {
        if(err) {
          q.reject(err);
        } else {
          q.resolve(true);
        }
      });
      return q.promise;
    },
    isInstalled: function () {
      var q = $q.defer();

      if (!window.Instagram) {
        console.error('Tried to call Instagram.isInstalled but the Instagram plugin isn\'t installed!');
        q.resolve(null);
        return q.promise;
      }

      Instagram.isInstalled(function (err, installed) {
        if (err) {
          q.reject(err);
        } else {
          q.resolve(installed || true);
        }
      });
      return q.promise;
    }
  };
}]);

// install   :      cordova plugin add https://github.com/driftyco/ionic-plugins-keyboard.git
// link      :      https://github.com/driftyco/ionic-plugins-keyboard

angular.module('ngCordova.plugins.keyboard', [])

  .factory('$cordovaKeyboard', ['$rootScope', '$timeout', function ($rootScope, $timeout) {

    var keyboardShowEvent = function () {
      $rootScope.$evalAsync(function () {
        $rootScope.$broadcast('$cordovaKeyboard:show');
      });
    };

    var keyboardHideEvent = function () {
      $rootScope.$evalAsync(function () {
        $rootScope.$broadcast('$cordovaKeyboard:hide');
      });
    };

    document.addEventListener("deviceready", function () {
      if (cordova.plugins.Keyboard) {
        window.addEventListener("native.keyboardshow", keyboardShowEvent, false);
        window.addEventListener("native.keyboardhide", keyboardHideEvent, false);
      }
    });

    return {
      hideAccessoryBar: function (bool) {
        return cordova.plugins.Keyboard.hideKeyboardAccessoryBar(bool);
      },

      close: function () {
        return cordova.plugins.Keyboard.close();
      },

      show: function () {
        return cordova.plugins.Keyboard.show();
      },

      disableScroll: function (bool) {
        return cordova.plugins.Keyboard.disableScroll(bool);
      },

      isVisible: function () {
        return cordova.plugins.Keyboard.isVisible;
      },

      clearShowWatch: function () {
        document.removeEventListener("native.keyboardshow", keyboardShowEvent);
        $rootScope.$$listeners["$cordovaKeyboard:show"] = [];
      },

      clearHideWatch: function () {
        document.removeEventListener("native.keyboardhide", keyboardHideEvent);
        $rootScope.$$listeners["$cordovaKeyboard:hide"] = [];
      }
    };
  }]);

// install   :      cordova plugin add https://github.com/shazron/KeychainPlugin.git
// link      :      https://github.com/shazron/KeychainPlugin

angular.module('ngCordova.plugins.keychain', [])

  .factory('$cordovaKeychain', ['$q', function ($q) {

    return {
      getForKey: function (key, serviceName) {
        var defer = $q.defer(),
            kc = new Keychain();

        kc.getForKey(defer.resolve, defer.reject, key, serviceName);

        return defer.promise;
      },

      setForKey: function (key, serviceName, value) {
        var defer = $q.defer(),
            kc = new Keychain();

        kc.setForKey(defer.resolve, defer.reject, key, serviceName, value);

        return defer.promise;
      },

      removeForKey: function (key, serviceName) {
        var defer = $q.defer(),
            kc = new Keychain();

        kc.removeForKey(defer.resolve, defer.reject, key, serviceName);

        return defer.promise;
      }
    };
  }]);

// install   :  cordova plugin add https://github.com/katzer/cordova-plugin-local-notifications.git
// link      :  https://github.com/katzer/cordova-plugin-local-notifications

angular.module('ngCordova.plugins.localNotification', [])

  .factory('$cordovaLocalNotification', ['$q', '$window', '$rootScope', '$timeout', function ($q, $window, $rootScope, $timeout) {
    document.addEventListener('deviceready', function () {
      if ($window.cordova &&
        $window.cordova.plugins &&
        $window.cordova.plugins.notification &&
        $window.cordova.plugins.notification.local) {
        // ----- "Scheduling" events

        // A local notification was scheduled
        $window.cordova.plugins.notification.local.on('schedule', function (notification, state) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaLocalNotification:schedule', notification, state);
          });
        });

        // A local notification was triggered
        $window.cordova.plugins.notification.local.on('trigger', function (notification, state) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaLocalNotification:trigger', notification, state);
          });
        });

        // ----- "Update" events

        // A local notification was updated
        $window.cordova.plugins.notification.local.on('update', function (notification, state) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaLocalNotification:update', notification, state);
          });
        });

        // ----- "Clear" events

        // A local notification was cleared from the notification center
        $window.cordova.plugins.notification.local.on('clear', function (notification, state) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaLocalNotification:clear', notification, state);
          });
        });

        // All local notifications were cleared from the notification center
        $window.cordova.plugins.notification.local.on('clearall', function (state) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaLocalNotification:clearall', state);
          });
        });

        // ----- "Cancel" events

        // A local notification was cancelled
        $window.cordova.plugins.notification.local.on('cancel', function (notification, state) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaLocalNotification:cancel', notification, state);
          });
        });

        // All local notifications were cancelled
        $window.cordova.plugins.notification.local.on('cancelall', function (state) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaLocalNotification:cancelall', state);
          });
        });

        // ----- Other events

        // A local notification was clicked
        $window.cordova.plugins.notification.local.on('click', function (notification, state) {
          $timeout(function () {
            $rootScope.$broadcast('$cordovaLocalNotification:click', notification, state);
          });
        });
      }
    }, false);
    return {
      schedule: function (options, scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.schedule(options, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      add: function (options, scope) {
        console.warn('Deprecated: use "schedule" instead.');

        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.schedule(options, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      update: function (options, scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.update(options, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      clear: function (ids, scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.clear(ids, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      clearAll: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.clearAll(function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      cancel: function (ids, scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.cancel(ids, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      cancelAll: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.cancelAll(function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      isPresent: function (id, scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.isPresent(id, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      isScheduled: function (id, scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.isScheduled(id, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      isTriggered: function (id, scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.isTriggered(id, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      hasPermission: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.hasPermission(function (result) {
          if (result) {
            q.resolve(result);
          } else {
            q.reject(result);
          }
        }, scope);

        return q.promise;
      },

      registerPermission: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.registerPermission(function (result) {
          if (result) {
            q.resolve(result);
          } else {
            q.reject(result);
          }
        }, scope);

        return q.promise;
      },

      promptForPermission: function (scope) {
        console.warn('Deprecated: use "registerPermission" instead.');

        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.registerPermission(function (result) {
          if (result) {
            q.resolve(result);
          } else {
            q.reject(result);
          }
        }, scope);

        return q.promise;
      },

      getAllIds: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.getAllIds(function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      getIds: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.getIds(function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      getScheduledIds: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.getScheduledIds(function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      getTriggeredIds: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.getTriggeredIds(function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      get: function (ids, scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.get(ids, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      getAll: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.getAll(function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      getScheduled: function (ids, scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.getScheduled(ids, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      getAllScheduled: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.getAllScheduled(function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      getTriggered: function (ids, scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.getTriggered(ids, function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      getAllTriggered: function (scope) {
        var q = $q.defer();
        scope = scope || null;

        $window.cordova.plugins.notification.local.getAllTriggered(function (result) {
          q.resolve(result);
        }, scope);

        return q.promise;
      },

      getDefaults: function () {
        return $window.cordova.plugins.notification.local.getDefaults();
      },

      setDefaults: function (Object) {
        $window.cordova.plugins.notification.local.setDefaults(Object);
      }
    };
  }]);

// install  :     cordova plugin add https://github.com/floatinghotpot/cordova-plugin-mmedia.git
// link     :     https://github.com/floatinghotpot/cordova-plugin-mmedia

angular.module('ngCordova.plugins.mMediaAds', [])
  .factory('$cordovaMMediaAds', ['$q', '$window', function ($q, $window) {

    return {
      setOptions: function (options) {
        var d = $q.defer();

        $window.mMedia.setOptions(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      createBanner: function (options) {
        var d = $q.defer();

        $window.mMedia.createBanner(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      removeBanner: function () {
        var d = $q.defer();

        $window.mMedia.removeBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBanner: function (position) {
        var d = $q.defer();

        $window.mMedia.showBanner(position, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBannerAtXY: function (x, y) {
        var d = $q.defer();

        $window.mMedia.showBannerAtXY(x, y, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      hideBanner: function () {
        var d = $q.defer();

        $window.mMedia.hideBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      prepareInterstitial: function (options) {
        var d = $q.defer();

        $window.mMedia.prepareInterstitial(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showInterstitial: function () {
        var d = $q.defer();

        $window.mMedia.showInterstitial(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      }
    };
  }]);

// install   :      cordova plugin add cordova-plugin-media
// link      :      https://github.com/apache/cordova-plugin-media

angular.module('ngCordova.plugins.media', [])

  .factory('$cordovaMedia', ['$q', function ($q) {

    return {
      newMedia: function (src) {
        var q = $q.defer();
        var mediaStatus = null;
        var media;

        media = new Media(src,
          function (success) {
            q.resolve(success);
          }, function (error) {
            q.reject(error);
          }, function (status) {
            mediaStatus = status;
          });

        // getCurrentPosition NOT WORKING!
        q.promise.getCurrentPosition = function () {
          media.getCurrentPosition(function (success) {
          }, function (error) {
          });
        };

        q.promise.getDuration = function () {
          media.getDuration();
        };

        // iOS quirks :
        // -  myMedia.play({ numberOfLoops: 2 }) -> looping
        // -  myMedia.play({ playAudioWhenScreenIsLocked : false })
        q.promise.play = function (options) {
          if (typeof options !== "object") {
            options = {};
          }
          media.play(options);
        };

        q.promise.pause = function () {
          media.pause();
        };

        q.promise.stop = function () {
          media.stop();
        };

        q.promise.release = function () {
          media.release();
        };

        q.promise.seekTo = function (timing) {
          media.seekTo(timing);
        };

        q.promise.setVolume = function (volume) {
          media.setVolume(volume);
        };

        q.promise.startRecord = function () {
          media.startRecord();
        };

        q.promise.stopRecord = function () {
          media.stopRecord();
        };

        q.promise.media = media;

        return q.promise;
      }
    };
  }]);

// install  :     cordova plugin add https://github.com/floatinghotpot/cordova-mobfox-pro.git
// link     :     https://github.com/floatinghotpot/cordova-mobfox-pro

angular.module('ngCordova.plugins.mobfoxAds', [])
  .factory('$cordovaMobFoxAds', ['$q', '$window', function ($q, $window) {

    return {
      setOptions: function (options) {
        var d = $q.defer();

        $window.MobFox.setOptions(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      createBanner: function (options) {
        var d = $q.defer();

        $window.MobFox.createBanner(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      removeBanner: function () {
        var d = $q.defer();

        $window.MobFox.removeBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBanner: function (position) {
        var d = $q.defer();

        $window.MobFox.showBanner(position, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBannerAtXY: function (x, y) {
        var d = $q.defer();

        $window.MobFox.showBannerAtXY(x, y, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      hideBanner: function () {
        var d = $q.defer();

        $window.MobFox.hideBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      prepareInterstitial: function (options) {
        var d = $q.defer();

        $window.MobFox.prepareInterstitial(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showInterstitial: function () {
        var d = $q.defer();

        $window.MobFox.showInterstitial(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      }
    };
  }]);

angular.module('ngCordova.plugins', [
  'ngCordova.plugins.actionSheet',
  'ngCordova.plugins.adMob',
  'ngCordova.plugins.appAvailability',
  'ngCordova.plugins.appRate',
  'ngCordova.plugins.appVersion',
  'ngCordova.plugins.backgroundGeolocation',
  'ngCordova.plugins.badge',
  'ngCordova.plugins.barcodeScanner',
  'ngCordova.plugins.batteryStatus',
  'ngCordova.plugins.ble',
  'ngCordova.plugins.bluetoothSerial',
  'ngCordova.plugins.brightness',
  'ngCordova.plugins.calendar',
  'ngCordova.plugins.camera',
  'ngCordova.plugins.capture',
  'ngCordova.plugins.clipboard',
  'ngCordova.plugins.contacts',
  'ngCordova.plugins.datePicker',
  'ngCordova.plugins.device',
  'ngCordova.plugins.deviceMotion',
  'ngCordova.plugins.deviceOrientation',
  'ngCordova.plugins.dialogs',
  'ngCordova.plugins.emailComposer',
  'ngCordova.plugins.facebook',
  'ngCordova.plugins.facebookAds',
  'ngCordova.plugins.file',
  'ngCordova.plugins.fileTransfer',
  'ngCordova.plugins.fileOpener2',
  'ngCordova.plugins.flashlight',
  'ngCordova.plugins.flurryAds',
  'ngCordova.plugins.ga',
  'ngCordova.plugins.geolocation',
  'ngCordova.plugins.globalization',
  'ngCordova.plugins.googleAds',
  'ngCordova.plugins.googleAnalytics',
  'ngCordova.plugins.googleMap',
  'ngCordova.plugins.googlePlayGame',
  'ngCordova.plugins.healthKit',
  'ngCordova.plugins.httpd',
  'ngCordova.plugins.iAd',
  'ngCordova.plugins.imagePicker',
  'ngCordova.plugins.inAppBrowser',
  'ngCordova.plugins.keyboard',
  'ngCordova.plugins.keychain',
  'ngCordova.plugins.localNotification',
  'ngCordova.plugins.media',
  'ngCordova.plugins.mMediaAds',
  'ngCordova.plugins.mobfoxAds',
  'ngCordova.plugins.mopubAds',
  'ngCordova.plugins.nativeAudio',
  'ngCordova.plugins.network',
  'ngCordova.plugins.oauth',
  'ngCordova.plugins.oauthUtility',
  'ngCordova.plugins.pinDialog',
  'ngCordova.plugins.prefs',
  'ngCordova.plugins.printer',
  'ngCordova.plugins.progressIndicator',
  'ngCordova.plugins.push',
  'ngCordova.plugins.sms',
  'ngCordova.plugins.socialSharing',
  'ngCordova.plugins.spinnerDialog',
  'ngCordova.plugins.splashscreen',
  'ngCordova.plugins.sqlite',
  'ngCordova.plugins.statusbar',
  'ngCordova.plugins.toast',
  'ngCordova.plugins.touchid',
  'ngCordova.plugins.vibration',
  'ngCordova.plugins.videoCapturePlus',
  'ngCordova.plugins.zip',
  'ngCordova.plugins.insomnia'
]);

// install  :     cordova plugin add https://github.com/floatinghotpot/cordova-plugin-mopub.git
// link     :     https://github.com/floatinghotpot/cordova-plugin-mopub

angular.module('ngCordova.plugins.mopubAds', [])
  .factory('$cordovaMoPubAds', ['$q', '$window', function ($q, $window) {

    return {
      setOptions: function (options) {
        var d = $q.defer();

        $window.MoPub.setOptions(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      createBanner: function (options) {
        var d = $q.defer();

        $window.MoPub.createBanner(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      removeBanner: function () {
        var d = $q.defer();

        $window.MoPub.removeBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBanner: function (position) {
        var d = $q.defer();

        $window.MoPub.showBanner(position, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showBannerAtXY: function (x, y) {
        var d = $q.defer();

        $window.MoPub.showBannerAtXY(x, y, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      hideBanner: function () {
        var d = $q.defer();

        $window.MoPub.hideBanner(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      prepareInterstitial: function (options) {
        var d = $q.defer();

        $window.MoPub.prepareInterstitial(options, function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      },

      showInterstitial: function () {
        var d = $q.defer();

        $window.MoPub.showInterstitial(function () {
          d.resolve();
        }, function () {
          d.reject();
        });

        return d.promise;
      }
    };
  }]);

// install   : cordova plugin add https://github.com/sidneys/cordova-plugin-nativeaudio.git
// link      : https://github.com/sidneys/cordova-plugin-nativeaudio

angular.module('ngCordova.plugins.nativeAudio', [])

  .factory('$cordovaNativeAudio', ['$q', '$window', function ($q, $window) {

    return {
      preloadSimple: function (id, assetPath) {
        var q = $q.defer();
        $window.plugins.NativeAudio.preloadSimple(id, assetPath, function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      preloadComplex: function (id, assetPath, volume, voices) {
        var q = $q.defer();
        $window.plugins.NativeAudio.preloadComplex(id, assetPath, volume, voices, function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      play: function (id, completeCallback) {
        var q = $q.defer();
        $window.plugins.NativeAudio.play(id, completeCallback, function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      stop: function (id) {
        var q = $q.defer();
        $window.plugins.NativeAudio.stop(id, function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });
        return q.promise;
      },

      loop: function (id) {
        var q = $q.defer();
        $window.plugins.NativeAudio.loop(id, function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      unload: function (id) {
        var q = $q.defer();
        $window.plugins.NativeAudio.unload(id, function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      setVolumeForComplexAsset: function (id, volume) {
        var q = $q.defer();
        $window.plugins.NativeAudio.setVolumeForComplexAsset(id, volume, function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      }
    };
  }]);

// install   :      cordova plugin add cordova-plugin-network-information
// link      :      https://github.com/apache/cordova-plugin-network-information

angular.module('ngCordova.plugins.network', [])

  .factory('$cordovaNetwork', ['$rootScope', '$timeout', function ($rootScope, $timeout) {

    var offlineEvent = function () {
      var networkState = navigator.connection.type;
      $timeout(function () {
        $rootScope.$broadcast('$cordovaNetwork:offline', networkState);
      });
    };

    var onlineEvent = function () {
      var networkState = navigator.connection.type;
      $timeout(function () {
        $rootScope.$broadcast('$cordovaNetwork:online', networkState);
      });
    };

    document.addEventListener("deviceready", function () {
      if (navigator.connection) {
        document.addEventListener("offline", offlineEvent, false);
        document.addEventListener("online", onlineEvent, false);
      }
    });

    return {
      getNetwork: function () {
        return navigator.connection.type;
      },

      isOnline: function () {
        var networkState = navigator.connection.type;
        return networkState !== Connection.UNKNOWN && networkState !== Connection.NONE;
      },

      isOffline: function () {
        var networkState = navigator.connection.type;
        return networkState === Connection.UNKNOWN || networkState === Connection.NONE;
      },

      clearOfflineWatch: function () {
        document.removeEventListener("offline", offlineEvent);
        $rootScope.$$listeners["$cordovaNetwork:offline"] = [];
      },

      clearOnlineWatch: function () {
        document.removeEventListener("online", offlineEvent);
        $rootScope.$$listeners["$cordovaNetwork:online"] = [];
      }
    };
  }])
  .run(['$cordovaNetwork', function ($cordovaNetwork) {
  }]);

/* Created by Nic Raboy
 * http://www.nraboy.com
 *
 * DESCRIPTION: Use Oauth sign in for various web services.
 *
 * REQUIRES:  Apache Cordova 3.5+, Apache InAppBrowser Plugin, jsSHA (Twitter, Magento only)
 *
 * SUPPORTS:
 *    Dropbox
 *    Digital Ocean
 *    Google
 *    GitHub
 *    Facebook
 *    LinkedIn
 *    Instagram
 *    Box
 *    Reddit
 *    Twitter
 *    Meetup
 *    Foursquare
 *    Salesforce
 *    Strava
 *    Magento
 *    vkontakte
 *    ADFS
 *    Imgur
 */

angular.module("ngCordova.plugins.oauth", ["ngCordova.plugins.oauthUtility"])

  .factory('$cordovaOauth', ['$q', '$http', '$cordovaOauthUtility', function ($q, $http, $cordovaOauthUtility) {

    return {

      /*
       * Sign into the ADFS service (ADFS 3.0 onwards)
       *
       * @param    string clientId (client registered in ADFS, with redirect_uri configured to: http://localhost/callback)
       * @param	 string adfsServer (url of the ADFS Server)
       * @param	 string relyingPartyId (url of the Relying Party (resource relying on ADFS for authentication) configured in ADFS)
       * @return   promise
       */
      adfs: function (clientId, adfsServer, relyingPartyId) {
        var deferred = $q.defer();
        if (window.cordova) {
          var cordovaMetadata = cordova.require("cordova/plugin_list").metadata;
          if (cordovaMetadata.hasOwnProperty("org.apache.cordova.inappbrowser") === true) {
            var browserRef = window.open(adfsServer + '/adfs/oauth2/authorize?response_type=code&client_id=' + clientId + '&redirect_uri=http://localhost/callback&resource=' + relyingPartyId, '_blank', 'location=no');

            browserRef.addEventListener("loadstart", function (event) {
              if ((event.url).indexOf('http://localhost/callback') === 0) {
                var requestToken = (event.url).split("code=")[1];
                $http.defaults.headers.post['Content-Type'] = 'application/x-www-form-urlencoded';
                $http({method: "post", url: adfsServer + "/adfs/oauth2/token", data: "client_id=" + clientId + "&code=" + requestToken + "&redirect_uri=http://localhost/callback&grant_type=authorization_code"})
                  .success(function (data) {
                    deferred.resolve(data);
                  })
                  .error(function (data, status) {
                    deferred.reject("Problem authenticating");
                  })
                  .finally(function () {
                    setTimeout(function () {
                      browserRef.close();
                    }, 10);
                  });
              }
            });
            browserRef.addEventListener('exit', function (event) {
              deferred.reject("The sign in flow was canceled");
            });
          } else {
            deferred.reject("Could not find InAppBrowser plugin");
          }
        } else {
          deferred.reject("Cannot authenticate via a web browser");
        }
        return deferred.promise;
      },

      /*
       * Sign into the Dropbox service
       *
       * @param    string appKey
       * @return   promise
       */
      dropbox: function (appKey) {
        var deferred = $q.defer();
        if (window.cordova) {
          var cordovaMetadata = cordova.require("cordova/plugin_list").metadata;
          if (cordovaMetadata.hasOwnProperty("org.apache.cordova.inappbrowser") === true) {
            var browserRef = window.open("https://www.dropbox.com/1/oauth2/authorize?client_id=" + appKey + "&redirect_uri=http://localhost/callback" + "&response_type=token", "_blank", "location=no,clearsessioncache=yes,clearcache=yes");
            browserRef.addEventListener("loadstart", function (event) {
              if ((event.url).indexOf("http://localhost/callback") === 0) {
                var callbackResponse = (event.url).split("#")[1];
                var responseParameters = (callbackResponse).split("&");
                var parameterMap = [];
                for (var i = 0; i < responseParameters.length; i++) {
                  parameterMap[responseParameters[i].split("=")[0]] = responseParameters[i].split("=")[1];
                }
                if (parameterMap.access_token !== undefined && parameterMap.access_token !== null) {
                  deferred.resolve({access_token: parameterMap.access_token, token_type: parameterMap.token_type, uid: parameterMap.uid});
                } else {
                  deferred.reject("Problem authenticating");
                }
                setTimeout(function () {
                  browserRef.close();
                }, 10);
              }
            });
            browserRef.addEventListener('exit', function (event) {
              deferred.reject("The sign in flow was canceled");
            });
          } else {
            deferred.reject("Could not find InAppBrowser plugin");
          }
        } else {
          deferred.reject("Cannot authenticate via a web browser");
        }
        return deferred.promise;
      },

      /*
       * Sign into the Digital Ocean service
       *
       * @param    string clientId
       * @param    string clientSecret
       * @return   promise
       */
      digitalOcean: function (clientId, clientSecret) {
        var deferred = $q.defer();
        if (window.cordova) {
          var cordovaMetadata = cordova.require("cordova/plugin_list").metadata;
          if (cordovaMetadata.hasOwnProperty("org.apache.cordova.inappbrowser") === true) {
            var browserRef = window.open("https://cloud.digitalocean.com/v1/oauth/authorize?client_id=" + clientId + "&redirect_uri=http://localhost/callback&response_type=code&scope=read%20write", "_blank", "location=no,clearsessioncache=yes,clearcache=yes");
            browserRef.addEventListener("loadstart", function (event) {
              if ((event.url).indexOf("http://localhost/callback") === 0) {
                var requestToken = (event.url).split("code=")[1];
                $http.defaults.headers.post['Content-Type'] = 'application/x-www-form-urlencoded';
                $http({
                  method: "post",
                  url: "https://cloud.digitalocean.com/v1/oauth/token",
                  data: "client_id=" + clientId + "&client_secret=" + clientSecret + "&redirect_uri=http://localhost/callback" + "&grant_type=authorization_code" + "&code=" + requestToken
                })
                  .success(function (data) {
                    deferred.resolve(data);
                  })
                  .error(function (data, status) {
                    deferred.reject("Problem authenticating");
                  })
                  .finally(function () {
                    setTimeout(function () {
                      browserRef.close();
                    }, 10);
                  });
              }
            });
            browserRef.addEventListener('exit', function (event) {
              deferred.reject("The sign in flow was canceled");
            });
          } else {
            deferred.reject("Could not find InAppBrowser plugin");
          }
        } else {
          deferred.reject("Cannot authenticate via a web browser");
        }
        return deferred.promise;
      },

      /*
       * Sign into the Google service
       *
       * @param    string clientId
       * @param    array appScope
       * @return   promise
       */
      google: function (clientId, appScope) {
        var deferred = $q.defer();
        if (window.cordova) {
          var cordovaMetadata = cordova.require("cordova/plugin_list").metadata;
          if (cordovaMetadata.hasOwnProperty("org.apache.cordova.inappbrowser") === true) {
            var browserRef = window.open('https://accounts.google.com/o/oauth2/auth?client_id=' + clientId + '&redirect_uri=http://localhost/callback&scope=' + appScope.join(" ") + '&approval_prompt=force&response_type=token', '_blank', 'location=no,clearsessioncache=yes,clearcache=yes');
            browserRef.addEventListener("loadstart", function (event) {
              if ((event.url).indexOf("http://localhost/callback") === 0) {
                var callbackResponse = (event.url).split("#")[1];
                var responseParameters = (callbackResponse).split("&");
                var parameterMap = [];
                for (var i = 0; i < responseParameters.length; i++) {
                  parameterMap[responseParameters[i].split("=")[0]] = responseParameters[i].split("=")[1];
                }
                if (parameterMap.access_token !== undefined && parameterMap.access_token !== null) {
                  deferred.resolve({access_token: parameterMap.access_token, token_type: parameterMap.token_type, expires_in: parameterMap.expires_in});
                } else {
                  deferred.reject("Problem authenticating");
                }
                setTimeout(function () {
                  browserRef.close();
                }, 10);
              }
            });
            browserRef.addEventListener('exit', function (event) {
              deferred.reject("The sign in flow was canceled");
            });
          } else {
            deferred.reject("Could not find InAppBrowser plugin");
          }
        } else {
          deferred.reject("Cannot authenticate via a web browser");
        }
        return deferred.promise;
      },

      /*
       * Sign into the GitHub service
       *
       * @param    string clientId
       * @param    string clientSecret
       * @param    array appScope
       * @return   promise
       */
      github: function (clientId, clientSecret, appScope) {
        var deferred = $q.defer();
        if (window.cordova) {
          var cordovaMetadata = cordova.require("cordova/plugin_list").metadata;
          if (cordovaMetadata.hasOwnProperty("org.apache.cordova.inappbrowser") === true) {
            var browserRef = window.open('https://github.com/login/oauth/authorize?client_id=' + clientId + '&redirect_uri=http://localhost/callback&scope=' + appScope.join(","), '_blank', 'location=no,clearsessioncache=yes,clearcache=yes');
            browserRef.addEventListener('loadstart', function (event) {
              if ((event.url).indexOf("http://localhost/callback") === 0) {
                requestToken = (event.url).split("code=")[1];
                $http.defaults.headers.post['Content-Type'] = 'application/x-www-form-urlencoded';
                $http.defaults.headers.post.accept = 'application/json';
                $http({method: "post", url: "https://github.com/login/oauth/access_token", data: "client_id=" + clientId + "&client_secret=" + clientSecret + "&redirect_uri=http://localhost/callback" + "&code=" + requestToken})
                  .success(function (data) {
                    deferred.resolve(data);
                  })
                  .error(function (data, status) {
                    deferred.reject("Problem authenticating");
                  })
                  .finally(function () {
                    setTimeout(function () {
                      browserRef.close();
                    }, 10);
                  });
              }
            });
            browserRef.addEventListener('exit', function (event) {
              deferred.reject("The sign in flow was canceled");
            });
          } else {
            deferred.reject("Could not find InAppBrowser plugin");
          }
        } else {
          deferred.reject("Cannot authenticate via a web browser");
        }
        return deferred.promise;
      },

      /*
       * Sign into the Facebook service
       *
       * @param    string clientId
       * @param    array appScope
       * @return   promise
       */
      facebook: function (clientId, appScope) {
        var deferred = $q.defer();
        if (window.cordova) {
          var cordovaMetadata = cordova.require("cordova/plugin_list").metadata;
          if (cordovaMetadata.hasOwnProperty("org.apache.cordova.inappbrowser") === true) {
            var browserRef = window.open('https://www.facebook.com/dialog/oauth?client_id=' + clientId + '&redirect_uri=http://localhost/callback&response_type=token&scope=' + appScope.join(","), '_blank', 'location=no,clearsessioncache=yes,clearcache=yes');
            browserRef.addEventListener('loadstart', function (event) {
              if ((event.url).indexOf("http://localhost/callback") === 0) {
                var callbackResponse = (event.url).split("#")[1];
                var responseParameters = (callbackResponse).split("&");
                var parameterMap = [];
                for (var i = 0; i < responseParameters.length; i++) {
                  parameterMap[responseParameters[i].split("=")[0]] = responseParameters[i].split("=")[1];
                }
                if (parameterMap.access_token !== undefined && parameterMap.access_token !== null) {
                  deferred.resolve({access_token: parameterMap.access_token, expires_in: parameterMap.expires_in});
                } else {
                  deferred.reject("Problem authenticating");
                }
                setTimeout(function () {
                  browserRef.close();
                }, 10);
              }
            });
            browserRef.addEventListener('exit', function (event) {
              deferred.reject("The sign in flow was canceled");
            });
          } else {
            deferred.reject("Could not find InAppBrowser plugin");
          }
        } else {
          deferred.reject("Cannot authenticate via a web browser");
        }
        return deferred.promise;
      },

      /*
       * Sign into the LinkedIn service
       *
       * @param    string clientId
       * @param    string clientSecret
       * @param    array appScope
       * @param    string state
       * @return   promise
       */
      linkedin: function (clientId, clientSecret, appScope, state) {
        var deferred = $q.defer();
        if (window.cordova) {
          var cordovaMetadata = cordova.require("cordova/plugin_list").metadata;
          if (cordovaMetadata.hasOwnProperty("org.apache.cordova.inappbrowser") === true) {
            var browserRef = window.open('https://www.linkedin.com/uas/oauth2/authorization?client_id=' + clientId + '&redirect_uri=http://localhost/callback&scope=' + appScope.join(" ") + '&response_type=code&state=' + state, '_blank', 'location=no,clearsessioncache=yes,clearcache=yes');
            browserRef.addEventListener('loadstart', function (event) {
              if ((event.url).indexOf("http://localhost/callback") === 0) {
                requestToken = (event.url).split("code=")[1];
                $http.defaults.headers.post['Content-Type'] = 'application/x-www-form-urlencoded';
                $http({
                  method: "post",
                  url: "https://www.linkedin.com/uas/oauth2/accessToken",
                  data: "client_id=" + clientId + "&client_secret=" + clientSecret + "&redirect_uri=http://localhost/callback" + "&grant_type=authorization_code" + "&code=" + requestToken
                })
                  .success(function (data) {
                    deferred.resolve(data);
                  })
                  .error(function (data, status) {
                    deferred.reject("Problem authenticating");
                  })
                  .finally(function () {
                    setTimeout(function () {
                      browserRef.close();
                    }, 10);
                  });
              }
            });
            browserRef.addEventListener('exit', function (event) {
              deferred.reject("The sign in flow was canceled");
            });
          } else {
            deferred.reject("Could not find InAppBrowser plugin");
          }
        } else {
          deferred.reject("Cannot authenticate via a web browser");
        }
        return deferred.promise;
      },

      /*
       * Sign into the Instagram service
       *
       * @param    string clientId
       * @param    array appScope
       * @return   promise
       */
      instagram: function (clientId, appScope) {
        var deferred = $q.defer();
        if (window.cordova) {
          var cordovaMetadata = cordova.require("cordova/plugin_list").metadata;
          if (cordovaMetadata.hasOwnProperty("org.apache.cordova.inappbrowser") === true) {
            var browserRef = window.open('https://api.instagram.com/oauth/authorize/?client_id=' + clientId + '&redirect_uri=http://localhost/callback&scope=' + appScope.join(" ") + '&response_type=token', '_blank', 'location=no,clearsessioncache=yes,clearcache=yes');
            browserRef.addEventListener('loadstart', function (event) {
              if ((event.url).indexOf("http://localhost/callback") === 0) {
                var callbackResponse = (event.url).split("#")[1];
                var responseParameters = (callbackResponse).split("&");
                var parameterMap = [];
                for (var i = 0; i < responseParameters.length; i++) {
                  parameterMap[responseParameters[i].split("=")[0]] = responseParameters[i].split("=")[1];
                }
                if (parameterMap.access_token !== undefined && parameterMap.access_token !== null) {
                  deferred.resolve({access_token: parameterMap.access_token});
                } else {
                  deferred.reject("Problem authenticating");
                }
                setTimeout(function () {
                  browserRef.close();
                }, 10);
              }
            });
            browserRef.addEventListener('exit', function (event) {
              deferred.reject("The sign in flow was canceled");
            });
          } else {
            deferred.reject("Could not find InAppBrowser plugin");
          }
        } else {
          deferred.reject("Cannot authenticate via a web browser");
        }
        return deferred.promise;
      },

      /*
       * Sign into the Box service
       *
       * @param    string clientId
       * @param    string clientSecret
       * @param    string appState
       * @return   promise
       */
      box: function (clientId, clientSecret, appState) {
        var deferred = $q.defer();
        if (window.cordova) {
          var cordovaMetadata = cordova.require("cordova/plugin_list").metadata;
          if (cordovaMetadata.hasOwnProperty("org.apache.cordova.inappbrowser") === true) {
            var browserRef = window.open('https://app.box.com/api/oauth2/authorize/?client_id=' + clientId + '&redirect_uri=http://localhost/callback&state=' + appState + '&response_type=code', '_blank', 'location=no,clearsessioncache=yes,clearcache=yes');
            browserRef.addEventListener('loadstart', function (event) {
              if ((event.url).indexOf("http://localhost/callback") === 0) {
                requestToken = (event.url).split("code=")[1];
                $http.defaults.headers.post['Content-Type'] = 'application/x-www-form-urlencoded';
                $http({
                  method: "post",
                  url: "https://app.box.com/api/oauth2/token",
                  data: "client_id=" + clientId + "&client_secret=" + clientSecret + "&redirect_uri=http://localhost/callback" + "&grant_type=authorization_code" + "&code=" + requestToken
                })
                  .success(function (data) {
                    deferred.resolve(data);
                  })
                  .error(function (data, status) {
                    deferred.reject("Problem authenticating");
                  })
                  .finally(function () {
                    setTimeout(function () {
                      browserRef.close();
                    }, 10);
                  });
              }
            });
            browserRef.addEventListener('exit', function (event) {
              deferred.reject("The sign in flow was canceled");
            });
          } else {
            deferred.reject("Could not find InAppBrowser plugin");
          }
        } else {
          deferred.reject("Cannot authenticate via a web browser");
        }
        return deferred.promise;
      },

      /*
       * Sign into the Reddit service
       *
       * @param    string clientId
       * @param    string clientSecret
       * @param    array appScope
       * @return   promise
       */
      reddit: function (clientId, clientSecret, appScope) {
        var deferred = $q.defer();
        if (window.cordova) {
          var cordovaMetadata = cordova.require("cordova/plugin_list").metadata;
          if (cordovaMetadata.hasOwnProperty("org.apache.cordova.inappbrowser") === true) {
            var browserRef = window.open('https://ssl.reddit.com/api/v1/authorize?client_id=' + clientId + '&redirect_uri=http://localhost/callback&duration=permanent&state=ngcordovaoauth&scope=' + appScope.join(",") + '&response_type=code', '_blank', 'location=no,clearsessioncache=yes,clearcache=yes');
            browserRef.addEventListener('loadstart', function (event) {
              if ((event.url).indexOf("http://localhost/callback") === 0) {
                requestToken = (event.url).split("code=")[1];
                $http.defaults.headers.post['Content-Type'] = 'application/x-www-form-urlencoded';
                $http.defaults.headers.post.Authorization = 'Basic ' + btoa(clientId + ":" + clientSecret);
                $http({method: "post", url: "https://ssl.reddit.com/api/v1/access_token", data: "redirect_uri=http://localhost/callback" + "&grant_type=authorization_code" + "&code=" + requestToken})
                  .success(function (data) {
                    deferred.resolve(data);
                  })
                  .error(function (data, status) {
                    deferred.reject("Problem authenticating");
                  })
                  .finally(function () {
                    setTimeout(function () {
                      browserRef.close();
                    }, 10);
                  });
              }
            });
            browserRef.addEventListener('exit', function (event) {
              deferred.reject("The sign in flow was canceled");
            });
          } else {
            deferred.reject("Could not find InAppBrowser plugin");
          }
        } else {
          deferred.reject("Cannot authenticate via a web browser");
        }
        return deferred.promise;
      },

      /*
       * Sign into the Twitter service
       * Note that this service requires jsSHA for generating HMAC-SHA1 Oauth 1.0 signatures
       *
       * @param    string clientId
       * @param    string clientSecret
       * @return   promise
       */
      twitter: function (clientId, clientSecret) {
        var deferred = $q.defer();
        if (window.cordova) {
          var cordovaMetadata = cordova.require("cordova/plugin_list").metadata;
          if (cordovaMetadata.hasOwnProperty("org.apache.cordova.inappbrowser") === true) {
            if (typeof jsSHA !== "undefined") {
              var oauthObject = {
                oauth_consumer_key: clientId,
                oauth_nonce: $cordovaOauthUtility.createNonce(10),
                oauth_signature_method: "HMAC-SHA1",
                oauth_timestamp: Math.round((new Date()).getTime() / 1000.0),
                oauth_version: "1.0"
              };
              var signatureObj = $cordovaOauthUtility.createSignature("POST", "https://api.twitter.com/oauth/request_token", oauthObject, {oauth_callback: "http://localhost/callback"}, clientSecret);
              $http({
                method: "post",
                url: "https://api.twitter.com/oauth/request_token",
                headers: {
                  "Authorization": signatureObj.authorization_header,
                  "Content-Type": "application/x-www-form-urlencoded"
                },
                data: "oauth_callback=" + encodeURIComponent("http://localhost/callback")
              })
                .success(function (requestTokenResult) {
                  var requestTokenParameters = (requestTokenResult).split("&");
                  var parameterMap = {};
                  for (var i = 0; i < requestTokenParameters.length; i++) {
                    parameterMap[requestTokenParameters[i].split("=")[0]] = requestTokenParameters[i].split("=")[1];
                  }
                  if (parameterMap.hasOwnProperty("oauth_token") === false) {
                    deferred.reject("Oauth request token was not received");
                  }
                  var browserRef = window.open('https://api.twitter.com/oauth/authenticate?oauth_token=' + parameterMap.oauth_token, '_blank', 'location=no,clearsessioncache=yes,clearcache=yes');
                  browserRef.addEventListener('loadstart', function (event) {
                    if ((event.url).indexOf("http://localhost/callback") === 0) {
                      var callbackResponse = (event.url).split("?")[1];
                      var responseParameters = (callbackResponse).split("&");
                      var parameterMap = {};
                      for (var i = 0; i < responseParameters.length; i++) {
                        parameterMap[responseParameters[i].split("=")[0]] = responseParameters[i].split("=")[1];
                      }
                      if (parameterMap.hasOwnProperty("oauth_verifier") === false) {
                        deferred.reject("Browser authentication failed to complete.  No oauth_verifier was returned");
                      }
                      delete oauthObject.oauth_signature;
                      oauthObject.oauth_token = parameterMap.oauth_token;
                      var signatureObj = $cordovaOauthUtility.createSignature("POST", "https://api.twitter.com/oauth/access_token", oauthObject, {oauth_verifier: parameterMap.oauth_verifier}, clientSecret);
                      $http({
                        method: "post",
                        url: "https://api.twitter.com/oauth/access_token",
                        headers: {
                          "Authorization": signatureObj.authorization_header
                        },
                        params: {
                          "oauth_verifier": parameterMap.oauth_verifier
                        }
                      })
                        .success(function (result) {
                          var accessTokenParameters = result.split("&");
                          var parameterMap = {};
                          for (var i = 0; i < accessTokenParameters.length; i++) {
                            parameterMap[accessTokenParameters[i].split("=")[0]] = accessTokenParameters[i].split("=")[1];
                          }
                          if (parameterMap.hasOwnProperty("oauth_token_secret") === false) {
                            deferred.reject("Oauth access token was not received");
                          }
                          deferred.resolve(parameterMap);
                        })
                        .error(function (error) {
                          deferred.reject(error);
                        })
                        .finally(function () {
                          setTimeout(function () {
                            browserRef.close();
                          }, 10);
                        });
                    }
                  });
                  browserRef.addEventListener('exit', function (event) {
                    deferred.reject("The sign in flow was canceled");
                  });
                })
                .error(function (error) {
                  deferred.reject(error);
                });
            } else {
              deferred.reject("Missing jsSHA JavaScript library");
            }
          } else {
            deferred.reject("Could not find InAppBrowser plugin");
          }
        } else {
          deferred.reject("Cannot authenticate via a web browser");
        }
        return deferred.promise;
      },

      /*
       * Sign into the Meetup service
       *
       * @param    string clientId
       * @return   promise
       */
      meetup: function (clientId) {
        var deferred = $q.defer();
        if (window.cordova) {
          var cordovaMetadata = cordova.require("cordova/plugin_list").metadata;
          if (cordovaMetadata.hasOwnProperty("org.apache.cordova.inappbrowser") === true) {
            var browserRef = window.open('https://secure.meetup.com/oauth2/authorize/?client_id=' + clientId + '&redirect_uri=http://localhost/callback&response_type=token', '_blank', 'location=no,clearsessioncache=yes,clearcache=yes');
            browserRef.addEventListener('loadstart', function (event) {
              if ((event.url).indexOf("http://localhost/callback") === 0) {
                var callbackResponse = (event.url).split("#")[1];
                var responseParameters = (callbackResponse).split("&");
                var parameterMap = {};
                for (var i = 0; i < responseParameters.length; i++) {
                  parameterMap[responseParameters[i].split("=")[0]] = responseParameters[i].split("=")[1];
                }
                if (parameterMap.access_token !== undefined && parameterMap.access_token !== null) {
                  deferred.resolve(parameterMap);
                } else {
                  deferred.reject("Problem authenticating");
                }
                setTimeout(function () {
                  browserRef.close();
                }, 10);
              }
            });
            browserRef.addEventListener('exit', function (event) {
              deferred.reject("The sign in flow was canceled");
            });
          } else {
            deferred.reject("Could not find InAppBrowser plugin");
          }
        } else {
          deferred.reject("Cannot authenticate via a web browser");
        }
        return deferred.promise;
      },

      /*
       * Sign into the Salesforce service
       *
       * Suggestion: use salesforce oauth with forcetk.js(as SDK)
       *
       * @param    string loginUrl (such as: https://login.salesforce.com ; please notice community login)
       * @param    string clientId (copy from connection app info)
       * @param    string redirectUri (callback url in connection app info)
       * @return   promise
       */
      salesforce: function (loginUrl, clientId) {
        var redirectUri = 'http://localhost/callback';
        var getAuthorizeUrl = function (loginUrl, clientId, redirectUri) {
          return loginUrl + 'services/oauth2/authorize?display=touch' +
            '&response_type=token&client_id=' + escape(clientId) +
            '&redirect_uri=' + escape(redirectUri);
        };
        var startWith = function (string, str) {
          return (string.substr(0, str.length) === str);
        };
        var deferred = $q.defer();
        if (window.cordova) {
          var cordovaMetadata = cordova.require("cordova/plugin_list").metadata;
          if (cordovaMetadata.hasOwnProperty("org.apache.cordova.inappbrowser") === true) {
            var browserRef = window.open(getAuthorizeUrl(loginUrl, clientId, redirectUri), "_blank", "location=no,clearsessioncache=yes,clearcache=yes");
            browserRef.addEventListener("loadstart", function (event) {
              if (startWith(event.url, redirectUri)) {
                var oauthResponse = {};

                var fragment = (event.url).split('#')[1];

                if (fragment) {
                  var nvps = fragment.split('&');
                  for (var nvp in nvps) {
                    var parts = nvps[nvp].split('=');
                    oauthResponse[parts[0]] = unescape(parts[1]);
                  }
                }

                if (typeof oauthResponse === 'undefined' ||
                  typeof oauthResponse.access_token === 'undefined') {
                  deferred.reject("Problem authenticating");
                } else {
                  deferred.resolve(oauthResponse);
                }
                setTimeout(function () {
                  browserRef.close();
                }, 10);
              }
            });
            browserRef.addEventListener('exit', function (event) {
              deferred.reject("The sign in flow was canceled");
            });
          } else {
            deferred.reject("Could not find InAppBrowser plugin");
          }
        } else {
          deferred.reject("Cannot authenticate via a web browser");
        }
        return deferred.promise;
      },

      /*
       * Sign into the Strava service
       *
       * @param    string clientId
       * @param    string clientSecret
       * @param    array appScope
       * @return   promise
       */
      strava: function (clientId, clientSecret, appScope) {
        var deferred = $q.defer();
        if (window.cordova) {
          var cordovaMetadata = cordova.require("cordova/plugin_list").metadata;
          if (cordovaMetadata.hasOwnProperty("org.apache.cordova.inappbrowser") === true) {
            var browserRef = window.open('https://www.strava.com/oauth/authorize?client_id=' + clientId + '&redirect_uri=http://localhost/callback&scope=' + appScope.join(",") + '&response_type=code&approval_prompt=force', '_blank', 'location=no,clearsessioncache=yes,clearcache=yes');
            browserRef.addEventListener('loadstart', function (event) {
              if ((event.url).indexOf("http://localhost/callback") === 0) {
                requestToken = (event.url).split("code=")[1];
                $http.defaults.headers.post['Content-Type'] = 'application/x-www-form-urlencoded';
                $http({method: "post", url: "https://www.strava.com/oauth/token", data: "client_id=" + clientId + "&client_secret=" + clientSecret + "&code=" + requestToken})
                  .success(function (data) {
                    deferred.resolve(data);
                  })
                  .error(function (data, status) {
                    deferred.reject("Problem authenticating");
                  })
                  .finally(function () {
                    setTimeout(function () {
                      browserRef.close();
                    }, 10);
                  });
              }
            });
            browserRef.addEventListener('exit', function (event) {
              deferred.reject("The sign in flow was canceled");
            });
          } else {
            deferred.reject("Could not find InAppBrowser plugin");
          }
        } else {
          deferred.reject("Cannot authenticate via a web browser");
        }
        return deferred.promise;
      },

      /*
       * Sign into the Foursquare service
       *
       * @param    string clientId
       * @return   promise
       */
      foursquare: function (clientId) {
        var deferred = $q.defer();
        if (window.cordova) {
          var cordovaMetadata = cordova.require("cordova/plugin_list").metadata;
          if (cordovaMetadata.hasOwnProperty("org.apache.cordova.inappbrowser") === true) {
            var browserRef = window.open('https://foursquare.com/oauth2/authenticate?client_id=' + clientId + '&redirect_uri=http://localhost/callback&response_type=token', '_blank', 'location=no,clearsessioncache=yes,clearcache=yes');
            browserRef.addEventListener('loadstart', function (event) {
              if ((event.url).indexOf("http://localhost/callback") === 0) {
                var callbackResponse = (event.url).split("#")[1];
                var responseParameters = (callbackResponse).split("&");
                var parameterMap = [];
                for (var i = 0; i < responseParameters.length; i++) {
                  parameterMap[responseParameters[i].split("=")[0]] = responseParameters[i].split("=")[1];
                }
                if (parameterMap.access_token !== undefined && parameterMap.access_token !== null) {
                  var promiseResponse = {
                    access_token: parameterMap.access_token,
                    expires_in: parameterMap.expires_in
                  };
                  deferred.resolve(promiseResponse);
                } else {
                  deferred.reject("Problem authenticating");
                }
                setTimeout(function () {
                  browserRef.close();
                }, 10);
              }
            });
            browserRef.addEventListener('exit', function (event) {
              deferred.reject("The sign in flow was canceled");
            });
          } else {
            deferred.reject("Could not find InAppBrowser plugin");
          }
        } else {
          deferred.reject("Cannot authenticate via a web browser");
        }
        return deferred.promise;
      },

      /*
       * Sign into the Magento service
       * Note that this service requires jsSHA for generating HMAC-SHA1 Oauth 1.0 signatures
       *
       * @param    string baseUrl
       * @param    string clientId
       * @param    string clientSecret
       * @return   promise
       */
      magento: function (baseUrl, clientId, clientSecret) {
        var deferred = $q.defer();
        if (window.cordova) {
          var cordovaMetadata = cordova.require("cordova/plugin_list").metadata;
          if (cordovaMetadata.hasOwnProperty("org.apache.cordova.inappbrowser") === true) {
            if (typeof jsSHA !== "undefined") {
              var oauthObject = {
                oauth_callback: "http://localhost/callback",
                oauth_consumer_key: clientId,
                oauth_nonce: $cordovaOauthUtility.createNonce(5),
                oauth_signature_method: "HMAC-SHA1",
                oauth_timestamp: Math.round((new Date()).getTime() / 1000.0),
                oauth_version: "1.0"
              };
              var signatureObj = $cordovaOauthUtility.createSignature("POST", baseUrl + "/oauth/initiate", oauthObject, {oauth_callback: "http://localhost/callback"}, clientSecret);
              $http.defaults.headers.post.Authorization = signatureObj.authorization_header;
              $http.defaults.headers.post['Content-Type'] = 'application/x-www-form-urlencoded';
              $http({method: "post", url: baseUrl + "/oauth/initiate", data: "oauth_callback=http://localhost/callback"})
                .success(function (requestTokenResult) {
                  var requestTokenParameters = (requestTokenResult).split("&");
                  var parameterMap = {};
                  for (var i = 0; i < requestTokenParameters.length; i++) {
                    parameterMap[requestTokenParameters[i].split("=")[0]] = requestTokenParameters[i].split("=")[1];
                  }
                  if (parameterMap.hasOwnProperty("oauth_token") === false) {
                    deferred.reject("Oauth request token was not received");
                  }
                  var tokenSecret = parameterMap.oauth_token_secret;
                  var browserRef = window.open(baseUrl + '/oauth/authorize?oauth_token=' + parameterMap.oauth_token, '_blank', 'location=no,clearsessioncache=yes,clearcache=yes');
                  browserRef.addEventListener('loadstart', function (event) {
                    if ((event.url).indexOf("http://localhost/callback") === 0) {
                      var callbackResponse = (event.url).split("?")[1];
                      var responseParameters = (callbackResponse).split("&");
                      var parameterMap = {};
                      for (var i = 0; i < responseParameters.length; i++) {
                        parameterMap[responseParameters[i].split("=")[0]] = responseParameters[i].split("=")[1];
                      }
                      if (parameterMap.hasOwnProperty("oauth_verifier") === false) {
                        deferred.reject("Browser authentication failed to complete.  No oauth_verifier was returned");
                      }
                      delete oauthObject.oauth_signature;
                      delete oauthObject.oauth_callback;
                      oauthObject.oauth_token = parameterMap.oauth_token;
                      oauthObject.oauth_nonce = $cordovaOauthUtility.createNonce(5);
                      oauthObject.oauth_verifier = parameterMap.oauth_verifier;
                      var signatureObj = $cordovaOauthUtility.createSignature("POST", baseUrl + "/oauth/token", oauthObject, {}, clientSecret, tokenSecret);
                      $http.defaults.headers.post.Authorization = signatureObj.authorization_header;
                      $http.defaults.headers.post['Content-Type'] = 'application/x-www-form-urlencoded';
                      $http({method: "post", url: baseUrl + "/oauth/token"})
                        .success(function (result) {
                          var accessTokenParameters = result.split("&");
                          var parameterMap = {};
                          for (var i = 0; i < accessTokenParameters.length; i++) {
                            parameterMap[accessTokenParameters[i].split("=")[0]] = accessTokenParameters[i].split("=")[1];
                          }
                          if (parameterMap.hasOwnProperty("oauth_token_secret") === false) {
                            deferred.reject("Oauth access token was not received");
                          }
                          deferred.resolve(parameterMap);
                        })
                        .error(function (error) {
                          deferred.reject(error);
                        })
                        .finally(function () {
                          setTimeout(function () {
                            browserRef.close();
                          }, 10);
                        });
                    }
                  });
                  browserRef.addEventListener('exit', function (event) {
                    deferred.reject("The sign in flow was canceled");
                  });
                })
                .error(function (error) {
                  deferred.reject(error);
                });
            } else {
              deferred.reject("Missing jsSHA JavaScript library");
            }
          } else {
            deferred.reject("Could not find InAppBrowser plugin");
          }
        } else {
          deferred.reject("Cannot authenticate via a web browser");
        }
        return deferred.promise;
      },

      /*
       * Sign into the Vkontakte service
       *
       * @param    string clientId
       * @param    array appScope (for example: "friends,wall,photos,messages")
       * @return   promise
       */
      vkontakte: function (clientId, appScope) {
        var deferred = $q.defer();
        if (window.cordova) {
          var cordovaMetadata = cordova.require("cordova/plugin_list").metadata;
          if (cordovaMetadata.hasOwnProperty("org.apache.cordova.inappbrowser") === true) {
            var browserRef = window.open('https://oauth.vk.com/authorize?client_id=' + clientId + '&redirect_uri=http://oauth.vk.com/blank.html&response_type=token&scope=' + appScope.join(",") + '&display=touch&response_type=token', '_blank', 'location=no,clearsessioncache=yes,clearcache=yes');
            browserRef.addEventListener('loadstart', function (event) {
              var tmp = (event.url).split("#");
              if (tmp[0] == 'https://oauth.vk.com/blank.html' || tmp[0] == 'http://oauth.vk.com/blank.html') {
                var callbackResponse = (event.url).split("#")[1];
                var responseParameters = (callbackResponse).split("&");
                var parameterMap = [];
                for (var i = 0; i < responseParameters.length; i++) {
                  parameterMap[responseParameters[i].split("=")[0]] = responseParameters[i].split("=")[1];
                }
                if (parameterMap.access_token !== undefined && parameterMap.access_token !== null) {
                  deferred.resolve({access_token: parameterMap.access_token, expires_in: parameterMap.expires_in, user_id: parameterMap.user_id});
                } else {
                  deferred.reject("Problem authenticating");
                }
                setTimeout(function () {
                  browserRef.close();
                }, 10);
              }
            });
            browserRef.addEventListener('exit', function (event) {
              deferred.reject("The sign in flow was canceled");
            });
          } else {
            deferred.reject("Could not find InAppBrowser plugin");
          }
        } else {
          deferred.reject("Cannot authenticate via a web browser");
        }
        return deferred.promise;
      },

      /*
       * Sign into the Imgur service
       *
       * @param    string clientId
       * @return   promise
       */
      imgur: function (clientId) {
        var deferred = $q.defer();
        if (window.cordova) {
          var cordovaMetadata = cordova.require("cordova/plugin_list").metadata;
          if (cordovaMetadata.hasOwnProperty("org.apache.cordova.inappbrowser") === true) {
            var browserRef = window.open('https://api.imgur.com/oauth2/authorize?client_id=' + clientId + '&response_type=token', '_blank', 'location=no,clearsessioncache=yes,clearcache=yes');
            browserRef.addEventListener('loadstart', function (event) {
              if ((event.url).indexOf("http://localhost/callback") === 0) {
                browserRef.removeEventListener("exit", function (event) {
                });
                browserRef.close();
                var callbackResponse = (event.url).split("#")[1];
                var responseParameters = (callbackResponse).split("&");
                var parameterMap = [];
                for (var i = 0; i < responseParameters.length; i++) {
                  parameterMap[responseParameters[i].split("=")[0]] = responseParameters[i].split("=")[1];
                }
                if (parameterMap.access_token !== undefined && parameterMap.access_token !== null) {
                  deferred.resolve({access_token: parameterMap.access_token, expires_in: parameterMap.expires_in, account_username: parameterMap.account_username});
                } else {
                  deferred.reject("Problem authenticating");
                }
              }
            });
            browserRef.addEventListener('exit', function (event) {
              deferred.reject("The sign in flow was canceled");
            });
          } else {
            deferred.reject("Could not find InAppBrowser plugin");
          }
        } else {
          deferred.reject("Cannot authenticate via a web browser");
        }
        return deferred.promise;
      }

    };
  }]);

angular.module("ngCordova.plugins.oauthUtility", [])

  .factory('$cordovaOauthUtility', ['$q', function ($q) {

    return {

      /*
       * Sign an Oauth 1.0 request
       *
       * @param    string method
       * @param    string endPoint
       * @param    object headerParameters
       * @param    object bodyParameters
       * @param    string secretKey
       * @return   object
       */
      createSignature: function (method, endPoint, headerParameters, bodyParameters, secretKey, tokenSecret) {
        if (typeof jsSHA !== "undefined") {
          var headerAndBodyParameters = angular.copy(headerParameters);
          var bodyParameterKeys = Object.keys(bodyParameters);
          for (var i = 0; i < bodyParameterKeys.length; i++) {
            headerAndBodyParameters[bodyParameterKeys[i]] = encodeURIComponent(bodyParameters[bodyParameterKeys[i]]);
          }
          var signatureBaseString = method + "&" + encodeURIComponent(endPoint) + "&";
          var headerAndBodyParameterKeys = (Object.keys(headerAndBodyParameters)).sort();
          for (i = 0; i < headerAndBodyParameterKeys.length; i++) {
            if (i == headerAndBodyParameterKeys.length - 1) {
              signatureBaseString += encodeURIComponent(headerAndBodyParameterKeys[i] + "=" + headerAndBodyParameters[headerAndBodyParameterKeys[i]]);
            } else {
              signatureBaseString += encodeURIComponent(headerAndBodyParameterKeys[i] + "=" + headerAndBodyParameters[headerAndBodyParameterKeys[i]] + "&");
            }
          }
          var oauthSignatureObject = new jsSHA(signatureBaseString, "TEXT");

          var encodedTokenSecret = '';
          if (tokenSecret) {
            encodedTokenSecret = encodeURIComponent(tokenSecret);
          }

          headerParameters.oauth_signature = encodeURIComponent(oauthSignatureObject.getHMAC(encodeURIComponent(secretKey) + "&" + encodedTokenSecret, "TEXT", "SHA-1", "B64"));
          var headerParameterKeys = Object.keys(headerParameters);
          var authorizationHeader = 'OAuth ';
          for (i = 0; i < headerParameterKeys.length; i++) {
            if (i == headerParameterKeys.length - 1) {
              authorizationHeader += headerParameterKeys[i] + '="' + headerParameters[headerParameterKeys[i]] + '"';
            } else {
              authorizationHeader += headerParameterKeys[i] + '="' + headerParameters[headerParameterKeys[i]] + '",';
            }
          }
          return {signature_base_string: signatureBaseString, authorization_header: authorizationHeader, signature: headerParameters.oauth_signature};
        } else {
          return "Missing jsSHA JavaScript library";
        }
      },

      /*
       * Create Random String Nonce
       *
       * @param    integer length
       * @return   string
       */
      createNonce: function (length) {
        var text = "";
        var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (var i = 0; i < length; i++) {
          text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
      }

    };

  }]);

// install   :      cordova plugin add https://github.com/Paldom/PinDialog.git
// link      :      https://github.com/Paldom/PinDialog

angular.module('ngCordova.plugins.pinDialog', [])

  .factory('$cordovaPinDialog', ['$q', '$window', function ($q, $window) {

    return {
      prompt: function (message, title, buttons) {
        var q = $q.defer();

        $window.plugins.pinDialog.prompt(message, function (res) {
          q.resolve(res);
        }, title, buttons);

        return q.promise;
      }
    };
  }]);

// install   :
// link      :

angular.module('ngCordova.plugins.prefs', [])

  .factory('$cordovaPreferences', ['$window', '$q', function ($window, $q) {

    return {

      set: function (key, value) {
        var q = $q.defer();

        $window.appgiraffe.plugins.applicationPreferences.set(key, value, function (result) {
          q.resolve(result);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      },

      get: function (key) {
        var q = $q.defer();

        $window.appgiraffe.plugins.applicationPreferences.get(key, function (value) {
          q.resolve(value);
        }, function (err) {
          q.reject(err);
        });

        return q.promise;
      }
    };
  }]);

// install   : cordova plugin add https://github.com/katzer/cordova-plugin-printer.git
// link      : https://github.com/katzer/cordova-plugin-printer

angular.module('ngCordova.plugins.printer', [])

  .factory('$cordovaPrinter', ['$q', '$window', function ($q, $window) {

    return {
      isAvailable: function () {
        var q = $q.defer();

        $window.plugin.printer.isAvailable(function (isAvailable) {
          q.resolve(isAvailable);
        });

        return q.promise;
      },

      print: function (doc, options) {
        var q = $q.defer();
        $window.plugin.printer.print(doc, options, function () {
          q.resolve();
        });
        return q.promise;
      }
    };
  }]);

// install   :      cordova plugin add https://github.com/pbernasconi/cordova-progressIndicator.git
// link      :      http://pbernasconi.github.io/cordova-progressIndicator/

angular.module('ngCordova.plugins.progressIndicator', [])

  .factory('$cordovaProgress', ['$q', function ($q) {

    return {
      show: function (_message) {
        var message = _message || "Please wait...";
        return ProgressIndicator.show(message);
      },

      showSimple: function (_dim) {
        var dim = _dim || false;
        return ProgressIndicator.showSimple(dim);
      },

      showSimpleWithLabel: function (_dim, _label) {
        var dim = _dim || false;
        var label = _label || "Loading...";
        return ProgressIndicator.showSimpleWithLabel(dim, label);
      },

      showSimpleWithLabelDetail: function (_dim, _label, _detail) {
        var dim = _dim || false;
        var label = _label || "Loading...";
        var detail = _detail || "Please wait";
        return ProgressIndicator.showSimpleWithLabelDetail(dim, label, detail);
      },

      showDeterminate: function (_dim, _timeout) {
        var dim = _dim || false;
        var timeout = _timeout || 50000;
        return ProgressIndicator.showDeterminate(dim, timeout);
      },

      showDeterminateWithLabel: function (_dim, _timeout, _label) {
        var dim = _dim || false;
        var timeout = _timeout || 50000;
        var label = _label || "Loading...";

        return ProgressIndicator.showDeterminateWithLabel(dim, timeout, label);
      },

      showAnnular: function (_dim, _timeout) {
        var dim = _dim || false;
        var timeout = _timeout || 50000;
        return ProgressIndicator.showAnnular(dim, timeout);
      },

      showAnnularWithLabel: function (_dim, _timeout, _label) {
        var dim = _dim || false;
        var timeout = _timeout || 50000;
        var label = _label || "Loading...";
        return ProgressIndicator.showAnnularWithLabel(dim, timeout, label);
      },

      showBar: function (_dim, _timeout) {
        var dim = _dim || false;
        var timeout = _timeout || 50000;
        return ProgressIndicator.showBar(dim, timeout);
      },

      showBarWithLabel: function (_dim, _timeout, _label) {
        var dim = _dim || false;
        var timeout = _timeout || 50000;
        var label = _label || "Loading...";
        return ProgressIndicator.showBarWithLabel(dim, timeout, label);
      },

      showSuccess: function (_dim, _label) {
        var dim = _dim || false;
        var label = _label || "Success";
        return ProgressIndicator.showSuccess(dim, label);
      },

      showText: function (_dim, _text, _position) {
        var dim = _dim || false;
        var text = _text || "Warning";
        var position = _position || "center";
        return ProgressIndicator.showText(dim, text, position);
      },

      hide: function () {
        return ProgressIndicator.hide();
      }
    };

  }]);

// install   :      cordova plugin add https://github.com/phonegap-build/PushPlugin.git
// link      :      https://github.com/phonegap-build/PushPlugin

angular.module('ngCordova.plugins.push', [])

  .factory('$cordovaPush', ['$q', '$window', '$rootScope', '$timeout', function ($q, $window, $rootScope, $timeout) {
    return {
      onNotification: function (notification) {
        $timeout(function () {
          $rootScope.$broadcast('$cordovaPush:notificationReceived', notification);
        });
      },

      register: function (config) {
        var q = $q.defer();
        var injector;
        if (config !== undefined && config.ecb === undefined) {
          if (document.querySelector('[ng-app]') === null) {
            injector = "document.body";
          }
          else {
            injector = "document.querySelector('[ng-app]')";
          }
          config.ecb = "angular.element(" + injector + ").injector().get('$cordovaPush').onNotification";
        }

        $window.plugins.pushNotification.register(function (token) {
          q.resolve(token);
        }, function (error) {
          q.reject(error);
        }, config);

        return q.promise;
      },

      unregister: function (options) {
        var q = $q.defer();
        $window.plugins.pushNotification.unregister(function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        }, options);

        return q.promise;
      },

      // iOS only
      setBadgeNumber: function (number) {
        var q = $q.defer();
        $window.plugins.pushNotification.setApplicationIconBadgeNumber(function (result) {
          q.resolve(result);
        }, function (error) {
          q.reject(error);
        }, number);
        return q.promise;
      }
    };
  }]);

// install   :      cordova plugin add https://github.com/cordova-sms/cordova-sms-plugin.git
// link      :      https://github.com/cordova-sms/cordova-sms-plugin

angular.module('ngCordova.plugins.sms', [])

  .factory('$cordovaSms', ['$q', function ($q) {

    return {
      send: function (number, message, options) {
        var q = $q.defer();
        sms.send(number, message, options, function (res) {
          q.resolve(res);
        }, function (err) {
          q.reject(err);
        });
        return q.promise;
      }
    };

  }]);

// install   :      cordova plugin add https://github.com/EddyVerbruggen/SocialSharing-PhoneGap-Plugin.git
// link      :      https://github.com/EddyVerbruggen/SocialSharing-PhoneGap-Plugin

// NOTE: shareViaEmail -> if user cancels sharing email, success is still called
// TODO: add support for iPad

angular.module('ngCordova.plugins.socialSharing', [])

  .factory('$cordovaSocialSharing', ['$q', '$window', function ($q, $window) {

    return {
      share: function (message, subject, file, link) {
        var q = $q.defer();
        subject = subject || null;
        file = file || null;
        link = link || null;
        $window.plugins.socialsharing.share(message, subject, file, link, function () {
          q.resolve(true);
        }, function () {
          q.reject(false);
        });
        return q.promise;
      },

      shareViaTwitter: function (message, file, link) {
        var q = $q.defer();
        file = file || null;
        link = link || null;
        $window.plugins.socialsharing.shareViaTwitter(message, file, link, function () {
          q.resolve(true);
        }, function () {
          q.reject(false);
        });
        return q.promise;
      },

      shareViaWhatsApp: function (message, file, link) {
        var q = $q.defer();
        file = file || null;
        link = link || null;
        $window.plugins.socialsharing.shareViaWhatsApp(message, file, link, function () {
          q.resolve(true);
        }, function () {
          q.reject(false);
        });
        return q.promise;
      },

      shareViaFacebook: function (message, file, link) {
        var q = $q.defer();
        message = message || null;
        file = file || null;
        link = link || null;
        $window.plugins.socialsharing.shareViaFacebook(message, file, link, function () {
          q.resolve(true);
        }, function () {
          q.reject(false);
        });
        return q.promise;
      },

      shareViaFacebookWithPasteMessageHint: function (message, file, link, pasteMessageHint) {
        var q = $q.defer();
        file = file || null;
        link = link || null;
        $window.plugins.socialsharing.shareViaFacebookWithPasteMessageHint(message, file, link, pasteMessageHint, function () {
          q.resolve(true);
        }, function () {
          q.reject(false);
        });
        return q.promise;
      },

      shareViaSMS: function (message, commaSeparatedPhoneNumbers) {
        var q = $q.defer();
        $window.plugins.socialsharing.shareViaSMS(message, commaSeparatedPhoneNumbers, function () {
          q.resolve(true);
        }, function () {
          q.reject(false);
        });
        return q.promise;
      },

      shareViaEmail: function (message, subject, toArr, ccArr, bccArr, fileArr) {
        var q = $q.defer();
        toArr = toArr || null;
        ccArr = ccArr || null;
        bccArr = bccArr || null;
        fileArr = fileArr || null;
        $window.plugins.socialsharing.shareViaEmail(message, subject, toArr, ccArr, bccArr, fileArr, function () {
          q.resolve(true);
        }, function () {
          q.reject(false);
        });
        return q.promise;
      },

      shareVia: function (via, message, subject, file, link) {
        var q = $q.defer();
        message = message || null;
        subject = subject || null;
        file = file || null;
        link = link || null;
        $window.plugins.socialsharing.shareVia(via, message, subject, file, link, function () {
          q.resolve(true);
        }, function () {
          q.reject(false);
        });
        return q.promise;
      },

      canShareViaEmail: function () {
        var q = $q.defer();
        $window.plugins.socialsharing.canShareViaEmail(function () {
          q.resolve(true);
        }, function () {
          q.reject(false);
        });
        return q.promise;
      },

      canShareVia: function (via, message, subject, file, link) {
        var q = $q.defer();
        $window.plugins.socialsharing.canShareVia(via, message, subject, file, link, function (success) {
          q.resolve(success);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      available: function () {
        var q = $q.defer();
        window.plugins.socialsharing.available(function (isAvailable) {
          if (isAvailable) {
            q.resolve();
          }
          else {
            q.reject();
          }
        });
      }
    };
  }]);

// install   :       cordova plugin add https://github.com/Paldom/SpinnerDialog.git
// link      :       https://github.com/Paldom/SpinnerDialog

angular.module('ngCordova.plugins.spinnerDialog', [])

  .factory('$cordovaSpinnerDialog', ['$window', function ($window) {

    return {
      show: function (title, message, fixed) {
        fixed = fixed || false;
        return $window.plugins.spinnerDialog.show(title, message, fixed);
      },
      hide: function () {
        return $window.plugins.spinnerDialog.hide();
      }
    };

  }]);

// install   :      cordova plugin add cordova-plugin-splashscreen
// link      :      https://github.com/apache/cordova-plugin-splashscreen

angular.module('ngCordova.plugins.splashscreen', [])

  .factory('$cordovaSplashscreen', [function () {

    return {
      hide: function () {
        return navigator.splashscreen.hide();
      },

      show: function () {
        return navigator.splashscreen.show();
      }
    };

  }]);

// install   :      cordova plugin add https://github.com/litehelpers/Cordova-sqlite-storage.git
// link      :      https://github.com/litehelpers/Cordova-sqlite-storage

angular.module('ngCordova.plugins.sqlite', [])

  .factory('$cordovaSQLite', ['$q', '$window', function ($q, $window) {

    return {
      openDB: function (dbName, background) {

        if (typeof background === 'undefined') {
          background = 0;
        }

        return $window.sqlitePlugin.openDatabase({
          name: dbName,
          bgType: background
        });
      },

      execute: function (db, query, binding) {
        var q = $q.defer();
        db.transaction(function (tx) {
          tx.executeSql(query, binding, function (tx, result) {
              q.resolve(result);
            },
            function (transaction, error) {
              q.reject(error);
            });
        });
        return q.promise;
      },

      insertCollection: function (db, query, bindings) {
        var q = $q.defer();
        var coll = bindings.slice(0); // clone collection

        db.transaction(function (tx) {
          (function insertOne() {
            var record = coll.splice(0, 1)[0]; // get the first record of coll and reduce coll by one
            try {
              tx.executeSql(query, record, function (tx, result) {
                if (coll.length === 0) {
                  q.resolve(result);
                } else {
                  insertOne();
                }
              }, function (transaction, error) {
                q.reject(error);
                return;
              });
            } catch (exception) {
              q.reject(exception);
            }
          })();
        });
        return q.promise;
      },

      nestedExecute: function (db, query1, query2, binding1, binding2) {
        var q = $q.defer();

        db.transaction(function (tx) {
            tx.executeSql(query1, binding1, function (tx, result) {
              q.resolve(result);
              tx.executeSql(query2, binding2, function (tx, res) {
                q.resolve(res);
              });
            });
          },
          function (transaction, error) {
            q.reject(error);
          });

        return q.promise;
      },

      deleteDB: function (dbName) {
        var q = $q.defer();

        $window.sqlitePlugin.deleteDatabase(dbName, function (success) {
          q.resolve(success);
        }, function (error) {
          q.reject(error);
        });

        return q.promise;
      }
    };
  }]);

// install   :      cordova plugin add cordova-plugin-statusbar
// link      :      https://github.com/apache/cordova-plugin-statusbar

angular.module('ngCordova.plugins.statusbar', [])

  .factory('$cordovaStatusbar', [function () {

    return {
      overlaysWebView: function (bool) {
        return StatusBar.overlaysWebView(!!bool);
      },

      STYLES: {
        DEFAULT: 0,
        LIGHT_CONTENT: 1,
        BLACK_TRANSLUCENT: 2,
        BLACK_OPAQUE: 3
      },

      style: function (style) {
        switch (style) {
          // Default
          case 0:
            return StatusBar.styleDefault();

          // LightContent
          case 1:
            return StatusBar.styleLightContent();

          // BlackTranslucent
          case 2:
            return StatusBar.styleBlackTranslucent();

          // BlackOpaque
          case 3:
            return StatusBar.styleBlackOpaque();

          default:
            return StatusBar.styleDefault();
        }
      },

      // supported names:
      // black, darkGray, lightGray, white, gray, red, green,
      // blue, cyan, yellow, magenta, orange, purple, brown
      styleColor: function (color) {
        return StatusBar.backgroundColorByName(color);
      },

      styleHex: function (colorHex) {
        return StatusBar.backgroundColorByHexString(colorHex);
      },

      hide: function () {
        return StatusBar.hide();
      },

      show: function () {
        return StatusBar.show();
      },

      isVisible: function () {
        return StatusBar.isVisible;
      }
    };
  }]);

// install   :      cordova plugin add https://github.com/EddyVerbruggen/Toast-PhoneGap-Plugin.git
// link      :      https://github.com/EddyVerbruggen/Toast-PhoneGap-Plugin

angular.module('ngCordova.plugins.toast', [])

  .factory('$cordovaToast', ['$q', '$window', function ($q, $window) {

    return {
      showShortTop: function (message) {
        var q = $q.defer();
        $window.plugins.toast.showShortTop(message, function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      showShortCenter: function (message) {
        var q = $q.defer();
        $window.plugins.toast.showShortCenter(message, function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      showShortBottom: function (message) {
        var q = $q.defer();
        $window.plugins.toast.showShortBottom(message, function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      showLongTop: function (message) {
        var q = $q.defer();
        $window.plugins.toast.showLongTop(message, function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      showLongCenter: function (message) {
        var q = $q.defer();
        $window.plugins.toast.showLongCenter(message, function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },

      showLongBottom: function (message) {
        var q = $q.defer();
        $window.plugins.toast.showLongBottom(message, function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      },


      show: function (message, duration, position) {
        var q = $q.defer();
        $window.plugins.toast.show(message, duration, position, function (response) {
          q.resolve(response);
        }, function (error) {
          q.reject(error);
        });
        return q.promise;
      }
    };

  }]);

// install   :      cordova plugin add https://github.com/leecrossley/cordova-plugin-touchid.git
// link      :      https://github.com/leecrossley/cordova-plugin-touchid

angular.module('ngCordova.plugins.touchid', [])

  .factory('$cordovaTouchID', ['$q', function ($q) {

    return {
      checkSupport: function () {
        var defer = $q.defer();
        if (!window.cordova) {
          defer.reject("Not supported without cordova.js");
        } else {
          touchid.checkSupport(function (value) {
            defer.resolve(value);
          }, function (err) {
            defer.reject(err);
          });
        }

        return defer.promise;
      },

      authenticate: function (auth_reason_text) {
        var defer = $q.defer();
        if (!window.cordova) {
          defer.reject("Not supported without cordova.js");
        } else {
          touchid.authenticate(function (value) {
            defer.resolve(value);
          }, function (err) {
            defer.reject(err);
          }, auth_reason_text);
        }

        return defer.promise;
      }
    };
  }]);

// install   :      cordova plugin add cordova-plugin-vibration
// link      :      https://github.com/apache/cordova-plugin-vibration

angular.module('ngCordova.plugins.vibration', [])

  .factory('$cordovaVibration', [function () {

    return {
      vibrate: function (times) {
        return navigator.notification.vibrate(times);
      },
      vibrateWithPattern: function (pattern, repeat) {
        return navigator.notification.vibrateWithPattern(pattern, repeat);
      },
      cancelVibration: function () {
        return navigator.notification.cancelVibration();
      }
    };
  }]);

// install   :    cordova plugin add https://github.com/EddyVerbruggen/VideoCapturePlus-PhoneGap-Plugin.git
// link      :    https://github.com/EddyVerbruggen/VideoCapturePlus-PhoneGap-Plugin

angular.module('ngCordova.plugins.videoCapturePlus', [])

  .provider('$cordovaVideoCapturePlus', [function () {

    var defaultOptions = {};


    /**
     * the nr of videos to record, default 1 (on iOS always 1)
     *
     * @param limit
     */
    this.setLimit = function setLimit(limit) {
      defaultOptions.limit = limit;
    };


    /**
     * max duration in seconds, default 0, which is 'forever'
     *
     * @param seconds
     */
    this.setMaxDuration = function setMaxDuration(seconds) {
      defaultOptions.duration = seconds;
    };


    /**
     * set to true to override the default low quality setting
     *
     * @param {Boolean} highquality
     */
    this.setHighQuality = function setHighQuality(highquality) {
      defaultOptions.highquality = highquality;
    };

    /**
     * you'll want to sniff the user-Agent/device and pass the best overlay based on that..
     * set to true to override the default backfacing camera setting. iOS: works fine, Android: YMMV (#18)
     *
     * @param {Boolean} frontcamera
     */
    this.useFrontCamera = function useFrontCamera(frontcamera) {
      defaultOptions.frontcamera = frontcamera;
    };


    /**
     * put the png in your www folder
     *
     * @param {String} imageUrl
     */
    this.setPortraitOverlay = function setPortraitOverlay(imageUrl) {
      defaultOptions.portraitOverlay = imageUrl;
    };


    /**
     *
     * @param {String} imageUrl
     */
    this.setLandscapeOverlay = function setLandscapeOverlay(imageUrl) {
      defaultOptions.landscapeOverlay = imageUrl;
    };


    /**
     * iOS only
     *
     * @param text
     */
    this.setOverlayText = function setOverlayText(text) {
      defaultOptions.overlayText = text;
    };


    this.$get = ['$q', '$window', function ($q, $window) {
      return {
        captureVideo: function (options) {
          var q = $q.defer();

          if (!$window.plugins.videocaptureplus) {
            q.resolve(null);
            return q.promise;
          }

          $window.plugins.videocaptureplus.captureVideo(q.resolve, q.reject,
            angular.extend({}, defaultOptions, options));

          return q.promise;
        }
      };
    }];
  }]);

// install  :     cordova plugin add https://github.com/MobileChromeApps/zip.git
// link     :     https://github.com/MobileChromeApps/zip

angular.module('ngCordova.plugins.zip', [])

  .factory('$cordovaZip', ['$q', '$window', function ($q, $window) {

    return {
      unzip: function (source, destination) {
        var q = $q.defer();

        $window.zip.unzip(source, destination, function (isError) {
          if (isError === 0) {
            q.resolve();
          } else {
            q.reject();
          }
        }, function (progressEvent) {
          q.notify(progressEvent);
        });

        return q.promise;
      }
    };
  }]);

})();
/*
 Leaflet, a JavaScript library for mobile-friendly interactive maps. http://leafletjs.com
 (c) 2010-2013, Vladimir Agafonkin
 (c) 2010-2011, CloudMade
*/
!function(t,e,i){var n=t.L,o={};o.version="0.7.3","object"==typeof module&&"object"==typeof module.exports?module.exports=o:"function"==typeof define&&define.amd&&define(o),o.noConflict=function(){return t.L=n,this},t.L=o,o.Util={extend:function(t){var e,i,n,o,s=Array.prototype.slice.call(arguments,1);for(i=0,n=s.length;n>i;i++){o=s[i]||{};for(e in o)o.hasOwnProperty(e)&&(t[e]=o[e])}return t},bind:function(t,e){var i=arguments.length>2?Array.prototype.slice.call(arguments,2):null;return function(){return t.apply(e,i||arguments)}},stamp:function(){var t=0,e="_leaflet_id";return function(i){return i[e]=i[e]||++t,i[e]}}(),invokeEach:function(t,e,i){var n,o;if("object"==typeof t){o=Array.prototype.slice.call(arguments,3);for(n in t)e.apply(i,[n,t[n]].concat(o));return!0}return!1},limitExecByInterval:function(t,e,i){var n,o;return function s(){var a=arguments;return n?void(o=!0):(n=!0,setTimeout(function(){n=!1,o&&(s.apply(i,a),o=!1)},e),void t.apply(i,a))}},falseFn:function(){return!1},formatNum:function(t,e){var i=Math.pow(10,e||5);return Math.round(t*i)/i},trim:function(t){return t.trim?t.trim():t.replace(/^\s+|\s+$/g,"")},splitWords:function(t){return o.Util.trim(t).split(/\s+/)},setOptions:function(t,e){return t.options=o.extend({},t.options,e),t.options},getParamString:function(t,e,i){var n=[];for(var o in t)n.push(encodeURIComponent(i?o.toUpperCase():o)+"="+encodeURIComponent(t[o]));return(e&&-1!==e.indexOf("?")?"&":"?")+n.join("&")},template:function(t,e){return t.replace(/\{ *([\w_]+) *\}/g,function(t,n){var o=e[n];if(o===i)throw new Error("No value provided for variable "+t);return"function"==typeof o&&(o=o(e)),o})},isArray:Array.isArray||function(t){return"[object Array]"===Object.prototype.toString.call(t)},emptyImageUrl:"data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="},function(){function e(e){var i,n,o=["webkit","moz","o","ms"];for(i=0;i<o.length&&!n;i++)n=t[o[i]+e];return n}function i(e){var i=+new Date,o=Math.max(0,16-(i-n));return n=i+o,t.setTimeout(e,o)}var n=0,s=t.requestAnimationFrame||e("RequestAnimationFrame")||i,a=t.cancelAnimationFrame||e("CancelAnimationFrame")||e("CancelRequestAnimationFrame")||function(e){t.clearTimeout(e)};o.Util.requestAnimFrame=function(e,n,a,r){return e=o.bind(e,n),a&&s===i?void e():s.call(t,e,r)},o.Util.cancelAnimFrame=function(e){e&&a.call(t,e)}}(),o.extend=o.Util.extend,o.bind=o.Util.bind,o.stamp=o.Util.stamp,o.setOptions=o.Util.setOptions,o.Class=function(){},o.Class.extend=function(t){var e=function(){this.initialize&&this.initialize.apply(this,arguments),this._initHooks&&this.callInitHooks()},i=function(){};i.prototype=this.prototype;var n=new i;n.constructor=e,e.prototype=n;for(var s in this)this.hasOwnProperty(s)&&"prototype"!==s&&(e[s]=this[s]);t.statics&&(o.extend(e,t.statics),delete t.statics),t.includes&&(o.Util.extend.apply(null,[n].concat(t.includes)),delete t.includes),t.options&&n.options&&(t.options=o.extend({},n.options,t.options)),o.extend(n,t),n._initHooks=[];var a=this;return e.__super__=a.prototype,n.callInitHooks=function(){if(!this._initHooksCalled){a.prototype.callInitHooks&&a.prototype.callInitHooks.call(this),this._initHooksCalled=!0;for(var t=0,e=n._initHooks.length;e>t;t++)n._initHooks[t].call(this)}},e},o.Class.include=function(t){o.extend(this.prototype,t)},o.Class.mergeOptions=function(t){o.extend(this.prototype.options,t)},o.Class.addInitHook=function(t){var e=Array.prototype.slice.call(arguments,1),i="function"==typeof t?t:function(){this[t].apply(this,e)};this.prototype._initHooks=this.prototype._initHooks||[],this.prototype._initHooks.push(i)};var s="_leaflet_events";o.Mixin={},o.Mixin.Events={addEventListener:function(t,e,i){if(o.Util.invokeEach(t,this.addEventListener,this,e,i))return this;var n,a,r,h,l,u,c,d=this[s]=this[s]||{},p=i&&i!==this&&o.stamp(i);for(t=o.Util.splitWords(t),n=0,a=t.length;a>n;n++)r={action:e,context:i||this},h=t[n],p?(l=h+"_idx",u=l+"_len",c=d[l]=d[l]||{},c[p]||(c[p]=[],d[u]=(d[u]||0)+1),c[p].push(r)):(d[h]=d[h]||[],d[h].push(r));return this},hasEventListeners:function(t){var e=this[s];return!!e&&(t in e&&e[t].length>0||t+"_idx"in e&&e[t+"_idx_len"]>0)},removeEventListener:function(t,e,i){if(!this[s])return this;if(!t)return this.clearAllEventListeners();if(o.Util.invokeEach(t,this.removeEventListener,this,e,i))return this;var n,a,r,h,l,u,c,d,p,_=this[s],m=i&&i!==this&&o.stamp(i);for(t=o.Util.splitWords(t),n=0,a=t.length;a>n;n++)if(r=t[n],u=r+"_idx",c=u+"_len",d=_[u],e){if(h=m&&d?d[m]:_[r]){for(l=h.length-1;l>=0;l--)h[l].action!==e||i&&h[l].context!==i||(p=h.splice(l,1),p[0].action=o.Util.falseFn);i&&d&&0===h.length&&(delete d[m],_[c]--)}}else delete _[r],delete _[u],delete _[c];return this},clearAllEventListeners:function(){return delete this[s],this},fireEvent:function(t,e){if(!this.hasEventListeners(t))return this;var i,n,a,r,h,l=o.Util.extend({},e,{type:t,target:this}),u=this[s];if(u[t])for(i=u[t].slice(),n=0,a=i.length;a>n;n++)i[n].action.call(i[n].context,l);r=u[t+"_idx"];for(h in r)if(i=r[h].slice())for(n=0,a=i.length;a>n;n++)i[n].action.call(i[n].context,l);return this},addOneTimeEventListener:function(t,e,i){if(o.Util.invokeEach(t,this.addOneTimeEventListener,this,e,i))return this;var n=o.bind(function(){this.removeEventListener(t,e,i).removeEventListener(t,n,i)},this);return this.addEventListener(t,e,i).addEventListener(t,n,i)}},o.Mixin.Events.on=o.Mixin.Events.addEventListener,o.Mixin.Events.off=o.Mixin.Events.removeEventListener,o.Mixin.Events.once=o.Mixin.Events.addOneTimeEventListener,o.Mixin.Events.fire=o.Mixin.Events.fireEvent,function(){var n="ActiveXObject"in t,s=n&&!e.addEventListener,a=navigator.userAgent.toLowerCase(),r=-1!==a.indexOf("webkit"),h=-1!==a.indexOf("chrome"),l=-1!==a.indexOf("phantom"),u=-1!==a.indexOf("android"),c=-1!==a.search("android [23]"),d=-1!==a.indexOf("gecko"),p=typeof orientation!=i+"",_=t.navigator&&t.navigator.msPointerEnabled&&t.navigator.msMaxTouchPoints&&!t.PointerEvent,m=t.PointerEvent&&t.navigator.pointerEnabled&&t.navigator.maxTouchPoints||_,f="devicePixelRatio"in t&&t.devicePixelRatio>1||"matchMedia"in t&&t.matchMedia("(min-resolution:144dpi)")&&t.matchMedia("(min-resolution:144dpi)").matches,g=e.documentElement,v=n&&"transition"in g.style,y="WebKitCSSMatrix"in t&&"m11"in new t.WebKitCSSMatrix&&!c,P="MozPerspective"in g.style,L="OTransition"in g.style,x=!t.L_DISABLE_3D&&(v||y||P||L)&&!l,w=!t.L_NO_TOUCH&&!l&&function(){var t="ontouchstart";if(m||t in g)return!0;var i=e.createElement("div"),n=!1;return i.setAttribute?(i.setAttribute(t,"return;"),"function"==typeof i[t]&&(n=!0),i.removeAttribute(t),i=null,n):!1}();o.Browser={ie:n,ielt9:s,webkit:r,gecko:d&&!r&&!t.opera&&!n,android:u,android23:c,chrome:h,ie3d:v,webkit3d:y,gecko3d:P,opera3d:L,any3d:x,mobile:p,mobileWebkit:p&&r,mobileWebkit3d:p&&y,mobileOpera:p&&t.opera,touch:w,msPointer:_,pointer:m,retina:f}}(),o.Point=function(t,e,i){this.x=i?Math.round(t):t,this.y=i?Math.round(e):e},o.Point.prototype={clone:function(){return new o.Point(this.x,this.y)},add:function(t){return this.clone()._add(o.point(t))},_add:function(t){return this.x+=t.x,this.y+=t.y,this},subtract:function(t){return this.clone()._subtract(o.point(t))},_subtract:function(t){return this.x-=t.x,this.y-=t.y,this},divideBy:function(t){return this.clone()._divideBy(t)},_divideBy:function(t){return this.x/=t,this.y/=t,this},multiplyBy:function(t){return this.clone()._multiplyBy(t)},_multiplyBy:function(t){return this.x*=t,this.y*=t,this},round:function(){return this.clone()._round()},_round:function(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this},floor:function(){return this.clone()._floor()},_floor:function(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this},distanceTo:function(t){t=o.point(t);var e=t.x-this.x,i=t.y-this.y;return Math.sqrt(e*e+i*i)},equals:function(t){return t=o.point(t),t.x===this.x&&t.y===this.y},contains:function(t){return t=o.point(t),Math.abs(t.x)<=Math.abs(this.x)&&Math.abs(t.y)<=Math.abs(this.y)},toString:function(){return"Point("+o.Util.formatNum(this.x)+", "+o.Util.formatNum(this.y)+")"}},o.point=function(t,e,n){return t instanceof o.Point?t:o.Util.isArray(t)?new o.Point(t[0],t[1]):t===i||null===t?t:new o.Point(t,e,n)},o.Bounds=function(t,e){if(t)for(var i=e?[t,e]:t,n=0,o=i.length;o>n;n++)this.extend(i[n])},o.Bounds.prototype={extend:function(t){return t=o.point(t),this.min||this.max?(this.min.x=Math.min(t.x,this.min.x),this.max.x=Math.max(t.x,this.max.x),this.min.y=Math.min(t.y,this.min.y),this.max.y=Math.max(t.y,this.max.y)):(this.min=t.clone(),this.max=t.clone()),this},getCenter:function(t){return new o.Point((this.min.x+this.max.x)/2,(this.min.y+this.max.y)/2,t)},getBottomLeft:function(){return new o.Point(this.min.x,this.max.y)},getTopRight:function(){return new o.Point(this.max.x,this.min.y)},getSize:function(){return this.max.subtract(this.min)},contains:function(t){var e,i;return t="number"==typeof t[0]||t instanceof o.Point?o.point(t):o.bounds(t),t instanceof o.Bounds?(e=t.min,i=t.max):e=i=t,e.x>=this.min.x&&i.x<=this.max.x&&e.y>=this.min.y&&i.y<=this.max.y},intersects:function(t){t=o.bounds(t);var e=this.min,i=this.max,n=t.min,s=t.max,a=s.x>=e.x&&n.x<=i.x,r=s.y>=e.y&&n.y<=i.y;return a&&r},isValid:function(){return!(!this.min||!this.max)}},o.bounds=function(t,e){return!t||t instanceof o.Bounds?t:new o.Bounds(t,e)},o.Transformation=function(t,e,i,n){this._a=t,this._b=e,this._c=i,this._d=n},o.Transformation.prototype={transform:function(t,e){return this._transform(t.clone(),e)},_transform:function(t,e){return e=e||1,t.x=e*(this._a*t.x+this._b),t.y=e*(this._c*t.y+this._d),t},untransform:function(t,e){return e=e||1,new o.Point((t.x/e-this._b)/this._a,(t.y/e-this._d)/this._c)}},o.DomUtil={get:function(t){return"string"==typeof t?e.getElementById(t):t},getStyle:function(t,i){var n=t.style[i];if(!n&&t.currentStyle&&(n=t.currentStyle[i]),(!n||"auto"===n)&&e.defaultView){var o=e.defaultView.getComputedStyle(t,null);n=o?o[i]:null}return"auto"===n?null:n},getViewportOffset:function(t){var i,n=0,s=0,a=t,r=e.body,h=e.documentElement;do{if(n+=a.offsetTop||0,s+=a.offsetLeft||0,n+=parseInt(o.DomUtil.getStyle(a,"borderTopWidth"),10)||0,s+=parseInt(o.DomUtil.getStyle(a,"borderLeftWidth"),10)||0,i=o.DomUtil.getStyle(a,"position"),a.offsetParent===r&&"absolute"===i)break;if("fixed"===i){n+=r.scrollTop||h.scrollTop||0,s+=r.scrollLeft||h.scrollLeft||0;break}if("relative"===i&&!a.offsetLeft){var l=o.DomUtil.getStyle(a,"width"),u=o.DomUtil.getStyle(a,"max-width"),c=a.getBoundingClientRect();("none"!==l||"none"!==u)&&(s+=c.left+a.clientLeft),n+=c.top+(r.scrollTop||h.scrollTop||0);break}a=a.offsetParent}while(a);a=t;do{if(a===r)break;n-=a.scrollTop||0,s-=a.scrollLeft||0,a=a.parentNode}while(a);return new o.Point(s,n)},documentIsLtr:function(){return o.DomUtil._docIsLtrCached||(o.DomUtil._docIsLtrCached=!0,o.DomUtil._docIsLtr="ltr"===o.DomUtil.getStyle(e.body,"direction")),o.DomUtil._docIsLtr},create:function(t,i,n){var o=e.createElement(t);return o.className=i,n&&n.appendChild(o),o},hasClass:function(t,e){if(t.classList!==i)return t.classList.contains(e);var n=o.DomUtil._getClass(t);return n.length>0&&new RegExp("(^|\\s)"+e+"(\\s|$)").test(n)},addClass:function(t,e){if(t.classList!==i)for(var n=o.Util.splitWords(e),s=0,a=n.length;a>s;s++)t.classList.add(n[s]);else if(!o.DomUtil.hasClass(t,e)){var r=o.DomUtil._getClass(t);o.DomUtil._setClass(t,(r?r+" ":"")+e)}},removeClass:function(t,e){t.classList!==i?t.classList.remove(e):o.DomUtil._setClass(t,o.Util.trim((" "+o.DomUtil._getClass(t)+" ").replace(" "+e+" "," ")))},_setClass:function(t,e){t.className.baseVal===i?t.className=e:t.className.baseVal=e},_getClass:function(t){return t.className.baseVal===i?t.className:t.className.baseVal},setOpacity:function(t,e){if("opacity"in t.style)t.style.opacity=e;else if("filter"in t.style){var i=!1,n="DXImageTransform.Microsoft.Alpha";try{i=t.filters.item(n)}catch(o){if(1===e)return}e=Math.round(100*e),i?(i.Enabled=100!==e,i.Opacity=e):t.style.filter+=" progid:"+n+"(opacity="+e+")"}},testProp:function(t){for(var i=e.documentElement.style,n=0;n<t.length;n++)if(t[n]in i)return t[n];return!1},getTranslateString:function(t){var e=o.Browser.webkit3d,i="translate"+(e?"3d":"")+"(",n=(e?",0":"")+")";return i+t.x+"px,"+t.y+"px"+n},getScaleString:function(t,e){var i=o.DomUtil.getTranslateString(e.add(e.multiplyBy(-1*t))),n=" scale("+t+") ";return i+n},setPosition:function(t,e,i){t._leaflet_pos=e,!i&&o.Browser.any3d?t.style[o.DomUtil.TRANSFORM]=o.DomUtil.getTranslateString(e):(t.style.left=e.x+"px",t.style.top=e.y+"px")},getPosition:function(t){return t._leaflet_pos}},o.DomUtil.TRANSFORM=o.DomUtil.testProp(["transform","WebkitTransform","OTransform","MozTransform","msTransform"]),o.DomUtil.TRANSITION=o.DomUtil.testProp(["webkitTransition","transition","OTransition","MozTransition","msTransition"]),o.DomUtil.TRANSITION_END="webkitTransition"===o.DomUtil.TRANSITION||"OTransition"===o.DomUtil.TRANSITION?o.DomUtil.TRANSITION+"End":"transitionend",function(){if("onselectstart"in e)o.extend(o.DomUtil,{disableTextSelection:function(){o.DomEvent.on(t,"selectstart",o.DomEvent.preventDefault)},enableTextSelection:function(){o.DomEvent.off(t,"selectstart",o.DomEvent.preventDefault)}});else{var i=o.DomUtil.testProp(["userSelect","WebkitUserSelect","OUserSelect","MozUserSelect","msUserSelect"]);o.extend(o.DomUtil,{disableTextSelection:function(){if(i){var t=e.documentElement.style;this._userSelect=t[i],t[i]="none"}},enableTextSelection:function(){i&&(e.documentElement.style[i]=this._userSelect,delete this._userSelect)}})}o.extend(o.DomUtil,{disableImageDrag:function(){o.DomEvent.on(t,"dragstart",o.DomEvent.preventDefault)},enableImageDrag:function(){o.DomEvent.off(t,"dragstart",o.DomEvent.preventDefault)}})}(),o.LatLng=function(t,e,n){if(t=parseFloat(t),e=parseFloat(e),isNaN(t)||isNaN(e))throw new Error("Invalid LatLng object: ("+t+", "+e+")");this.lat=t,this.lng=e,n!==i&&(this.alt=parseFloat(n))},o.extend(o.LatLng,{DEG_TO_RAD:Math.PI/180,RAD_TO_DEG:180/Math.PI,MAX_MARGIN:1e-9}),o.LatLng.prototype={equals:function(t){if(!t)return!1;t=o.latLng(t);var e=Math.max(Math.abs(this.lat-t.lat),Math.abs(this.lng-t.lng));return e<=o.LatLng.MAX_MARGIN},toString:function(t){return"LatLng("+o.Util.formatNum(this.lat,t)+", "+o.Util.formatNum(this.lng,t)+")"},distanceTo:function(t){t=o.latLng(t);var e=6378137,i=o.LatLng.DEG_TO_RAD,n=(t.lat-this.lat)*i,s=(t.lng-this.lng)*i,a=this.lat*i,r=t.lat*i,h=Math.sin(n/2),l=Math.sin(s/2),u=h*h+l*l*Math.cos(a)*Math.cos(r);return 2*e*Math.atan2(Math.sqrt(u),Math.sqrt(1-u))},wrap:function(t,e){var i=this.lng;return t=t||-180,e=e||180,i=(i+e)%(e-t)+(t>i||i===e?e:t),new o.LatLng(this.lat,i)}},o.latLng=function(t,e){return t instanceof o.LatLng?t:o.Util.isArray(t)?"number"==typeof t[0]||"string"==typeof t[0]?new o.LatLng(t[0],t[1],t[2]):null:t===i||null===t?t:"object"==typeof t&&"lat"in t?new o.LatLng(t.lat,"lng"in t?t.lng:t.lon):e===i?null:new o.LatLng(t,e)},o.LatLngBounds=function(t,e){if(t)for(var i=e?[t,e]:t,n=0,o=i.length;o>n;n++)this.extend(i[n])},o.LatLngBounds.prototype={extend:function(t){if(!t)return this;var e=o.latLng(t);return t=null!==e?e:o.latLngBounds(t),t instanceof o.LatLng?this._southWest||this._northEast?(this._southWest.lat=Math.min(t.lat,this._southWest.lat),this._southWest.lng=Math.min(t.lng,this._southWest.lng),this._northEast.lat=Math.max(t.lat,this._northEast.lat),this._northEast.lng=Math.max(t.lng,this._northEast.lng)):(this._southWest=new o.LatLng(t.lat,t.lng),this._northEast=new o.LatLng(t.lat,t.lng)):t instanceof o.LatLngBounds&&(this.extend(t._southWest),this.extend(t._northEast)),this},pad:function(t){var e=this._southWest,i=this._northEast,n=Math.abs(e.lat-i.lat)*t,s=Math.abs(e.lng-i.lng)*t;return new o.LatLngBounds(new o.LatLng(e.lat-n,e.lng-s),new o.LatLng(i.lat+n,i.lng+s))},getCenter:function(){return new o.LatLng((this._southWest.lat+this._northEast.lat)/2,(this._southWest.lng+this._northEast.lng)/2)},getSouthWest:function(){return this._southWest},getNorthEast:function(){return this._northEast},getNorthWest:function(){return new o.LatLng(this.getNorth(),this.getWest())},getSouthEast:function(){return new o.LatLng(this.getSouth(),this.getEast())},getWest:function(){return this._southWest.lng},getSouth:function(){return this._southWest.lat},getEast:function(){return this._northEast.lng},getNorth:function(){return this._northEast.lat},contains:function(t){t="number"==typeof t[0]||t instanceof o.LatLng?o.latLng(t):o.latLngBounds(t);var e,i,n=this._southWest,s=this._northEast;return t instanceof o.LatLngBounds?(e=t.getSouthWest(),i=t.getNorthEast()):e=i=t,e.lat>=n.lat&&i.lat<=s.lat&&e.lng>=n.lng&&i.lng<=s.lng},intersects:function(t){t=o.latLngBounds(t);var e=this._southWest,i=this._northEast,n=t.getSouthWest(),s=t.getNorthEast(),a=s.lat>=e.lat&&n.lat<=i.lat,r=s.lng>=e.lng&&n.lng<=i.lng;return a&&r},toBBoxString:function(){return[this.getWest(),this.getSouth(),this.getEast(),this.getNorth()].join(",")},equals:function(t){return t?(t=o.latLngBounds(t),this._southWest.equals(t.getSouthWest())&&this._northEast.equals(t.getNorthEast())):!1},isValid:function(){return!(!this._southWest||!this._northEast)}},o.latLngBounds=function(t,e){return!t||t instanceof o.LatLngBounds?t:new o.LatLngBounds(t,e)},o.Projection={},o.Projection.SphericalMercator={MAX_LATITUDE:85.0511287798,project:function(t){var e=o.LatLng.DEG_TO_RAD,i=this.MAX_LATITUDE,n=Math.max(Math.min(i,t.lat),-i),s=t.lng*e,a=n*e;return a=Math.log(Math.tan(Math.PI/4+a/2)),new o.Point(s,a)},unproject:function(t){var e=o.LatLng.RAD_TO_DEG,i=t.x*e,n=(2*Math.atan(Math.exp(t.y))-Math.PI/2)*e;return new o.LatLng(n,i)}},o.Projection.LonLat={project:function(t){return new o.Point(t.lng,t.lat)},unproject:function(t){return new o.LatLng(t.y,t.x)}},o.CRS={latLngToPoint:function(t,e){var i=this.projection.project(t),n=this.scale(e);return this.transformation._transform(i,n)},pointToLatLng:function(t,e){var i=this.scale(e),n=this.transformation.untransform(t,i);return this.projection.unproject(n)},project:function(t){return this.projection.project(t)},scale:function(t){return 256*Math.pow(2,t)},getSize:function(t){var e=this.scale(t);return o.point(e,e)}},o.CRS.Simple=o.extend({},o.CRS,{projection:o.Projection.LonLat,transformation:new o.Transformation(1,0,-1,0),scale:function(t){return Math.pow(2,t)}}),o.CRS.EPSG3857=o.extend({},o.CRS,{code:"EPSG:3857",projection:o.Projection.SphericalMercator,transformation:new o.Transformation(.5/Math.PI,.5,-.5/Math.PI,.5),project:function(t){var e=this.projection.project(t),i=6378137;return e.multiplyBy(i)}}),o.CRS.EPSG900913=o.extend({},o.CRS.EPSG3857,{code:"EPSG:900913"}),o.CRS.EPSG4326=o.extend({},o.CRS,{code:"EPSG:4326",projection:o.Projection.LonLat,transformation:new o.Transformation(1/360,.5,-1/360,.5)}),o.Map=o.Class.extend({includes:o.Mixin.Events,options:{crs:o.CRS.EPSG3857,fadeAnimation:o.DomUtil.TRANSITION&&!o.Browser.android23,trackResize:!0,markerZoomAnimation:o.DomUtil.TRANSITION&&o.Browser.any3d},initialize:function(t,e){e=o.setOptions(this,e),this._initContainer(t),this._initLayout(),this._onResize=o.bind(this._onResize,this),this._initEvents(),e.maxBounds&&this.setMaxBounds(e.maxBounds),e.center&&e.zoom!==i&&this.setView(o.latLng(e.center),e.zoom,{reset:!0}),this._handlers=[],this._layers={},this._zoomBoundLayers={},this._tileLayersNum=0,this.callInitHooks(),this._addLayers(e.layers)},setView:function(t,e){return e=e===i?this.getZoom():e,this._resetView(o.latLng(t),this._limitZoom(e)),this},setZoom:function(t,e){return this._loaded?this.setView(this.getCenter(),t,{zoom:e}):(this._zoom=this._limitZoom(t),this)},zoomIn:function(t,e){return this.setZoom(this._zoom+(t||1),e)},zoomOut:function(t,e){return this.setZoom(this._zoom-(t||1),e)},setZoomAround:function(t,e,i){var n=this.getZoomScale(e),s=this.getSize().divideBy(2),a=t instanceof o.Point?t:this.latLngToContainerPoint(t),r=a.subtract(s).multiplyBy(1-1/n),h=this.containerPointToLatLng(s.add(r));return this.setView(h,e,{zoom:i})},fitBounds:function(t,e){e=e||{},t=t.getBounds?t.getBounds():o.latLngBounds(t);var i=o.point(e.paddingTopLeft||e.padding||[0,0]),n=o.point(e.paddingBottomRight||e.padding||[0,0]),s=this.getBoundsZoom(t,!1,i.add(n)),a=n.subtract(i).divideBy(2),r=this.project(t.getSouthWest(),s),h=this.project(t.getNorthEast(),s),l=this.unproject(r.add(h).divideBy(2).add(a),s);return s=e&&e.maxZoom?Math.min(e.maxZoom,s):s,this.setView(l,s,e)},fitWorld:function(t){return this.fitBounds([[-90,-180],[90,180]],t)},panTo:function(t,e){return this.setView(t,this._zoom,{pan:e})},panBy:function(t){return this.fire("movestart"),this._rawPanBy(o.point(t)),this.fire("move"),this.fire("moveend")},setMaxBounds:function(t){return t=o.latLngBounds(t),this.options.maxBounds=t,t?(this._loaded&&this._panInsideMaxBounds(),this.on("moveend",this._panInsideMaxBounds,this)):this.off("moveend",this._panInsideMaxBounds,this)},panInsideBounds:function(t,e){var i=this.getCenter(),n=this._limitCenter(i,this._zoom,t);return i.equals(n)?this:this.panTo(n,e)},addLayer:function(t){var e=o.stamp(t);return this._layers[e]?this:(this._layers[e]=t,!t.options||isNaN(t.options.maxZoom)&&isNaN(t.options.minZoom)||(this._zoomBoundLayers[e]=t,this._updateZoomLevels()),this.options.zoomAnimation&&o.TileLayer&&t instanceof o.TileLayer&&(this._tileLayersNum++,this._tileLayersToLoad++,t.on("load",this._onTileLayerLoad,this)),this._loaded&&this._layerAdd(t),this)},removeLayer:function(t){var e=o.stamp(t);return this._layers[e]?(this._loaded&&t.onRemove(this),delete this._layers[e],this._loaded&&this.fire("layerremove",{layer:t}),this._zoomBoundLayers[e]&&(delete this._zoomBoundLayers[e],this._updateZoomLevels()),this.options.zoomAnimation&&o.TileLayer&&t instanceof o.TileLayer&&(this._tileLayersNum--,this._tileLayersToLoad--,t.off("load",this._onTileLayerLoad,this)),this):this},hasLayer:function(t){return t?o.stamp(t)in this._layers:!1},eachLayer:function(t,e){for(var i in this._layers)t.call(e,this._layers[i]);return this},invalidateSize:function(t){if(!this._loaded)return this;t=o.extend({animate:!1,pan:!0},t===!0?{animate:!0}:t);var e=this.getSize();this._sizeChanged=!0,this._initialCenter=null;var i=this.getSize(),n=e.divideBy(2).round(),s=i.divideBy(2).round(),a=n.subtract(s);return a.x||a.y?(t.animate&&t.pan?this.panBy(a):(t.pan&&this._rawPanBy(a),this.fire("move"),t.debounceMoveend?(clearTimeout(this._sizeTimer),this._sizeTimer=setTimeout(o.bind(this.fire,this,"moveend"),200)):this.fire("moveend")),this.fire("resize",{oldSize:e,newSize:i})):this},addHandler:function(t,e){if(!e)return this;var i=this[t]=new e(this);return this._handlers.push(i),this.options[t]&&i.enable(),this},remove:function(){this._loaded&&this.fire("unload"),this._initEvents("off");try{delete this._container._leaflet}catch(t){this._container._leaflet=i}return this._clearPanes(),this._clearControlPos&&this._clearControlPos(),this._clearHandlers(),this},getCenter:function(){return this._checkIfLoaded(),this._initialCenter&&!this._moved()?this._initialCenter:this.layerPointToLatLng(this._getCenterLayerPoint())},getZoom:function(){return this._zoom},getBounds:function(){var t=this.getPixelBounds(),e=this.unproject(t.getBottomLeft()),i=this.unproject(t.getTopRight());return new o.LatLngBounds(e,i)},getMinZoom:function(){return this.options.minZoom===i?this._layersMinZoom===i?0:this._layersMinZoom:this.options.minZoom},getMaxZoom:function(){return this.options.maxZoom===i?this._layersMaxZoom===i?1/0:this._layersMaxZoom:this.options.maxZoom},getBoundsZoom:function(t,e,i){t=o.latLngBounds(t);var n,s=this.getMinZoom()-(e?1:0),a=this.getMaxZoom(),r=this.getSize(),h=t.getNorthWest(),l=t.getSouthEast(),u=!0;i=o.point(i||[0,0]);do s++,n=this.project(l,s).subtract(this.project(h,s)).add(i),u=e?n.x<r.x||n.y<r.y:r.contains(n);while(u&&a>=s);return u&&e?null:e?s:s-1},getSize:function(){return(!this._size||this._sizeChanged)&&(this._size=new o.Point(this._container.clientWidth,this._container.clientHeight),this._sizeChanged=!1),this._size.clone()},getPixelBounds:function(){var t=this._getTopLeftPoint();return new o.Bounds(t,t.add(this.getSize()))},getPixelOrigin:function(){return this._checkIfLoaded(),this._initialTopLeftPoint},getPanes:function(){return this._panes},getContainer:function(){return this._container},getZoomScale:function(t){var e=this.options.crs;return e.scale(t)/e.scale(this._zoom)},getScaleZoom:function(t){return this._zoom+Math.log(t)/Math.LN2},project:function(t,e){return e=e===i?this._zoom:e,this.options.crs.latLngToPoint(o.latLng(t),e)},unproject:function(t,e){return e=e===i?this._zoom:e,this.options.crs.pointToLatLng(o.point(t),e)},layerPointToLatLng:function(t){var e=o.point(t).add(this.getPixelOrigin());return this.unproject(e)},latLngToLayerPoint:function(t){var e=this.project(o.latLng(t))._round();return e._subtract(this.getPixelOrigin())},containerPointToLayerPoint:function(t){return o.point(t).subtract(this._getMapPanePos())},layerPointToContainerPoint:function(t){return o.point(t).add(this._getMapPanePos())},containerPointToLatLng:function(t){var e=this.containerPointToLayerPoint(o.point(t));return this.layerPointToLatLng(e)},latLngToContainerPoint:function(t){return this.layerPointToContainerPoint(this.latLngToLayerPoint(o.latLng(t)))},mouseEventToContainerPoint:function(t){return o.DomEvent.getMousePosition(t,this._container)},mouseEventToLayerPoint:function(t){return this.containerPointToLayerPoint(this.mouseEventToContainerPoint(t))},mouseEventToLatLng:function(t){return this.layerPointToLatLng(this.mouseEventToLayerPoint(t))},_initContainer:function(t){var e=this._container=o.DomUtil.get(t);if(!e)throw new Error("Map container not found.");if(e._leaflet)throw new Error("Map container is already initialized.");e._leaflet=!0},_initLayout:function(){var t=this._container;o.DomUtil.addClass(t,"leaflet-container"+(o.Browser.touch?" leaflet-touch":"")+(o.Browser.retina?" leaflet-retina":"")+(o.Browser.ielt9?" leaflet-oldie":"")+(this.options.fadeAnimation?" leaflet-fade-anim":""));var e=o.DomUtil.getStyle(t,"position");"absolute"!==e&&"relative"!==e&&"fixed"!==e&&(t.style.position="relative"),this._initPanes(),this._initControlPos&&this._initControlPos()},_initPanes:function(){var t=this._panes={};this._mapPane=t.mapPane=this._createPane("leaflet-map-pane",this._container),this._tilePane=t.tilePane=this._createPane("leaflet-tile-pane",this._mapPane),t.objectsPane=this._createPane("leaflet-objects-pane",this._mapPane),t.shadowPane=this._createPane("leaflet-shadow-pane"),t.overlayPane=this._createPane("leaflet-overlay-pane"),t.markerPane=this._createPane("leaflet-marker-pane"),t.popupPane=this._createPane("leaflet-popup-pane");var e=" leaflet-zoom-hide";this.options.markerZoomAnimation||(o.DomUtil.addClass(t.markerPane,e),o.DomUtil.addClass(t.shadowPane,e),o.DomUtil.addClass(t.popupPane,e))},_createPane:function(t,e){return o.DomUtil.create("div",t,e||this._panes.objectsPane)},_clearPanes:function(){this._container.removeChild(this._mapPane)},_addLayers:function(t){t=t?o.Util.isArray(t)?t:[t]:[];for(var e=0,i=t.length;i>e;e++)this.addLayer(t[e])},_resetView:function(t,e,i,n){var s=this._zoom!==e;n||(this.fire("movestart"),s&&this.fire("zoomstart")),this._zoom=e,this._initialCenter=t,this._initialTopLeftPoint=this._getNewTopLeftPoint(t),i?this._initialTopLeftPoint._add(this._getMapPanePos()):o.DomUtil.setPosition(this._mapPane,new o.Point(0,0)),this._tileLayersToLoad=this._tileLayersNum;var a=!this._loaded;this._loaded=!0,this.fire("viewreset",{hard:!i}),a&&(this.fire("load"),this.eachLayer(this._layerAdd,this)),this.fire("move"),(s||n)&&this.fire("zoomend"),this.fire("moveend",{hard:!i})},_rawPanBy:function(t){o.DomUtil.setPosition(this._mapPane,this._getMapPanePos().subtract(t))},_getZoomSpan:function(){return this.getMaxZoom()-this.getMinZoom()},_updateZoomLevels:function(){var t,e=1/0,n=-1/0,o=this._getZoomSpan();for(t in this._zoomBoundLayers){var s=this._zoomBoundLayers[t];isNaN(s.options.minZoom)||(e=Math.min(e,s.options.minZoom)),isNaN(s.options.maxZoom)||(n=Math.max(n,s.options.maxZoom))}t===i?this._layersMaxZoom=this._layersMinZoom=i:(this._layersMaxZoom=n,this._layersMinZoom=e),o!==this._getZoomSpan()&&this.fire("zoomlevelschange")},_panInsideMaxBounds:function(){this.panInsideBounds(this.options.maxBounds)},_checkIfLoaded:function(){if(!this._loaded)throw new Error("Set map center and zoom first.")},_initEvents:function(e){if(o.DomEvent){e=e||"on",o.DomEvent[e](this._container,"click",this._onMouseClick,this);var i,n,s=["dblclick","mousedown","mouseup","mouseenter","mouseleave","mousemove","contextmenu"];for(i=0,n=s.length;n>i;i++)o.DomEvent[e](this._container,s[i],this._fireMouseEvent,this);this.options.trackResize&&o.DomEvent[e](t,"resize",this._onResize,this)}},_onResize:function(){o.Util.cancelAnimFrame(this._resizeRequest),this._resizeRequest=o.Util.requestAnimFrame(function(){this.invalidateSize({debounceMoveend:!0})},this,!1,this._container)},_onMouseClick:function(t){!this._loaded||!t._simulated&&(this.dragging&&this.dragging.moved()||this.boxZoom&&this.boxZoom.moved())||o.DomEvent._skipped(t)||(this.fire("preclick"),this._fireMouseEvent(t))},_fireMouseEvent:function(t){if(this._loaded&&!o.DomEvent._skipped(t)){var e=t.type;if(e="mouseenter"===e?"mouseover":"mouseleave"===e?"mouseout":e,this.hasEventListeners(e)){"contextmenu"===e&&o.DomEvent.preventDefault(t);var i=this.mouseEventToContainerPoint(t),n=this.containerPointToLayerPoint(i),s=this.layerPointToLatLng(n);this.fire(e,{latlng:s,layerPoint:n,containerPoint:i,originalEvent:t})}}},_onTileLayerLoad:function(){this._tileLayersToLoad--,this._tileLayersNum&&!this._tileLayersToLoad&&this.fire("tilelayersload")},_clearHandlers:function(){for(var t=0,e=this._handlers.length;e>t;t++)this._handlers[t].disable()},whenReady:function(t,e){return this._loaded?t.call(e||this,this):this.on("load",t,e),this},_layerAdd:function(t){t.onAdd(this),this.fire("layeradd",{layer:t})},_getMapPanePos:function(){return o.DomUtil.getPosition(this._mapPane)},_moved:function(){var t=this._getMapPanePos();return t&&!t.equals([0,0])},_getTopLeftPoint:function(){return this.getPixelOrigin().subtract(this._getMapPanePos())},_getNewTopLeftPoint:function(t,e){var i=this.getSize()._divideBy(2);return this.project(t,e)._subtract(i)._round()},_latLngToNewLayerPoint:function(t,e,i){var n=this._getNewTopLeftPoint(i,e).add(this._getMapPanePos());return this.project(t,e)._subtract(n)},_getCenterLayerPoint:function(){return this.containerPointToLayerPoint(this.getSize()._divideBy(2))},_getCenterOffset:function(t){return this.latLngToLayerPoint(t).subtract(this._getCenterLayerPoint())},_limitCenter:function(t,e,i){if(!i)return t;var n=this.project(t,e),s=this.getSize().divideBy(2),a=new o.Bounds(n.subtract(s),n.add(s)),r=this._getBoundsOffset(a,i,e);return this.unproject(n.add(r),e)},_limitOffset:function(t,e){if(!e)return t;var i=this.getPixelBounds(),n=new o.Bounds(i.min.add(t),i.max.add(t));return t.add(this._getBoundsOffset(n,e))},_getBoundsOffset:function(t,e,i){var n=this.project(e.getNorthWest(),i).subtract(t.min),s=this.project(e.getSouthEast(),i).subtract(t.max),a=this._rebound(n.x,-s.x),r=this._rebound(n.y,-s.y);return new o.Point(a,r)},_rebound:function(t,e){return t+e>0?Math.round(t-e)/2:Math.max(0,Math.ceil(t))-Math.max(0,Math.floor(e))},_limitZoom:function(t){var e=this.getMinZoom(),i=this.getMaxZoom();return Math.max(e,Math.min(i,t))}}),o.map=function(t,e){return new o.Map(t,e)},o.Projection.Mercator={MAX_LATITUDE:85.0840591556,R_MINOR:6356752.314245179,R_MAJOR:6378137,project:function(t){var e=o.LatLng.DEG_TO_RAD,i=this.MAX_LATITUDE,n=Math.max(Math.min(i,t.lat),-i),s=this.R_MAJOR,a=this.R_MINOR,r=t.lng*e*s,h=n*e,l=a/s,u=Math.sqrt(1-l*l),c=u*Math.sin(h);c=Math.pow((1-c)/(1+c),.5*u);var d=Math.tan(.5*(.5*Math.PI-h))/c;return h=-s*Math.log(d),new o.Point(r,h)},unproject:function(t){for(var e,i=o.LatLng.RAD_TO_DEG,n=this.R_MAJOR,s=this.R_MINOR,a=t.x*i/n,r=s/n,h=Math.sqrt(1-r*r),l=Math.exp(-t.y/n),u=Math.PI/2-2*Math.atan(l),c=15,d=1e-7,p=c,_=.1;Math.abs(_)>d&&--p>0;)e=h*Math.sin(u),_=Math.PI/2-2*Math.atan(l*Math.pow((1-e)/(1+e),.5*h))-u,u+=_;
return new o.LatLng(u*i,a)}},o.CRS.EPSG3395=o.extend({},o.CRS,{code:"EPSG:3395",projection:o.Projection.Mercator,transformation:function(){var t=o.Projection.Mercator,e=t.R_MAJOR,i=.5/(Math.PI*e);return new o.Transformation(i,.5,-i,.5)}()}),o.TileLayer=o.Class.extend({includes:o.Mixin.Events,options:{minZoom:0,maxZoom:18,tileSize:256,subdomains:"abc",errorTileUrl:"",attribution:"",zoomOffset:0,opacity:1,unloadInvisibleTiles:o.Browser.mobile,updateWhenIdle:o.Browser.mobile},initialize:function(t,e){e=o.setOptions(this,e),e.detectRetina&&o.Browser.retina&&e.maxZoom>0&&(e.tileSize=Math.floor(e.tileSize/2),e.zoomOffset++,e.minZoom>0&&e.minZoom--,this.options.maxZoom--),e.bounds&&(e.bounds=o.latLngBounds(e.bounds)),this._url=t;var i=this.options.subdomains;"string"==typeof i&&(this.options.subdomains=i.split(""))},onAdd:function(t){this._map=t,this._animated=t._zoomAnimated,this._initContainer(),t.on({viewreset:this._reset,moveend:this._update},this),this._animated&&t.on({zoomanim:this._animateZoom,zoomend:this._endZoomAnim},this),this.options.updateWhenIdle||(this._limitedUpdate=o.Util.limitExecByInterval(this._update,150,this),t.on("move",this._limitedUpdate,this)),this._reset(),this._update()},addTo:function(t){return t.addLayer(this),this},onRemove:function(t){this._container.parentNode.removeChild(this._container),t.off({viewreset:this._reset,moveend:this._update},this),this._animated&&t.off({zoomanim:this._animateZoom,zoomend:this._endZoomAnim},this),this.options.updateWhenIdle||t.off("move",this._limitedUpdate,this),this._container=null,this._map=null},bringToFront:function(){var t=this._map._panes.tilePane;return this._container&&(t.appendChild(this._container),this._setAutoZIndex(t,Math.max)),this},bringToBack:function(){var t=this._map._panes.tilePane;return this._container&&(t.insertBefore(this._container,t.firstChild),this._setAutoZIndex(t,Math.min)),this},getAttribution:function(){return this.options.attribution},getContainer:function(){return this._container},setOpacity:function(t){return this.options.opacity=t,this._map&&this._updateOpacity(),this},setZIndex:function(t){return this.options.zIndex=t,this._updateZIndex(),this},setUrl:function(t,e){return this._url=t,e||this.redraw(),this},redraw:function(){return this._map&&(this._reset({hard:!0}),this._update()),this},_updateZIndex:function(){this._container&&this.options.zIndex!==i&&(this._container.style.zIndex=this.options.zIndex)},_setAutoZIndex:function(t,e){var i,n,o,s=t.children,a=-e(1/0,-1/0);for(n=0,o=s.length;o>n;n++)s[n]!==this._container&&(i=parseInt(s[n].style.zIndex,10),isNaN(i)||(a=e(a,i)));this.options.zIndex=this._container.style.zIndex=(isFinite(a)?a:0)+e(1,-1)},_updateOpacity:function(){var t,e=this._tiles;if(o.Browser.ielt9)for(t in e)o.DomUtil.setOpacity(e[t],this.options.opacity);else o.DomUtil.setOpacity(this._container,this.options.opacity)},_initContainer:function(){var t=this._map._panes.tilePane;if(!this._container){if(this._container=o.DomUtil.create("div","leaflet-layer"),this._updateZIndex(),this._animated){var e="leaflet-tile-container";this._bgBuffer=o.DomUtil.create("div",e,this._container),this._tileContainer=o.DomUtil.create("div",e,this._container)}else this._tileContainer=this._container;t.appendChild(this._container),this.options.opacity<1&&this._updateOpacity()}},_reset:function(t){for(var e in this._tiles)this.fire("tileunload",{tile:this._tiles[e]});this._tiles={},this._tilesToLoad=0,this.options.reuseTiles&&(this._unusedTiles=[]),this._tileContainer.innerHTML="",this._animated&&t&&t.hard&&this._clearBgBuffer(),this._initContainer()},_getTileSize:function(){var t=this._map,e=t.getZoom()+this.options.zoomOffset,i=this.options.maxNativeZoom,n=this.options.tileSize;return i&&e>i&&(n=Math.round(t.getZoomScale(e)/t.getZoomScale(i)*n)),n},_update:function(){if(this._map){var t=this._map,e=t.getPixelBounds(),i=t.getZoom(),n=this._getTileSize();if(!(i>this.options.maxZoom||i<this.options.minZoom)){var s=o.bounds(e.min.divideBy(n)._floor(),e.max.divideBy(n)._floor());this._addTilesFromCenterOut(s),(this.options.unloadInvisibleTiles||this.options.reuseTiles)&&this._removeOtherTiles(s)}}},_addTilesFromCenterOut:function(t){var i,n,s,a=[],r=t.getCenter();for(i=t.min.y;i<=t.max.y;i++)for(n=t.min.x;n<=t.max.x;n++)s=new o.Point(n,i),this._tileShouldBeLoaded(s)&&a.push(s);var h=a.length;if(0!==h){a.sort(function(t,e){return t.distanceTo(r)-e.distanceTo(r)});var l=e.createDocumentFragment();for(this._tilesToLoad||this.fire("loading"),this._tilesToLoad+=h,n=0;h>n;n++)this._addTile(a[n],l);this._tileContainer.appendChild(l)}},_tileShouldBeLoaded:function(t){if(t.x+":"+t.y in this._tiles)return!1;var e=this.options;if(!e.continuousWorld){var i=this._getWrapTileNum();if(e.noWrap&&(t.x<0||t.x>=i.x)||t.y<0||t.y>=i.y)return!1}if(e.bounds){var n=e.tileSize,o=t.multiplyBy(n),s=o.add([n,n]),a=this._map.unproject(o),r=this._map.unproject(s);if(e.continuousWorld||e.noWrap||(a=a.wrap(),r=r.wrap()),!e.bounds.intersects([a,r]))return!1}return!0},_removeOtherTiles:function(t){var e,i,n,o;for(o in this._tiles)e=o.split(":"),i=parseInt(e[0],10),n=parseInt(e[1],10),(i<t.min.x||i>t.max.x||n<t.min.y||n>t.max.y)&&this._removeTile(o)},_removeTile:function(t){var e=this._tiles[t];this.fire("tileunload",{tile:e,url:e.src}),this.options.reuseTiles?(o.DomUtil.removeClass(e,"leaflet-tile-loaded"),this._unusedTiles.push(e)):e.parentNode===this._tileContainer&&this._tileContainer.removeChild(e),o.Browser.android||(e.onload=null,e.src=o.Util.emptyImageUrl),delete this._tiles[t]},_addTile:function(t,e){var i=this._getTilePos(t),n=this._getTile();o.DomUtil.setPosition(n,i,o.Browser.chrome),this._tiles[t.x+":"+t.y]=n,this._loadTile(n,t),n.parentNode!==this._tileContainer&&e.appendChild(n)},_getZoomForUrl:function(){var t=this.options,e=this._map.getZoom();return t.zoomReverse&&(e=t.maxZoom-e),e+=t.zoomOffset,t.maxNativeZoom?Math.min(e,t.maxNativeZoom):e},_getTilePos:function(t){var e=this._map.getPixelOrigin(),i=this._getTileSize();return t.multiplyBy(i).subtract(e)},getTileUrl:function(t){return o.Util.template(this._url,o.extend({s:this._getSubdomain(t),z:t.z,x:t.x,y:t.y},this.options))},_getWrapTileNum:function(){var t=this._map.options.crs,e=t.getSize(this._map.getZoom());return e.divideBy(this._getTileSize())._floor()},_adjustTilePoint:function(t){var e=this._getWrapTileNum();this.options.continuousWorld||this.options.noWrap||(t.x=(t.x%e.x+e.x)%e.x),this.options.tms&&(t.y=e.y-t.y-1),t.z=this._getZoomForUrl()},_getSubdomain:function(t){var e=Math.abs(t.x+t.y)%this.options.subdomains.length;return this.options.subdomains[e]},_getTile:function(){if(this.options.reuseTiles&&this._unusedTiles.length>0){var t=this._unusedTiles.pop();return this._resetTile(t),t}return this._createTile()},_resetTile:function(){},_createTile:function(){var t=o.DomUtil.create("img","leaflet-tile");return t.style.width=t.style.height=this._getTileSize()+"px",t.galleryimg="no",t.onselectstart=t.onmousemove=o.Util.falseFn,o.Browser.ielt9&&this.options.opacity!==i&&o.DomUtil.setOpacity(t,this.options.opacity),o.Browser.mobileWebkit3d&&(t.style.WebkitBackfaceVisibility="hidden"),t},_loadTile:function(t,e){t._layer=this,t.onload=this._tileOnLoad,t.onerror=this._tileOnError,this._adjustTilePoint(e),t.src=this.getTileUrl(e),this.fire("tileloadstart",{tile:t,url:t.src})},_tileLoaded:function(){this._tilesToLoad--,this._animated&&o.DomUtil.addClass(this._tileContainer,"leaflet-zoom-animated"),this._tilesToLoad||(this.fire("load"),this._animated&&(clearTimeout(this._clearBgBufferTimer),this._clearBgBufferTimer=setTimeout(o.bind(this._clearBgBuffer,this),500)))},_tileOnLoad:function(){var t=this._layer;this.src!==o.Util.emptyImageUrl&&(o.DomUtil.addClass(this,"leaflet-tile-loaded"),t.fire("tileload",{tile:this,url:this.src})),t._tileLoaded()},_tileOnError:function(){var t=this._layer;t.fire("tileerror",{tile:this,url:this.src});var e=t.options.errorTileUrl;e&&(this.src=e),t._tileLoaded()}}),o.tileLayer=function(t,e){return new o.TileLayer(t,e)},o.TileLayer.WMS=o.TileLayer.extend({defaultWmsParams:{service:"WMS",request:"GetMap",version:"1.1.1",layers:"",styles:"",format:"image/jpeg",transparent:!1},initialize:function(t,e){this._url=t;var i=o.extend({},this.defaultWmsParams),n=e.tileSize||this.options.tileSize;i.width=i.height=e.detectRetina&&o.Browser.retina?2*n:n;for(var s in e)this.options.hasOwnProperty(s)||"crs"===s||(i[s]=e[s]);this.wmsParams=i,o.setOptions(this,e)},onAdd:function(t){this._crs=this.options.crs||t.options.crs,this._wmsVersion=parseFloat(this.wmsParams.version);var e=this._wmsVersion>=1.3?"crs":"srs";this.wmsParams[e]=this._crs.code,o.TileLayer.prototype.onAdd.call(this,t)},getTileUrl:function(t){var e=this._map,i=this.options.tileSize,n=t.multiplyBy(i),s=n.add([i,i]),a=this._crs.project(e.unproject(n,t.z)),r=this._crs.project(e.unproject(s,t.z)),h=this._wmsVersion>=1.3&&this._crs===o.CRS.EPSG4326?[r.y,a.x,a.y,r.x].join(","):[a.x,r.y,r.x,a.y].join(","),l=o.Util.template(this._url,{s:this._getSubdomain(t)});return l+o.Util.getParamString(this.wmsParams,l,!0)+"&BBOX="+h},setParams:function(t,e){return o.extend(this.wmsParams,t),e||this.redraw(),this}}),o.tileLayer.wms=function(t,e){return new o.TileLayer.WMS(t,e)},o.TileLayer.Canvas=o.TileLayer.extend({options:{async:!1},initialize:function(t){o.setOptions(this,t)},redraw:function(){this._map&&(this._reset({hard:!0}),this._update());for(var t in this._tiles)this._redrawTile(this._tiles[t]);return this},_redrawTile:function(t){this.drawTile(t,t._tilePoint,this._map._zoom)},_createTile:function(){var t=o.DomUtil.create("canvas","leaflet-tile");return t.width=t.height=this.options.tileSize,t.onselectstart=t.onmousemove=o.Util.falseFn,t},_loadTile:function(t,e){t._layer=this,t._tilePoint=e,this._redrawTile(t),this.options.async||this.tileDrawn(t)},drawTile:function(){},tileDrawn:function(t){this._tileOnLoad.call(t)}}),o.tileLayer.canvas=function(t){return new o.TileLayer.Canvas(t)},o.ImageOverlay=o.Class.extend({includes:o.Mixin.Events,options:{opacity:1},initialize:function(t,e,i){this._url=t,this._bounds=o.latLngBounds(e),o.setOptions(this,i)},onAdd:function(t){this._map=t,this._image||this._initImage(),t._panes.overlayPane.appendChild(this._image),t.on("viewreset",this._reset,this),t.options.zoomAnimation&&o.Browser.any3d&&t.on("zoomanim",this._animateZoom,this),this._reset()},onRemove:function(t){t.getPanes().overlayPane.removeChild(this._image),t.off("viewreset",this._reset,this),t.options.zoomAnimation&&t.off("zoomanim",this._animateZoom,this)},addTo:function(t){return t.addLayer(this),this},setOpacity:function(t){return this.options.opacity=t,this._updateOpacity(),this},bringToFront:function(){return this._image&&this._map._panes.overlayPane.appendChild(this._image),this},bringToBack:function(){var t=this._map._panes.overlayPane;return this._image&&t.insertBefore(this._image,t.firstChild),this},setUrl:function(t){this._url=t,this._image.src=this._url},getAttribution:function(){return this.options.attribution},_initImage:function(){this._image=o.DomUtil.create("img","leaflet-image-layer"),this._map.options.zoomAnimation&&o.Browser.any3d?o.DomUtil.addClass(this._image,"leaflet-zoom-animated"):o.DomUtil.addClass(this._image,"leaflet-zoom-hide"),this._updateOpacity(),o.extend(this._image,{galleryimg:"no",onselectstart:o.Util.falseFn,onmousemove:o.Util.falseFn,onload:o.bind(this._onImageLoad,this),src:this._url})},_animateZoom:function(t){var e=this._map,i=this._image,n=e.getZoomScale(t.zoom),s=this._bounds.getNorthWest(),a=this._bounds.getSouthEast(),r=e._latLngToNewLayerPoint(s,t.zoom,t.center),h=e._latLngToNewLayerPoint(a,t.zoom,t.center)._subtract(r),l=r._add(h._multiplyBy(.5*(1-1/n)));i.style[o.DomUtil.TRANSFORM]=o.DomUtil.getTranslateString(l)+" scale("+n+") "},_reset:function(){var t=this._image,e=this._map.latLngToLayerPoint(this._bounds.getNorthWest()),i=this._map.latLngToLayerPoint(this._bounds.getSouthEast())._subtract(e);o.DomUtil.setPosition(t,e),t.style.width=i.x+"px",t.style.height=i.y+"px"},_onImageLoad:function(){this.fire("load")},_updateOpacity:function(){o.DomUtil.setOpacity(this._image,this.options.opacity)}}),o.imageOverlay=function(t,e,i){return new o.ImageOverlay(t,e,i)},o.Icon=o.Class.extend({options:{className:""},initialize:function(t){o.setOptions(this,t)},createIcon:function(t){return this._createIcon("icon",t)},createShadow:function(t){return this._createIcon("shadow",t)},_createIcon:function(t,e){var i=this._getIconUrl(t);if(!i){if("icon"===t)throw new Error("iconUrl not set in Icon options (see the docs).");return null}var n;return n=e&&"IMG"===e.tagName?this._createImg(i,e):this._createImg(i),this._setIconStyles(n,t),n},_setIconStyles:function(t,e){var i,n=this.options,s=o.point(n[e+"Size"]);i=o.point("shadow"===e?n.shadowAnchor||n.iconAnchor:n.iconAnchor),!i&&s&&(i=s.divideBy(2,!0)),t.className="leaflet-marker-"+e+" "+n.className,i&&(t.style.marginLeft=-i.x+"px",t.style.marginTop=-i.y+"px"),s&&(t.style.width=s.x+"px",t.style.height=s.y+"px")},_createImg:function(t,i){return i=i||e.createElement("img"),i.src=t,i},_getIconUrl:function(t){return o.Browser.retina&&this.options[t+"RetinaUrl"]?this.options[t+"RetinaUrl"]:this.options[t+"Url"]}}),o.icon=function(t){return new o.Icon(t)},o.Icon.Default=o.Icon.extend({options:{iconSize:[25,41],iconAnchor:[12,41],popupAnchor:[1,-34],shadowSize:[41,41]},_getIconUrl:function(t){var e=t+"Url";if(this.options[e])return this.options[e];o.Browser.retina&&"icon"===t&&(t+="-2x");var i=o.Icon.Default.imagePath;if(!i)throw new Error("Couldn't autodetect L.Icon.Default.imagePath, set it manually.");return i+"/marker-"+t+".png"}}),o.Icon.Default.imagePath=function(){var t,i,n,o,s,a=e.getElementsByTagName("script"),r=/[\/^]leaflet[\-\._]?([\w\-\._]*)\.js\??/;for(t=0,i=a.length;i>t;t++)if(n=a[t].src,o=n.match(r))return s=n.split(r)[0],(s?s+"/":"")+"images"}(),o.Marker=o.Class.extend({includes:o.Mixin.Events,options:{icon:new o.Icon.Default,title:"",alt:"",clickable:!0,draggable:!1,keyboard:!0,zIndexOffset:0,opacity:1,riseOnHover:!1,riseOffset:250},initialize:function(t,e){o.setOptions(this,e),this._latlng=o.latLng(t)},onAdd:function(t){this._map=t,t.on("viewreset",this.update,this),this._initIcon(),this.update(),this.fire("add"),t.options.zoomAnimation&&t.options.markerZoomAnimation&&t.on("zoomanim",this._animateZoom,this)},addTo:function(t){return t.addLayer(this),this},onRemove:function(t){this.dragging&&this.dragging.disable(),this._removeIcon(),this._removeShadow(),this.fire("remove"),t.off({viewreset:this.update,zoomanim:this._animateZoom},this),this._map=null},getLatLng:function(){return this._latlng},setLatLng:function(t){return this._latlng=o.latLng(t),this.update(),this.fire("move",{latlng:this._latlng})},setZIndexOffset:function(t){return this.options.zIndexOffset=t,this.update(),this},setIcon:function(t){return this.options.icon=t,this._map&&(this._initIcon(),this.update()),this._popup&&this.bindPopup(this._popup),this},update:function(){if(this._icon){var t=this._map.latLngToLayerPoint(this._latlng).round();this._setPos(t)}return this},_initIcon:function(){var t=this.options,e=this._map,i=e.options.zoomAnimation&&e.options.markerZoomAnimation,n=i?"leaflet-zoom-animated":"leaflet-zoom-hide",s=t.icon.createIcon(this._icon),a=!1;s!==this._icon&&(this._icon&&this._removeIcon(),a=!0,t.title&&(s.title=t.title),t.alt&&(s.alt=t.alt)),o.DomUtil.addClass(s,n),t.keyboard&&(s.tabIndex="0"),this._icon=s,this._initInteraction(),t.riseOnHover&&o.DomEvent.on(s,"mouseover",this._bringToFront,this).on(s,"mouseout",this._resetZIndex,this);var r=t.icon.createShadow(this._shadow),h=!1;r!==this._shadow&&(this._removeShadow(),h=!0),r&&o.DomUtil.addClass(r,n),this._shadow=r,t.opacity<1&&this._updateOpacity();var l=this._map._panes;a&&l.markerPane.appendChild(this._icon),r&&h&&l.shadowPane.appendChild(this._shadow)},_removeIcon:function(){this.options.riseOnHover&&o.DomEvent.off(this._icon,"mouseover",this._bringToFront).off(this._icon,"mouseout",this._resetZIndex),this._map._panes.markerPane.removeChild(this._icon),this._icon=null},_removeShadow:function(){this._shadow&&this._map._panes.shadowPane.removeChild(this._shadow),this._shadow=null},_setPos:function(t){o.DomUtil.setPosition(this._icon,t),this._shadow&&o.DomUtil.setPosition(this._shadow,t),this._zIndex=t.y+this.options.zIndexOffset,this._resetZIndex()},_updateZIndex:function(t){this._icon.style.zIndex=this._zIndex+t},_animateZoom:function(t){var e=this._map._latLngToNewLayerPoint(this._latlng,t.zoom,t.center).round();this._setPos(e)},_initInteraction:function(){if(this.options.clickable){var t=this._icon,e=["dblclick","mousedown","mouseover","mouseout","contextmenu"];o.DomUtil.addClass(t,"leaflet-clickable"),o.DomEvent.on(t,"click",this._onMouseClick,this),o.DomEvent.on(t,"keypress",this._onKeyPress,this);for(var i=0;i<e.length;i++)o.DomEvent.on(t,e[i],this._fireMouseEvent,this);o.Handler.MarkerDrag&&(this.dragging=new o.Handler.MarkerDrag(this),this.options.draggable&&this.dragging.enable())}},_onMouseClick:function(t){var e=this.dragging&&this.dragging.moved();(this.hasEventListeners(t.type)||e)&&o.DomEvent.stopPropagation(t),e||(this.dragging&&this.dragging._enabled||!this._map.dragging||!this._map.dragging.moved())&&this.fire(t.type,{originalEvent:t,latlng:this._latlng})},_onKeyPress:function(t){13===t.keyCode&&this.fire("click",{originalEvent:t,latlng:this._latlng})},_fireMouseEvent:function(t){this.fire(t.type,{originalEvent:t,latlng:this._latlng}),"contextmenu"===t.type&&this.hasEventListeners(t.type)&&o.DomEvent.preventDefault(t),"mousedown"!==t.type?o.DomEvent.stopPropagation(t):o.DomEvent.preventDefault(t)},setOpacity:function(t){return this.options.opacity=t,this._map&&this._updateOpacity(),this},_updateOpacity:function(){o.DomUtil.setOpacity(this._icon,this.options.opacity),this._shadow&&o.DomUtil.setOpacity(this._shadow,this.options.opacity)},_bringToFront:function(){this._updateZIndex(this.options.riseOffset)},_resetZIndex:function(){this._updateZIndex(0)}}),o.marker=function(t,e){return new o.Marker(t,e)},o.DivIcon=o.Icon.extend({options:{iconSize:[12,12],className:"leaflet-div-icon",html:!1},createIcon:function(t){var i=t&&"DIV"===t.tagName?t:e.createElement("div"),n=this.options;return i.innerHTML=n.html!==!1?n.html:"",n.bgPos&&(i.style.backgroundPosition=-n.bgPos.x+"px "+-n.bgPos.y+"px"),this._setIconStyles(i,"icon"),i},createShadow:function(){return null}}),o.divIcon=function(t){return new o.DivIcon(t)},o.Map.mergeOptions({closePopupOnClick:!0}),o.Popup=o.Class.extend({includes:o.Mixin.Events,options:{minWidth:50,maxWidth:300,autoPan:!0,closeButton:!0,offset:[0,7],autoPanPadding:[5,5],keepInView:!1,className:"",zoomAnimation:!0},initialize:function(t,e){o.setOptions(this,t),this._source=e,this._animated=o.Browser.any3d&&this.options.zoomAnimation,this._isOpen=!1},onAdd:function(t){this._map=t,this._container||this._initLayout();var e=t.options.fadeAnimation;e&&o.DomUtil.setOpacity(this._container,0),t._panes.popupPane.appendChild(this._container),t.on(this._getEvents(),this),this.update(),e&&o.DomUtil.setOpacity(this._container,1),this.fire("open"),t.fire("popupopen",{popup:this}),this._source&&this._source.fire("popupopen",{popup:this})},addTo:function(t){return t.addLayer(this),this},openOn:function(t){return t.openPopup(this),this},onRemove:function(t){t._panes.popupPane.removeChild(this._container),o.Util.falseFn(this._container.offsetWidth),t.off(this._getEvents(),this),t.options.fadeAnimation&&o.DomUtil.setOpacity(this._container,0),this._map=null,this.fire("close"),t.fire("popupclose",{popup:this}),this._source&&this._source.fire("popupclose",{popup:this})},getLatLng:function(){return this._latlng},setLatLng:function(t){return this._latlng=o.latLng(t),this._map&&(this._updatePosition(),this._adjustPan()),this},getContent:function(){return this._content},setContent:function(t){return this._content=t,this.update(),this},update:function(){this._map&&(this._container.style.visibility="hidden",this._updateContent(),this._updateLayout(),this._updatePosition(),this._container.style.visibility="",this._adjustPan())},_getEvents:function(){var t={viewreset:this._updatePosition};return this._animated&&(t.zoomanim=this._zoomAnimation),("closeOnClick"in this.options?this.options.closeOnClick:this._map.options.closePopupOnClick)&&(t.preclick=this._close),this.options.keepInView&&(t.moveend=this._adjustPan),t},_close:function(){this._map&&this._map.closePopup(this)},_initLayout:function(){var t,e="leaflet-popup",i=e+" "+this.options.className+" leaflet-zoom-"+(this._animated?"animated":"hide"),n=this._container=o.DomUtil.create("div",i);this.options.closeButton&&(t=this._closeButton=o.DomUtil.create("a",e+"-close-button",n),t.href="#close",t.innerHTML="&#215;",o.DomEvent.disableClickPropagation(t),o.DomEvent.on(t,"click",this._onCloseButtonClick,this));var s=this._wrapper=o.DomUtil.create("div",e+"-content-wrapper",n);o.DomEvent.disableClickPropagation(s),this._contentNode=o.DomUtil.create("div",e+"-content",s),o.DomEvent.disableScrollPropagation(this._contentNode),o.DomEvent.on(s,"contextmenu",o.DomEvent.stopPropagation),this._tipContainer=o.DomUtil.create("div",e+"-tip-container",n),this._tip=o.DomUtil.create("div",e+"-tip",this._tipContainer)},_updateContent:function(){if(this._content){if("string"==typeof this._content)this._contentNode.innerHTML=this._content;else{for(;this._contentNode.hasChildNodes();)this._contentNode.removeChild(this._contentNode.firstChild);this._contentNode.appendChild(this._content)}this.fire("contentupdate")}},_updateLayout:function(){var t=this._contentNode,e=t.style;e.width="",e.whiteSpace="nowrap";var i=t.offsetWidth;i=Math.min(i,this.options.maxWidth),i=Math.max(i,this.options.minWidth),e.width=i+1+"px",e.whiteSpace="",e.height="";var n=t.offsetHeight,s=this.options.maxHeight,a="leaflet-popup-scrolled";s&&n>s?(e.height=s+"px",o.DomUtil.addClass(t,a)):o.DomUtil.removeClass(t,a),this._containerWidth=this._container.offsetWidth},_updatePosition:function(){if(this._map){var t=this._map.latLngToLayerPoint(this._latlng),e=this._animated,i=o.point(this.options.offset);e&&o.DomUtil.setPosition(this._container,t),this._containerBottom=-i.y-(e?0:t.y),this._containerLeft=-Math.round(this._containerWidth/2)+i.x+(e?0:t.x),this._container.style.bottom=this._containerBottom+"px",this._container.style.left=this._containerLeft+"px"}},_zoomAnimation:function(t){var e=this._map._latLngToNewLayerPoint(this._latlng,t.zoom,t.center);o.DomUtil.setPosition(this._container,e)},_adjustPan:function(){if(this.options.autoPan){var t=this._map,e=this._container.offsetHeight,i=this._containerWidth,n=new o.Point(this._containerLeft,-e-this._containerBottom);this._animated&&n._add(o.DomUtil.getPosition(this._container));var s=t.layerPointToContainerPoint(n),a=o.point(this.options.autoPanPadding),r=o.point(this.options.autoPanPaddingTopLeft||a),h=o.point(this.options.autoPanPaddingBottomRight||a),l=t.getSize(),u=0,c=0;s.x+i+h.x>l.x&&(u=s.x+i-l.x+h.x),s.x-u-r.x<0&&(u=s.x-r.x),s.y+e+h.y>l.y&&(c=s.y+e-l.y+h.y),s.y-c-r.y<0&&(c=s.y-r.y),(u||c)&&t.fire("autopanstart").panBy([u,c])}},_onCloseButtonClick:function(t){this._close(),o.DomEvent.stop(t)}}),o.popup=function(t,e){return new o.Popup(t,e)},o.Map.include({openPopup:function(t,e,i){if(this.closePopup(),!(t instanceof o.Popup)){var n=t;t=new o.Popup(i).setLatLng(e).setContent(n)}return t._isOpen=!0,this._popup=t,this.addLayer(t)},closePopup:function(t){return t&&t!==this._popup||(t=this._popup,this._popup=null),t&&(this.removeLayer(t),t._isOpen=!1),this}}),o.Marker.include({openPopup:function(){return this._popup&&this._map&&!this._map.hasLayer(this._popup)&&(this._popup.setLatLng(this._latlng),this._map.openPopup(this._popup)),this},closePopup:function(){return this._popup&&this._popup._close(),this},togglePopup:function(){return this._popup&&(this._popup._isOpen?this.closePopup():this.openPopup()),this},bindPopup:function(t,e){var i=o.point(this.options.icon.options.popupAnchor||[0,0]);return i=i.add(o.Popup.prototype.options.offset),e&&e.offset&&(i=i.add(e.offset)),e=o.extend({offset:i},e),this._popupHandlersAdded||(this.on("click",this.togglePopup,this).on("remove",this.closePopup,this).on("move",this._movePopup,this),this._popupHandlersAdded=!0),t instanceof o.Popup?(o.setOptions(t,e),this._popup=t):this._popup=new o.Popup(e,this).setContent(t),this},setPopupContent:function(t){return this._popup&&this._popup.setContent(t),this},unbindPopup:function(){return this._popup&&(this._popup=null,this.off("click",this.togglePopup,this).off("remove",this.closePopup,this).off("move",this._movePopup,this),this._popupHandlersAdded=!1),this},getPopup:function(){return this._popup},_movePopup:function(t){this._popup.setLatLng(t.latlng)}}),o.LayerGroup=o.Class.extend({initialize:function(t){this._layers={};var e,i;if(t)for(e=0,i=t.length;i>e;e++)this.addLayer(t[e])},addLayer:function(t){var e=this.getLayerId(t);return this._layers[e]=t,this._map&&this._map.addLayer(t),this},removeLayer:function(t){var e=t in this._layers?t:this.getLayerId(t);return this._map&&this._layers[e]&&this._map.removeLayer(this._layers[e]),delete this._layers[e],this},hasLayer:function(t){return t?t in this._layers||this.getLayerId(t)in this._layers:!1},clearLayers:function(){return this.eachLayer(this.removeLayer,this),this},invoke:function(t){var e,i,n=Array.prototype.slice.call(arguments,1);for(e in this._layers)i=this._layers[e],i[t]&&i[t].apply(i,n);return this},onAdd:function(t){this._map=t,this.eachLayer(t.addLayer,t)},onRemove:function(t){this.eachLayer(t.removeLayer,t),this._map=null},addTo:function(t){return t.addLayer(this),this},eachLayer:function(t,e){for(var i in this._layers)t.call(e,this._layers[i]);return this},getLayer:function(t){return this._layers[t]},getLayers:function(){var t=[];for(var e in this._layers)t.push(this._layers[e]);return t},setZIndex:function(t){return this.invoke("setZIndex",t)},getLayerId:function(t){return o.stamp(t)}}),o.layerGroup=function(t){return new o.LayerGroup(t)},o.FeatureGroup=o.LayerGroup.extend({includes:o.Mixin.Events,statics:{EVENTS:"click dblclick mouseover mouseout mousemove contextmenu popupopen popupclose"},addLayer:function(t){return this.hasLayer(t)?this:("on"in t&&t.on(o.FeatureGroup.EVENTS,this._propagateEvent,this),o.LayerGroup.prototype.addLayer.call(this,t),this._popupContent&&t.bindPopup&&t.bindPopup(this._popupContent,this._popupOptions),this.fire("layeradd",{layer:t}))},removeLayer:function(t){return this.hasLayer(t)?(t in this._layers&&(t=this._layers[t]),t.off(o.FeatureGroup.EVENTS,this._propagateEvent,this),o.LayerGroup.prototype.removeLayer.call(this,t),this._popupContent&&this.invoke("unbindPopup"),this.fire("layerremove",{layer:t})):this},bindPopup:function(t,e){return this._popupContent=t,this._popupOptions=e,this.invoke("bindPopup",t,e)},openPopup:function(t){for(var e in this._layers){this._layers[e].openPopup(t);break}return this},setStyle:function(t){return this.invoke("setStyle",t)},bringToFront:function(){return this.invoke("bringToFront")},bringToBack:function(){return this.invoke("bringToBack")},getBounds:function(){var t=new o.LatLngBounds;return this.eachLayer(function(e){t.extend(e instanceof o.Marker?e.getLatLng():e.getBounds())}),t},_propagateEvent:function(t){t=o.extend({layer:t.target,target:this},t),this.fire(t.type,t)}}),o.featureGroup=function(t){return new o.FeatureGroup(t)},o.Path=o.Class.extend({includes:[o.Mixin.Events],statics:{CLIP_PADDING:function(){var e=o.Browser.mobile?1280:2e3,i=(e/Math.max(t.outerWidth,t.outerHeight)-1)/2;return Math.max(0,Math.min(.5,i))}()},options:{stroke:!0,color:"#0033ff",dashArray:null,lineCap:null,lineJoin:null,weight:5,opacity:.5,fill:!1,fillColor:null,fillOpacity:.2,clickable:!0},initialize:function(t){o.setOptions(this,t)},onAdd:function(t){this._map=t,this._container||(this._initElements(),this._initEvents()),this.projectLatlngs(),this._updatePath(),this._container&&this._map._pathRoot.appendChild(this._container),this.fire("add"),t.on({viewreset:this.projectLatlngs,moveend:this._updatePath},this)},addTo:function(t){return t.addLayer(this),this},onRemove:function(t){t._pathRoot.removeChild(this._container),this.fire("remove"),this._map=null,o.Browser.vml&&(this._container=null,this._stroke=null,this._fill=null),t.off({viewreset:this.projectLatlngs,moveend:this._updatePath},this)},projectLatlngs:function(){},setStyle:function(t){return o.setOptions(this,t),this._container&&this._updateStyle(),this},redraw:function(){return this._map&&(this.projectLatlngs(),this._updatePath()),this}}),o.Map.include({_updatePathViewport:function(){var t=o.Path.CLIP_PADDING,e=this.getSize(),i=o.DomUtil.getPosition(this._mapPane),n=i.multiplyBy(-1)._subtract(e.multiplyBy(t)._round()),s=n.add(e.multiplyBy(1+2*t)._round());this._pathViewport=new o.Bounds(n,s)}}),o.Path.SVG_NS="http://www.w3.org/2000/svg",o.Browser.svg=!(!e.createElementNS||!e.createElementNS(o.Path.SVG_NS,"svg").createSVGRect),o.Path=o.Path.extend({statics:{SVG:o.Browser.svg},bringToFront:function(){var t=this._map._pathRoot,e=this._container;return e&&t.lastChild!==e&&t.appendChild(e),this},bringToBack:function(){var t=this._map._pathRoot,e=this._container,i=t.firstChild;return e&&i!==e&&t.insertBefore(e,i),this},getPathString:function(){},_createElement:function(t){return e.createElementNS(o.Path.SVG_NS,t)},_initElements:function(){this._map._initPathRoot(),this._initPath(),this._initStyle()},_initPath:function(){this._container=this._createElement("g"),this._path=this._createElement("path"),this.options.className&&o.DomUtil.addClass(this._path,this.options.className),this._container.appendChild(this._path)},_initStyle:function(){this.options.stroke&&(this._path.setAttribute("stroke-linejoin","round"),this._path.setAttribute("stroke-linecap","round")),this.options.fill&&this._path.setAttribute("fill-rule","evenodd"),this.options.pointerEvents&&this._path.setAttribute("pointer-events",this.options.pointerEvents),this.options.clickable||this.options.pointerEvents||this._path.setAttribute("pointer-events","none"),this._updateStyle()},_updateStyle:function(){this.options.stroke?(this._path.setAttribute("stroke",this.options.color),this._path.setAttribute("stroke-opacity",this.options.opacity),this._path.setAttribute("stroke-width",this.options.weight),this.options.dashArray?this._path.setAttribute("stroke-dasharray",this.options.dashArray):this._path.removeAttribute("stroke-dasharray"),this.options.lineCap&&this._path.setAttribute("stroke-linecap",this.options.lineCap),this.options.lineJoin&&this._path.setAttribute("stroke-linejoin",this.options.lineJoin)):this._path.setAttribute("stroke","none"),this.options.fill?(this._path.setAttribute("fill",this.options.fillColor||this.options.color),this._path.setAttribute("fill-opacity",this.options.fillOpacity)):this._path.setAttribute("fill","none")},_updatePath:function(){var t=this.getPathString();t||(t="M0 0"),this._path.setAttribute("d",t)},_initEvents:function(){if(this.options.clickable){(o.Browser.svg||!o.Browser.vml)&&o.DomUtil.addClass(this._path,"leaflet-clickable"),o.DomEvent.on(this._container,"click",this._onMouseClick,this);for(var t=["dblclick","mousedown","mouseover","mouseout","mousemove","contextmenu"],e=0;e<t.length;e++)o.DomEvent.on(this._container,t[e],this._fireMouseEvent,this)}},_onMouseClick:function(t){this._map.dragging&&this._map.dragging.moved()||this._fireMouseEvent(t)},_fireMouseEvent:function(t){if(this.hasEventListeners(t.type)){var e=this._map,i=e.mouseEventToContainerPoint(t),n=e.containerPointToLayerPoint(i),s=e.layerPointToLatLng(n);this.fire(t.type,{latlng:s,layerPoint:n,containerPoint:i,originalEvent:t}),"contextmenu"===t.type&&o.DomEvent.preventDefault(t),"mousemove"!==t.type&&o.DomEvent.stopPropagation(t)}}}),o.Map.include({_initPathRoot:function(){this._pathRoot||(this._pathRoot=o.Path.prototype._createElement("svg"),this._panes.overlayPane.appendChild(this._pathRoot),this.options.zoomAnimation&&o.Browser.any3d?(o.DomUtil.addClass(this._pathRoot,"leaflet-zoom-animated"),this.on({zoomanim:this._animatePathZoom,zoomend:this._endPathZoom})):o.DomUtil.addClass(this._pathRoot,"leaflet-zoom-hide"),this.on("moveend",this._updateSvgViewport),this._updateSvgViewport())
},_animatePathZoom:function(t){var e=this.getZoomScale(t.zoom),i=this._getCenterOffset(t.center)._multiplyBy(-e)._add(this._pathViewport.min);this._pathRoot.style[o.DomUtil.TRANSFORM]=o.DomUtil.getTranslateString(i)+" scale("+e+") ",this._pathZooming=!0},_endPathZoom:function(){this._pathZooming=!1},_updateSvgViewport:function(){if(!this._pathZooming){this._updatePathViewport();var t=this._pathViewport,e=t.min,i=t.max,n=i.x-e.x,s=i.y-e.y,a=this._pathRoot,r=this._panes.overlayPane;o.Browser.mobileWebkit&&r.removeChild(a),o.DomUtil.setPosition(a,e),a.setAttribute("width",n),a.setAttribute("height",s),a.setAttribute("viewBox",[e.x,e.y,n,s].join(" ")),o.Browser.mobileWebkit&&r.appendChild(a)}}}),o.Path.include({bindPopup:function(t,e){return t instanceof o.Popup?this._popup=t:((!this._popup||e)&&(this._popup=new o.Popup(e,this)),this._popup.setContent(t)),this._popupHandlersAdded||(this.on("click",this._openPopup,this).on("remove",this.closePopup,this),this._popupHandlersAdded=!0),this},unbindPopup:function(){return this._popup&&(this._popup=null,this.off("click",this._openPopup).off("remove",this.closePopup),this._popupHandlersAdded=!1),this},openPopup:function(t){return this._popup&&(t=t||this._latlng||this._latlngs[Math.floor(this._latlngs.length/2)],this._openPopup({latlng:t})),this},closePopup:function(){return this._popup&&this._popup._close(),this},_openPopup:function(t){this._popup.setLatLng(t.latlng),this._map.openPopup(this._popup)}}),o.Browser.vml=!o.Browser.svg&&function(){try{var t=e.createElement("div");t.innerHTML='<v:shape adj="1"/>';var i=t.firstChild;return i.style.behavior="url(#default#VML)",i&&"object"==typeof i.adj}catch(n){return!1}}(),o.Path=o.Browser.svg||!o.Browser.vml?o.Path:o.Path.extend({statics:{VML:!0,CLIP_PADDING:.02},_createElement:function(){try{return e.namespaces.add("lvml","urn:schemas-microsoft-com:vml"),function(t){return e.createElement("<lvml:"+t+' class="lvml">')}}catch(t){return function(t){return e.createElement("<"+t+' xmlns="urn:schemas-microsoft.com:vml" class="lvml">')}}}(),_initPath:function(){var t=this._container=this._createElement("shape");o.DomUtil.addClass(t,"leaflet-vml-shape"+(this.options.className?" "+this.options.className:"")),this.options.clickable&&o.DomUtil.addClass(t,"leaflet-clickable"),t.coordsize="1 1",this._path=this._createElement("path"),t.appendChild(this._path),this._map._pathRoot.appendChild(t)},_initStyle:function(){this._updateStyle()},_updateStyle:function(){var t=this._stroke,e=this._fill,i=this.options,n=this._container;n.stroked=i.stroke,n.filled=i.fill,i.stroke?(t||(t=this._stroke=this._createElement("stroke"),t.endcap="round",n.appendChild(t)),t.weight=i.weight+"px",t.color=i.color,t.opacity=i.opacity,t.dashStyle=i.dashArray?o.Util.isArray(i.dashArray)?i.dashArray.join(" "):i.dashArray.replace(/( *, *)/g," "):"",i.lineCap&&(t.endcap=i.lineCap.replace("butt","flat")),i.lineJoin&&(t.joinstyle=i.lineJoin)):t&&(n.removeChild(t),this._stroke=null),i.fill?(e||(e=this._fill=this._createElement("fill"),n.appendChild(e)),e.color=i.fillColor||i.color,e.opacity=i.fillOpacity):e&&(n.removeChild(e),this._fill=null)},_updatePath:function(){var t=this._container.style;t.display="none",this._path.v=this.getPathString()+" ",t.display=""}}),o.Map.include(o.Browser.svg||!o.Browser.vml?{}:{_initPathRoot:function(){if(!this._pathRoot){var t=this._pathRoot=e.createElement("div");t.className="leaflet-vml-container",this._panes.overlayPane.appendChild(t),this.on("moveend",this._updatePathViewport),this._updatePathViewport()}}}),o.Browser.canvas=function(){return!!e.createElement("canvas").getContext}(),o.Path=o.Path.SVG&&!t.L_PREFER_CANVAS||!o.Browser.canvas?o.Path:o.Path.extend({statics:{CANVAS:!0,SVG:!1},redraw:function(){return this._map&&(this.projectLatlngs(),this._requestUpdate()),this},setStyle:function(t){return o.setOptions(this,t),this._map&&(this._updateStyle(),this._requestUpdate()),this},onRemove:function(t){t.off("viewreset",this.projectLatlngs,this).off("moveend",this._updatePath,this),this.options.clickable&&(this._map.off("click",this._onClick,this),this._map.off("mousemove",this._onMouseMove,this)),this._requestUpdate(),this.fire("remove"),this._map=null},_requestUpdate:function(){this._map&&!o.Path._updateRequest&&(o.Path._updateRequest=o.Util.requestAnimFrame(this._fireMapMoveEnd,this._map))},_fireMapMoveEnd:function(){o.Path._updateRequest=null,this.fire("moveend")},_initElements:function(){this._map._initPathRoot(),this._ctx=this._map._canvasCtx},_updateStyle:function(){var t=this.options;t.stroke&&(this._ctx.lineWidth=t.weight,this._ctx.strokeStyle=t.color),t.fill&&(this._ctx.fillStyle=t.fillColor||t.color)},_drawPath:function(){var t,e,i,n,s,a;for(this._ctx.beginPath(),t=0,i=this._parts.length;i>t;t++){for(e=0,n=this._parts[t].length;n>e;e++)s=this._parts[t][e],a=(0===e?"move":"line")+"To",this._ctx[a](s.x,s.y);this instanceof o.Polygon&&this._ctx.closePath()}},_checkIfEmpty:function(){return!this._parts.length},_updatePath:function(){if(!this._checkIfEmpty()){var t=this._ctx,e=this.options;this._drawPath(),t.save(),this._updateStyle(),e.fill&&(t.globalAlpha=e.fillOpacity,t.fill()),e.stroke&&(t.globalAlpha=e.opacity,t.stroke()),t.restore()}},_initEvents:function(){this.options.clickable&&(this._map.on("mousemove",this._onMouseMove,this),this._map.on("click",this._onClick,this))},_onClick:function(t){this._containsPoint(t.layerPoint)&&this.fire("click",t)},_onMouseMove:function(t){this._map&&!this._map._animatingZoom&&(this._containsPoint(t.layerPoint)?(this._ctx.canvas.style.cursor="pointer",this._mouseInside=!0,this.fire("mouseover",t)):this._mouseInside&&(this._ctx.canvas.style.cursor="",this._mouseInside=!1,this.fire("mouseout",t)))}}),o.Map.include(o.Path.SVG&&!t.L_PREFER_CANVAS||!o.Browser.canvas?{}:{_initPathRoot:function(){var t,i=this._pathRoot;i||(i=this._pathRoot=e.createElement("canvas"),i.style.position="absolute",t=this._canvasCtx=i.getContext("2d"),t.lineCap="round",t.lineJoin="round",this._panes.overlayPane.appendChild(i),this.options.zoomAnimation&&(this._pathRoot.className="leaflet-zoom-animated",this.on("zoomanim",this._animatePathZoom),this.on("zoomend",this._endPathZoom)),this.on("moveend",this._updateCanvasViewport),this._updateCanvasViewport())},_updateCanvasViewport:function(){if(!this._pathZooming){this._updatePathViewport();var t=this._pathViewport,e=t.min,i=t.max.subtract(e),n=this._pathRoot;o.DomUtil.setPosition(n,e),n.width=i.x,n.height=i.y,n.getContext("2d").translate(-e.x,-e.y)}}}),o.LineUtil={simplify:function(t,e){if(!e||!t.length)return t.slice();var i=e*e;return t=this._reducePoints(t,i),t=this._simplifyDP(t,i)},pointToSegmentDistance:function(t,e,i){return Math.sqrt(this._sqClosestPointOnSegment(t,e,i,!0))},closestPointOnSegment:function(t,e,i){return this._sqClosestPointOnSegment(t,e,i)},_simplifyDP:function(t,e){var n=t.length,o=typeof Uint8Array!=i+""?Uint8Array:Array,s=new o(n);s[0]=s[n-1]=1,this._simplifyDPStep(t,s,e,0,n-1);var a,r=[];for(a=0;n>a;a++)s[a]&&r.push(t[a]);return r},_simplifyDPStep:function(t,e,i,n,o){var s,a,r,h=0;for(a=n+1;o-1>=a;a++)r=this._sqClosestPointOnSegment(t[a],t[n],t[o],!0),r>h&&(s=a,h=r);h>i&&(e[s]=1,this._simplifyDPStep(t,e,i,n,s),this._simplifyDPStep(t,e,i,s,o))},_reducePoints:function(t,e){for(var i=[t[0]],n=1,o=0,s=t.length;s>n;n++)this._sqDist(t[n],t[o])>e&&(i.push(t[n]),o=n);return s-1>o&&i.push(t[s-1]),i},clipSegment:function(t,e,i,n){var o,s,a,r=n?this._lastCode:this._getBitCode(t,i),h=this._getBitCode(e,i);for(this._lastCode=h;;){if(!(r|h))return[t,e];if(r&h)return!1;o=r||h,s=this._getEdgeIntersection(t,e,o,i),a=this._getBitCode(s,i),o===r?(t=s,r=a):(e=s,h=a)}},_getEdgeIntersection:function(t,e,i,n){var s=e.x-t.x,a=e.y-t.y,r=n.min,h=n.max;return 8&i?new o.Point(t.x+s*(h.y-t.y)/a,h.y):4&i?new o.Point(t.x+s*(r.y-t.y)/a,r.y):2&i?new o.Point(h.x,t.y+a*(h.x-t.x)/s):1&i?new o.Point(r.x,t.y+a*(r.x-t.x)/s):void 0},_getBitCode:function(t,e){var i=0;return t.x<e.min.x?i|=1:t.x>e.max.x&&(i|=2),t.y<e.min.y?i|=4:t.y>e.max.y&&(i|=8),i},_sqDist:function(t,e){var i=e.x-t.x,n=e.y-t.y;return i*i+n*n},_sqClosestPointOnSegment:function(t,e,i,n){var s,a=e.x,r=e.y,h=i.x-a,l=i.y-r,u=h*h+l*l;return u>0&&(s=((t.x-a)*h+(t.y-r)*l)/u,s>1?(a=i.x,r=i.y):s>0&&(a+=h*s,r+=l*s)),h=t.x-a,l=t.y-r,n?h*h+l*l:new o.Point(a,r)}},o.Polyline=o.Path.extend({initialize:function(t,e){o.Path.prototype.initialize.call(this,e),this._latlngs=this._convertLatLngs(t)},options:{smoothFactor:1,noClip:!1},projectLatlngs:function(){this._originalPoints=[];for(var t=0,e=this._latlngs.length;e>t;t++)this._originalPoints[t]=this._map.latLngToLayerPoint(this._latlngs[t])},getPathString:function(){for(var t=0,e=this._parts.length,i="";e>t;t++)i+=this._getPathPartStr(this._parts[t]);return i},getLatLngs:function(){return this._latlngs},setLatLngs:function(t){return this._latlngs=this._convertLatLngs(t),this.redraw()},addLatLng:function(t){return this._latlngs.push(o.latLng(t)),this.redraw()},spliceLatLngs:function(){var t=[].splice.apply(this._latlngs,arguments);return this._convertLatLngs(this._latlngs,!0),this.redraw(),t},closestLayerPoint:function(t){for(var e,i,n=1/0,s=this._parts,a=null,r=0,h=s.length;h>r;r++)for(var l=s[r],u=1,c=l.length;c>u;u++){e=l[u-1],i=l[u];var d=o.LineUtil._sqClosestPointOnSegment(t,e,i,!0);n>d&&(n=d,a=o.LineUtil._sqClosestPointOnSegment(t,e,i))}return a&&(a.distance=Math.sqrt(n)),a},getBounds:function(){return new o.LatLngBounds(this.getLatLngs())},_convertLatLngs:function(t,e){var i,n,s=e?t:[];for(i=0,n=t.length;n>i;i++){if(o.Util.isArray(t[i])&&"number"!=typeof t[i][0])return;s[i]=o.latLng(t[i])}return s},_initEvents:function(){o.Path.prototype._initEvents.call(this)},_getPathPartStr:function(t){for(var e,i=o.Path.VML,n=0,s=t.length,a="";s>n;n++)e=t[n],i&&e._round(),a+=(n?"L":"M")+e.x+" "+e.y;return a},_clipPoints:function(){var t,e,i,n=this._originalPoints,s=n.length;if(this.options.noClip)return void(this._parts=[n]);this._parts=[];var a=this._parts,r=this._map._pathViewport,h=o.LineUtil;for(t=0,e=0;s-1>t;t++)i=h.clipSegment(n[t],n[t+1],r,t),i&&(a[e]=a[e]||[],a[e].push(i[0]),(i[1]!==n[t+1]||t===s-2)&&(a[e].push(i[1]),e++))},_simplifyPoints:function(){for(var t=this._parts,e=o.LineUtil,i=0,n=t.length;n>i;i++)t[i]=e.simplify(t[i],this.options.smoothFactor)},_updatePath:function(){this._map&&(this._clipPoints(),this._simplifyPoints(),o.Path.prototype._updatePath.call(this))}}),o.polyline=function(t,e){return new o.Polyline(t,e)},o.PolyUtil={},o.PolyUtil.clipPolygon=function(t,e){var i,n,s,a,r,h,l,u,c,d=[1,4,2,8],p=o.LineUtil;for(n=0,l=t.length;l>n;n++)t[n]._code=p._getBitCode(t[n],e);for(a=0;4>a;a++){for(u=d[a],i=[],n=0,l=t.length,s=l-1;l>n;s=n++)r=t[n],h=t[s],r._code&u?h._code&u||(c=p._getEdgeIntersection(h,r,u,e),c._code=p._getBitCode(c,e),i.push(c)):(h._code&u&&(c=p._getEdgeIntersection(h,r,u,e),c._code=p._getBitCode(c,e),i.push(c)),i.push(r));t=i}return t},o.Polygon=o.Polyline.extend({options:{fill:!0},initialize:function(t,e){o.Polyline.prototype.initialize.call(this,t,e),this._initWithHoles(t)},_initWithHoles:function(t){var e,i,n;if(t&&o.Util.isArray(t[0])&&"number"!=typeof t[0][0])for(this._latlngs=this._convertLatLngs(t[0]),this._holes=t.slice(1),e=0,i=this._holes.length;i>e;e++)n=this._holes[e]=this._convertLatLngs(this._holes[e]),n[0].equals(n[n.length-1])&&n.pop();t=this._latlngs,t.length>=2&&t[0].equals(t[t.length-1])&&t.pop()},projectLatlngs:function(){if(o.Polyline.prototype.projectLatlngs.call(this),this._holePoints=[],this._holes){var t,e,i,n;for(t=0,i=this._holes.length;i>t;t++)for(this._holePoints[t]=[],e=0,n=this._holes[t].length;n>e;e++)this._holePoints[t][e]=this._map.latLngToLayerPoint(this._holes[t][e])}},setLatLngs:function(t){return t&&o.Util.isArray(t[0])&&"number"!=typeof t[0][0]?(this._initWithHoles(t),this.redraw()):o.Polyline.prototype.setLatLngs.call(this,t)},_clipPoints:function(){var t=this._originalPoints,e=[];if(this._parts=[t].concat(this._holePoints),!this.options.noClip){for(var i=0,n=this._parts.length;n>i;i++){var s=o.PolyUtil.clipPolygon(this._parts[i],this._map._pathViewport);s.length&&e.push(s)}this._parts=e}},_getPathPartStr:function(t){var e=o.Polyline.prototype._getPathPartStr.call(this,t);return e+(o.Browser.svg?"z":"x")}}),o.polygon=function(t,e){return new o.Polygon(t,e)},function(){function t(t){return o.FeatureGroup.extend({initialize:function(t,e){this._layers={},this._options=e,this.setLatLngs(t)},setLatLngs:function(e){var i=0,n=e.length;for(this.eachLayer(function(t){n>i?t.setLatLngs(e[i++]):this.removeLayer(t)},this);n>i;)this.addLayer(new t(e[i++],this._options));return this},getLatLngs:function(){var t=[];return this.eachLayer(function(e){t.push(e.getLatLngs())}),t}})}o.MultiPolyline=t(o.Polyline),o.MultiPolygon=t(o.Polygon),o.multiPolyline=function(t,e){return new o.MultiPolyline(t,e)},o.multiPolygon=function(t,e){return new o.MultiPolygon(t,e)}}(),o.Rectangle=o.Polygon.extend({initialize:function(t,e){o.Polygon.prototype.initialize.call(this,this._boundsToLatLngs(t),e)},setBounds:function(t){this.setLatLngs(this._boundsToLatLngs(t))},_boundsToLatLngs:function(t){return t=o.latLngBounds(t),[t.getSouthWest(),t.getNorthWest(),t.getNorthEast(),t.getSouthEast()]}}),o.rectangle=function(t,e){return new o.Rectangle(t,e)},o.Circle=o.Path.extend({initialize:function(t,e,i){o.Path.prototype.initialize.call(this,i),this._latlng=o.latLng(t),this._mRadius=e},options:{fill:!0},setLatLng:function(t){return this._latlng=o.latLng(t),this.redraw()},setRadius:function(t){return this._mRadius=t,this.redraw()},projectLatlngs:function(){var t=this._getLngRadius(),e=this._latlng,i=this._map.latLngToLayerPoint([e.lat,e.lng-t]);this._point=this._map.latLngToLayerPoint(e),this._radius=Math.max(this._point.x-i.x,1)},getBounds:function(){var t=this._getLngRadius(),e=this._mRadius/40075017*360,i=this._latlng;return new o.LatLngBounds([i.lat-e,i.lng-t],[i.lat+e,i.lng+t])},getLatLng:function(){return this._latlng},getPathString:function(){var t=this._point,e=this._radius;return this._checkIfEmpty()?"":o.Browser.svg?"M"+t.x+","+(t.y-e)+"A"+e+","+e+",0,1,1,"+(t.x-.1)+","+(t.y-e)+" z":(t._round(),e=Math.round(e),"AL "+t.x+","+t.y+" "+e+","+e+" 0,23592600")},getRadius:function(){return this._mRadius},_getLatRadius:function(){return this._mRadius/40075017*360},_getLngRadius:function(){return this._getLatRadius()/Math.cos(o.LatLng.DEG_TO_RAD*this._latlng.lat)},_checkIfEmpty:function(){if(!this._map)return!1;var t=this._map._pathViewport,e=this._radius,i=this._point;return i.x-e>t.max.x||i.y-e>t.max.y||i.x+e<t.min.x||i.y+e<t.min.y}}),o.circle=function(t,e,i){return new o.Circle(t,e,i)},o.CircleMarker=o.Circle.extend({options:{radius:10,weight:2},initialize:function(t,e){o.Circle.prototype.initialize.call(this,t,null,e),this._radius=this.options.radius},projectLatlngs:function(){this._point=this._map.latLngToLayerPoint(this._latlng)},_updateStyle:function(){o.Circle.prototype._updateStyle.call(this),this.setRadius(this.options.radius)},setLatLng:function(t){return o.Circle.prototype.setLatLng.call(this,t),this._popup&&this._popup._isOpen&&this._popup.setLatLng(t),this},setRadius:function(t){return this.options.radius=this._radius=t,this.redraw()},getRadius:function(){return this._radius}}),o.circleMarker=function(t,e){return new o.CircleMarker(t,e)},o.Polyline.include(o.Path.CANVAS?{_containsPoint:function(t,e){var i,n,s,a,r,h,l,u=this.options.weight/2;for(o.Browser.touch&&(u+=10),i=0,a=this._parts.length;a>i;i++)for(l=this._parts[i],n=0,r=l.length,s=r-1;r>n;s=n++)if((e||0!==n)&&(h=o.LineUtil.pointToSegmentDistance(t,l[s],l[n]),u>=h))return!0;return!1}}:{}),o.Polygon.include(o.Path.CANVAS?{_containsPoint:function(t){var e,i,n,s,a,r,h,l,u=!1;if(o.Polyline.prototype._containsPoint.call(this,t,!0))return!0;for(s=0,h=this._parts.length;h>s;s++)for(e=this._parts[s],a=0,l=e.length,r=l-1;l>a;r=a++)i=e[a],n=e[r],i.y>t.y!=n.y>t.y&&t.x<(n.x-i.x)*(t.y-i.y)/(n.y-i.y)+i.x&&(u=!u);return u}}:{}),o.Circle.include(o.Path.CANVAS?{_drawPath:function(){var t=this._point;this._ctx.beginPath(),this._ctx.arc(t.x,t.y,this._radius,0,2*Math.PI,!1)},_containsPoint:function(t){var e=this._point,i=this.options.stroke?this.options.weight/2:0;return t.distanceTo(e)<=this._radius+i}}:{}),o.CircleMarker.include(o.Path.CANVAS?{_updateStyle:function(){o.Path.prototype._updateStyle.call(this)}}:{}),o.GeoJSON=o.FeatureGroup.extend({initialize:function(t,e){o.setOptions(this,e),this._layers={},t&&this.addData(t)},addData:function(t){var e,i,n,s=o.Util.isArray(t)?t:t.features;if(s){for(e=0,i=s.length;i>e;e++)n=s[e],(n.geometries||n.geometry||n.features||n.coordinates)&&this.addData(s[e]);return this}var a=this.options;if(!a.filter||a.filter(t)){var r=o.GeoJSON.geometryToLayer(t,a.pointToLayer,a.coordsToLatLng,a);return r.feature=o.GeoJSON.asFeature(t),r.defaultOptions=r.options,this.resetStyle(r),a.onEachFeature&&a.onEachFeature(t,r),this.addLayer(r)}},resetStyle:function(t){var e=this.options.style;e&&(o.Util.extend(t.options,t.defaultOptions),this._setLayerStyle(t,e))},setStyle:function(t){this.eachLayer(function(e){this._setLayerStyle(e,t)},this)},_setLayerStyle:function(t,e){"function"==typeof e&&(e=e(t.feature)),t.setStyle&&t.setStyle(e)}}),o.extend(o.GeoJSON,{geometryToLayer:function(t,e,i,n){var s,a,r,h,l="Feature"===t.type?t.geometry:t,u=l.coordinates,c=[];switch(i=i||this.coordsToLatLng,l.type){case"Point":return s=i(u),e?e(t,s):new o.Marker(s);case"MultiPoint":for(r=0,h=u.length;h>r;r++)s=i(u[r]),c.push(e?e(t,s):new o.Marker(s));return new o.FeatureGroup(c);case"LineString":return a=this.coordsToLatLngs(u,0,i),new o.Polyline(a,n);case"Polygon":if(2===u.length&&!u[1].length)throw new Error("Invalid GeoJSON object.");return a=this.coordsToLatLngs(u,1,i),new o.Polygon(a,n);case"MultiLineString":return a=this.coordsToLatLngs(u,1,i),new o.MultiPolyline(a,n);case"MultiPolygon":return a=this.coordsToLatLngs(u,2,i),new o.MultiPolygon(a,n);case"GeometryCollection":for(r=0,h=l.geometries.length;h>r;r++)c.push(this.geometryToLayer({geometry:l.geometries[r],type:"Feature",properties:t.properties},e,i,n));return new o.FeatureGroup(c);default:throw new Error("Invalid GeoJSON object.")}},coordsToLatLng:function(t){return new o.LatLng(t[1],t[0],t[2])},coordsToLatLngs:function(t,e,i){var n,o,s,a=[];for(o=0,s=t.length;s>o;o++)n=e?this.coordsToLatLngs(t[o],e-1,i):(i||this.coordsToLatLng)(t[o]),a.push(n);return a},latLngToCoords:function(t){var e=[t.lng,t.lat];return t.alt!==i&&e.push(t.alt),e},latLngsToCoords:function(t){for(var e=[],i=0,n=t.length;n>i;i++)e.push(o.GeoJSON.latLngToCoords(t[i]));return e},getFeature:function(t,e){return t.feature?o.extend({},t.feature,{geometry:e}):o.GeoJSON.asFeature(e)},asFeature:function(t){return"Feature"===t.type?t:{type:"Feature",properties:{},geometry:t}}});var a={toGeoJSON:function(){return o.GeoJSON.getFeature(this,{type:"Point",coordinates:o.GeoJSON.latLngToCoords(this.getLatLng())})}};o.Marker.include(a),o.Circle.include(a),o.CircleMarker.include(a),o.Polyline.include({toGeoJSON:function(){return o.GeoJSON.getFeature(this,{type:"LineString",coordinates:o.GeoJSON.latLngsToCoords(this.getLatLngs())})}}),o.Polygon.include({toGeoJSON:function(){var t,e,i,n=[o.GeoJSON.latLngsToCoords(this.getLatLngs())];if(n[0].push(n[0][0]),this._holes)for(t=0,e=this._holes.length;e>t;t++)i=o.GeoJSON.latLngsToCoords(this._holes[t]),i.push(i[0]),n.push(i);return o.GeoJSON.getFeature(this,{type:"Polygon",coordinates:n})}}),function(){function t(t){return function(){var e=[];return this.eachLayer(function(t){e.push(t.toGeoJSON().geometry.coordinates)}),o.GeoJSON.getFeature(this,{type:t,coordinates:e})}}o.MultiPolyline.include({toGeoJSON:t("MultiLineString")}),o.MultiPolygon.include({toGeoJSON:t("MultiPolygon")}),o.LayerGroup.include({toGeoJSON:function(){var e,i=this.feature&&this.feature.geometry,n=[];if(i&&"MultiPoint"===i.type)return t("MultiPoint").call(this);var s=i&&"GeometryCollection"===i.type;return this.eachLayer(function(t){t.toGeoJSON&&(e=t.toGeoJSON(),n.push(s?e.geometry:o.GeoJSON.asFeature(e)))}),s?o.GeoJSON.getFeature(this,{geometries:n,type:"GeometryCollection"}):{type:"FeatureCollection",features:n}}})}(),o.geoJson=function(t,e){return new o.GeoJSON(t,e)},o.DomEvent={addListener:function(t,e,i,n){var s,a,r,h=o.stamp(i),l="_leaflet_"+e+h;return t[l]?this:(s=function(e){return i.call(n||t,e||o.DomEvent._getEvent())},o.Browser.pointer&&0===e.indexOf("touch")?this.addPointerListener(t,e,s,h):(o.Browser.touch&&"dblclick"===e&&this.addDoubleTapListener&&this.addDoubleTapListener(t,s,h),"addEventListener"in t?"mousewheel"===e?(t.addEventListener("DOMMouseScroll",s,!1),t.addEventListener(e,s,!1)):"mouseenter"===e||"mouseleave"===e?(a=s,r="mouseenter"===e?"mouseover":"mouseout",s=function(e){return o.DomEvent._checkMouse(t,e)?a(e):void 0},t.addEventListener(r,s,!1)):"click"===e&&o.Browser.android?(a=s,s=function(t){return o.DomEvent._filterClick(t,a)},t.addEventListener(e,s,!1)):t.addEventListener(e,s,!1):"attachEvent"in t&&t.attachEvent("on"+e,s),t[l]=s,this))},removeListener:function(t,e,i){var n=o.stamp(i),s="_leaflet_"+e+n,a=t[s];return a?(o.Browser.pointer&&0===e.indexOf("touch")?this.removePointerListener(t,e,n):o.Browser.touch&&"dblclick"===e&&this.removeDoubleTapListener?this.removeDoubleTapListener(t,n):"removeEventListener"in t?"mousewheel"===e?(t.removeEventListener("DOMMouseScroll",a,!1),t.removeEventListener(e,a,!1)):"mouseenter"===e||"mouseleave"===e?t.removeEventListener("mouseenter"===e?"mouseover":"mouseout",a,!1):t.removeEventListener(e,a,!1):"detachEvent"in t&&t.detachEvent("on"+e,a),t[s]=null,this):this},stopPropagation:function(t){return t.stopPropagation?t.stopPropagation():t.cancelBubble=!0,o.DomEvent._skipped(t),this},disableScrollPropagation:function(t){var e=o.DomEvent.stopPropagation;return o.DomEvent.on(t,"mousewheel",e).on(t,"MozMousePixelScroll",e)},disableClickPropagation:function(t){for(var e=o.DomEvent.stopPropagation,i=o.Draggable.START.length-1;i>=0;i--)o.DomEvent.on(t,o.Draggable.START[i],e);return o.DomEvent.on(t,"click",o.DomEvent._fakeStop).on(t,"dblclick",e)},preventDefault:function(t){return t.preventDefault?t.preventDefault():t.returnValue=!1,this},stop:function(t){return o.DomEvent.preventDefault(t).stopPropagation(t)},getMousePosition:function(t,e){if(!e)return new o.Point(t.clientX,t.clientY);var i=e.getBoundingClientRect();return new o.Point(t.clientX-i.left-e.clientLeft,t.clientY-i.top-e.clientTop)},getWheelDelta:function(t){var e=0;return t.wheelDelta&&(e=t.wheelDelta/120),t.detail&&(e=-t.detail/3),e},_skipEvents:{},_fakeStop:function(t){o.DomEvent._skipEvents[t.type]=!0},_skipped:function(t){var e=this._skipEvents[t.type];return this._skipEvents[t.type]=!1,e},_checkMouse:function(t,e){var i=e.relatedTarget;if(!i)return!0;try{for(;i&&i!==t;)i=i.parentNode}catch(n){return!1}return i!==t},_getEvent:function(){var e=t.event;if(!e)for(var i=arguments.callee.caller;i&&(e=i.arguments[0],!e||t.Event!==e.constructor);)i=i.caller;return e},_filterClick:function(t,e){var i=t.timeStamp||t.originalEvent.timeStamp,n=o.DomEvent._lastClick&&i-o.DomEvent._lastClick;return n&&n>100&&500>n||t.target._simulatedClick&&!t._simulated?void o.DomEvent.stop(t):(o.DomEvent._lastClick=i,e(t))}},o.DomEvent.on=o.DomEvent.addListener,o.DomEvent.off=o.DomEvent.removeListener,o.Draggable=o.Class.extend({includes:o.Mixin.Events,statics:{START:o.Browser.touch?["touchstart","mousedown"]:["mousedown"],END:{mousedown:"mouseup",touchstart:"touchend",pointerdown:"touchend",MSPointerDown:"touchend"},MOVE:{mousedown:"mousemove",touchstart:"touchmove",pointerdown:"touchmove",MSPointerDown:"touchmove"}},initialize:function(t,e){this._element=t,this._dragStartTarget=e||t},enable:function(){if(!this._enabled){for(var t=o.Draggable.START.length-1;t>=0;t--)o.DomEvent.on(this._dragStartTarget,o.Draggable.START[t],this._onDown,this);this._enabled=!0}},disable:function(){if(this._enabled){for(var t=o.Draggable.START.length-1;t>=0;t--)o.DomEvent.off(this._dragStartTarget,o.Draggable.START[t],this._onDown,this);this._enabled=!1,this._moved=!1}},_onDown:function(t){if(this._moved=!1,!(t.shiftKey||1!==t.which&&1!==t.button&&!t.touches||(o.DomEvent.stopPropagation(t),o.Draggable._disabled||(o.DomUtil.disableImageDrag(),o.DomUtil.disableTextSelection(),this._moving)))){var i=t.touches?t.touches[0]:t;this._startPoint=new o.Point(i.clientX,i.clientY),this._startPos=this._newPos=o.DomUtil.getPosition(this._element),o.DomEvent.on(e,o.Draggable.MOVE[t.type],this._onMove,this).on(e,o.Draggable.END[t.type],this._onUp,this)}},_onMove:function(t){if(t.touches&&t.touches.length>1)return void(this._moved=!0);var i=t.touches&&1===t.touches.length?t.touches[0]:t,n=new o.Point(i.clientX,i.clientY),s=n.subtract(this._startPoint);(s.x||s.y)&&(o.Browser.touch&&Math.abs(s.x)+Math.abs(s.y)<3||(o.DomEvent.preventDefault(t),this._moved||(this.fire("dragstart"),this._moved=!0,this._startPos=o.DomUtil.getPosition(this._element).subtract(s),o.DomUtil.addClass(e.body,"leaflet-dragging"),this._lastTarget=t.target||t.srcElement,o.DomUtil.addClass(this._lastTarget,"leaflet-drag-target")),this._newPos=this._startPos.add(s),this._moving=!0,o.Util.cancelAnimFrame(this._animRequest),this._animRequest=o.Util.requestAnimFrame(this._updatePosition,this,!0,this._dragStartTarget)))},_updatePosition:function(){this.fire("predrag"),o.DomUtil.setPosition(this._element,this._newPos),this.fire("drag")},_onUp:function(){o.DomUtil.removeClass(e.body,"leaflet-dragging"),this._lastTarget&&(o.DomUtil.removeClass(this._lastTarget,"leaflet-drag-target"),this._lastTarget=null);for(var t in o.Draggable.MOVE)o.DomEvent.off(e,o.Draggable.MOVE[t],this._onMove).off(e,o.Draggable.END[t],this._onUp);o.DomUtil.enableImageDrag(),o.DomUtil.enableTextSelection(),this._moved&&this._moving&&(o.Util.cancelAnimFrame(this._animRequest),this.fire("dragend",{distance:this._newPos.distanceTo(this._startPos)})),this._moving=!1}}),o.Handler=o.Class.extend({initialize:function(t){this._map=t},enable:function(){this._enabled||(this._enabled=!0,this.addHooks())},disable:function(){this._enabled&&(this._enabled=!1,this.removeHooks())},enabled:function(){return!!this._enabled}}),o.Map.mergeOptions({dragging:!0,inertia:!o.Browser.android23,inertiaDeceleration:3400,inertiaMaxSpeed:1/0,inertiaThreshold:o.Browser.touch?32:18,easeLinearity:.25,worldCopyJump:!1}),o.Map.Drag=o.Handler.extend({addHooks:function(){if(!this._draggable){var t=this._map;this._draggable=new o.Draggable(t._mapPane,t._container),this._draggable.on({dragstart:this._onDragStart,drag:this._onDrag,dragend:this._onDragEnd},this),t.options.worldCopyJump&&(this._draggable.on("predrag",this._onPreDrag,this),t.on("viewreset",this._onViewReset,this),t.whenReady(this._onViewReset,this))}this._draggable.enable()},removeHooks:function(){this._draggable.disable()},moved:function(){return this._draggable&&this._draggable._moved},_onDragStart:function(){var t=this._map;t._panAnim&&t._panAnim.stop(),t.fire("movestart").fire("dragstart"),t.options.inertia&&(this._positions=[],this._times=[])},_onDrag:function(){if(this._map.options.inertia){var t=this._lastTime=+new Date,e=this._lastPos=this._draggable._newPos;this._positions.push(e),this._times.push(t),t-this._times[0]>200&&(this._positions.shift(),this._times.shift())}this._map.fire("move").fire("drag")},_onViewReset:function(){var t=this._map.getSize()._divideBy(2),e=this._map.latLngToLayerPoint([0,0]);this._initialWorldOffset=e.subtract(t).x,this._worldWidth=this._map.project([0,180]).x},_onPreDrag:function(){var t=this._worldWidth,e=Math.round(t/2),i=this._initialWorldOffset,n=this._draggable._newPos.x,o=(n-e+i)%t+e-i,s=(n+e+i)%t-e-i,a=Math.abs(o+i)<Math.abs(s+i)?o:s;this._draggable._newPos.x=a},_onDragEnd:function(t){var e=this._map,i=e.options,n=+new Date-this._lastTime,s=!i.inertia||n>i.inertiaThreshold||!this._positions[0];if(e.fire("dragend",t),s)e.fire("moveend");else{var a=this._lastPos.subtract(this._positions[0]),r=(this._lastTime+n-this._times[0])/1e3,h=i.easeLinearity,l=a.multiplyBy(h/r),u=l.distanceTo([0,0]),c=Math.min(i.inertiaMaxSpeed,u),d=l.multiplyBy(c/u),p=c/(i.inertiaDeceleration*h),_=d.multiplyBy(-p/2).round();_.x&&_.y?(_=e._limitOffset(_,e.options.maxBounds),o.Util.requestAnimFrame(function(){e.panBy(_,{duration:p,easeLinearity:h,noMoveStart:!0})})):e.fire("moveend")}}}),o.Map.addInitHook("addHandler","dragging",o.Map.Drag),o.Map.mergeOptions({doubleClickZoom:!0}),o.Map.DoubleClickZoom=o.Handler.extend({addHooks:function(){this._map.on("dblclick",this._onDoubleClick,this)},removeHooks:function(){this._map.off("dblclick",this._onDoubleClick,this)},_onDoubleClick:function(t){var e=this._map,i=e.getZoom()+(t.originalEvent.shiftKey?-1:1);"center"===e.options.doubleClickZoom?e.setZoom(i):e.setZoomAround(t.containerPoint,i)}}),o.Map.addInitHook("addHandler","doubleClickZoom",o.Map.DoubleClickZoom),o.Map.mergeOptions({scrollWheelZoom:!0}),o.Map.ScrollWheelZoom=o.Handler.extend({addHooks:function(){o.DomEvent.on(this._map._container,"mousewheel",this._onWheelScroll,this),o.DomEvent.on(this._map._container,"MozMousePixelScroll",o.DomEvent.preventDefault),this._delta=0},removeHooks:function(){o.DomEvent.off(this._map._container,"mousewheel",this._onWheelScroll),o.DomEvent.off(this._map._container,"MozMousePixelScroll",o.DomEvent.preventDefault)},_onWheelScroll:function(t){var e=o.DomEvent.getWheelDelta(t);this._delta+=e,this._lastMousePos=this._map.mouseEventToContainerPoint(t),this._startTime||(this._startTime=+new Date);var i=Math.max(40-(+new Date-this._startTime),0);clearTimeout(this._timer),this._timer=setTimeout(o.bind(this._performZoom,this),i),o.DomEvent.preventDefault(t),o.DomEvent.stopPropagation(t)},_performZoom:function(){var t=this._map,e=this._delta,i=t.getZoom();e=e>0?Math.ceil(e):Math.floor(e),e=Math.max(Math.min(e,4),-4),e=t._limitZoom(i+e)-i,this._delta=0,this._startTime=null,e&&("center"===t.options.scrollWheelZoom?t.setZoom(i+e):t.setZoomAround(this._lastMousePos,i+e))}}),o.Map.addInitHook("addHandler","scrollWheelZoom",o.Map.ScrollWheelZoom),o.extend(o.DomEvent,{_touchstart:o.Browser.msPointer?"MSPointerDown":o.Browser.pointer?"pointerdown":"touchstart",_touchend:o.Browser.msPointer?"MSPointerUp":o.Browser.pointer?"pointerup":"touchend",addDoubleTapListener:function(t,i,n){function s(t){var e;if(o.Browser.pointer?(_.push(t.pointerId),e=_.length):e=t.touches.length,!(e>1)){var i=Date.now(),n=i-(r||i);h=t.touches?t.touches[0]:t,l=n>0&&u>=n,r=i}}function a(t){if(o.Browser.pointer){var e=_.indexOf(t.pointerId);if(-1===e)return;_.splice(e,1)}if(l){if(o.Browser.pointer){var n,s={};for(var a in h)n=h[a],s[a]="function"==typeof n?n.bind(h):n;h=s}h.type="dblclick",i(h),r=null}}var r,h,l=!1,u=250,c="_leaflet_",d=this._touchstart,p=this._touchend,_=[];t[c+d+n]=s,t[c+p+n]=a;var m=o.Browser.pointer?e.documentElement:t;return t.addEventListener(d,s,!1),m.addEventListener(p,a,!1),o.Browser.pointer&&m.addEventListener(o.DomEvent.POINTER_CANCEL,a,!1),this},removeDoubleTapListener:function(t,i){var n="_leaflet_";return t.removeEventListener(this._touchstart,t[n+this._touchstart+i],!1),(o.Browser.pointer?e.documentElement:t).removeEventListener(this._touchend,t[n+this._touchend+i],!1),o.Browser.pointer&&e.documentElement.removeEventListener(o.DomEvent.POINTER_CANCEL,t[n+this._touchend+i],!1),this}}),o.extend(o.DomEvent,{POINTER_DOWN:o.Browser.msPointer?"MSPointerDown":"pointerdown",POINTER_MOVE:o.Browser.msPointer?"MSPointerMove":"pointermove",POINTER_UP:o.Browser.msPointer?"MSPointerUp":"pointerup",POINTER_CANCEL:o.Browser.msPointer?"MSPointerCancel":"pointercancel",_pointers:[],_pointerDocumentListener:!1,addPointerListener:function(t,e,i,n){switch(e){case"touchstart":return this.addPointerListenerStart(t,e,i,n);case"touchend":return this.addPointerListenerEnd(t,e,i,n);case"touchmove":return this.addPointerListenerMove(t,e,i,n);default:throw"Unknown touch event type"}},addPointerListenerStart:function(t,i,n,s){var a="_leaflet_",r=this._pointers,h=function(t){o.DomEvent.preventDefault(t);for(var e=!1,i=0;i<r.length;i++)if(r[i].pointerId===t.pointerId){e=!0;
break}e||r.push(t),t.touches=r.slice(),t.changedTouches=[t],n(t)};if(t[a+"touchstart"+s]=h,t.addEventListener(this.POINTER_DOWN,h,!1),!this._pointerDocumentListener){var l=function(t){for(var e=0;e<r.length;e++)if(r[e].pointerId===t.pointerId){r.splice(e,1);break}};e.documentElement.addEventListener(this.POINTER_UP,l,!1),e.documentElement.addEventListener(this.POINTER_CANCEL,l,!1),this._pointerDocumentListener=!0}return this},addPointerListenerMove:function(t,e,i,n){function o(t){if(t.pointerType!==t.MSPOINTER_TYPE_MOUSE&&"mouse"!==t.pointerType||0!==t.buttons){for(var e=0;e<a.length;e++)if(a[e].pointerId===t.pointerId){a[e]=t;break}t.touches=a.slice(),t.changedTouches=[t],i(t)}}var s="_leaflet_",a=this._pointers;return t[s+"touchmove"+n]=o,t.addEventListener(this.POINTER_MOVE,o,!1),this},addPointerListenerEnd:function(t,e,i,n){var o="_leaflet_",s=this._pointers,a=function(t){for(var e=0;e<s.length;e++)if(s[e].pointerId===t.pointerId){s.splice(e,1);break}t.touches=s.slice(),t.changedTouches=[t],i(t)};return t[o+"touchend"+n]=a,t.addEventListener(this.POINTER_UP,a,!1),t.addEventListener(this.POINTER_CANCEL,a,!1),this},removePointerListener:function(t,e,i){var n="_leaflet_",o=t[n+e+i];switch(e){case"touchstart":t.removeEventListener(this.POINTER_DOWN,o,!1);break;case"touchmove":t.removeEventListener(this.POINTER_MOVE,o,!1);break;case"touchend":t.removeEventListener(this.POINTER_UP,o,!1),t.removeEventListener(this.POINTER_CANCEL,o,!1)}return this}}),o.Map.mergeOptions({touchZoom:o.Browser.touch&&!o.Browser.android23,bounceAtZoomLimits:!0}),o.Map.TouchZoom=o.Handler.extend({addHooks:function(){o.DomEvent.on(this._map._container,"touchstart",this._onTouchStart,this)},removeHooks:function(){o.DomEvent.off(this._map._container,"touchstart",this._onTouchStart,this)},_onTouchStart:function(t){var i=this._map;if(t.touches&&2===t.touches.length&&!i._animatingZoom&&!this._zooming){var n=i.mouseEventToLayerPoint(t.touches[0]),s=i.mouseEventToLayerPoint(t.touches[1]),a=i._getCenterLayerPoint();this._startCenter=n.add(s)._divideBy(2),this._startDist=n.distanceTo(s),this._moved=!1,this._zooming=!0,this._centerOffset=a.subtract(this._startCenter),i._panAnim&&i._panAnim.stop(),o.DomEvent.on(e,"touchmove",this._onTouchMove,this).on(e,"touchend",this._onTouchEnd,this),o.DomEvent.preventDefault(t)}},_onTouchMove:function(t){var e=this._map;if(t.touches&&2===t.touches.length&&this._zooming){var i=e.mouseEventToLayerPoint(t.touches[0]),n=e.mouseEventToLayerPoint(t.touches[1]);this._scale=i.distanceTo(n)/this._startDist,this._delta=i._add(n)._divideBy(2)._subtract(this._startCenter),1!==this._scale&&(e.options.bounceAtZoomLimits||!(e.getZoom()===e.getMinZoom()&&this._scale<1||e.getZoom()===e.getMaxZoom()&&this._scale>1))&&(this._moved||(o.DomUtil.addClass(e._mapPane,"leaflet-touching"),e.fire("movestart").fire("zoomstart"),this._moved=!0),o.Util.cancelAnimFrame(this._animRequest),this._animRequest=o.Util.requestAnimFrame(this._updateOnMove,this,!0,this._map._container),o.DomEvent.preventDefault(t))}},_updateOnMove:function(){var t=this._map,e=this._getScaleOrigin(),i=t.layerPointToLatLng(e),n=t.getScaleZoom(this._scale);t._animateZoom(i,n,this._startCenter,this._scale,this._delta,!1,!0)},_onTouchEnd:function(){if(!this._moved||!this._zooming)return void(this._zooming=!1);var t=this._map;this._zooming=!1,o.DomUtil.removeClass(t._mapPane,"leaflet-touching"),o.Util.cancelAnimFrame(this._animRequest),o.DomEvent.off(e,"touchmove",this._onTouchMove).off(e,"touchend",this._onTouchEnd);var i=this._getScaleOrigin(),n=t.layerPointToLatLng(i),s=t.getZoom(),a=t.getScaleZoom(this._scale)-s,r=a>0?Math.ceil(a):Math.floor(a),h=t._limitZoom(s+r),l=t.getZoomScale(h)/this._scale;t._animateZoom(n,h,i,l)},_getScaleOrigin:function(){var t=this._centerOffset.subtract(this._delta).divideBy(this._scale);return this._startCenter.add(t)}}),o.Map.addInitHook("addHandler","touchZoom",o.Map.TouchZoom),o.Map.mergeOptions({tap:!0,tapTolerance:15}),o.Map.Tap=o.Handler.extend({addHooks:function(){o.DomEvent.on(this._map._container,"touchstart",this._onDown,this)},removeHooks:function(){o.DomEvent.off(this._map._container,"touchstart",this._onDown,this)},_onDown:function(t){if(t.touches){if(o.DomEvent.preventDefault(t),this._fireClick=!0,t.touches.length>1)return this._fireClick=!1,void clearTimeout(this._holdTimeout);var i=t.touches[0],n=i.target;this._startPos=this._newPos=new o.Point(i.clientX,i.clientY),n.tagName&&"a"===n.tagName.toLowerCase()&&o.DomUtil.addClass(n,"leaflet-active"),this._holdTimeout=setTimeout(o.bind(function(){this._isTapValid()&&(this._fireClick=!1,this._onUp(),this._simulateEvent("contextmenu",i))},this),1e3),o.DomEvent.on(e,"touchmove",this._onMove,this).on(e,"touchend",this._onUp,this)}},_onUp:function(t){if(clearTimeout(this._holdTimeout),o.DomEvent.off(e,"touchmove",this._onMove,this).off(e,"touchend",this._onUp,this),this._fireClick&&t&&t.changedTouches){var i=t.changedTouches[0],n=i.target;n&&n.tagName&&"a"===n.tagName.toLowerCase()&&o.DomUtil.removeClass(n,"leaflet-active"),this._isTapValid()&&this._simulateEvent("click",i)}},_isTapValid:function(){return this._newPos.distanceTo(this._startPos)<=this._map.options.tapTolerance},_onMove:function(t){var e=t.touches[0];this._newPos=new o.Point(e.clientX,e.clientY)},_simulateEvent:function(i,n){var o=e.createEvent("MouseEvents");o._simulated=!0,n.target._simulatedClick=!0,o.initMouseEvent(i,!0,!0,t,1,n.screenX,n.screenY,n.clientX,n.clientY,!1,!1,!1,!1,0,null),n.target.dispatchEvent(o)}}),o.Browser.touch&&!o.Browser.pointer&&o.Map.addInitHook("addHandler","tap",o.Map.Tap),o.Map.mergeOptions({boxZoom:!0}),o.Map.BoxZoom=o.Handler.extend({initialize:function(t){this._map=t,this._container=t._container,this._pane=t._panes.overlayPane,this._moved=!1},addHooks:function(){o.DomEvent.on(this._container,"mousedown",this._onMouseDown,this)},removeHooks:function(){o.DomEvent.off(this._container,"mousedown",this._onMouseDown),this._moved=!1},moved:function(){return this._moved},_onMouseDown:function(t){return this._moved=!1,!t.shiftKey||1!==t.which&&1!==t.button?!1:(o.DomUtil.disableTextSelection(),o.DomUtil.disableImageDrag(),this._startLayerPoint=this._map.mouseEventToLayerPoint(t),void o.DomEvent.on(e,"mousemove",this._onMouseMove,this).on(e,"mouseup",this._onMouseUp,this).on(e,"keydown",this._onKeyDown,this))},_onMouseMove:function(t){this._moved||(this._box=o.DomUtil.create("div","leaflet-zoom-box",this._pane),o.DomUtil.setPosition(this._box,this._startLayerPoint),this._container.style.cursor="crosshair",this._map.fire("boxzoomstart"));var e=this._startLayerPoint,i=this._box,n=this._map.mouseEventToLayerPoint(t),s=n.subtract(e),a=new o.Point(Math.min(n.x,e.x),Math.min(n.y,e.y));o.DomUtil.setPosition(i,a),this._moved=!0,i.style.width=Math.max(0,Math.abs(s.x)-4)+"px",i.style.height=Math.max(0,Math.abs(s.y)-4)+"px"},_finish:function(){this._moved&&(this._pane.removeChild(this._box),this._container.style.cursor=""),o.DomUtil.enableTextSelection(),o.DomUtil.enableImageDrag(),o.DomEvent.off(e,"mousemove",this._onMouseMove).off(e,"mouseup",this._onMouseUp).off(e,"keydown",this._onKeyDown)},_onMouseUp:function(t){this._finish();var e=this._map,i=e.mouseEventToLayerPoint(t);if(!this._startLayerPoint.equals(i)){var n=new o.LatLngBounds(e.layerPointToLatLng(this._startLayerPoint),e.layerPointToLatLng(i));e.fitBounds(n),e.fire("boxzoomend",{boxZoomBounds:n})}},_onKeyDown:function(t){27===t.keyCode&&this._finish()}}),o.Map.addInitHook("addHandler","boxZoom",o.Map.BoxZoom),o.Map.mergeOptions({keyboard:!0,keyboardPanOffset:80,keyboardZoomOffset:1}),o.Map.Keyboard=o.Handler.extend({keyCodes:{left:[37],right:[39],down:[40],up:[38],zoomIn:[187,107,61,171],zoomOut:[189,109,173]},initialize:function(t){this._map=t,this._setPanOffset(t.options.keyboardPanOffset),this._setZoomOffset(t.options.keyboardZoomOffset)},addHooks:function(){var t=this._map._container;-1===t.tabIndex&&(t.tabIndex="0"),o.DomEvent.on(t,"focus",this._onFocus,this).on(t,"blur",this._onBlur,this).on(t,"mousedown",this._onMouseDown,this),this._map.on("focus",this._addHooks,this).on("blur",this._removeHooks,this)},removeHooks:function(){this._removeHooks();var t=this._map._container;o.DomEvent.off(t,"focus",this._onFocus,this).off(t,"blur",this._onBlur,this).off(t,"mousedown",this._onMouseDown,this),this._map.off("focus",this._addHooks,this).off("blur",this._removeHooks,this)},_onMouseDown:function(){if(!this._focused){var i=e.body,n=e.documentElement,o=i.scrollTop||n.scrollTop,s=i.scrollLeft||n.scrollLeft;this._map._container.focus(),t.scrollTo(s,o)}},_onFocus:function(){this._focused=!0,this._map.fire("focus")},_onBlur:function(){this._focused=!1,this._map.fire("blur")},_setPanOffset:function(t){var e,i,n=this._panKeys={},o=this.keyCodes;for(e=0,i=o.left.length;i>e;e++)n[o.left[e]]=[-1*t,0];for(e=0,i=o.right.length;i>e;e++)n[o.right[e]]=[t,0];for(e=0,i=o.down.length;i>e;e++)n[o.down[e]]=[0,t];for(e=0,i=o.up.length;i>e;e++)n[o.up[e]]=[0,-1*t]},_setZoomOffset:function(t){var e,i,n=this._zoomKeys={},o=this.keyCodes;for(e=0,i=o.zoomIn.length;i>e;e++)n[o.zoomIn[e]]=t;for(e=0,i=o.zoomOut.length;i>e;e++)n[o.zoomOut[e]]=-t},_addHooks:function(){o.DomEvent.on(e,"keydown",this._onKeyDown,this)},_removeHooks:function(){o.DomEvent.off(e,"keydown",this._onKeyDown,this)},_onKeyDown:function(t){var e=t.keyCode,i=this._map;if(e in this._panKeys){if(i._panAnim&&i._panAnim._inProgress)return;i.panBy(this._panKeys[e]),i.options.maxBounds&&i.panInsideBounds(i.options.maxBounds)}else{if(!(e in this._zoomKeys))return;i.setZoom(i.getZoom()+this._zoomKeys[e])}o.DomEvent.stop(t)}}),o.Map.addInitHook("addHandler","keyboard",o.Map.Keyboard),o.Handler.MarkerDrag=o.Handler.extend({initialize:function(t){this._marker=t},addHooks:function(){var t=this._marker._icon;this._draggable||(this._draggable=new o.Draggable(t,t)),this._draggable.on("dragstart",this._onDragStart,this).on("drag",this._onDrag,this).on("dragend",this._onDragEnd,this),this._draggable.enable(),o.DomUtil.addClass(this._marker._icon,"leaflet-marker-draggable")},removeHooks:function(){this._draggable.off("dragstart",this._onDragStart,this).off("drag",this._onDrag,this).off("dragend",this._onDragEnd,this),this._draggable.disable(),o.DomUtil.removeClass(this._marker._icon,"leaflet-marker-draggable")},moved:function(){return this._draggable&&this._draggable._moved},_onDragStart:function(){this._marker.closePopup().fire("movestart").fire("dragstart")},_onDrag:function(){var t=this._marker,e=t._shadow,i=o.DomUtil.getPosition(t._icon),n=t._map.layerPointToLatLng(i);e&&o.DomUtil.setPosition(e,i),t._latlng=n,t.fire("move",{latlng:n}).fire("drag")},_onDragEnd:function(t){this._marker.fire("moveend").fire("dragend",t)}}),o.Control=o.Class.extend({options:{position:"topright"},initialize:function(t){o.setOptions(this,t)},getPosition:function(){return this.options.position},setPosition:function(t){var e=this._map;return e&&e.removeControl(this),this.options.position=t,e&&e.addControl(this),this},getContainer:function(){return this._container},addTo:function(t){this._map=t;var e=this._container=this.onAdd(t),i=this.getPosition(),n=t._controlCorners[i];return o.DomUtil.addClass(e,"leaflet-control"),-1!==i.indexOf("bottom")?n.insertBefore(e,n.firstChild):n.appendChild(e),this},removeFrom:function(t){var e=this.getPosition(),i=t._controlCorners[e];return i.removeChild(this._container),this._map=null,this.onRemove&&this.onRemove(t),this},_refocusOnMap:function(){this._map&&this._map.getContainer().focus()}}),o.control=function(t){return new o.Control(t)},o.Map.include({addControl:function(t){return t.addTo(this),this},removeControl:function(t){return t.removeFrom(this),this},_initControlPos:function(){function t(t,s){var a=i+t+" "+i+s;e[t+s]=o.DomUtil.create("div",a,n)}var e=this._controlCorners={},i="leaflet-",n=this._controlContainer=o.DomUtil.create("div",i+"control-container",this._container);t("top","left"),t("top","right"),t("bottom","left"),t("bottom","right")},_clearControlPos:function(){this._container.removeChild(this._controlContainer)}}),o.Control.Zoom=o.Control.extend({options:{position:"topleft",zoomInText:"+",zoomInTitle:"Zoom in",zoomOutText:"-",zoomOutTitle:"Zoom out"},onAdd:function(t){var e="leaflet-control-zoom",i=o.DomUtil.create("div",e+" leaflet-bar");return this._map=t,this._zoomInButton=this._createButton(this.options.zoomInText,this.options.zoomInTitle,e+"-in",i,this._zoomIn,this),this._zoomOutButton=this._createButton(this.options.zoomOutText,this.options.zoomOutTitle,e+"-out",i,this._zoomOut,this),this._updateDisabled(),t.on("zoomend zoomlevelschange",this._updateDisabled,this),i},onRemove:function(t){t.off("zoomend zoomlevelschange",this._updateDisabled,this)},_zoomIn:function(t){this._map.zoomIn(t.shiftKey?3:1)},_zoomOut:function(t){this._map.zoomOut(t.shiftKey?3:1)},_createButton:function(t,e,i,n,s,a){var r=o.DomUtil.create("a",i,n);r.innerHTML=t,r.href="#",r.title=e;var h=o.DomEvent.stopPropagation;return o.DomEvent.on(r,"click",h).on(r,"mousedown",h).on(r,"dblclick",h).on(r,"click",o.DomEvent.preventDefault).on(r,"click",s,a).on(r,"click",this._refocusOnMap,a),r},_updateDisabled:function(){var t=this._map,e="leaflet-disabled";o.DomUtil.removeClass(this._zoomInButton,e),o.DomUtil.removeClass(this._zoomOutButton,e),t._zoom===t.getMinZoom()&&o.DomUtil.addClass(this._zoomOutButton,e),t._zoom===t.getMaxZoom()&&o.DomUtil.addClass(this._zoomInButton,e)}}),o.Map.mergeOptions({zoomControl:!0}),o.Map.addInitHook(function(){this.options.zoomControl&&(this.zoomControl=new o.Control.Zoom,this.addControl(this.zoomControl))}),o.control.zoom=function(t){return new o.Control.Zoom(t)},o.Control.Attribution=o.Control.extend({options:{position:"bottomright",prefix:'<a href="http://leafletjs.com" title="A JS library for interactive maps">Leaflet</a>'},initialize:function(t){o.setOptions(this,t),this._attributions={}},onAdd:function(t){this._container=o.DomUtil.create("div","leaflet-control-attribution"),o.DomEvent.disableClickPropagation(this._container);for(var e in t._layers)t._layers[e].getAttribution&&this.addAttribution(t._layers[e].getAttribution());return t.on("layeradd",this._onLayerAdd,this).on("layerremove",this._onLayerRemove,this),this._update(),this._container},onRemove:function(t){t.off("layeradd",this._onLayerAdd).off("layerremove",this._onLayerRemove)},setPrefix:function(t){return this.options.prefix=t,this._update(),this},addAttribution:function(t){return t?(this._attributions[t]||(this._attributions[t]=0),this._attributions[t]++,this._update(),this):void 0},removeAttribution:function(t){return t?(this._attributions[t]&&(this._attributions[t]--,this._update()),this):void 0},_update:function(){if(this._map){var t=[];for(var e in this._attributions)this._attributions[e]&&t.push(e);var i=[];this.options.prefix&&i.push(this.options.prefix),t.length&&i.push(t.join(", ")),this._container.innerHTML=i.join(" | ")}},_onLayerAdd:function(t){t.layer.getAttribution&&this.addAttribution(t.layer.getAttribution())},_onLayerRemove:function(t){t.layer.getAttribution&&this.removeAttribution(t.layer.getAttribution())}}),o.Map.mergeOptions({attributionControl:!0}),o.Map.addInitHook(function(){this.options.attributionControl&&(this.attributionControl=(new o.Control.Attribution).addTo(this))}),o.control.attribution=function(t){return new o.Control.Attribution(t)},o.Control.Scale=o.Control.extend({options:{position:"bottomleft",maxWidth:100,metric:!0,imperial:!0,updateWhenIdle:!1},onAdd:function(t){this._map=t;var e="leaflet-control-scale",i=o.DomUtil.create("div",e),n=this.options;return this._addScales(n,e,i),t.on(n.updateWhenIdle?"moveend":"move",this._update,this),t.whenReady(this._update,this),i},onRemove:function(t){t.off(this.options.updateWhenIdle?"moveend":"move",this._update,this)},_addScales:function(t,e,i){t.metric&&(this._mScale=o.DomUtil.create("div",e+"-line",i)),t.imperial&&(this._iScale=o.DomUtil.create("div",e+"-line",i))},_update:function(){var t=this._map.getBounds(),e=t.getCenter().lat,i=6378137*Math.PI*Math.cos(e*Math.PI/180),n=i*(t.getNorthEast().lng-t.getSouthWest().lng)/180,o=this._map.getSize(),s=this.options,a=0;o.x>0&&(a=n*(s.maxWidth/o.x)),this._updateScales(s,a)},_updateScales:function(t,e){t.metric&&e&&this._updateMetric(e),t.imperial&&e&&this._updateImperial(e)},_updateMetric:function(t){var e=this._getRoundNum(t);this._mScale.style.width=this._getScaleWidth(e/t)+"px",this._mScale.innerHTML=1e3>e?e+" m":e/1e3+" km"},_updateImperial:function(t){var e,i,n,o=3.2808399*t,s=this._iScale;o>5280?(e=o/5280,i=this._getRoundNum(e),s.style.width=this._getScaleWidth(i/e)+"px",s.innerHTML=i+" mi"):(n=this._getRoundNum(o),s.style.width=this._getScaleWidth(n/o)+"px",s.innerHTML=n+" ft")},_getScaleWidth:function(t){return Math.round(this.options.maxWidth*t)-10},_getRoundNum:function(t){var e=Math.pow(10,(Math.floor(t)+"").length-1),i=t/e;return i=i>=10?10:i>=5?5:i>=3?3:i>=2?2:1,e*i}}),o.control.scale=function(t){return new o.Control.Scale(t)},o.Control.Layers=o.Control.extend({options:{collapsed:!0,position:"topright",autoZIndex:!0},initialize:function(t,e,i){o.setOptions(this,i),this._layers={},this._lastZIndex=0,this._handlingClick=!1;for(var n in t)this._addLayer(t[n],n);for(n in e)this._addLayer(e[n],n,!0)},onAdd:function(t){return this._initLayout(),this._update(),t.on("layeradd",this._onLayerChange,this).on("layerremove",this._onLayerChange,this),this._container},onRemove:function(t){t.off("layeradd",this._onLayerChange,this).off("layerremove",this._onLayerChange,this)},addBaseLayer:function(t,e){return this._addLayer(t,e),this._update(),this},addOverlay:function(t,e){return this._addLayer(t,e,!0),this._update(),this},removeLayer:function(t){var e=o.stamp(t);return delete this._layers[e],this._update(),this},_initLayout:function(){var t="leaflet-control-layers",e=this._container=o.DomUtil.create("div",t);e.setAttribute("aria-haspopup",!0),o.Browser.touch?o.DomEvent.on(e,"click",o.DomEvent.stopPropagation):o.DomEvent.disableClickPropagation(e).disableScrollPropagation(e);var i=this._form=o.DomUtil.create("form",t+"-list");if(this.options.collapsed){o.Browser.android||o.DomEvent.on(e,"mouseover",this._expand,this).on(e,"mouseout",this._collapse,this);var n=this._layersLink=o.DomUtil.create("a",t+"-toggle",e);n.href="#",n.title="Layers",o.Browser.touch?o.DomEvent.on(n,"click",o.DomEvent.stop).on(n,"click",this._expand,this):o.DomEvent.on(n,"focus",this._expand,this),o.DomEvent.on(i,"click",function(){setTimeout(o.bind(this._onInputClick,this),0)},this),this._map.on("click",this._collapse,this)}else this._expand();this._baseLayersList=o.DomUtil.create("div",t+"-base",i),this._separator=o.DomUtil.create("div",t+"-separator",i),this._overlaysList=o.DomUtil.create("div",t+"-overlays",i),e.appendChild(i)},_addLayer:function(t,e,i){var n=o.stamp(t);this._layers[n]={layer:t,name:e,overlay:i},this.options.autoZIndex&&t.setZIndex&&(this._lastZIndex++,t.setZIndex(this._lastZIndex))},_update:function(){if(this._container){this._baseLayersList.innerHTML="",this._overlaysList.innerHTML="";var t,e,i=!1,n=!1;for(t in this._layers)e=this._layers[t],this._addItem(e),n=n||e.overlay,i=i||!e.overlay;this._separator.style.display=n&&i?"":"none"}},_onLayerChange:function(t){var e=this._layers[o.stamp(t.layer)];if(e){this._handlingClick||this._update();var i=e.overlay?"layeradd"===t.type?"overlayadd":"overlayremove":"layeradd"===t.type?"baselayerchange":null;i&&this._map.fire(i,e)}},_createRadioElement:function(t,i){var n='<input type="radio" class="leaflet-control-layers-selector" name="'+t+'"';i&&(n+=' checked="checked"'),n+="/>";var o=e.createElement("div");return o.innerHTML=n,o.firstChild},_addItem:function(t){var i,n=e.createElement("label"),s=this._map.hasLayer(t.layer);t.overlay?(i=e.createElement("input"),i.type="checkbox",i.className="leaflet-control-layers-selector",i.defaultChecked=s):i=this._createRadioElement("leaflet-base-layers",s),i.layerId=o.stamp(t.layer),o.DomEvent.on(i,"click",this._onInputClick,this);var a=e.createElement("span");a.innerHTML=" "+t.name,n.appendChild(i),n.appendChild(a);var r=t.overlay?this._overlaysList:this._baseLayersList;return r.appendChild(n),n},_onInputClick:function(){var t,e,i,n=this._form.getElementsByTagName("input"),o=n.length;for(this._handlingClick=!0,t=0;o>t;t++)e=n[t],i=this._layers[e.layerId],e.checked&&!this._map.hasLayer(i.layer)?this._map.addLayer(i.layer):!e.checked&&this._map.hasLayer(i.layer)&&this._map.removeLayer(i.layer);this._handlingClick=!1,this._refocusOnMap()},_expand:function(){o.DomUtil.addClass(this._container,"leaflet-control-layers-expanded")},_collapse:function(){this._container.className=this._container.className.replace(" leaflet-control-layers-expanded","")}}),o.control.layers=function(t,e,i){return new o.Control.Layers(t,e,i)},o.PosAnimation=o.Class.extend({includes:o.Mixin.Events,run:function(t,e,i,n){this.stop(),this._el=t,this._inProgress=!0,this._newPos=e,this.fire("start"),t.style[o.DomUtil.TRANSITION]="all "+(i||.25)+"s cubic-bezier(0,0,"+(n||.5)+",1)",o.DomEvent.on(t,o.DomUtil.TRANSITION_END,this._onTransitionEnd,this),o.DomUtil.setPosition(t,e),o.Util.falseFn(t.offsetWidth),this._stepTimer=setInterval(o.bind(this._onStep,this),50)},stop:function(){this._inProgress&&(o.DomUtil.setPosition(this._el,this._getPos()),this._onTransitionEnd(),o.Util.falseFn(this._el.offsetWidth))},_onStep:function(){var t=this._getPos();return t?(this._el._leaflet_pos=t,void this.fire("step")):void this._onTransitionEnd()},_transformRe:/([-+]?(?:\d*\.)?\d+)\D*, ([-+]?(?:\d*\.)?\d+)\D*\)/,_getPos:function(){var e,i,n,s=this._el,a=t.getComputedStyle(s);if(o.Browser.any3d){if(n=a[o.DomUtil.TRANSFORM].match(this._transformRe),!n)return;e=parseFloat(n[1]),i=parseFloat(n[2])}else e=parseFloat(a.left),i=parseFloat(a.top);return new o.Point(e,i,!0)},_onTransitionEnd:function(){o.DomEvent.off(this._el,o.DomUtil.TRANSITION_END,this._onTransitionEnd,this),this._inProgress&&(this._inProgress=!1,this._el.style[o.DomUtil.TRANSITION]="",this._el._leaflet_pos=this._newPos,clearInterval(this._stepTimer),this.fire("step").fire("end"))}}),o.Map.include({setView:function(t,e,n){if(e=e===i?this._zoom:this._limitZoom(e),t=this._limitCenter(o.latLng(t),e,this.options.maxBounds),n=n||{},this._panAnim&&this._panAnim.stop(),this._loaded&&!n.reset&&n!==!0){n.animate!==i&&(n.zoom=o.extend({animate:n.animate},n.zoom),n.pan=o.extend({animate:n.animate},n.pan));var s=this._zoom!==e?this._tryAnimatedZoom&&this._tryAnimatedZoom(t,e,n.zoom):this._tryAnimatedPan(t,n.pan);if(s)return clearTimeout(this._sizeTimer),this}return this._resetView(t,e),this},panBy:function(t,e){if(t=o.point(t).round(),e=e||{},!t.x&&!t.y)return this;if(this._panAnim||(this._panAnim=new o.PosAnimation,this._panAnim.on({step:this._onPanTransitionStep,end:this._onPanTransitionEnd},this)),e.noMoveStart||this.fire("movestart"),e.animate!==!1){o.DomUtil.addClass(this._mapPane,"leaflet-pan-anim");var i=this._getMapPanePos().subtract(t);this._panAnim.run(this._mapPane,i,e.duration||.25,e.easeLinearity)}else this._rawPanBy(t),this.fire("move").fire("moveend");return this},_onPanTransitionStep:function(){this.fire("move")},_onPanTransitionEnd:function(){o.DomUtil.removeClass(this._mapPane,"leaflet-pan-anim"),this.fire("moveend")},_tryAnimatedPan:function(t,e){var i=this._getCenterOffset(t)._floor();return(e&&e.animate)===!0||this.getSize().contains(i)?(this.panBy(i,e),!0):!1}}),o.PosAnimation=o.DomUtil.TRANSITION?o.PosAnimation:o.PosAnimation.extend({run:function(t,e,i,n){this.stop(),this._el=t,this._inProgress=!0,this._duration=i||.25,this._easeOutPower=1/Math.max(n||.5,.2),this._startPos=o.DomUtil.getPosition(t),this._offset=e.subtract(this._startPos),this._startTime=+new Date,this.fire("start"),this._animate()},stop:function(){this._inProgress&&(this._step(),this._complete())},_animate:function(){this._animId=o.Util.requestAnimFrame(this._animate,this),this._step()},_step:function(){var t=+new Date-this._startTime,e=1e3*this._duration;e>t?this._runFrame(this._easeOut(t/e)):(this._runFrame(1),this._complete())},_runFrame:function(t){var e=this._startPos.add(this._offset.multiplyBy(t));o.DomUtil.setPosition(this._el,e),this.fire("step")},_complete:function(){o.Util.cancelAnimFrame(this._animId),this._inProgress=!1,this.fire("end")},_easeOut:function(t){return 1-Math.pow(1-t,this._easeOutPower)}}),o.Map.mergeOptions({zoomAnimation:!0,zoomAnimationThreshold:4}),o.DomUtil.TRANSITION&&o.Map.addInitHook(function(){this._zoomAnimated=this.options.zoomAnimation&&o.DomUtil.TRANSITION&&o.Browser.any3d&&!o.Browser.android23&&!o.Browser.mobileOpera,this._zoomAnimated&&o.DomEvent.on(this._mapPane,o.DomUtil.TRANSITION_END,this._catchTransitionEnd,this)}),o.Map.include(o.DomUtil.TRANSITION?{_catchTransitionEnd:function(t){this._animatingZoom&&t.propertyName.indexOf("transform")>=0&&this._onZoomTransitionEnd()},_nothingToAnimate:function(){return!this._container.getElementsByClassName("leaflet-zoom-animated").length},_tryAnimatedZoom:function(t,e,i){if(this._animatingZoom)return!0;if(i=i||{},!this._zoomAnimated||i.animate===!1||this._nothingToAnimate()||Math.abs(e-this._zoom)>this.options.zoomAnimationThreshold)return!1;var n=this.getZoomScale(e),o=this._getCenterOffset(t)._divideBy(1-1/n),s=this._getCenterLayerPoint()._add(o);return i.animate===!0||this.getSize().contains(o)?(this.fire("movestart").fire("zoomstart"),this._animateZoom(t,e,s,n,null,!0),!0):!1},_animateZoom:function(t,e,i,n,s,a,r){r||(this._animatingZoom=!0),o.DomUtil.addClass(this._mapPane,"leaflet-zoom-anim"),this._animateToCenter=t,this._animateToZoom=e,o.Draggable&&(o.Draggable._disabled=!0),o.Util.requestAnimFrame(function(){this.fire("zoomanim",{center:t,zoom:e,origin:i,scale:n,delta:s,backwards:a})},this)},_onZoomTransitionEnd:function(){this._animatingZoom=!1,o.DomUtil.removeClass(this._mapPane,"leaflet-zoom-anim"),this._resetView(this._animateToCenter,this._animateToZoom,!0,!0),o.Draggable&&(o.Draggable._disabled=!1)}}:{}),o.TileLayer.include({_animateZoom:function(t){this._animating||(this._animating=!0,this._prepareBgBuffer());var e=this._bgBuffer,i=o.DomUtil.TRANSFORM,n=t.delta?o.DomUtil.getTranslateString(t.delta):e.style[i],s=o.DomUtil.getScaleString(t.scale,t.origin);e.style[i]=t.backwards?s+" "+n:n+" "+s},_endZoomAnim:function(){var t=this._tileContainer,e=this._bgBuffer;t.style.visibility="",t.parentNode.appendChild(t),o.Util.falseFn(e.offsetWidth),this._animating=!1},_clearBgBuffer:function(){var t=this._map;!t||t._animatingZoom||t.touchZoom._zooming||(this._bgBuffer.innerHTML="",this._bgBuffer.style[o.DomUtil.TRANSFORM]="")},_prepareBgBuffer:function(){var t=this._tileContainer,e=this._bgBuffer,i=this._getLoadedTilesPercentage(e),n=this._getLoadedTilesPercentage(t);return e&&i>.5&&.5>n?(t.style.visibility="hidden",void this._stopLoadingImages(t)):(e.style.visibility="hidden",e.style[o.DomUtil.TRANSFORM]="",this._tileContainer=e,e=this._bgBuffer=t,this._stopLoadingImages(e),void clearTimeout(this._clearBgBufferTimer))},_getLoadedTilesPercentage:function(t){var e,i,n=t.getElementsByTagName("img"),o=0;for(e=0,i=n.length;i>e;e++)n[e].complete&&o++;return o/i},_stopLoadingImages:function(t){var e,i,n,s=Array.prototype.slice.call(t.getElementsByTagName("img"));for(e=0,i=s.length;i>e;e++)n=s[e],n.complete||(n.onload=o.Util.falseFn,n.onerror=o.Util.falseFn,n.src=o.Util.emptyImageUrl,n.parentNode.removeChild(n))}}),o.Map.include({_defaultLocateOptions:{watch:!1,setView:!1,maxZoom:1/0,timeout:1e4,maximumAge:0,enableHighAccuracy:!1},locate:function(t){if(t=this._locateOptions=o.extend(this._defaultLocateOptions,t),!navigator.geolocation)return this._handleGeolocationError({code:0,message:"Geolocation not supported."}),this;var e=o.bind(this._handleGeolocationResponse,this),i=o.bind(this._handleGeolocationError,this);return t.watch?this._locationWatchId=navigator.geolocation.watchPosition(e,i,t):navigator.geolocation.getCurrentPosition(e,i,t),this},stopLocate:function(){return navigator.geolocation&&navigator.geolocation.clearWatch(this._locationWatchId),this._locateOptions&&(this._locateOptions.setView=!1),this},_handleGeolocationError:function(t){var e=t.code,i=t.message||(1===e?"permission denied":2===e?"position unavailable":"timeout");this._locateOptions.setView&&!this._loaded&&this.fitWorld(),this.fire("locationerror",{code:e,message:"Geolocation error: "+i+"."})},_handleGeolocationResponse:function(t){var e=t.coords.latitude,i=t.coords.longitude,n=new o.LatLng(e,i),s=180*t.coords.accuracy/40075017,a=s/Math.cos(o.LatLng.DEG_TO_RAD*e),r=o.latLngBounds([e-s,i-a],[e+s,i+a]),h=this._locateOptions;if(h.setView){var l=Math.min(this.getBoundsZoom(r),h.maxZoom);this.setView(n,l)}var u={latlng:n,bounds:r,timestamp:t.timestamp};for(var c in t.coords)"number"==typeof t.coords[c]&&(u[c]=t.coords[c]);this.fire("locationfound",u)}})}(window,document);
/*!
*  angular-leaflet-directive 0.8.5 2015-06-29
*  angular-leaflet-directive - An AngularJS directive to easily interact with Leaflet maps
*  git: https://github.com/tombatossals/angular-leaflet-directive
*/
(function(angular){
'use strict';
angular.module("leaflet-directive", []).directive('leaflet',
    ["$q", "leafletData", "leafletMapDefaults", "leafletHelpers", "leafletEvents", function ($q, leafletData, leafletMapDefaults, leafletHelpers, leafletEvents) {
    return {
        restrict: "EA",
        replace: true,
        scope: {
            center         : '=',
            defaults       : '=',
            maxbounds      : '=',
            bounds         : '=',
            markers        : '=',
            legend         : '=',
            geojson        : '=',
            paths          : '=',
            tiles          : '=',
            layers         : '=',
            controls       : '=',
            decorations    : '=',
            eventBroadcast : '=',
            markersWatchOptions : '=',
            geojsonWatchOptions : '='
        },
        transclude: true,
        template: '<div class="angular-leaflet-map"><div ng-transclude></div></div>',
        controller: ["$scope", function ($scope) {
            this._leafletMap = $q.defer();
            this.getMap = function () {
                return this._leafletMap.promise;
            };

            this.getLeafletScope = function() {
                return $scope;
            };
        }],

        link: function(scope, element, attrs, ctrl) {
            var isDefined = leafletHelpers.isDefined,
                defaults = leafletMapDefaults.setDefaults(scope.defaults, attrs.id),
                mapEvents = leafletEvents.getAvailableMapEvents(),
                addEvents = leafletEvents.addEvents;

            scope.mapId =  attrs.id;
            leafletData.setDirectiveControls({}, attrs.id);

            // Set width and height utility functions
            function updateWidth() {
                if (isNaN(attrs.width)) {
                    element.css('width', attrs.width);
                } else {
                    element.css('width', attrs.width + 'px');
                }
            }

            function updateHeight() {
                if (isNaN(attrs.height)) {
                    element.css('height', attrs.height);
                } else {
                    element.css('height', attrs.height + 'px');
                }
            }

            // If the width attribute defined update css
            // Then watch if bound property changes and update css
            if (isDefined(attrs.width)) {
                updateWidth();

                scope.$watch(
                    function () {
                        return element[0].getAttribute('width');
                    },
                    function () {
                        updateWidth();
                        map.invalidateSize();
                    });
            }

            // If the height attribute defined update css
            // Then watch if bound property changes and update css
            if (isDefined(attrs.height)) {
                updateHeight();

                scope.$watch(
                    function () {
                        return element[0].getAttribute('height');
                    },
                    function () {
                        updateHeight();
                        map.invalidateSize();
                    });
            }

            // Create the Leaflet Map Object with the options
            var map = new L.Map(element[0], leafletMapDefaults.getMapCreationDefaults(attrs.id));
            ctrl._leafletMap.resolve(map);

            if (!isDefined(attrs.center)) {
                map.setView([defaults.center.lat, defaults.center.lng], defaults.center.zoom);
            }

            // If no layers nor tiles defined, set the default tileLayer
            if (!isDefined(attrs.tiles) && (!isDefined(attrs.layers))) {
                var tileLayerObj = L.tileLayer(defaults.tileLayer, defaults.tileLayerOptions);
                tileLayerObj.addTo(map);
                leafletData.setTiles(tileLayerObj, attrs.id);
            }

            // Set zoom control configuration
            if (isDefined(map.zoomControl) &&
                isDefined(defaults.zoomControlPosition)) {
                map.zoomControl.setPosition(defaults.zoomControlPosition);
            }

            if (isDefined(map.zoomControl) &&
                defaults.zoomControl===false) {
                map.zoomControl.removeFrom(map);
            }

            if (isDefined(map.zoomsliderControl) &&
                isDefined(defaults.zoomsliderControl) &&
                defaults.zoomsliderControl===false) {
                map.zoomsliderControl.removeFrom(map);
            }


            // if no event-broadcast attribute, all events are broadcasted
            if (!isDefined(attrs.eventBroadcast)) {
                var logic = "broadcast";
                addEvents(map, mapEvents, "eventName", scope, logic);
            }

            // Resolve the map object to the promises
            map.whenReady(function() {
                leafletData.setMap(map, attrs.id);
            });

            scope.$on('$destroy', function () {
                leafletMapDefaults.reset();
                map.remove();
                leafletData.unresolveMap(attrs.id);
            });

            //Handle request to invalidate the map size
            //Up scope using $scope.$emit('invalidateSize')
            //Down scope using $scope.$broadcast('invalidateSize')
            scope.$on('invalidateSize', function() {
                map.invalidateSize();
            });
        }
    };
}]);

angular.module("leaflet-directive").factory('leafletBoundsHelpers', ["$log", "leafletHelpers", function ($log, leafletHelpers) {

    var isArray = leafletHelpers.isArray,
        isNumber = leafletHelpers.isNumber,
        isFunction = leafletHelpers.isFunction,
        isDefined = leafletHelpers.isDefined;

    function _isValidBounds(bounds) {
        return angular.isDefined(bounds) && angular.isDefined(bounds.southWest) &&
               angular.isDefined(bounds.northEast) && angular.isNumber(bounds.southWest.lat) &&
               angular.isNumber(bounds.southWest.lng) && angular.isNumber(bounds.northEast.lat) &&
               angular.isNumber(bounds.northEast.lng);
    }

    return {
        createLeafletBounds: function(bounds) {
            if (_isValidBounds(bounds)) {
                return L.latLngBounds([bounds.southWest.lat, bounds.southWest.lng],
                                      [bounds.northEast.lat, bounds.northEast.lng ]);
            }
        },

        isValidBounds: _isValidBounds,

        createBoundsFromArray: function(boundsArray) {
            if (!(isArray(boundsArray) && boundsArray.length === 2 &&
                  isArray(boundsArray[0]) && isArray(boundsArray[1]) &&
                  boundsArray[0].length === 2 && boundsArray[1].length === 2 &&
                  isNumber(boundsArray[0][0]) && isNumber(boundsArray[0][1]) &&
                  isNumber(boundsArray[1][0]) && isNumber(boundsArray[1][1]))) {
                $log.error("[AngularJS - Leaflet] The bounds array is not valid.");
                return;
            }

            return {
                northEast: {
                    lat: boundsArray[0][0],
                    lng: boundsArray[0][1]
                },
                southWest: {
                    lat: boundsArray[1][0],
                    lng: boundsArray[1][1]
                }
            };
        },

        createBoundsFromLeaflet: function(lfBounds) {
            if (!(isDefined(lfBounds) && isFunction(lfBounds.getNorthEast) && isFunction(lfBounds.getSouthWest))) {
                $log.error("[AngularJS - Leaflet] The leaflet bounds is not valid object.");
                return;
            }

            var northEast = lfBounds.getNorthEast(),
                southWest = lfBounds.getSouthWest();

            return {
                northEast: {
                    lat: northEast.lat,
                    lng: northEast.lng
                },
                southWest: {
                    lat: southWest.lat,
                    lng: southWest.lng
                }
            };
        }
    };
}]);

angular.module("leaflet-directive").factory('leafletControlHelpers', ["$rootScope", "$log", "leafletHelpers", "leafletMapDefaults", function ($rootScope, $log, leafletHelpers, leafletMapDefaults) {
    var isDefined = leafletHelpers.isDefined;
    var isObject = leafletHelpers.isObject;
    var _controls = {};

    var _controlLayersMustBeVisible = function(baselayers, overlays, mapId) {
        var defaults = leafletMapDefaults.getDefaults(mapId);
        if(!defaults.controls.layers.visible) {
            return false;
        }

        var atLeastOneControlItemMustBeShown = false;

        if (isObject(baselayers)) {
            Object.keys(baselayers).forEach(function(key) {
                var layer = baselayers[key];
                if (!isDefined(layer.layerOptions) || layer.layerOptions.showOnSelector !== false) {
                    atLeastOneControlItemMustBeShown = true;
                }
            });
        }

        if (isObject(overlays)) {
            Object.keys(overlays).forEach(function(key) {
                var layer = overlays[key];
                if (!isDefined(layer.layerParams) || layer.layerParams.showOnSelector !== false) {
                    atLeastOneControlItemMustBeShown = true;
                }
            });
        }

        return atLeastOneControlItemMustBeShown;
    };

    var _createLayersControl = function(mapId) {
        var defaults = leafletMapDefaults.getDefaults(mapId);
        var controlOptions = {
            collapsed: defaults.controls.layers.collapsed,
            position: defaults.controls.layers.position,
            autoZIndex: false
        };

        angular.extend(controlOptions, defaults.controls.layers.options);

        var control;
        if(defaults.controls.layers && isDefined(defaults.controls.layers.control)) {
			control = defaults.controls.layers.control.apply(this, [[], [], controlOptions]);
		} else {
			control = new L.control.layers([], [], controlOptions);
		}

        return control;
    };

    return {
        layersControlMustBeVisible: _controlLayersMustBeVisible,

        updateLayersControl: function(map, mapId, loaded, baselayers, overlays, leafletLayers) {
            var i;
            var _layersControl = _controls[mapId];
            var mustBeLoaded = _controlLayersMustBeVisible(baselayers, overlays, mapId);

            if (isDefined(_layersControl) && loaded) {
                for (i in leafletLayers.baselayers) {
                    _layersControl.removeLayer(leafletLayers.baselayers[i]);
                }
                for (i in leafletLayers.overlays) {
                    _layersControl.removeLayer(leafletLayers.overlays[i]);
                }
                map.removeControl(_layersControl);
                delete _controls[mapId];
            }

            if (mustBeLoaded) {
                _layersControl = _createLayersControl(mapId);
                _controls[mapId] = _layersControl;
                for (i in baselayers) {
                    var hideOnSelector = isDefined(baselayers[i].layerOptions) &&
                                         baselayers[i].layerOptions.showOnSelector === false;
                    if (!hideOnSelector && isDefined(leafletLayers.baselayers[i])) {
                        _layersControl.addBaseLayer(leafletLayers.baselayers[i], baselayers[i].name);
                    }
                }
                for (i in overlays) {
                	var hideOverlayOnSelector = isDefined(overlays[i].layerParams) &&
                            overlays[i].layerParams.showOnSelector === false;
                    if (!hideOverlayOnSelector && isDefined(leafletLayers.overlays[i])) {
                        _layersControl.addOverlay(leafletLayers.overlays[i], overlays[i].name);
                    }
                }

                map.addControl(_layersControl);
            }
            return mustBeLoaded;
        }
    };
}]);

angular.module("leaflet-directive").service('leafletData', ["$log", "$q", "leafletHelpers", function ($log, $q, leafletHelpers) {
    var getDefer = leafletHelpers.getDefer,
        getUnresolvedDefer = leafletHelpers.getUnresolvedDefer,
        setResolvedDefer = leafletHelpers.setResolvedDefer;

    var _private = {};
    var self = this;

    var upperFirst = function (string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    };

    var _privateItems = [
        'map',
        'tiles',
        'layers',
        'paths',
        'markers',
        'geoJSON',
        'UTFGrid', //odd ball on naming convention keeping to not break
        'decorations',
        'directiveControls'];

    //init
    _privateItems.forEach(function(itemName){
        _private[itemName] = {};
    });

    this.unresolveMap = function (scopeId) {
        var id = leafletHelpers.obtainEffectiveMapId(_private.map, scopeId);
        _privateItems.forEach(function (itemName) {
            _private[itemName][id] = undefined;
        });
    };

    //int repetitive stuff (get and sets)
    _privateItems.forEach(function (itemName) {
        var name = upperFirst(itemName);
        self['set' + name] = function (lObject, scopeId) {
            var defer = getUnresolvedDefer(_private[itemName], scopeId);
            defer.resolve(lObject);
            setResolvedDefer(_private[itemName], scopeId);
        };

        self['get' + name] = function (scopeId) {
            var defer = getDefer(_private[itemName], scopeId);
            return defer.promise;
        };
    });
}]);

angular.module("leaflet-directive")
.service('leafletDirectiveControlsHelpers', ["$log", "leafletData", "leafletHelpers", function ($log, leafletData, leafletHelpers) {
    var _isDefined = leafletHelpers.isDefined,
        _isString = leafletHelpers.isString,
        _isObject = leafletHelpers.isObject,
        _mainErrorHeader = leafletHelpers.errorHeader;

    var _errorHeader = _mainErrorHeader + '[leafletDirectiveControlsHelpers';

    var _extend = function(id, thingToAddName, createFn, cleanFn){
        var _fnHeader = _errorHeader + '.extend] ';
        var extender = {};
        if(!_isDefined(thingToAddName)){
            $log.error(_fnHeader + 'thingToAddName cannot be undefined');
            return;
        }

        if(_isString(thingToAddName) && _isDefined(createFn) && _isDefined(cleanFn)){
            extender[thingToAddName] = {
                create: createFn,
                clean: cleanFn
            };
        }
        else if(_isObject(thingToAddName) && !_isDefined(createFn) && !_isDefined(cleanFn)){
            extender = thingToAddName;
        }
        else{
            $log.error(_fnHeader + 'incorrect arguments');
            return;
        }

        //add external control to create / destroy markers without a watch
        leafletData.getDirectiveControls().then(function(controls){
            angular.extend(controls, extender);
            leafletData.setDirectiveControls(controls, id);
        });
    };

    return {
        extend: _extend
    };
}]);

angular.module("leaflet-directive").factory('leafletEvents',
    ["leafletMapEvents", "leafletMarkerEvents", "leafletPathEvents", "leafletIterators", function (leafletMapEvents, leafletMarkerEvents, leafletPathEvents, leafletIterators) {
        //NOTE THIS SHOULD BE DEPRECATED infavor of getting a specific events helper
        var instance = angular.extend({},
            leafletMapEvents, {
                bindMarkerEvents: leafletMarkerEvents.bindEvents,
                getAvailableMarkerEvents: leafletMarkerEvents.getAvailableEvents
            }, leafletPathEvents);

        var genDispatchMapEvent = instance.genDispatchMapEvent;

        instance.addEvents =  function(map, mapEvents, contextName, scope, logic){
            leafletIterators.each(mapEvents, function(eventName) {
                var context = {};
                context[contextName] = eventName;
                map.on(eventName, genDispatchMapEvent(scope, eventName, logic), context);
            });
        };

        return instance;
}]);

angular.module("leaflet-directive")
.service('leafletGeoJsonHelpers', ["leafletHelpers", "leafletIterators", function (leafletHelpers, leafletIterators) {
    var lHlp = leafletHelpers,
    lIt = leafletIterators;
    var Point = function(lat,lng){
        this.lat = lat;
        this.lng = lng;
        return this;
    };

    var _getLat = function(value) {
        if (Array.isArray(value) && value.length === 2) {
            return value[1];
        } else if (lHlp.isDefined(value.type) && value.type === 'Point') {
            return +value.coordinates[1];
        } else {
            return +value.lat;
        }
    };

    var _getLng = function(value) {
        if (Array.isArray(value) && value.length === 2) {
            return value[0];
        } else if (lHlp.isDefined(value.type) && value.type === 'Point') {
            return +value.coordinates[0];
        } else {
            return +value.lng;
        }
    };

    var _validateCoords = function(coords) {
        if (lHlp.isUndefined(coords)) {
            return false;
        }
        if (lHlp.isArray(coords)) {
            if (coords.length === 2 && lHlp.isNumber(coords[0]) && lHlp.isNumber(coords[1])) {
                return true;
            }
        } else if (lHlp.isDefined(coords.type)) {
            if (
                coords.type === 'Point' && lHlp.isArray(coords.coordinates) &&
                coords.coordinates.length === 2  &&
                lHlp.isNumber(coords.coordinates[0]) &&
                lHlp.isNumber(coords.coordinates[1])) {
                    return true;
                }
            }

            var ret = lIt.all(['lat', 'lng'], function(pos){
                return lHlp.isDefined(coords[pos]) && lHlp.isNumber(coords[pos]);
            });
            return ret;
        };

        var _getCoords = function(value) {
            if (!value || !_validateCoords(value)) {
                return;
            }
            var p =  null;
            if (Array.isArray(value) && value.length === 2) {
                p = new Point(value[1], value[0]);
            } else if (lHlp.isDefined(value.type) && value.type === 'Point') {
                p = new Point(value.coordinates[1], value.coordinates[0]);
            } else {
                return value;
            }
            //note angular.merge is avail in angular 1.4.X we might want to fill it here
            return angular.extend(value, p);//tap on lat, lng if it doesnt exist
        };


        return {
            getLat: _getLat,
            getLng: _getLng,
            validateCoords: _validateCoords,
            getCoords: _getCoords
        };
    }]);

angular.module("leaflet-directive").factory('leafletHelpers', ["$q", "$log", function ($q, $log) {
    var _errorHeader = '[AngularJS - Leaflet] ';
    var _copy = angular.copy;
    var _clone = _copy;
    /*
    For parsing paths to a field in an object

    Example:
    var obj = {
        bike:{
         1: 'hi'
         2: 'foo'
        }
    };
    _getObjectValue(obj,"bike.1") returns 'hi'
    this is getPath in ui-gmap
     */
    var _getObjectValue = function(object, pathStr) {
        var obj;
        if(!object || !angular.isObject(object))
            return;
        //if the key is not a sting then we already have the value
        if ((pathStr === null) || !angular.isString(pathStr)) {
            return pathStr;
        }
        obj = object;
        pathStr.split('.').forEach(function(value) {
            if (obj) {
                obj = obj[value];
            }
        });
        return obj;
    };

    /*
     Object Array Notation
     _getObjectArrayPath("bike.one.two")
     returns:
     'bike["one"]["two"]'
     */
    var _getObjectArrayPath = function(pathStr){
        return pathStr.split('.').reduce(function(previous, current) {
            return previous + '["'+ current + '"]';
        });
    };

    /* Object Dot Notation
     _getObjectPath(["bike","one","two"])
     returns:
     "bike.one.two"
     */
    var _getObjectDotPath = function(arrayOfStrings){
        return arrayOfStrings.reduce(function(previous, current) {
            return previous + '.' + current;
        });
    };

    function _obtainEffectiveMapId(d, mapId) {
        var id, i;
        if (!angular.isDefined(mapId)) {
        if (Object.keys(d).length === 0) {
            id = "main";
        } else if (Object.keys(d).length >= 1) {
            for (i in d) {
                if (d.hasOwnProperty(i)) {
                    id = i;
                }
            }
        } else if (Object.keys(d).length === 0) {
            id = "main";
        } else {
                $log.error(_errorHeader + "- You have more than 1 map on the DOM, you must provide the map ID to the leafletData.getXXX call");
            }
        } else {
            id = mapId;
        }

        return id;
    }

    function _getUnresolvedDefer(d, mapId) {
        var id = _obtainEffectiveMapId(d, mapId),
            defer;

        if (!angular.isDefined(d[id]) || d[id].resolvedDefer === true) {
            defer = $q.defer();
            d[id] = {
                defer: defer,
                resolvedDefer: false
            };
        } else {
            defer = d[id].defer;
        }

        return defer;
    }

    var _isDefined = function(value) {
        return angular.isDefined(value) && value !== null;
    };
    var _isUndefined = function(value){
        return !_isDefined(value);
    };

    return {
        copy:_copy,
        clone:_clone,
        errorHeader: _errorHeader,
        getObjectValue: _getObjectValue,
        getObjectArrayPath:_getObjectArrayPath,
        getObjectDotPath: _getObjectDotPath,
        defaultTo: function(val, _default){
            return _isDefined(val) ? val : _default;
        },
        //mainly for checking attributes of directives lets keep this minimal (on what we accept)
        isTruthy: function(val){
            return val === 'true' || val === true;
        },
        //Determine if a reference is {}
        isEmpty: function(value) {
            return Object.keys(value).length === 0;
        },

        //Determine if a reference is undefined or {}
        isUndefinedOrEmpty: function (value) {
            return (angular.isUndefined(value) || value === null) || Object.keys(value).length === 0;
        },

        // Determine if a reference is defined
        isDefined: _isDefined,
        isUndefined:_isUndefined,
        isNumber: angular.isNumber,
        isString: angular.isString,
        isArray: angular.isArray,
        isObject: angular.isObject,
        isFunction: angular.isFunction,
        equals: angular.equals,

        isValidCenter: function(center) {
            return angular.isDefined(center) && angular.isNumber(center.lat) &&
                   angular.isNumber(center.lng) && angular.isNumber(center.zoom);
        },

        isValidPoint: function(point) {
            if (!angular.isDefined(point)) {
                return false;
            }
            if (angular.isArray(point)) {
                return point.length === 2 && angular.isNumber(point[0]) && angular.isNumber(point[1]);
            }
            return angular.isNumber(point.lat) && angular.isNumber(point.lng);
        },

        isSameCenterOnMap: function(centerModel, map) {
            var mapCenter = map.getCenter();
            var zoom = map.getZoom();
            if (centerModel.lat && centerModel.lng &&
                mapCenter.lat.toFixed(4) === centerModel.lat.toFixed(4) &&
                mapCenter.lng.toFixed(4) === centerModel.lng.toFixed(4) &&
                zoom === centerModel.zoom) {
                    return true;
            }
            return false;
        },

        safeApply: function($scope, fn) {
            var phase = $scope.$root.$$phase;
            if (phase === '$apply' || phase === '$digest') {
                $scope.$eval(fn);
            } else {
                $scope.$evalAsync(fn);
            }
        },

        obtainEffectiveMapId: _obtainEffectiveMapId,

        getDefer: function(d, mapId) {
            var id = _obtainEffectiveMapId(d, mapId),
                defer;
            if (!angular.isDefined(d[id]) || d[id].resolvedDefer === false) {
                defer = _getUnresolvedDefer(d, mapId);
            } else {
                defer = d[id].defer;
            }
            return defer;
        },

        getUnresolvedDefer: _getUnresolvedDefer,

        setResolvedDefer: function(d, mapId) {
            var id = _obtainEffectiveMapId(d, mapId);
            d[id].resolvedDefer = true;
        },

        FullScreenControlPlugin: {
            isLoaded: function() {
                return angular.isDefined(L.Control.Fullscreen);
            }
        },

        SearchControlPlugin: {
            isLoaded: function() {
                return angular.isDefined(L.Control.Search);
            }
        },

        MiniMapControlPlugin: {
            isLoaded: function() {
                return angular.isDefined(L.Control.MiniMap);
            }
        },

        AwesomeMarkersPlugin: {
            isLoaded: function() {
                return angular.isDefined(L.AwesomeMarkers) && angular.isDefined(L.AwesomeMarkers.Icon);
            },
            is: function(icon) {
                if (this.isLoaded()) {
                    return icon instanceof L.AwesomeMarkers.Icon;
                } else {
                    return false;
                }
            },
            equal: function (iconA, iconB) {
                if (!this.isLoaded()) {
                    return false;
                }
                if (this.is(iconA)) {
                    return angular.equals(iconA, iconB);
                } else {
                    return false;
                }
            }
        },

        PolylineDecoratorPlugin: {
            isLoaded: function() {
                if (angular.isDefined(L.PolylineDecorator)) {
                    return true;
                } else {
                    return false;
                }
            },
            is: function(decoration) {
                if (this.isLoaded()) {
                    return decoration instanceof L.PolylineDecorator;
                } else {
                    return false;
                }
            },
            equal: function(decorationA, decorationB) {
                if (!this.isLoaded()) {
                    return false;
                }
                if (this.is(decorationA)) {
                    return angular.equals(decorationA, decorationB);
                } else {
                    return false;
                }
            }
        },

        MakiMarkersPlugin: {
            isLoaded: function() {
                if (angular.isDefined(L.MakiMarkers) && angular.isDefined(L.MakiMarkers.Icon)) {
                    return true;
                } else {
                    return false;
                }
            },
            is: function(icon) {
                if (this.isLoaded()) {
                    return icon instanceof L.MakiMarkers.Icon;
                } else {
                    return false;
                }
            },
            equal: function (iconA, iconB) {
                if (!this.isLoaded()) {
                    return false;
                }
                if (this.is(iconA)) {
                    return angular.equals(iconA, iconB);
                } else {
                    return false;
                }
            }
        },
        ExtraMarkersPlugin: {
            isLoaded: function () {
                if (angular.isDefined(L.ExtraMarkers) && angular.isDefined(L.ExtraMarkers.Icon)) {
                    return true;
                } else {
                    return false;
                }
            },
            is: function (icon) {
                if (this.isLoaded()) {
                    return icon instanceof L.ExtraMarkers.Icon;
                } else {
                    return false;
                }
            },
            equal: function (iconA, iconB) {
                if (!this.isLoaded()) {
                    return false;
                }
                if (this.is(iconA)) {
                    return angular.equals(iconA, iconB);
                } else {
                    return false;
                }
            }
        },
        LabelPlugin: {
            isLoaded: function() {
                return angular.isDefined(L.Label);
            },
            is: function(layer) {
                if (this.isLoaded()) {
                    return layer instanceof L.MarkerClusterGroup;
                } else {
                    return false;
                }
            }
        },
        MarkerClusterPlugin: {
            isLoaded: function() {
                return angular.isDefined(L.MarkerClusterGroup);
            },
            is: function(layer) {
                if (this.isLoaded()) {
                    return layer instanceof L.MarkerClusterGroup;
                } else {
                    return false;
                }
            }
        },
        GoogleLayerPlugin: {
            isLoaded: function() {
                return angular.isDefined(L.Google);
            },
            is: function(layer) {
                if (this.isLoaded()) {
                    return layer instanceof L.Google;
                } else {
                    return false;
                }
            }
        },
        ChinaLayerPlugin: {
            isLoaded: function() {
                return angular.isDefined(L.tileLayer.chinaProvider);
            }
        },
        HeatLayerPlugin: {
            isLoaded: function() {
                return angular.isDefined(L.heatLayer);
            }
        },
        WebGLHeatMapLayerPlugin: {
            isLoaded: function() {
                return angular.isDefined(L.TileLayer.WebGLHeatMap);
            }
        },
        BingLayerPlugin: {
            isLoaded: function() {
                return angular.isDefined(L.BingLayer);
            },
            is: function(layer) {
                if (this.isLoaded()) {
                    return layer instanceof L.BingLayer;
                } else {
                    return false;
                }
            }
        },
        WFSLayerPlugin: {
            isLoaded: function() {
                return L.GeoJSON.WFS !== undefined;
            },
            is: function(layer) {
                if (this.isLoaded()) {
                    return layer instanceof L.GeoJSON.WFS;
                } else {
                    return false;
                }
            }
        },
        AGSBaseLayerPlugin: {
            isLoaded: function() {
                return L.esri !== undefined && L.esri.basemapLayer !== undefined;
            },
            is: function (layer) {
                if (this.isLoaded()) {
                    return layer instanceof L.esri.basemapLayer;
                } else {
                    return false;
                }
            }
        },
        AGSLayerPlugin: {
            isLoaded: function() {
                return lvector !== undefined && lvector.AGS !== undefined;
            },
            is: function(layer) {
                if (this.isLoaded()) {
                    return layer instanceof lvector.AGS;
                } else {
                    return false;
                }
            }
        },
        AGSFeatureLayerPlugin: {
            isLoaded: function() {
                return L.esri !== undefined && L.esri.featureLayer !== undefined;
            },
            is: function (layer) {
                if (this.isLoaded()) {
                    return layer instanceof L.esri.featureLayer;
                } else {
                    return false;
                }
            }
        },
        AGSTiledMapLayerPlugin: {
            isLoaded: function() {
                return L.esri !== undefined && L.esri.tiledMapLayer !== undefined;
            },
            is: function (layer) {
                if (this.isLoaded()) {
                    return layer instanceof L.esri.tiledMapLayer;
                } else {
                    return false;
                }
            }
        },
        AGSDynamicMapLayerPlugin: {
            isLoaded: function () {
                return L.esri !== undefined && L.esri.dynamicMapLayer !== undefined;
            },
            is: function (layer) {
                if (this.isLoaded()) {
                    return layer instanceof L.esri.dynamicMapLayer;
                } else {
                    return false;
                }
            }
        },
        AGSImageMapLayerPlugin: {
            isLoaded: function () {
                return L.esri !== undefined && L.esri.imageMapLayer !== undefined;
            },
            is: function (layer) {
                if (this.isLoaded()) {
                    return layer instanceof L.esri.imageMapLayer;
                } else {
                    return false;
                }
            }
        },
        AGSClusteredLayerPlugin: {
            isLoaded: function () {
                return L.esri !== undefined && L.esri.clusteredFeatureLayer !== undefined;
            },
            is: function (layer) {
                if (this.isLoaded()) {
                    return layer instanceof L.esri.clusteredFeatureLayer;
                } else {
                    return false;
                }
            }
        },
        AGSHeatmapLayerPlugin: {
            isLoaded: function () {
                return L.esri !== undefined && L.esri.heatmapFeatureLayer !== undefined;
            },
            is: function (layer) {
                if (this.isLoaded()) {
                    return layer instanceof L.esri.heatmapFeatureLayer;
                } else {
                    return false;
                }
            }
        },
        YandexLayerPlugin: {
            isLoaded: function() {
                return angular.isDefined(L.Yandex);
            },
            is: function(layer) {
                if (this.isLoaded()) {
                    return layer instanceof L.Yandex;
                } else {
                    return false;
                }
            }
        },
        GeoJSONPlugin: {
            isLoaded: function(){
                return angular.isDefined(L.TileLayer.GeoJSON);
            },
            is: function(layer) {
                if (this.isLoaded()) {
                    return layer instanceof L.TileLayer.GeoJSON;
                } else {
                    return false;
                }
            }
        },
        UTFGridPlugin: {
            isLoaded: function(){
                return angular.isDefined(L.UtfGrid);
            },
            is: function(layer) {
                if (this.isLoaded()) {
                    return layer instanceof L.UtfGrid;
                } else {
                    $log.error('[AngularJS - Leaflet] No UtfGrid plugin found.');
                    return false;
                }
            }
        },
        CartoDB: {
            isLoaded: function(){
                return cartodb;
            },
            is: function(/*layer*/) {
                return true;
                /*
                if (this.isLoaded()) {
                    return layer instanceof L.TileLayer.GeoJSON;
                } else {
                    return false;
                }*/
            }
        },
        Leaflet: {
            DivIcon: {
                is: function(icon) {
                    return icon instanceof L.DivIcon;
                },
                equal: function(iconA, iconB) {
                    if (this.is(iconA)) {
                        return angular.equals(iconA, iconB);
                    } else {
                        return false;
                    }
                }
            },
            Icon: {
                is: function(icon) {
                    return icon instanceof L.Icon;
                },
                equal: function(iconA, iconB) {
                    if (this.is(iconA)) {
                        return angular.equals(iconA, iconB);
                    } else {
                        return false;
                    }
                }
            }
        },
        /*
         watchOptions - object to set deep nested watches and turn off watches all together
         (rely on control / functional updates)
         watchOptions - Object
             doWatch:boolean
             isDeep:boolean (sets $watch(function,isDeep))
             individual
                 doWatch:boolean
                 isDeep:boolean
         */
        //legacy defaults
        watchOptions: {
            doWatch:true,
            isDeep: true,
            individual:{
                doWatch:true,
                isDeep: true
            }
        }
    };
}]);

angular.module('leaflet-directive').service('leafletIterators', ["$log", "leafletHelpers", function ($log, leafletHelpers) {

  var lHlp = leafletHelpers,
  errorHeader = leafletHelpers.errorHeader + 'leafletIterators: ';

  //BEGIN COPY from underscore
  var _keys = Object.keys;
  var _isFunction = lHlp.isFunction;
  var _isObject = lHlp.isObject;

  // Helper for collection methods to determine whether a collection
  // should be iterated as an array or as an object
  // Related: http://people.mozilla.org/~jorendorff/es6-draft.html#sec-tolength
  var MAX_ARRAY_INDEX = Math.pow(2, 53) - 1;

  var _isArrayLike = function(collection) {
    var length = collection !== null && collection.length;
    return  lHlp.isNumber(length) && length >= 0 && length <= MAX_ARRAY_INDEX;
  };

  // Keep the identity function around for default iteratees.
  var _identity = function(value) {
    return value;
  };

  var _property = function(key) {
    return function(obj) {
      return obj === null ? void 0 : obj[key];
    };
  };

  // Internal function that returns an efficient (for current engines) version
  // of the passed-in callback, to be repeatedly applied in other Underscore
  // functions.
  var optimizeCb = function(func, context, argCount) {
    if (context === void 0) return func;
    switch (argCount === null ? 3 : argCount) {
      case 1: return function(value) {
        return func.call(context, value);
      };
      case 2: return function(value, other) {
        return func.call(context, value, other);
      };
      case 3: return function(value, index, collection) {
        return func.call(context, value, index, collection);
      };
      case 4: return function(accumulator, value, index, collection) {
        return func.call(context, accumulator, value, index, collection);
      };
    }
    return function() {
      return func.apply(context, arguments);
    };
  };

  // An internal function for creating assigner functions.
  var createAssigner = function(keysFunc, undefinedOnly) {
    return function(obj) {
      var length = arguments.length;
      if (length < 2 || obj === null) return obj;
      for (var index = 1; index < length; index++) {
        var source = arguments[index],
            keys = keysFunc(source),
            l = keys.length;
        for (var i = 0; i < l; i++) {
          var key = keys[i];
          if (!undefinedOnly || obj[key] === void 0) obj[key] = source[key];
        }
      }
      return obj;
    };
  };

  // Assigns a given object with all the own properties in the passed-in object(s)
  // (https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object/assign)
  var _extendOwn, _assign = null;
  _extendOwn = _assign = createAssigner(_keys);

  // Returns whether an object has a given set of `key:value` pairs.
  var _isMatch = function(object, attrs) {
    var keys = _keys(attrs), length = keys.length;
    if (object === null) return !length;
    var obj = Object(object);
    for (var i = 0; i < length; i++) {
      var key = keys[i];
      if (attrs[key] !== obj[key] || !(key in obj)) return false;
    }
    return true;
  };

  // Returns a predicate for checking whether an object has a given set of
  // `key:value` pairs.
  var _matcher, _matches = null;
  _matcher = _matches = function(attrs) {
    attrs = _extendOwn({}, attrs);
    return function(obj) {
      return _isMatch(obj, attrs);
    };
  };


  // A mostly-internal function to generate callbacks that can be applied
  // to each element in a collection, returning the desired result — either
  // identity, an arbitrary callback, a property matcher, or a property accessor.
  var cb = function(value, context, argCount) {
    if (value === null) return _identity;
    if (_isFunction(value)) return optimizeCb(value, context, argCount);
    if (_isObject(value)) return _matcher(value);
    return _property(value);
  };

  var _every, _all = null;
  _every = _all = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var keys = !_isArrayLike(obj) && _keys(obj),
    length = (keys || obj).length;
    for (var index = 0; index < length; index++) {
      var currentKey = keys ? keys[index] : index;
      if (!predicate(obj[currentKey], currentKey, obj)) return false;
    }
    return true;
  };

  //END COPY fron underscore

  var _hasErrors = function(collection, cb, ignoreCollection, cbName){
    if(!ignoreCollection) {
      if (!lHlp.isDefined(collection) || !lHlp.isDefined(cb)) {
        return true;
      }
    }
    if(!lHlp.isFunction(cb)){
      cbName = lHlp.defaultTo(cb,'cb');
      $log.error(errorHeader + cbName + ' is not a function');
      return true;
    }
    return false;
  };

  var _iterate = function(collection, externalCb, internalCb){
    if(_hasErrors(undefined, internalCb, true, 'internalCb')){
      return;
    }
    if(!_hasErrors(collection, externalCb)){
      for(var key in collection){
        internalCb(collection[key], key);
      }
    }
  };

  //see http://jsperf.com/iterators/3
  //utilizing for in is way faster
  var _each = function(collection, cb){
    _iterate(collection, cb, function(val, key){
      cb(val, key);
    });
  };

  return {
    each:_each,
    forEach: _each,
    every: _every,
    all: _all
  };
}]);

angular.module("leaflet-directive")
.factory('leafletLayerHelpers', ["$rootScope", "$log", "leafletHelpers", "leafletIterators", function ($rootScope, $log, leafletHelpers, leafletIterators) {
    var Helpers = leafletHelpers;
    var isString = leafletHelpers.isString;
    var isObject = leafletHelpers.isObject;
    var isArray = leafletHelpers.isArray;
    var isDefined = leafletHelpers.isDefined;
    var errorHeader = leafletHelpers.errorHeader;
    var $it = leafletIterators;

    var utfGridCreateLayer = function(params) {
        if (!Helpers.UTFGridPlugin.isLoaded()) {
            $log.error('[AngularJS - Leaflet] The UTFGrid plugin is not loaded.');
            return;
        }
        var utfgrid = new L.UtfGrid(params.url, params.pluginOptions);

        utfgrid.on('mouseover', function(e) {
            $rootScope.$broadcast('leafletDirectiveMap.utfgridMouseover', e);
        });

        utfgrid.on('mouseout', function(e) {
            $rootScope.$broadcast('leafletDirectiveMap.utfgridMouseout', e);
        });

        utfgrid.on('click', function(e) {
            $rootScope.$broadcast('leafletDirectiveMap.utfgridClick', e);
        });

        utfgrid.on('mousemove', function(e) {
            $rootScope.$broadcast('leafletDirectiveMap.utfgridMousemove', e);
        });

        return utfgrid;
    };

    var layerTypes = {
        xyz: {
            mustHaveUrl: true,
            createLayer: function(params) {
                return L.tileLayer(params.url, params.options);
            }
        },
        mapbox: {
            mustHaveKey: true,
            createLayer: function(params) {
                var version = 3;
                if(isDefined(params.options.version) && params.options.version === 4) {
                    version = params.options.version;
                }
                var url = version === 3?
                    '//{s}.tiles.mapbox.com/v3/' + params.key + '/{z}/{x}/{y}.png':
                    '//api.tiles.mapbox.com/v4/' + params.key + '/{z}/{x}/{y}.png?access_token=' + params.apiKey;
                return L.tileLayer(url, params.options);
            }
        },
        geoJSON: {
            mustHaveUrl: true,
            createLayer: function(params) {
                if (!Helpers.GeoJSONPlugin.isLoaded()) {
                    return;
                }
                return new L.TileLayer.GeoJSON(params.url, params.pluginOptions, params.options);
            }
        },
        utfGrid: {
            mustHaveUrl: true,
            createLayer: utfGridCreateLayer
        },
        cartodbTiles: {
            mustHaveKey: true,
            createLayer: function(params) {
                var url = '//' + params.user + '.cartodb.com/api/v1/map/' + params.key + '/{z}/{x}/{y}.png';
                return L.tileLayer(url, params.options);
            }
        },
        cartodbUTFGrid: {
            mustHaveKey: true,
            mustHaveLayer : true,
            createLayer: function(params) {
                params.url = '//' + params.user + '.cartodb.com/api/v1/map/' + params.key + '/' + params.layer + '/{z}/{x}/{y}.grid.json';
                return utfGridCreateLayer(params);
            }
        },
        cartodbInteractive: {
            mustHaveKey: true,
            mustHaveLayer : true,
            createLayer: function(params) {
                var tilesURL = '//' + params.user + '.cartodb.com/api/v1/map/' + params.key + '/{z}/{x}/{y}.png';
                var tileLayer = L.tileLayer(tilesURL, params.options);
                params.url = '//' + params.user + '.cartodb.com/api/v1/map/' + params.key + '/' + params.layer + '/{z}/{x}/{y}.grid.json';
                var utfLayer = utfGridCreateLayer(params);
                return L.layerGroup([tileLayer, utfLayer]);
            }
        },
        wms: {
            mustHaveUrl: true,
            createLayer: function(params) {
                return L.tileLayer.wms(params.url, params.options);
            }
        },
        wmts: {
            mustHaveUrl: true,
            createLayer: function(params) {
                return L.tileLayer.wmts(params.url, params.options);
            }
        },
        wfs: {
            mustHaveUrl: true,
            mustHaveLayer : true,
            createLayer: function(params) {
                if (!Helpers.WFSLayerPlugin.isLoaded()) {
                    return;
                }
                var options = angular.copy(params.options);
                if(options.crs && 'string' === typeof options.crs) {
                    /*jshint -W061 */
                    options.crs = eval(options.crs);
                }
                return new L.GeoJSON.WFS(params.url, params.layer, options);
            }
        },
        group: {
            mustHaveUrl: false,
            createLayer: function (params) {
                var lyrs = [];
                $it.each(params.options.layers, function(l){
                  lyrs.push(createLayer(l));
                });
                return L.layerGroup(lyrs);
            }
        },
        featureGroup: {
            mustHaveUrl: false,
            createLayer: function () {
                return L.featureGroup();
            }
        },
        google: {
            mustHaveUrl: false,
            createLayer: function(params) {
                var type = params.type || 'SATELLITE';
                if (!Helpers.GoogleLayerPlugin.isLoaded()) {
                    return;
                }
                return new L.Google(type, params.options);
            }
        },
        china:{
            mustHaveUrl:false,
            createLayer:function(params){
                var type = params.type || '';
                if(!Helpers.ChinaLayerPlugin.isLoaded()){
                    return;
                }
                return L.tileLayer.chinaProvider(type, params.options);
            }
        },
        agsBase: {
            mustHaveLayer : true,
            createLayer: function (params) {
                if (!Helpers.AGSBaseLayerPlugin.isLoaded()) {
                    return;
                }
                return L.esri.basemapLayer(params.layer, params.options);
            }
        },
        ags: {
            mustHaveUrl: true,
            createLayer: function(params) {
                if (!Helpers.AGSLayerPlugin.isLoaded()) {
                    return;
                }

                var options = angular.copy(params.options);
                angular.extend(options, {
                    url: params.url
                });
                var layer = new lvector.AGS(options);
                layer.onAdd = function(map) {
                    this.setMap(map);
                };
                layer.onRemove = function() {
                    this.setMap(null);
                };
                return layer;
            }
        },
        agsFeature: {
            mustHaveUrl: true,
            createLayer: function(params) {
                if (!Helpers.AGSFeatureLayerPlugin.isLoaded()) {
                    $log.warn(errorHeader + ' The esri plugin is not loaded.');
                    return;
                }
                return L.esri.featureLayer(params.url, params.options);
            }
        },
        agsTiled: {
            mustHaveUrl: true,
            createLayer: function(params) {
                if (!Helpers.AGSTiledMapLayerPlugin.isLoaded()) {
                    $log.warn(errorHeader + ' The esri plugin is not loaded.');
                    return;
                }
                return L.esri.tiledMapLayer(params.url, params.options);
            }
        },
        agsDynamic: {
            mustHaveUrl: true,
            createLayer: function(params) {
                if (!Helpers.AGSDynamicMapLayerPlugin.isLoaded()) {
                    $log.warn(errorHeader + ' The esri plugin is not loaded.');
                    return;
                }
                return L.esri.dynamicMapLayer(params.url, params.options);
            }
        },
        agsImage: {
            mustHaveUrl: true,
            createLayer: function(params) {
                if (!Helpers.AGSImageMapLayerPlugin.isLoaded()) {
                    $log.warn(errorHeader + ' The esri plugin is not loaded.');
                    return;
                }
                return L.esri.imageMapLayer(params.url, params.options);
            }
        },
        agsClustered: {
            mustHaveUrl: true,
            createLayer: function(params) {
                if (!Helpers.AGSClusteredLayerPlugin.isLoaded()) {
                    $log.warn(errorHeader + ' The esri clustered layer plugin is not loaded.');
                    return;
                }

                if(!Helpers.MarkerClusterPlugin.isLoaded()) {
                    $log.warn(errorHeader + ' The markercluster plugin is not loaded.');
                    return;
                }
                return L.esri.clusteredFeatureLayer(params.url, params.options);
            }
        },
        agsHeatmap: {
            mustHaveUrl: true,
            createLayer: function(params) {
                if (!Helpers.AGSHeatmapLayerPlugin.isLoaded()) {
                    $log.warn(errorHeader + ' The esri heatmap layer plugin is not loaded.');
                    return;
                }

                if(!Helpers.HeatLayerPlugin.isLoaded()) {
                    $log.warn(errorHeader + ' The heatlayer plugin is not loaded.');
                    return;
                }
                return L.esri.heatmapFeatureLayer(params.url, params.options);
            }
        },
        markercluster: {
            mustHaveUrl: false,
            createLayer: function(params) {
                if (!Helpers.MarkerClusterPlugin.isLoaded()) {
                    $log.warn(errorHeader + ' The markercluster plugin is not loaded.');
                    return;
                }
                return new L.MarkerClusterGroup(params.options);
            }
        },
        bing: {
            mustHaveUrl: false,
            createLayer: function(params) {
                if (!Helpers.BingLayerPlugin.isLoaded()) {
                    return;
                }
                return new L.BingLayer(params.key, params.options);
            }
        },
        webGLHeatmap: {
            mustHaveUrl: false,
            mustHaveData: true,
            createLayer: function(params) {
                if (!Helpers.WebGLHeatMapLayerPlugin.isLoaded()) {
                    return;
                }
                var layer = new L.TileLayer.WebGLHeatMap(params.options);
                if (isDefined(params.data)) {
                    layer.setData(params.data);
                }

                return layer;
            }
        },
        heat: {
            mustHaveUrl: false,
            mustHaveData: true,
            createLayer: function(params) {
                if (!Helpers.HeatLayerPlugin.isLoaded()) {
                    return;
                }
                var layer = new L.heatLayer();

                if (isArray(params.data)) {
                    layer.setLatLngs(params.data);
                }

                if (isObject(params.options)) {
                    layer.setOptions(params.options);
                }

                return layer;
            }
        },
        yandex: {
            mustHaveUrl: false,
            createLayer: function(params) {
                var type = params.type || 'map';
                if (!Helpers.YandexLayerPlugin.isLoaded()) {
                    return;
                }
                return new L.Yandex(type, params.options);
            }
        },
        imageOverlay: {
            mustHaveUrl: true,
            mustHaveBounds : true,
            createLayer: function(params) {
                return L.imageOverlay(params.url, params.bounds, params.options);
            }
        },

        // This "custom" type is used to accept every layer that user want to define himself.
        // We can wrap these custom layers like heatmap or yandex, but it means a lot of work/code to wrap the world,
        // so we let user to define their own layer outside the directive,
        // and pass it on "createLayer" result for next processes
        custom: {
            createLayer: function (params) {
                if (params.layer instanceof L.Class) {
                    return angular.copy(params.layer);
                }
                else {
                    $log.error('[AngularJS - Leaflet] A custom layer must be a leaflet Class');
                }
            }
        },
        cartodb: {
            mustHaveUrl: true,
            createLayer: function(params) {
                return cartodb.createLayer(params.map, params.url);
            }
        }
    };

    function isValidLayerType(layerDefinition) {
        // Check if the baselayer has a valid type
        if (!isString(layerDefinition.type)) {
            $log.error('[AngularJS - Leaflet] A layer must have a valid type defined.');
            return false;
        }

        if (Object.keys(layerTypes).indexOf(layerDefinition.type) === -1) {
            $log.error('[AngularJS - Leaflet] A layer must have a valid type: ' + Object.keys(layerTypes));
            return false;
        }

        // Check if the layer must have an URL
        if (layerTypes[layerDefinition.type].mustHaveUrl && !isString(layerDefinition.url)) {
            $log.error('[AngularJS - Leaflet] A base layer must have an url');
            return false;
        }

        if (layerTypes[layerDefinition.type].mustHaveData && !isDefined(layerDefinition.data)) {
            $log.error('[AngularJS - Leaflet] The base layer must have a "data" array attribute');
            return false;
        }

        if(layerTypes[layerDefinition.type].mustHaveLayer && !isDefined(layerDefinition.layer)) {
            $log.error('[AngularJS - Leaflet] The type of layer ' + layerDefinition.type + ' must have an layer defined');
            return false;
        }

        if (layerTypes[layerDefinition.type].mustHaveBounds && !isDefined(layerDefinition.bounds)) {
            $log.error('[AngularJS - Leaflet] The type of layer ' + layerDefinition.type + ' must have bounds defined');
            return false ;
        }

        if (layerTypes[layerDefinition.type].mustHaveKey && !isDefined(layerDefinition.key)) {
            $log.error('[AngularJS - Leaflet] The type of layer ' + layerDefinition.type + ' must have key defined');
            return false ;
        }
        return true;
    }

    function createLayer(layerDefinition) {
        if (!isValidLayerType(layerDefinition)) {
            return;
        }

        if (!isString(layerDefinition.name)) {
            $log.error('[AngularJS - Leaflet] A base layer must have a name');
            return;
        }
        if (!isObject(layerDefinition.layerParams)) {
            layerDefinition.layerParams = {};
        }
        if (!isObject(layerDefinition.layerOptions)) {
            layerDefinition.layerOptions = {};
        }

        // Mix the layer specific parameters with the general Leaflet options. Although this is an overhead
        // the definition of a base layers is more 'clean' if the two types of parameters are differentiated
        for (var attrname in layerDefinition.layerParams) {
            layerDefinition.layerOptions[attrname] = layerDefinition.layerParams[attrname];
        }

        var params = {
            url: layerDefinition.url,
            data: layerDefinition.data,
            options: layerDefinition.layerOptions,
            layer: layerDefinition.layer,
            type: layerDefinition.layerType,
            bounds: layerDefinition.bounds,
            key: layerDefinition.key,
            apiKey: layerDefinition.apiKey,
            pluginOptions: layerDefinition.pluginOptions,
            user: layerDefinition.user
        };

        //TODO Add $watch to the layer properties
        return layerTypes[layerDefinition.type].createLayer(params);
    }

    return {
        createLayer: createLayer
    };
}]);

angular.module("leaflet-directive").factory('leafletLegendHelpers', function () {
	var _updateLegend = function(div, legendData, type, url) {
		div.innerHTML = '';
		if(legendData.error) {
			div.innerHTML += '<div class="info-title alert alert-danger">' + legendData.error.message + '</div>';
		} else {
			if (type === 'arcgis') {
				for (var i = 0; i < legendData.layers.length; i++) {
					var layer = legendData.layers[i];
					div.innerHTML += '<div class="info-title" data-layerid="' + layer.layerId + '">' + layer.layerName + '</div>';
					for(var j = 0; j < layer.legend.length; j++) {
						var leg = layer.legend[j];
						div.innerHTML +=
							'<div class="inline" data-layerid="' + layer.layerId + '"><img src="data:' + leg.contentType + ';base64,' + leg.imageData + '" /></div>' +
							'<div class="info-label" data-layerid="' + layer.layerId + '">' + leg.label + '</div>';
					}
				}
			}
			else if (type === 'image') {
				div.innerHTML = '<img src="' + url + '"/>';
			}
		}
	};

	var _getOnAddLegend = function(legendData, legendClass, type, url) {
		return function(/*map*/) {
			var div = L.DomUtil.create('div', legendClass);

			if (!L.Browser.touch) {
				L.DomEvent.disableClickPropagation(div);
				L.DomEvent.on(div, 'mousewheel', L.DomEvent.stopPropagation);
			} else {
				L.DomEvent.on(div, 'click', L.DomEvent.stopPropagation);
			}
			_updateLegend(div, legendData, type, url);
			return div;
		};
	};

	var _getOnAddArrayLegend = function(legend, legendClass) {
		return function(/*map*/) {
			var div = L.DomUtil.create('div', legendClass);
            for (var i = 0; i < legend.colors.length; i++) {
                div.innerHTML +=
                    '<div class="outline"><i style="background:' + legend.colors[i] + '"></i></div>' +
                    '<div class="info-label">' + legend.labels[i] + '</div>';
            }
            if (!L.Browser.touch) {
				L.DomEvent.disableClickPropagation(div);
				L.DomEvent.on(div, 'mousewheel', L.DomEvent.stopPropagation);
			} else {
				L.DomEvent.on(div, 'click', L.DomEvent.stopPropagation);
			}
            return div;
		};
	};

	return {
		getOnAddLegend: _getOnAddLegend,
		getOnAddArrayLegend: _getOnAddArrayLegend,
		updateLegend: _updateLegend,
	};
});

angular.module("leaflet-directive").factory('leafletMapDefaults', ["$q", "leafletHelpers", function ($q, leafletHelpers) {
    function _getDefaults() {
        return {
            keyboard: true,
            dragging: true,
            worldCopyJump: false,
            doubleClickZoom: true,
            scrollWheelZoom: true,
            tap: true,
            touchZoom: true,
            zoomControl: true,
            zoomsliderControl: false,
            zoomControlPosition: 'topleft',
            attributionControl: true,
            controls: {
                layers: {
                    visible: true,
                    position: 'topright',
                    collapsed: true
                }
            },
            crs: L.CRS.EPSG3857,
            tileLayer: '//{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            tileLayerOptions: {
                attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            },
            path: {
                weight: 10,
                opacity: 1,
                color: '#0000ff'
            },
            center: {
                lat: 0,
                lng: 0,
                zoom: 1
            }
        };
    }

    var isDefined = leafletHelpers.isDefined,
        isObject = leafletHelpers.isObject,
        obtainEffectiveMapId = leafletHelpers.obtainEffectiveMapId,
        defaults = {};

    // Get the _defaults dictionary, and override the properties defined by the user
    return {
        reset: function () {
           defaults = {};
        },
        getDefaults: function (scopeId) {
            var mapId = obtainEffectiveMapId(defaults, scopeId);
            return defaults[mapId];
        },

        getMapCreationDefaults: function (scopeId) {
            var mapId = obtainEffectiveMapId(defaults, scopeId);
            var d = defaults[mapId];

            var mapDefaults = {
                maxZoom: d.maxZoom,
                keyboard: d.keyboard,
                dragging: d.dragging,
                zoomControl: d.zoomControl,
                doubleClickZoom: d.doubleClickZoom,
                scrollWheelZoom: d.scrollWheelZoom,
                tap: d.tap,
                touchZoom: d.touchZoom,
                attributionControl: d.attributionControl,
                worldCopyJump: d.worldCopyJump,
                crs: d.crs
            };

            if (isDefined(d.minZoom)) {
                mapDefaults.minZoom = d.minZoom;
            }

            if (isDefined(d.zoomAnimation)) {
                mapDefaults.zoomAnimation = d.zoomAnimation;
            }

            if (isDefined(d.fadeAnimation)) {
                mapDefaults.fadeAnimation = d.fadeAnimation;
            }

            if (isDefined(d.markerZoomAnimation)) {
                mapDefaults.markerZoomAnimation = d.markerZoomAnimation;
            }

            if (d.map) {
                for (var option in d.map) {
                    mapDefaults[option] = d.map[option];
                }
            }

            return mapDefaults;
        },

        setDefaults: function (userDefaults, scopeId) {
            var newDefaults = _getDefaults();

            if (isDefined(userDefaults)) {
                newDefaults.doubleClickZoom = isDefined(userDefaults.doubleClickZoom) ? userDefaults.doubleClickZoom : newDefaults.doubleClickZoom;
                newDefaults.scrollWheelZoom = isDefined(userDefaults.scrollWheelZoom) ? userDefaults.scrollWheelZoom : newDefaults.doubleClickZoom;
                newDefaults.tap = isDefined(userDefaults.tap) ? userDefaults.tap : newDefaults.tap;
                newDefaults.touchZoom = isDefined(userDefaults.touchZoom) ? userDefaults.touchZoom : newDefaults.doubleClickZoom;
                newDefaults.zoomControl = isDefined(userDefaults.zoomControl) ? userDefaults.zoomControl : newDefaults.zoomControl;
                newDefaults.zoomsliderControl = isDefined(userDefaults.zoomsliderControl) ? userDefaults.zoomsliderControl : newDefaults.zoomsliderControl;
                newDefaults.attributionControl = isDefined(userDefaults.attributionControl) ? userDefaults.attributionControl : newDefaults.attributionControl;
                newDefaults.tileLayer = isDefined(userDefaults.tileLayer) ? userDefaults.tileLayer : newDefaults.tileLayer;
                newDefaults.zoomControlPosition = isDefined(userDefaults.zoomControlPosition) ? userDefaults.zoomControlPosition : newDefaults.zoomControlPosition;
                newDefaults.keyboard = isDefined(userDefaults.keyboard) ? userDefaults.keyboard : newDefaults.keyboard;
                newDefaults.dragging = isDefined(userDefaults.dragging) ? userDefaults.dragging : newDefaults.dragging;

                if (isDefined(userDefaults.controls)) {
                    angular.extend(newDefaults.controls, userDefaults.controls);
                }

                if (isObject(userDefaults.crs)) {
                    newDefaults.crs = userDefaults.crs;
                } else if (isDefined(L.CRS[userDefaults.crs])) {
                    newDefaults.crs = L.CRS[userDefaults.crs];
                }

                if (isDefined(userDefaults.center)) {
                    angular.copy(userDefaults.center, newDefaults.center);
                }

                if (isDefined(userDefaults.tileLayerOptions)) {
                    angular.copy(userDefaults.tileLayerOptions, newDefaults.tileLayerOptions);
                }

                if (isDefined(userDefaults.maxZoom)) {
                    newDefaults.maxZoom = userDefaults.maxZoom;
                }

                if (isDefined(userDefaults.minZoom)) {
                    newDefaults.minZoom = userDefaults.minZoom;
                }

                if (isDefined(userDefaults.zoomAnimation)) {
                    newDefaults.zoomAnimation = userDefaults.zoomAnimation;
                }

                if (isDefined(userDefaults.fadeAnimation)) {
                    newDefaults.fadeAnimation = userDefaults.fadeAnimation;
                }

                if (isDefined(userDefaults.markerZoomAnimation)) {
                    newDefaults.markerZoomAnimation = userDefaults.markerZoomAnimation;
                }

                if (isDefined(userDefaults.worldCopyJump)) {
                    newDefaults.worldCopyJump = userDefaults.worldCopyJump;
                }

                if (isDefined(userDefaults.map)) {
                    newDefaults.map = userDefaults.map;
                }
                
                if (isDefined(userDefaults.path)) {
                    newDefaults.path = userDefaults.path;
                }
            }

            var mapId = obtainEffectiveMapId(defaults, scopeId);
            defaults[mapId] = newDefaults;
            return newDefaults;
        }
    };
}]);

angular.module("leaflet-directive").service('leafletMarkersHelpers', ["$rootScope", "$timeout", "leafletHelpers", "$log", "$compile", "leafletGeoJsonHelpers", function ($rootScope, $timeout, leafletHelpers, $log, $compile, leafletGeoJsonHelpers) {
    var isDefined = leafletHelpers.isDefined,
        defaultTo = leafletHelpers.defaultTo,
        MarkerClusterPlugin = leafletHelpers.MarkerClusterPlugin,
        AwesomeMarkersPlugin = leafletHelpers.AwesomeMarkersPlugin,
        MakiMarkersPlugin = leafletHelpers.MakiMarkersPlugin,
        ExtraMarkersPlugin = leafletHelpers.ExtraMarkersPlugin,
        safeApply = leafletHelpers.safeApply,
        Helpers = leafletHelpers,
        isString = leafletHelpers.isString,
        isNumber = leafletHelpers.isNumber,
        isObject = leafletHelpers.isObject,
        groups = {},
        geoHlp = leafletGeoJsonHelpers,
        errorHeader = leafletHelpers.errorHeader;


    var _string = function (marker) {
        //this exists since JSON.stringify barfs on cyclic
        var retStr = '';
        ['_icon', '_latlng', '_leaflet_id', '_map', '_shadow'].forEach(function (prop) {
            retStr += prop + ': ' + defaultTo(marker[prop], 'undefined') + ' \n';
        });
        return '[leafletMarker] : \n' + retStr;
    };
    var _log = function (marker, useConsole) {
        var logger = useConsole ? console : $log;
        logger.debug(_string(marker));
    };

    var createLeafletIcon = function (iconData) {
        if (isDefined(iconData) && isDefined(iconData.type) && iconData.type === 'awesomeMarker') {
            if (!AwesomeMarkersPlugin.isLoaded()) {
                $log.error(errorHeader + ' The AwesomeMarkers Plugin is not loaded.');
            }

            return new L.AwesomeMarkers.icon(iconData);
        }

        if (isDefined(iconData) && isDefined(iconData.type) && iconData.type === 'makiMarker') {
            if (!MakiMarkersPlugin.isLoaded()) {
                $log.error(errorHeader + 'The MakiMarkers Plugin is not loaded.');
            }

            return new L.MakiMarkers.icon(iconData);
        }

        if (isDefined(iconData) && isDefined(iconData.type) && iconData.type === 'extraMarker') {
            if (!ExtraMarkersPlugin.isLoaded()) {
                $log.error(errorHeader + 'The ExtraMarkers Plugin is not loaded.');
            }
            return new L.ExtraMarkers.icon(iconData);
        }

        if (isDefined(iconData) && isDefined(iconData.type) && iconData.type === 'div') {
            return new L.divIcon(iconData);
        }

        // allow for any custom icon to be used... assumes the icon has already been initialized
        if (isDefined(iconData) && isDefined(iconData.type) && iconData.type === 'icon') {
            return iconData.icon;
        }

        var base64icon = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAApCAYAAADAk4LOAAAGmklEQVRYw7VXeUyTZxjvNnfELFuyIzOabermMZEeQC/OclkO49CpOHXOLJl/CAURuYbQi3KLgEhbrhZ1aDwmaoGqKII6odATmH/scDFbdC7LvFqOCc+e95s2VG50X/LLm/f4/Z7neY/ne18aANCmAr5E/xZf1uDOkTcGcWR6hl9247tT5U7Y6SNvWsKT63P58qbfeLJG8M5qcgTknrvvrdDbsT7Ml+tv82X6vVxJE33aRmgSyYtcWVMqX97Yv2JvW39UhRE2HuyBL+t+gK1116ly06EeWFNlAmHxlQE0OMiV6mQCScusKRlhS3QLeVJdl1+23h5dY4FNB3thrbYboqptEFlphTC1hSpJnbRvxP4NWgsE5Jyz86QNNi/5qSUTGuFk1gu54tN9wuK2wc3o+Wc13RCmsoBwEqzGcZsxsvCSy/9wJKf7UWf1mEY8JWfewc67UUoDbDjQC+FqK4QqLVMGGR9d2wurKzqBk3nqIT/9zLxRRjgZ9bqQgub+DdoeCC03Q8j+0QhFhBHR/eP3U/zCln7Uu+hihJ1+bBNffLIvmkyP0gpBZWYXhKussK6mBz5HT6M1Nqpcp+mBCPXosYQfrekGvrjewd59/GvKCE7TbK/04/ZV5QZYVWmDwH1mF3xa2Q3ra3DBC5vBT1oP7PTj4C0+CcL8c7C2CtejqhuCnuIQHaKHzvcRfZpnylFfXsYJx3pNLwhKzRAwAhEqG0SpusBHfAKkxw3w4627MPhoCH798z7s0ZnBJ/MEJbZSbXPhER2ih7p2ok/zSj2cEJDd4CAe+5WYnBCgR2uruyEw6zRoW6/DWJ/OeAP8pd/BGtzOZKpG8oke0SX6GMmRk6GFlyAc59K32OTEinILRJRchah8HQwND8N435Z9Z0FY1EqtxUg+0SO6RJ/mmXz4VuS+DpxXC3gXmZwIL7dBSH4zKE50wESf8qwVgrP1EIlTO5JP9Igu0aexdh28F1lmAEGJGfh7jE6ElyM5Rw/FDcYJjWhbeiBYoYNIpc2FT/SILivp0F1ipDWk4BIEo2VuodEJUifhbiltnNBIXPUFCMpthtAyqws/BPlEF/VbaIxErdxPphsU7rcCp8DohC+GvBIPJS/tW2jtvTmmAeuNO8BNOYQeG8G/2OzCJ3q+soYB5i6NhMaKr17FSal7GIHheuV3uSCY8qYVuEm1cOzqdWr7ku/R0BDoTT+DT+ohCM6/CCvKLKO4RI+dXPeAuaMqksaKrZ7L3FE5FIFbkIceeOZ2OcHO6wIhTkNo0ffgjRGxEqogXHYUPHfWAC/lADpwGcLRY3aeK4/oRGCKYcZXPVoeX/kelVYY8dUGf8V5EBRbgJXT5QIPhP9ePJi428JKOiEYhYXFBqou2Guh+p/mEB1/RfMw6rY7cxcjTrneI1FrDyuzUSRm9miwEJx8E/gUmqlyvHGkneiwErR21F3tNOK5Tf0yXaT+O7DgCvALTUBXdM4YhC/IawPU+2PduqMvuaR6eoxSwUk75ggqsYJ7VicsnwGIkZBSXKOUww73WGXyqP+J2/b9c+gi1YAg/xpwck3gJuucNrh5JvDPvQr0WFXf0piyt8f8/WI0hV4pRxxkQZdJDfDJNOAmM0Ag8jyT6hz0WGXWuP94Yh2jcfjmXAGvHCMslRimDHYuHuDsy2QtHuIavznhbYURq5R57KpzBBRZKPJi8eQg48h4j8SDdowifdIrEVdU+gbO6QNvRRt4ZBthUaZhUnjlYObNagV3keoeru3rU7rcuceqU1mJBxy+BWZYlNEBH+0eH4vRiB+OYybU2hnblYlTvkHinM4m54YnxSyaZYSF6R3jwgP7udKLGIX6r/lbNa9N6y5MFynjWDtrHd75ZvTYAPO/6RgF0k76mQla3FGq7dO+cH8sKn0Vo7nDllwAhqwLPkxrHwWmHJOo+AKJ4rab5OgrM7rVu8eWb2Pu0Dh4eDgXoOfvp7Y7QeqknRmvcTBEyq9m/HQQSCSz6LHq3z0yzsNySRfMS253wl2KyRDbcZPcfJKjZmSEOjcxyi+Y8dUOtsIEH6R2wNykdqrkYJ0RV92H0W58pkfQk7cKevsLK10Py8SdMGfXNXATY+pPbyJR/ET6n9nIfztNtZYRV9XniQu9IA2vOVgy4ir7GCLVmmd+zjkH0eAF9Po6K61pmCXHxU5rHMYd1ftc3owjwRSVRzLjKvqZEty6cRUD7jGqiOdu5HG6MdHjNcNYGqfDm5YRzLBBCCDl/2bk8a8gdbqcfwECu62Fg/HrggAAAABJRU5ErkJggg==";
        var base64shadow = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACkAAAApCAYAAACoYAD2AAAC5ElEQVRYw+2YW4/TMBCF45S0S1luXZCABy5CgLQgwf//S4BYBLTdJLax0fFqmB07nnQfEGqkIydpVH85M+NLjPe++dcPc4Q8Qh4hj5D/AaQJx6H/4TMwB0PeBNwU7EGQAmAtsNfAzoZkgIa0ZgLMa4Aj6CxIAsjhjOCoL5z7Glg1JAOkaicgvQBXuncwJAWjksLtBTWZe04CnYRktUGdilALppZBOgHGZcBzL6OClABvMSVIzyBjazOgrvACf1ydC5mguqAVg6RhdkSWQFj2uxfaq/BrIZOLEWgZdALIDvcMcZLD8ZbLC9de4yR1sYMi4G20S4Q/PWeJYxTOZn5zJXANZHIxAd4JWhPIloTJZhzMQduM89WQ3MUVAE/RnhAXpTycqys3NZALOBbB7kFrgLesQl2h45Fcj8L1tTSohUwuxhy8H/Qg6K7gIs+3kkaigQCOcyEXCHN07wyQazhrmIulvKMQAwMcmLNqyCVyMAI+BuxSMeTk3OPikLY2J1uE+VHQk6ANrhds+tNARqBeaGc72cK550FP4WhXmFmcMGhTwAR1ifOe3EvPqIegFmF+C8gVy0OfAaWQPMR7gF1OQKqGoBjq90HPMP01BUjPOqGFksC4emE48tWQAH0YmvOgF3DST6xieJgHAWxPAHMuNhrImIdvoNOKNWIOcE+UXE0pYAnkX6uhWsgVXDxHdTfCmrEEmMB2zMFimLVOtiiajxiGWrbU52EeCdyOwPEQD8LqyPH9Ti2kgYMf4OhSKB7qYILbBv3CuVTJ11Y80oaseiMWOONc/Y7kJYe0xL2f0BaiFTxknHO5HaMGMublKwxFGzYdWsBF174H/QDknhTHmHHN39iWFnkZx8lPyM8WHfYELmlLKtgWNmFNzQcC1b47gJ4hL19i7o65dhH0Negbca8vONZoP7doIeOC9zXm8RjuL0Gf4d4OYaU5ljo3GYiqzrWQHfJxA6ALhDpVKv9qYeZA8eM3EhfPSCmpuD0AAAAASUVORK5CYII=";

        if (!isDefined(iconData) || !isDefined(iconData.iconUrl)) {
            return new L.Icon.Default({
                iconUrl: base64icon,
                shadowUrl: base64shadow,
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            });
        }

        return new L.Icon(iconData);
    };

    var _resetMarkerGroup = function (groupName) {
        if (isDefined(groups[groupName])) {
            groups.splice(groupName, 1);
        }
    };

    var _resetMarkerGroups = function () {
        groups = {};
    };

    var _deleteMarker = function (marker, map, layers) {
        marker.closePopup();
        // There is no easy way to know if a marker is added to a layer, so we search for it
        // if there are overlays
        if (isDefined(layers) && isDefined(layers.overlays)) {
            for (var key in layers.overlays) {
                if (layers.overlays[key] instanceof L.LayerGroup || layers.overlays[key] instanceof L.FeatureGroup) {
                    if (layers.overlays[key].hasLayer(marker)) {
                        layers.overlays[key].removeLayer(marker);
                        return;
                    }
                }
            }
        }

        if (isDefined(groups)) {
            for (var groupKey in groups) {
                if (groups[groupKey].hasLayer(marker)) {
                    groups[groupKey].removeLayer(marker);
                }
            }
        }

        if (map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    };

    var adjustPopupPan = function(marker, map) {
        var containerHeight = marker._popup._container.offsetHeight,
            layerPos = new L.Point(marker._popup._containerLeft, -containerHeight - marker._popup._containerBottom),
            containerPos = map.layerPointToContainerPoint(layerPos);
        if (containerPos !== null) {
            marker._popup._adjustPan();
        }
    };

    var compilePopup = function(marker, markerScope) {
        $compile(marker._popup._contentNode)(markerScope);
    };

    var updatePopup = function (marker, markerScope, map) {
        //The innerText should be more than 1 once angular has compiled.
        //We need to keep trying until angular has compiled before we _updateLayout and _updatePosition
        //This should take care of any scenario , eg ngincludes, whatever.
        //Is there a better way to check for this?
        if (marker._popup._contentNode.innerText.length < 1) {
            $timeout(function () {
                updatePopup(marker, markerScope, map);
            });
        }

        //cause a reflow - this is also very important - if we don't do this then the widths are from before $compile
        var reflow = marker._popup._contentNode.offsetWidth;

        marker._popup._updateLayout();
        marker._popup._updatePosition();

        if (marker._popup.options.autoPan) {
            adjustPopupPan(marker, map);
        }

        //using / returning reflow so jshint doesn't moan
        return reflow;
    };

    var _manageOpenPopup = function (marker, markerData, map) {
        // The marker may provide a scope returning function used to compile the message
        // default to $rootScope otherwise
        var markerScope = angular.isFunction(markerData.getMessageScope) ? markerData.getMessageScope() : $rootScope,
            compileMessage = isDefined(markerData.compileMessage) ? markerData.compileMessage : true;

        if (compileMessage) {
            if (!isDefined(marker._popup) || !isDefined(marker._popup._contentNode)) {
                $log.error(errorHeader + 'Popup is invalid or does not have any content.');
                return false;
            }

            compilePopup(marker, markerScope);
            updatePopup(marker, markerData, map);
        }
    };


    var _manageOpenLabel = function (marker, markerData) {
        var markerScope = angular.isFunction(markerData.getMessageScope) ? markerData.getMessageScope() : $rootScope,
            labelScope = angular.isFunction(markerData.getLabelScope) ? markerData.getLabelScope() : markerScope,
            compileMessage = isDefined(markerData.compileMessage) ? markerData.compileMessage : true;

        if (Helpers.LabelPlugin.isLoaded() && isDefined(markerData.label)) {
            if (isDefined(markerData.label.options) && markerData.label.options.noHide === true) {
                marker.showLabel();
            }
            if (compileMessage && isDefined(marker.label)) {
                $compile(marker.label._container)(labelScope);
            }
        }
    };

    var _updateMarker = function (markerData, oldMarkerData, marker, name, leafletScope, layers, map) {
            if (!isDefined(oldMarkerData)) {
                return;
            }

            // Update the lat-lng property (always present in marker properties)
            if (!geoHlp.validateCoords(markerData)) {
                $log.warn('There are problems with lat-lng data, please verify your marker model');
                _deleteMarker(marker, map, layers);
                return;
            }

            // watch is being initialized if old and new object is the same
            var isInitializing = markerData === oldMarkerData;

            // Update marker rotation
            if (isDefined(markerData.iconAngle) && oldMarkerData.iconAngle !== markerData.iconAngle) {
                marker.setIconAngle(markerData.iconAngle);
            }

            // It is possible that the layer has been removed or the layer marker does not exist
            // Update the layer group if present or move it to the map if not
            if (!isString(markerData.layer)) {
                // There is no layer information, we move the marker to the map if it was in a layer group
                if (isString(oldMarkerData.layer)) {
                    // Remove from the layer group that is supposed to be
                    if (isDefined(layers.overlays[oldMarkerData.layer]) && layers.overlays[oldMarkerData.layer].hasLayer(marker)) {
                        layers.overlays[oldMarkerData.layer].removeLayer(marker);
                        marker.closePopup();
                    }
                    // Test if it is not on the map and add it
                    if (!map.hasLayer(marker)) {
                        map.addLayer(marker);
                    }
                }
            }

            if ((isNumber(markerData.opacity) || isNumber(parseFloat(markerData.opacity))) && markerData.opacity !== oldMarkerData.opacity) {
                // There was a different opacity so we update it
                marker.setOpacity(markerData.opacity);
            }

            if (isString(markerData.layer) && oldMarkerData.layer !== markerData.layer) {
                // If it was on a layer group we have to remove it
                if (isString(oldMarkerData.layer) && isDefined(layers.overlays[oldMarkerData.layer]) && layers.overlays[oldMarkerData.layer].hasLayer(marker)) {
                    layers.overlays[oldMarkerData.layer].removeLayer(marker);
                }
                marker.closePopup();

                // Remove it from the map in case the new layer is hidden or there is an error in the new layer
                if (map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }

                // The markerData.layer is defined so we add the marker to the layer if it is different from the old data
                if (!isDefined(layers.overlays[markerData.layer])) {
                    $log.error(errorHeader + 'You must use a name of an existing layer');
                    return;
                }
                // Is a group layer?
                var layerGroup = layers.overlays[markerData.layer];
                if (!(layerGroup instanceof L.LayerGroup || layerGroup instanceof L.FeatureGroup)) {
                    $log.error(errorHeader + 'A marker can only be added to a layer of type "group" or "featureGroup"');
                    return;
                }
                // The marker goes to a correct layer group, so first of all we add it
                layerGroup.addLayer(marker);
                // The marker is automatically added to the map depending on the visibility
                // of the layer, so we only have to open the popup if the marker is in the map
                if (map.hasLayer(marker) && markerData.focus === true) {
                    marker.openPopup();
                }
            }

            // Update the draggable property
            if (markerData.draggable !== true && oldMarkerData.draggable === true && (isDefined(marker.dragging))) {
                marker.dragging.disable();
            }

            if (markerData.draggable === true && oldMarkerData.draggable !== true) {
                // The markerData.draggable property must be true so we update if there wasn't a previous value or it wasn't true
                if (marker.dragging) {
                    marker.dragging.enable();
                } else {
                    if (L.Handler.MarkerDrag) {
                        marker.dragging = new L.Handler.MarkerDrag(marker);
                        marker.options.draggable = true;
                        marker.dragging.enable();
                    }
                }
            }

            // Update the icon property
            if (!isObject(markerData.icon)) {
                // If there is no icon property or it's not an object
                if (isObject(oldMarkerData.icon)) {
                    // If there was an icon before restore to the default
                    marker.setIcon(createLeafletIcon());
                    marker.closePopup();
                    marker.unbindPopup();
                    if (isString(markerData.message)) {
                        marker.bindPopup(markerData.message, markerData.popupOptions);
                    }
                }
            }

            if (isObject(markerData.icon) && isObject(oldMarkerData.icon) && !angular.equals(markerData.icon, oldMarkerData.icon)) {
                var dragG = false;
                if (marker.dragging) {
                    dragG = marker.dragging.enabled();
                }
                marker.setIcon(createLeafletIcon(markerData.icon));
                if (dragG) {
                    marker.dragging.enable();
                }
                marker.closePopup();
                marker.unbindPopup();
                if (isString(markerData.message)) {
                    marker.bindPopup(markerData.message, markerData.popupOptions);
                }
            }

            // Update the Popup message property
            if (!isString(markerData.message) && isString(oldMarkerData.message)) {
                marker.closePopup();
                marker.unbindPopup();
            }

            // Update the label content or bind a new label if the old one has been removed.
            if (Helpers.LabelPlugin.isLoaded()) {
                if (isDefined(markerData.label) && isDefined(markerData.label.message)) {
                    if ('label' in oldMarkerData && 'message' in oldMarkerData.label && !angular.equals(markerData.label.message, oldMarkerData.label.message)) {
                        marker.updateLabelContent(markerData.label.message);
                    } else if (!angular.isFunction(marker.getLabel) || angular.isFunction(marker.getLabel) && !isDefined(marker.getLabel())) {
                        marker.bindLabel(markerData.label.message, markerData.label.options);
                        _manageOpenLabel(marker, markerData);
                    } else {
                        _manageOpenLabel(marker, markerData);
                    }
                } else if (!('label' in markerData && !('message' in markerData.label))) {
                    if (angular.isFunction(marker.unbindLabel)) {
                        marker.unbindLabel();
                    }
                }
            }

            // There is some text in the popup, so we must show the text or update existing
            if (isString(markerData.message) && !isString(oldMarkerData.message)) {
                // There was no message before so we create it
                marker.bindPopup(markerData.message, markerData.popupOptions);
            }

            if (isString(markerData.message) && isString(oldMarkerData.message) && markerData.message !== oldMarkerData.message) {
                // There was a different previous message so we update it
                marker.setPopupContent(markerData.message);
            }

            // Update the focus property
            var updatedFocus = false;
            if (markerData.focus !== true && oldMarkerData.focus === true) {
                // If there was a focus property and was true we turn it off
                marker.closePopup();
                updatedFocus = true;
            }

            // The markerData.focus property must be true so we update if there wasn't a previous value or it wasn't true
            if (markerData.focus === true && ( !isDefined(oldMarkerData.focus) || oldMarkerData.focus === false) || (isInitializing && markerData.focus === true)) {
                // Reopen the popup when focus is still true
                marker.openPopup();
                updatedFocus = true;
            }

            // zIndexOffset adjustment
            if (oldMarkerData.zIndexOffset !== markerData.zIndexOffset) {
                marker.setZIndexOffset(markerData.zIndexOffset);
            }

            var markerLatLng = marker.getLatLng();
            var isCluster = (isString(markerData.layer) && Helpers.MarkerClusterPlugin.is(layers.overlays[markerData.layer]));
            // If the marker is in a cluster it has to be removed and added to the layer when the location is changed
            if (isCluster) {
                // The focus has changed even by a user click or programatically
                if (updatedFocus) {
                    // We only have to update the location if it was changed programatically, because it was
                    // changed by a user drag the marker data has already been updated by the internal event
                    // listened by the directive
                    if ((markerData.lat !== oldMarkerData.lat) || (markerData.lng !== oldMarkerData.lng)) {
                        layers.overlays[markerData.layer].removeLayer(marker);
                        marker.setLatLng([markerData.lat, markerData.lng]);
                        layers.overlays[markerData.layer].addLayer(marker);
                    }
                } else {
                    // The marker has possibly moved. It can be moved by a user drag (marker location and data are equal but old
                    // data is diferent) or programatically (marker location and data are diferent)
                    if ((markerLatLng.lat !== markerData.lat) || (markerLatLng.lng !== markerData.lng)) {
                        // The marker was moved by a user drag
                        layers.overlays[markerData.layer].removeLayer(marker);
                        marker.setLatLng([markerData.lat, markerData.lng]);
                        layers.overlays[markerData.layer].addLayer(marker);
                    } else if ((markerData.lat !== oldMarkerData.lat) || (markerData.lng !== oldMarkerData.lng)) {
                        // The marker was moved programatically
                        layers.overlays[markerData.layer].removeLayer(marker);
                        marker.setLatLng([markerData.lat, markerData.lng]);
                        layers.overlays[markerData.layer].addLayer(marker);
                    } else if (isObject(markerData.icon) && isObject(oldMarkerData.icon) && !angular.equals(markerData.icon, oldMarkerData.icon)) {
                        layers.overlays[markerData.layer].removeLayer(marker);
                        layers.overlays[markerData.layer].addLayer(marker);
                    }
                }
            } else if (markerLatLng.lat !== markerData.lat || markerLatLng.lng !== markerData.lng) {
                marker.setLatLng([markerData.lat, markerData.lng]);
            }
        };
    return {
        resetMarkerGroup: _resetMarkerGroup,

        resetMarkerGroups: _resetMarkerGroups,

        deleteMarker: _deleteMarker,

        manageOpenPopup: _manageOpenPopup,

        manageOpenLabel: _manageOpenLabel,

        createMarker: function (markerData) {
            if (!isDefined(markerData) || !geoHlp.validateCoords(markerData)) {
                $log.error(errorHeader + 'The marker definition is not valid.');
                return;
            }
            var coords = geoHlp.getCoords(markerData);

            if (!isDefined(coords)) {
                $log.error(errorHeader + 'Unable to get coordinates from markerData.');
                return;
            }

            var markerOptions = {
                icon: createLeafletIcon(markerData.icon),
                title: isDefined(markerData.title) ? markerData.title : '',
                draggable: isDefined(markerData.draggable) ? markerData.draggable : false,
                clickable: isDefined(markerData.clickable) ? markerData.clickable : true,
                riseOnHover: isDefined(markerData.riseOnHover) ? markerData.riseOnHover : false,
                zIndexOffset: isDefined(markerData.zIndexOffset) ? markerData.zIndexOffset : 0,
                iconAngle: isDefined(markerData.iconAngle) ? markerData.iconAngle : 0
            };
            // Add any other options not added above to markerOptions
            for (var markerDatum in markerData) {
                if (markerData.hasOwnProperty(markerDatum) && !markerOptions.hasOwnProperty(markerDatum)) {
                    markerOptions[markerDatum] = markerData[markerDatum];
                }
            }

            var marker = new L.marker(coords, markerOptions);

            if (!isString(markerData.message)) {
                marker.unbindPopup();
            }

            return marker;
        },

        addMarkerToGroup: function (marker, groupName, groupOptions, map) {
            if (!isString(groupName)) {
                $log.error(errorHeader + 'The marker group you have specified is invalid.');
                return;
            }

            if (!MarkerClusterPlugin.isLoaded()) {
                $log.error(errorHeader + "The MarkerCluster plugin is not loaded.");
                return;
            }
            if (!isDefined(groups[groupName])) {
                groups[groupName] = new L.MarkerClusterGroup(groupOptions);
                map.addLayer(groups[groupName]);
            }
            groups[groupName].addLayer(marker);
        },

        listenMarkerEvents: function (marker, markerData, leafletScope, doWatch, map) {
            marker.on("popupopen", function (/* event */) {
                safeApply(leafletScope, function () {
                    if (isDefined(marker._popup) || isDefined(marker._popup._contentNode)) {
                        markerData.focus = true;
                        _manageOpenPopup(marker, markerData, map);//needed since markerData is now a copy
                    }
                });
            });
            marker.on("popupclose", function (/* event */) {
                safeApply(leafletScope, function () {
                    markerData.focus = false;
                });
            });
            marker.on("add", function (/* event */) {
                safeApply(leafletScope, function () {
                    if ('label' in markerData)
                        _manageOpenLabel(marker, markerData);
                });
            });
        },

        updateMarker: _updateMarker,

        addMarkerWatcher: function (marker, name, leafletScope, layers, map, isDeepWatch) {
            var markerWatchPath = Helpers.getObjectArrayPath("markers." + name);
            isDeepWatch = defaultTo(isDeepWatch, true);

            var clearWatch = leafletScope.$watch(markerWatchPath, function(markerData, oldMarkerData) {
                if (!isDefined(markerData)) {
                    _deleteMarker(marker, map, layers);
                    clearWatch();
                    return;
                }
                _updateMarker(markerData, oldMarkerData, marker, name, leafletScope, layers, map);
            } , isDeepWatch);
        },
        string: _string,
        log: _log
    };
}]);

angular.module("leaflet-directive").factory('leafletPathsHelpers', ["$rootScope", "$log", "leafletHelpers", function ($rootScope, $log, leafletHelpers) {
    var isDefined = leafletHelpers.isDefined,
        isArray = leafletHelpers.isArray,
        isNumber = leafletHelpers.isNumber,
        isValidPoint = leafletHelpers.isValidPoint;
    var availableOptions = [
        // Path options
        'stroke', 'weight', 'color', 'opacity',
        'fill', 'fillColor', 'fillOpacity',
        'dashArray', 'lineCap', 'lineJoin', 'clickable',
        'pointerEvents', 'className',

        // Polyline options
        'smoothFactor', 'noClip'
    ];
    function _convertToLeafletLatLngs(latlngs) {
        return latlngs.filter(function(latlng) {
            return isValidPoint(latlng);
        }).map(function (latlng) {
            return _convertToLeafletLatLng(latlng);
        });
    }

    function _convertToLeafletLatLng(latlng) {
        if (isArray(latlng)) {
            return new L.LatLng(latlng[0], latlng[1]);
        } else {
            return new L.LatLng(latlng.lat, latlng.lng);
        }
    }

    function _convertToLeafletMultiLatLngs(paths) {
        return paths.map(function(latlngs) {
            return _convertToLeafletLatLngs(latlngs);
        });
    }

    function _getOptions(path, defaults) {
        var options = {};
        for (var i = 0; i < availableOptions.length; i++) {
            var optionName = availableOptions[i];

            if (isDefined(path[optionName])) {
                options[optionName] = path[optionName];
            } else if (isDefined(defaults.path[optionName])) {
                options[optionName] = defaults.path[optionName];
            }
        }

        return options;
    }

    var _updatePathOptions = function (path, data) {
        var updatedStyle = {};
        for (var i = 0; i < availableOptions.length; i++) {
            var optionName = availableOptions[i];
            if (isDefined(data[optionName])) {
                updatedStyle[optionName] = data[optionName];
            }
        }
        path.setStyle(data);
    };

    var _isValidPolyline = function(latlngs) {
        if (!isArray(latlngs)) {
            return false;
        }
        for (var i = 0; i < latlngs.length; i++) {
            var point = latlngs[i];
            if (!isValidPoint(point)) {
                return false;
            }
        }
        return true;
    };

    var pathTypes = {
        polyline: {
            isValid: function(pathData) {
                var latlngs = pathData.latlngs;
                return _isValidPolyline(latlngs);
            },
            createPath: function(options) {
                return new L.Polyline([], options);
            },
            setPath: function(path, data) {
                path.setLatLngs(_convertToLeafletLatLngs(data.latlngs));
                _updatePathOptions(path, data);
                return;
            }
        },
        multiPolyline: {
            isValid: function(pathData) {
                var latlngs = pathData.latlngs;
                if (!isArray(latlngs)) {
                    return false;
                }

                for (var i in latlngs) {
                    var polyline = latlngs[i];
                    if (!_isValidPolyline(polyline)) {
                        return false;
                    }
                }

                return true;
            },
            createPath: function(options) {
                return new L.multiPolyline([[[0,0],[1,1]]], options);
            },
            setPath: function(path, data) {
                path.setLatLngs(_convertToLeafletMultiLatLngs(data.latlngs));
                _updatePathOptions(path, data);
                return;
            }
        } ,
        polygon: {
            isValid: function(pathData) {
                var latlngs = pathData.latlngs;
                return _isValidPolyline(latlngs);
            },
            createPath: function(options) {
                return new L.Polygon([], options);
            },
            setPath: function(path, data) {
                path.setLatLngs(_convertToLeafletLatLngs(data.latlngs));
                _updatePathOptions(path, data);
                return;
            }
        },
        multiPolygon: {
            isValid: function(pathData) {
                var latlngs = pathData.latlngs;

                if (!isArray(latlngs)) {
                    return false;
                }

                for (var i in latlngs) {
                    var polyline = latlngs[i];
                    if (!_isValidPolyline(polyline)) {
                        return false;
                    }
                }

                return true;
            },
            createPath: function(options) {
                return new L.MultiPolygon([[[0,0],[1,1],[0,1]]], options);
            },
            setPath: function(path, data) {
                path.setLatLngs(_convertToLeafletMultiLatLngs(data.latlngs));
                _updatePathOptions(path, data);
                return;
            }
        },
        rectangle: {
            isValid: function(pathData) {
                var latlngs = pathData.latlngs;

                if (!isArray(latlngs) || latlngs.length !== 2) {
                    return false;
                }

                for (var i in latlngs) {
                    var point = latlngs[i];
                    if (!isValidPoint(point)) {
                        return false;
                    }
                }

                return true;
            },
            createPath: function(options) {
                return new L.Rectangle([[0,0],[1,1]], options);
            },
            setPath: function(path, data) {
                path.setBounds(new L.LatLngBounds(_convertToLeafletLatLngs(data.latlngs)));
                _updatePathOptions(path, data);
            }
        },
        circle: {
            isValid: function(pathData) {
                var point= pathData.latlngs;
                return isValidPoint(point) && isNumber(pathData.radius);
            },
            createPath: function(options) {
                return new L.Circle([0,0], 1, options);
            },
            setPath: function(path, data) {
                path.setLatLng(_convertToLeafletLatLng(data.latlngs));
                if (isDefined(data.radius)) {
                    path.setRadius(data.radius);
                }
                _updatePathOptions(path, data);
            }
        },
        circleMarker: {
            isValid: function(pathData) {
                var point= pathData.latlngs;
                return isValidPoint(point) && isNumber(pathData.radius);
            },
            createPath: function(options) {
                return new L.CircleMarker([0,0], options);
            },
            setPath: function(path, data) {
                path.setLatLng(_convertToLeafletLatLng(data.latlngs));
                if (isDefined(data.radius)) {
                    path.setRadius(data.radius);
                }
                _updatePathOptions(path, data);
            }
        }
    };

    var _getPathData = function(path) {
        var pathData = {};
        if (path.latlngs) {
            pathData.latlngs = path.latlngs;
        }

        if (path.radius) {
            pathData.radius = path.radius;
        }

        return pathData;
    };

    return {
        setPathOptions: function(leafletPath, pathType, data) {
            if(!isDefined(pathType)) {
                pathType = "polyline";
            }
            pathTypes[pathType].setPath(leafletPath, data);
        },
        createPath: function(name, path, defaults) {
            if(!isDefined(path.type)) {
                path.type = "polyline";
            }
            var options = _getOptions(path, defaults);
            var pathData = _getPathData(path);

            if (!pathTypes[path.type].isValid(pathData)) {
                $log.error("[AngularJS - Leaflet] Invalid data passed to the " + path.type + " path");
                return;
            }

            return pathTypes[path.type].createPath(options);
        }
    };
}]);

angular.module("leaflet-directive")
.service('leafletWatchHelpers', function (){

    var _maybe = function(scope, watchFunctionName, thingToWatchStr, watchOptions, initCb){
        //watchOptions.isDeep is/should be ignored in $watchCollection
        var unWatch = scope[watchFunctionName](thingToWatchStr, function(newValue, oldValue) {
            initCb(newValue, oldValue);
            if(!watchOptions.doWatch)
                unWatch();
        }, watchOptions.isDeep);

        return unWatch;
    };

  /*
  @name: maybeWatch
  @description: Utility to watch something once or forever.
  @returns unWatch function
  @param watchOptions - see markersWatchOptions and or derrivatives. This object is used
  to set watching to once and its watch depth.
  */
  var _maybeWatch = function(scope, thingToWatchStr, watchOptions, initCb){
      return _maybe(scope, '$watch', thingToWatchStr, watchOptions, initCb);
  };

  /*
  @name: _maybeWatchCollection
  @description: Utility to watch something once or forever.
  @returns unWatch function
  @param watchOptions - see markersWatchOptions and or derrivatives. This object is used
  to set watching to once and its watch depth.
  */
  var _maybeWatchCollection = function(scope, thingToWatchStr, watchOptions, initCb){
      return _maybe(scope, '$watchCollection', thingToWatchStr, watchOptions, initCb);
  };

  return {
    maybeWatch: _maybeWatch,
    maybeWatchCollection: _maybeWatchCollection
  };
});

angular.module("leaflet-directive").directive('bounds', ["$log", "$timeout", "leafletHelpers", "leafletBoundsHelpers", function ($log, $timeout, leafletHelpers, leafletBoundsHelpers) {
    return {
        restrict: "A",
        scope: false,
        replace: false,
        require: [ 'leaflet', 'center' ],

        link: function(scope, element, attrs, controller) {
            var isDefined = leafletHelpers.isDefined,
                createLeafletBounds = leafletBoundsHelpers.createLeafletBounds,
                leafletScope = controller[0].getLeafletScope(),
                mapController = controller[0];

            var emptyBounds = function(bounds) {
                return (bounds._southWest.lat === 0 && bounds._southWest.lng === 0 &&
                        bounds._northEast.lat === 0 && bounds._northEast.lng === 0);
            };

            mapController.getMap().then(function (map) {
                leafletScope.$on('boundsChanged', function (event) {
                    var scope = event.currentScope;
                    var bounds = map.getBounds();
                    //$log.debug('updated map bounds...', bounds);
                    if (emptyBounds(bounds) || scope.settingBoundsFromScope) {
                        return;
                    }
                    var newScopeBounds = {
                        northEast: {
                            lat: bounds._northEast.lat,
                            lng: bounds._northEast.lng
                        },
                        southWest: {
                            lat: bounds._southWest.lat,
                            lng: bounds._southWest.lng
                        },
                        options: bounds.options
                    };
                    if (!angular.equals(scope.bounds, newScopeBounds)) {
                        //$log.debug('Need to update scope bounds.');
                        scope.bounds = newScopeBounds;
                    }
                });
                leafletScope.$watch('bounds', function (bounds) {
                    //$log.debug('updated bounds...', bounds);
                    if (!isDefined(bounds)) {
                        $log.error('[AngularJS - Leaflet] Invalid bounds');
                        return;
                    }
                    var leafletBounds = createLeafletBounds(bounds);
                    if (leafletBounds && !map.getBounds().equals(leafletBounds)) {
                        //$log.debug('Need to update map bounds.');
                        scope.settingBoundsFromScope = true;
                        map.fitBounds(leafletBounds, bounds.options);
                        $timeout( function() {
                            //$log.debug('Allow bound updates.');
                            scope.settingBoundsFromScope = false;
                        });
                    }
                }, true);
            });
        }
    };
}]);

angular.module("leaflet-directive").directive('center',
    ["$log", "$q", "$location", "$timeout", "leafletMapDefaults", "leafletHelpers", "leafletBoundsHelpers", "leafletEvents", function ($log, $q, $location, $timeout, leafletMapDefaults, leafletHelpers, leafletBoundsHelpers, leafletEvents) {

    var isDefined     = leafletHelpers.isDefined,
        isNumber      = leafletHelpers.isNumber,
        isSameCenterOnMap = leafletHelpers.isSameCenterOnMap,
        safeApply     = leafletHelpers.safeApply,
        isValidCenter = leafletHelpers.isValidCenter,
        isValidBounds = leafletBoundsHelpers.isValidBounds,
        isUndefinedOrEmpty = leafletHelpers.isUndefinedOrEmpty,
        errorHeader   = leafletHelpers.errorHeader;

    var shouldInitializeMapWithBounds = function(bounds, center) {
        return isDefined(bounds) && isValidBounds(bounds) && isUndefinedOrEmpty(center);
    };

    var _leafletCenter;
    return {
        restrict: "A",
        scope: false,
        replace: false,
        require: 'leaflet',
        controller: function () {
            _leafletCenter = $q.defer();
            this.getCenter = function() {
                return _leafletCenter.promise;
            };
        },
        link: function(scope, element, attrs, controller) {
            var leafletScope  = controller.getLeafletScope(),
                centerModel   = leafletScope.center;

            controller.getMap().then(function(map) {
                var defaults = leafletMapDefaults.getDefaults(attrs.id);

                if (attrs.center.search("-") !== -1) {
                    $log.error(errorHeader + ' The "center" variable can\'t use a "-" on his key name: "' + attrs.center + '".');
                    map.setView([defaults.center.lat, defaults.center.lng], defaults.center.zoom);
                    return;
                } else if (shouldInitializeMapWithBounds(leafletScope.bounds, centerModel)) {
                    map.fitBounds(leafletBoundsHelpers.createLeafletBounds(leafletScope.bounds), leafletScope.bounds.options);
                    centerModel = map.getCenter();
                    safeApply(leafletScope, function (scope) {
                        angular.extend(scope.center,{
                           lat: map.getCenter().lat,
                           lng: map.getCenter().lng,
                           zoom: map.getZoom(),
                           autoDiscover: false
                        });
                    });
                    safeApply(leafletScope, function (scope) {
                        var mapBounds = map.getBounds();
                        scope.bounds = {
                            northEast: {
                                lat: mapBounds._northEast.lat,
                                lng: mapBounds._northEast.lng
                            },
                            southWest: {
                                lat: mapBounds._southWest.lat,
                                lng: mapBounds._southWest.lng
                            }
                        };
                    });
                } else if (!isDefined(centerModel)) {
                    $log.error(errorHeader + ' The "center" property is not defined in the main scope');
                    map.setView([defaults.center.lat, defaults.center.lng], defaults.center.zoom);
                    return;
                } else if (!(isDefined(centerModel.lat) && isDefined(centerModel.lng)) && !isDefined(centerModel.autoDiscover)) {
                    angular.copy(defaults.center, centerModel);
                }

                var urlCenterHash, mapReady;
                if (attrs.urlHashCenter === "yes") {
                    var extractCenterFromUrl = function() {
                        var search = $location.search();
                        var centerParam;
                        if (isDefined(search.c)) {
                            var cParam = search.c.split(":");
                            if (cParam.length === 3) {
                                centerParam = { lat: parseFloat(cParam[0]), lng: parseFloat(cParam[1]), zoom: parseInt(cParam[2], 10) };
                            }
                        }
                        return centerParam;
                    };
                    urlCenterHash = extractCenterFromUrl();

                    leafletScope.$on('$locationChangeSuccess', function(event) {
                        var scope = event.currentScope;
                        //$log.debug("updated location...");
                        var urlCenter = extractCenterFromUrl();
                        if (isDefined(urlCenter) && !isSameCenterOnMap(urlCenter, map)) {
                            //$log.debug("updating center model...", urlCenter);
                            angular.extend(scope.center, {
                                lat: urlCenter.lat,
                                lng: urlCenter.lng,
                                zoom: urlCenter.zoom
                            });
                        }
                    });
                }

                leafletScope.$watch("center", function(center) {
                    //$log.debug("updated center model...");
                    // The center from the URL has priority
                    if (isDefined(urlCenterHash)) {
                        angular.copy(urlCenterHash, center);
                        urlCenterHash = undefined;
                    }

                    if (!isValidCenter(center) && center.autoDiscover !== true) {
                        $log.warn(errorHeader + " invalid 'center'");
                        //map.setView([defaults.center.lat, defaults.center.lng], defaults.center.zoom);
                        return;
                    }

                    if (center.autoDiscover === true) {
                        if (!isNumber(center.zoom)) {
                            map.setView([defaults.center.lat, defaults.center.lng], defaults.center.zoom);
                        }
                        if (isNumber(center.zoom) && center.zoom > defaults.center.zoom) {
                            map.locate({ setView: true, maxZoom: center.zoom });
                        } else if (isDefined(defaults.maxZoom)) {
                            map.locate({ setView: true, maxZoom: defaults.maxZoom });
                        } else {
                            map.locate({ setView: true });
                        }
                        return;
                    }

                    if (mapReady && isSameCenterOnMap(center, map)) {
                        //$log.debug("no need to update map again.");
                        return;
                    }

                    //$log.debug("updating map center...", center);
                    leafletScope.settingCenterFromScope = true;
                    map.setView([center.lat, center.lng], center.zoom);
                    leafletEvents.notifyCenterChangedToBounds(leafletScope, map);
                    $timeout(function() {
                        leafletScope.settingCenterFromScope = false;
                        //$log.debug("allow center scope updates");
                    });
                }, true);

                map.whenReady(function() {
                    mapReady = true;
                });

                map.on('moveend', function(/* event */) {
                    // Resolve the center after the first map position
                    _leafletCenter.resolve();
                    leafletEvents.notifyCenterUrlHashChanged(leafletScope, map, attrs, $location.search());
                    //$log.debug("updated center on map...");
                    if (isSameCenterOnMap(centerModel, map) || scope.settingCenterFromScope) {
                        //$log.debug("same center in model, no need to update again.");
                        return;
                    }
                    safeApply(leafletScope, function(scope) {
                        if (!leafletScope.settingCenterFromScope) {
                            //$log.debug("updating center model...", map.getCenter(), map.getZoom());
                            angular.extend(scope.center,{
                                lat: map.getCenter().lat,
                                lng: map.getCenter().lng,
                                zoom: map.getZoom(),
                                autoDiscover: false
                            });
                        }
                        leafletEvents.notifyCenterChangedToBounds(leafletScope, map);
                    });
                });

                if (centerModel.autoDiscover === true) {
                    map.on('locationerror',  function() {
                        $log.warn(errorHeader + " The Geolocation API is unauthorized on this page.");
                        if (isValidCenter(centerModel)) {
                            map.setView([centerModel.lat, centerModel.lng], centerModel.zoom);
                            leafletEvents.notifyCenterChangedToBounds(leafletScope, map);
                        } else {
                            map.setView([defaults.center.lat, defaults.center.lng], defaults.center.zoom);
                            leafletEvents.notifyCenterChangedToBounds(leafletScope, map);
                        }
                    });
                }
            });
        }
    };
}]);

angular.module("leaflet-directive").directive('controls', ["$log", "leafletHelpers", "leafletLayerHelpers", function ($log, leafletHelpers, leafletLayerHelpers) {
    return {
        restrict: "A",
        scope: false,
        replace: false,
        require: '?^leaflet',

        link: function(scope, element, attrs, controller) {
            if(!controller) {
                return;
            }

            var isDefined = leafletHelpers.isDefined,
                createLayer = leafletLayerHelpers.createLayer,
                leafletScope  = controller.getLeafletScope(),
                controls = leafletScope.controls,
                errorHeader = leafletHelpers.errorHeader + ' [Controls] ';

            controller.getMap().then(function(map) {
                if (isDefined(L.Control.Draw) && isDefined(controls.draw)) {

                    if (!isDefined(controls.edit)) {
                        controls.edit = { featureGroup: new L.FeatureGroup() };
                        map.addLayer(controls.edit.featureGroup);
                    }

                    var drawControl = new L.Control.Draw(controls);
                    map.addControl(drawControl);
                }

                if (isDefined(controls.scale)) {
                    var scaleControl = new L.control.scale(controls.scale);
                    map.addControl(scaleControl);
                }

                if (isDefined(controls.fullscreen)) {
                    if (leafletHelpers.FullScreenControlPlugin.isLoaded()) {
                        var fullscreenControl = new L.Control.Fullscreen(controls.fullscreen);
                        map.addControl(fullscreenControl);
                    } else {
                        $log.error(errorHeader + ' Fullscreen plugin is not loaded.');
                    }
                }

                if (isDefined(controls.search)) {
                    if (leafletHelpers.SearchControlPlugin.isLoaded()) {
                        var searchControl = new L.Control.Search(controls.search);
                        map.addControl(searchControl);
                    } else {
                        $log.error(errorHeader + ' Search plugin is not loaded.');
                    }
                }

                if(isDefined(controls.minimap)) {
                    if (leafletHelpers.MiniMapControlPlugin.isLoaded()) {
                        if(isDefined(controls.minimap.layer)) {
                            var layer = createLayer(controls.minimap.layer);
                            delete controls.minimap.layer;

                            if(isDefined(layer)) {
                                if(isDefined(leafletScope.center)) {
                                    var moveend = function(/* event */) {
                                        var minimapControl = new L.Control.MiniMap(layer, controls.minimap);
                                        map.addControl(minimapControl);
                                        map.off('moveend', moveend);
                                    };
                                    map.on('moveend', moveend);
                                } else {
                                    var minimapControl = new L.Control.MiniMap(layer, controls.minimap);
                                    map.addControl(minimapControl);
                                }
                            } else {
                                $log.warn(errorHeader + ' Layer could not be created.');
                            }
                        } else {
                            $log.warn(errorHeader +' Layer option should be defined.');
                        }
                    } else {
                        $log.error(errorHeader + ' Minimap plugin is not loaded.');
                    }
                }

                if (isDefined(controls.custom)) {
                    for(var i in controls.custom) {
                        map.addControl(controls.custom[i]);
                    }
                }
            });
        }
    };
}]);

angular.module("leaflet-directive").directive("decorations", ["$log", "leafletHelpers", function($log, leafletHelpers) {
	return {
		restrict: "A",
		scope: false,
		replace: false,
		require: 'leaflet',

		link: function(scope, element, attrs, controller) {
			var leafletScope = controller.getLeafletScope(),
				PolylineDecoratorPlugin = leafletHelpers.PolylineDecoratorPlugin,
				isDefined = leafletHelpers.isDefined,
				leafletDecorations = {};

			/* Creates an "empty" decoration with a set of coordinates, but no pattern. */
			function createDecoration(options) {
				if (isDefined(options) && isDefined(options.coordinates)) {
					if (!PolylineDecoratorPlugin.isLoaded()) {
						$log.error('[AngularJS - Leaflet] The PolylineDecorator Plugin is not loaded.');
					}
				}

				return L.polylineDecorator(options.coordinates);
			}

			/* Updates the path and the patterns for the provided decoration, and returns the decoration. */
			function setDecorationOptions(decoration, options) {
				if (isDefined(decoration) && isDefined(options)) {
					if (isDefined(options.coordinates) && isDefined(options.patterns)) {
						decoration.setPaths(options.coordinates);
						decoration.setPatterns(options.patterns);
						return decoration;
					}
				}
			}

			controller.getMap().then(function(map) {
				leafletScope.$watch("decorations", function(newDecorations) {
					for (var name in leafletDecorations) {
						if (!isDefined(newDecorations[name]) || !angular.equals(newDecorations[name], leafletDecorations)) {
							map.removeLayer(leafletDecorations[name]);
							delete leafletDecorations[name];
						}
					}

					for (var newName in newDecorations) {
						var decorationData = newDecorations[newName],
							newDecoration = createDecoration(decorationData);

						if (isDefined(newDecoration)) {
							leafletDecorations[newName] = newDecoration;
							map.addLayer(newDecoration);
							setDecorationOptions(newDecoration, decorationData);
						}
					}
				}, true);
			});
		}
	};
}]);

angular.module("leaflet-directive").directive('eventBroadcast', ["$log", "$rootScope", "leafletHelpers", "leafletEvents", "leafletIterators", function ($log, $rootScope, leafletHelpers, leafletEvents, leafletIterators) {
    return {
        restrict: "A",
        scope: false,
        replace: false,
        require: 'leaflet',

        link: function(scope, element, attrs, controller) {
            var isObject = leafletHelpers.isObject,
                isDefined = leafletHelpers.isDefined,
                leafletScope  = controller.getLeafletScope(),
                eventBroadcast = leafletScope.eventBroadcast,
                availableMapEvents = leafletEvents.getAvailableMapEvents(),
                addEvents = leafletEvents.addEvents;

            controller.getMap().then(function(map) {

                var mapEvents = [],
                    logic = "broadcast";

                // We have a possible valid object
                if (!isDefined(eventBroadcast.map)) {
                    // We do not have events enable/disable do we do nothing (all enabled by default)
                    mapEvents = availableMapEvents;
                } else if (!isObject(eventBroadcast.map)) {
                    // Not a valid object
                    $log.warn("[AngularJS - Leaflet] event-broadcast.map must be an object check your model.");
                } else {
                    // We have a possible valid map object
                    // Event propadation logic
                    if (eventBroadcast.map.logic !== "emit" && eventBroadcast.map.logic !== "broadcast") {
                        // This is an error
                        $log.warn("[AngularJS - Leaflet] Available event propagation logic are: 'emit' or 'broadcast'.");
                    } else {
                        logic = eventBroadcast.map.logic;
                    }

                    if (!(isObject(eventBroadcast.map.enable) && eventBroadcast.map.enable.length >= 0)) {
                        $log.warn("[AngularJS - Leaflet] event-broadcast.map.enable must be an object check your model.");
                    } else {
                        // Enable events
                        leafletIterators.each(eventBroadcast.map.enable, function(eventName) {
                            // Do we have already the event enabled?
                            if (mapEvents.indexOf(eventName) === -1 && availableMapEvents.indexOf(eventName) !== -1) {
                                mapEvents.push(eventName);
                            }
                        });
                    }

                }
                // as long as the map is removed in the root leaflet directive we
                // do not need ot clean up the events as leaflet does it itself
                addEvents(map, mapEvents, "eventName", leafletScope, logic);
            });
        }
    };
}]);

angular.module("leaflet-directive")
.directive('geojson', ["$log", "$rootScope", "leafletData", "leafletHelpers", "leafletWatchHelpers", "leafletDirectiveControlsHelpers", "leafletIterators", "leafletGeoJsonEvents", function ($log, $rootScope, leafletData, leafletHelpers,
    leafletWatchHelpers, leafletDirectiveControlsHelpers,leafletIterators,
    leafletGeoJsonEvents) {

    var _maybeWatch = leafletWatchHelpers.maybeWatch,
        _watchOptions = leafletHelpers.watchOptions,
        _extendDirectiveControls = leafletDirectiveControlsHelpers.extend,
        hlp = leafletHelpers,
        $it = leafletIterators;

    return {
        restrict: "A",
        scope: false,
        replace: false,
        require: 'leaflet',

        link: function(scope, element, attrs, controller) {
            var isDefined = leafletHelpers.isDefined,
                leafletScope  = controller.getLeafletScope(),
                leafletGeoJSON = {},
                _hasSetLeafletData = false;

            controller.getMap().then(function(map) {
                var watchOptions = leafletScope.geojsonWatchOptions || _watchOptions;

                var _hookUpEvents = function(geojson, maybeName){
                    var onEachFeature;

                    if (angular.isFunction(geojson.onEachFeature)) {
                        onEachFeature = geojson.onEachFeature;
                    } else {
                        onEachFeature = function(feature, layer) {
                            if (leafletHelpers.LabelPlugin.isLoaded() && isDefined(feature.properties.description)) {
                                layer.bindLabel(feature.properties.description);
                            }

                            leafletGeoJsonEvents.bindEvents(layer, null, feature,
                                leafletScope, maybeName,
                                {resetStyleOnMouseout: geojson.resetStyleOnMouseout,
                                mapId: attrs.id});
                        };
                    }
                    return onEachFeature;
                };

                var isNested = (hlp.isDefined(attrs.geojsonNested) &&
                    hlp.isTruthy(attrs.geojsonNested));

                var _clean = function(){
                    if(!leafletGeoJSON)
                        return;
                    var _remove = function(lObject) {
                        if (isDefined(lObject) && map.hasLayer(lObject)) {
                            map.removeLayer(lObject);
                        }
                    };
                    if(isNested) {
                        $it.each(leafletGeoJSON, function(lObject) {
                            _remove(lObject);
                        });
                        return;
                    }
                    _remove(leafletGeoJSON);
                };

                var _addGeojson = function(model, maybeName){
                    var geojson = angular.copy(model);
                    if (!(isDefined(geojson) && isDefined(geojson.data))) {
                        return;
                    }
                    var onEachFeature = _hookUpEvents(geojson, maybeName);

                    if (!isDefined(geojson.options)) {
                        //right here is why we use a clone / copy (we modify and thus)
                        //would kick of a watcher.. we need to be more careful everywhere
                        //for stuff like this
                        geojson.options = {
                            style: geojson.style,
                            filter: geojson.filter,
                            onEachFeature: onEachFeature,
                            pointToLayer: geojson.pointToLayer
                        };
                    }

                    var lObject = L.geoJson(geojson.data, geojson.options);

                    if(maybeName && hlp.isString(maybeName)){
                        leafletGeoJSON[maybeName] = lObject;
                    }
                    else{
                        leafletGeoJSON = lObject;
                    }

                    lObject.addTo(map);

                    if(!_hasSetLeafletData){//only do this once and play with the same ref forever
                        _hasSetLeafletData = true;
                        leafletData.setGeoJSON(leafletGeoJSON, attrs.id);
                    }
                };

                var _create = function(model){
                    _clean();
                    if(isNested) {
                        if(!model || !Object.keys(model).length)
                            return;
                        $it.each(model, function(m, name) {
                            //name could be layerName and or groupName
                            //for now it is not tied to a layer
                            _addGeojson(m,name);
                        });
                        return;
                    }
                    _addGeojson(model);
                };

                _extendDirectiveControls(attrs.id, 'geojson', _create, _clean);

                _maybeWatch(leafletScope,'geojson', watchOptions, function(geojson){
                    _create(geojson);
                });
            });
        }
    };
}]);

angular.module("leaflet-directive").directive('opacityControl', ["$log", "leafletData", "leafletHelpers", function($log, leafletData, leafletHelpers) {
    return {
        scope: false,
        restrict: 'A',
        require: '^layercontrol',
        transclude: false,
        replace: false,
        link: function(scope, element) {
            var isDefined = leafletHelpers.isDefined,
                op;

            scope.$watch(function() {
                return scope.layerProperties[scope.layer.name];
            }, function(layerProperties) {
                if(!isDefined(layerProperties)) {
                    return;
                }

                op = layerProperties.opacity;

                if(isDefined(element.ionRangeSlider)) {
                    var input = '<input type="text" class="lf-opacity-control" data-key="' + scope.layer.index + '" value="' + op + '"/>';
                    input = angular.element(input).appendTo(element);

                    input.ionRangeSlider({
                        min: 0,
                        step: 1,
                        max: 100,
                        prettify: false,
                        hasGrid: false,
                        hideMinMax: false
                    });
                    scope.$watch(function() {
                        return scope.layerProperties[scope.layer.name].opacityControl;
                    }, function() {
                        if(scope.layer.visible && layerProperties.opacityControl) {
                            element.show();
                            input.ionRangeSlider('update', {
                                from: op,
                                onChange: function(val) {
                                    leafletData.getMap().then(function(map) {
                                        leafletData.getLayers().then(function(leafletLayers) {
                                            var key = val.input.data().key;
                                            var ly;
                                            for(var k in scope.layers.overlays) {
                                                if(scope.layers.overlays[k].index === key) {
                                                    ly = leafletLayers.overlays[k];
                                                    break;
                                                }
                                            }
                                            if(map.hasLayer(ly)) {
                                                layerProperties.opacity = val.input.val();
                                                if(ly.setOpacity) {
                                                    ly.setOpacity(val.input.val()/100);
                                                }
                                                if(ly.getLayers && ly.eachLayer) {
                                                    ly.eachLayer(function(lay) {
                                                        if(lay.setOpacity) {
                                                            lay.setOpacity(val.input.val()/100);
                                                        }
                                                    });
                                                }
                                            }
                                        });
                                    });
                                }
                            });
                        } else {
                            element.hide();
                        }
                    });
                } else {
                    $log.warn('[AngularJS - Leaflet] Ion Slide Range Plugin is not loaded');
                }
            });
        }
    };
}]).directive('layercontrol', ["$filter", "$log", "leafletData", "leafletHelpers", function ($filter, $log, leafletData, leafletHelpers) {
  return {
    restrict: "E",
    scope: {
        setIcons: '='
    },
    replace: true,
    transclude: false,
    require: '^leaflet',
    controller: ["$scope", "$element", "$sce", function ($scope, $element, $sce) {
      $log.debug('[Angular Directive - Layers] layers', $scope, $element);
      var safeApply = leafletHelpers.safeApply,
        isDefined = leafletHelpers.isDefined;
      angular.extend($scope, {
        baselayer: '',
        layerProperties: {},
        icons: {
          uncheck: 'fa fa-square-o',
          check: 'fa fa-check-square-o',
          radio: 'fa fa-dot-circle-o',
          unradio: 'fa fa-circle-o',
          up: 'fa fa-angle-up',
          down: 'fa fa-angle-down',
          open: 'fa fa-angle-double-down',
          close: 'fa fa-angle-double-up',
          toggleLegend: 'fa fa-pencil-square-o'
        },
        changeBaseLayer: function(key, e) {
          leafletHelpers.safeApply($scope, function(scp) {
            scp.baselayer = key;
            leafletData.getMap().then(function(map) {
              leafletData.getLayers().then(function(leafletLayers) {
                if(map.hasLayer(leafletLayers.baselayers[key])) {
                  return;
                }
                for(var i in scp.layers.baselayers) {
                  scp.layers.baselayers[i].icon = scp.icons.unradio;
                  if(map.hasLayer(leafletLayers.baselayers[i])) {
                    map.removeLayer(leafletLayers.baselayers[i]);
                  }
                }
                map.addLayer(leafletLayers.baselayers[key]);
                scp.layers.baselayers[key].icon = $scope.icons.radio;
              });
            });
          });
          e.preventDefault();
        },
        moveLayer: function(ly, newIndex, e) {
            var delta = Object.keys($scope.layers.baselayers).length;
            if(newIndex >= (1+delta) && newIndex <= ($scope.overlaysArray.length+delta)) {
                var oldLy;
                for(var key in $scope.layers.overlays) {
                    if($scope.layers.overlays[key].index === newIndex) {
                        oldLy = $scope.layers.overlays[key];
                        break;
                    }
                }
                if(oldLy) {
                    safeApply($scope, function() {
                        oldLy.index = ly.index;
                        ly.index = newIndex;
                    });
                }
            }
            e.stopPropagation();
            e.preventDefault();
        },
        initIndex: function(layer, idx) {
            var delta = Object.keys($scope.layers.baselayers).length;
            layer.index = isDefined(layer.index)? layer.index:idx+delta+1;
        },
        toggleOpacity: function(e, layer) {
            if(layer.visible) {
                var el = angular.element(e.currentTarget);
                el.toggleClass($scope.icons.close + ' ' + $scope.icons.open);
                el = el.parents('.lf-row').find('.lf-opacity');
                //el.toggle();
                $scope.layerProperties[layer.name].opacityControl = !$scope.layerProperties[layer.name].opacityControl;
            }
            e.stopPropagation();
            e.preventDefault();
        },
        toggleLegend: function(layer) {
            $scope.layerProperties[layer.name].showLegend = !$scope.layerProperties[layer.name].showLegend;
        },
        showLegend: function(layer) {
            return layer.legend && $scope.layerProperties[layer.name].showLegend;
        },
        unsafeHTML: function(html) {
          return $sce.trustAsHtml(html);
        }
      });

      var div = $element.get(0);
      if (!L.Browser.touch) {
          L.DomEvent.disableClickPropagation(div);
          L.DomEvent.on(div, 'mousewheel', L.DomEvent.stopPropagation);
      } else {
          L.DomEvent.on(div, 'click', L.DomEvent.stopPropagation);
      }
    }],
    template:
      '<div class="angular-leaflet-control-layers" ng-show="overlaysArray.length">' +
        '<div class="lf-baselayers">' +
            '<div class="lf-row" ng-repeat="(key, layer) in layers.baselayers">' +
                '<label class="lf-icon-bl" ng-click="changeBaseLayer(key, $event)">' +
                    '<input class="leaflet-control-layers-selector" type="radio" name="lf-radio" ' +
                        'ng-show="false" ng-checked="baselayer === key" ng-value="key" /> ' +
                    '<i class="lf-icon lf-icon-radio" ng-class="layer.icon"></i>' +
                    '<div class="lf-text">{{layer.name}}</div>' +
                '</label>' +
            '</div>' +
        '</div>' +
        '<div class="lf-overlays">' +
            '<div class="lf-container">' +
                '<div class="lf-row" ng-repeat="layer in overlaysArray | orderBy:\'index\':order" ng-init="initIndex(layer, $index)">' +
                    '<label class="lf-icon-ol">' +
                        '<input class="lf-control-layers-selector" type="checkbox" ng-show="false" ng-model="layer.visible"/> ' +
                        '<i class="lf-icon lf-icon-check" ng-class="layer.icon"></i>' +
                        '<div class="lf-text">{{layer.name}}</div>' +
                    '</label>'+
                    '<div class="lf-icons">' +
                        '<i class="lf-icon lf-up" ng-class="icons.up" ng-click="moveLayer(layer, layer.index - orderNumber, $event)"></i> ' +
                        '<i class="lf-icon lf-down" ng-class="icons.down" ng-click="moveLayer(layer, layer.index + orderNumber, $event)"></i> ' +
                        '<i class="lf-icon lf-toggle-legend" ng-class="icons.toggleLegend" ng-if="layer.legend" ng-click="toggleLegend(layer)"></i> ' +
                        '<i class="lf-icon lf-open" ng-class="layer.opacityControl? icons.close:icons.open" ng-click="toggleOpacity($event, layer)"></i>' +
                    '</div>' +
                    '<div class="lf-legend" ng-if="showLegend(layer)" ng-bind-html="unsafeHTML(layer.legend)"></div>' +
                    '<div class="lf-opacity" opacity-control>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>' +
      '</div>',
    link: function(scope, element, attrs, controller) {
        var isDefined = leafletHelpers.isDefined,
        leafletScope = controller.getLeafletScope(),
        layers = leafletScope.layers;

        // Setting layer stack order.
        attrs.order = (isDefined(attrs.order) && (attrs.order === 'normal' || attrs.order === 'reverse'))? attrs.order:'normal';
        scope.order = attrs.order === 'normal';
        scope.orderNumber = attrs.order === 'normal'? -1:1;

        scope.layers = layers;
        controller.getMap().then(function(map) {

            leafletScope.$watch('layers.baselayers', function(newBaseLayers) {
                leafletData.getLayers().then(function(leafletLayers) {
                    var key;
                    for(key in newBaseLayers) {
                      if(map.hasLayer(leafletLayers.baselayers[key])) {
                        newBaseLayers[key].icon = scope.icons.radio;
                      } else {
                        newBaseLayers[key].icon = scope.icons.unradio;
                      }
                    }
                });
            });

            leafletScope.$watch('layers.overlays', function(newOverlayLayers) {
                var overlaysArray = [];
                leafletData.getLayers().then(function(leafletLayers) {
                    for(var key in newOverlayLayers) {
                        newOverlayLayers[key].icon = scope.icons[(newOverlayLayers[key].visible? 'check':'uncheck')];
                        overlaysArray.push(newOverlayLayers[key]);
                        if(!isDefined(scope.layerProperties[newOverlayLayers[key].name])) {
                            scope.layerProperties[newOverlayLayers[key].name] = {
                                opacity: isDefined(newOverlayLayers[key].layerOptions.opacity)? newOverlayLayers[key].layerOptions.opacity*100:100,
                                opacityControl: false,
                                showLegend: true
                            };
                        }
                        if(isDefined(newOverlayLayers[key].index) && leafletLayers.overlays[key].setZIndex) {
                            leafletLayers.overlays[key].setZIndex(newOverlayLayers[key].index);
                        }
                    }
                });
                scope.overlaysArray = overlaysArray;
            }, true);
        });

        scope.$watch('setIcons', function(newIcons) {
            angular.extend(scope.icons, newIcons);
        });
    }
  };
}]);

angular.module("leaflet-directive").directive('layers', ["$log", "$q", "leafletData", "leafletHelpers", "leafletLayerHelpers", "leafletControlHelpers", function ($log, $q, leafletData, leafletHelpers, leafletLayerHelpers, leafletControlHelpers) {
    return {
        restrict: "A",
        scope: false,
        replace: false,
        require: 'leaflet',
        controller: ["$scope", function ($scope) {
            $scope._leafletLayers = $q.defer();
            this.getLayers = function () {
                return $scope._leafletLayers.promise;
            };
        }],
        link: function(scope, element, attrs, controller){
            var isDefined = leafletHelpers.isDefined,
                leafletLayers = {},
                leafletScope  = controller.getLeafletScope(),
                layers = leafletScope.layers,
                createLayer = leafletLayerHelpers.createLayer,
                updateLayersControl = leafletControlHelpers.updateLayersControl,
                isLayersControlVisible = false;

            controller.getMap().then(function(map) {

                // We have baselayers to add to the map
                scope._leafletLayers.resolve(leafletLayers);
                leafletData.setLayers(leafletLayers, attrs.id);

                leafletLayers.baselayers = {};
                leafletLayers.overlays = {};

                var mapId = attrs.id;

                // Setup all baselayers definitions
                var oneVisibleLayer = false;
                for (var layerName in layers.baselayers) {
                    var newBaseLayer = createLayer(layers.baselayers[layerName]);
                    if (!isDefined(newBaseLayer)) {
                        delete layers.baselayers[layerName];
                        continue;
                    }
                    leafletLayers.baselayers[layerName] = newBaseLayer;
                    // Only add the visible layer to the map, layer control manages the addition to the map
                    // of layers in its control
                    if (layers.baselayers[layerName].top === true) {
                        map.addLayer(leafletLayers.baselayers[layerName]);
                        oneVisibleLayer = true;
                    }
                }

                // If there is no visible layer add first to the map
                if (!oneVisibleLayer && Object.keys(leafletLayers.baselayers).length > 0) {
                    map.addLayer(leafletLayers.baselayers[Object.keys(layers.baselayers)[0]]);
                }

                // Setup the Overlays
                for (layerName in layers.overlays) {
                    if(layers.overlays[layerName].type === 'cartodb') {

                    }
                    var newOverlayLayer = createLayer(layers.overlays[layerName]);
                    if (!isDefined(newOverlayLayer)) {
                        delete layers.overlays[layerName];
                        continue;
                    }
                    leafletLayers.overlays[layerName] = newOverlayLayer;
                    // Only add the visible overlays to the map
                    if (layers.overlays[layerName].visible === true) {
                        map.addLayer(leafletLayers.overlays[layerName]);
                    }
                }

                // Watch for the base layers
                leafletScope.$watch('layers.baselayers', function(newBaseLayers, oldBaseLayers) {
                    if(angular.equals(newBaseLayers, oldBaseLayers)) {
                        isLayersControlVisible = updateLayersControl(map, mapId, isLayersControlVisible, newBaseLayers, layers.overlays, leafletLayers);
                        return true;
                    }
                    // Delete layers from the array
                    for (var name in leafletLayers.baselayers) {
                        if (!isDefined(newBaseLayers[name]) || newBaseLayers[name].doRefresh) {
                            // Remove from the map if it's on it
                            if (map.hasLayer(leafletLayers.baselayers[name])) {
                                map.removeLayer(leafletLayers.baselayers[name]);
                            }
                            delete leafletLayers.baselayers[name];

                            if (newBaseLayers[name] && newBaseLayers[name].doRefresh) {
                                newBaseLayers[name].doRefresh = false;
                            }
                        }
                    }
                    // add new layers
                    for (var newName in newBaseLayers) {
                        if (!isDefined(leafletLayers.baselayers[newName])) {
                            var testBaseLayer = createLayer(newBaseLayers[newName]);
                            if (isDefined(testBaseLayer)) {
                                leafletLayers.baselayers[newName] = testBaseLayer;
                                // Only add the visible layer to the map
                                if (newBaseLayers[newName].top === true) {
                                    map.addLayer(leafletLayers.baselayers[newName]);
                                }
                            }
                        } else {
                            if (newBaseLayers[newName].top === true && !map.hasLayer(leafletLayers.baselayers[newName])) {
                                map.addLayer(leafletLayers.baselayers[newName]);
                            } else if (newBaseLayers[newName].top === false && map.hasLayer(leafletLayers.baselayers[newName])) {
                                map.removeLayer(leafletLayers.baselayers[newName]);
                            }
                        }
                    }

                    //we have layers, so we need to make, at least, one active
                    var found = false;
                    // search for an active layer
                    for (var key in leafletLayers.baselayers) {
                        if (map.hasLayer(leafletLayers.baselayers[key])) {
                            found = true;
                            break;
                        }
                    }
                    // If there is no active layer make one active
                    if (!found && Object.keys(leafletLayers.baselayers).length > 0) {
                        map.addLayer(leafletLayers.baselayers[Object.keys(leafletLayers.baselayers)[0]]);
                    }

                    // Only show the layers switch selector control if we have more than one baselayer + overlay
                    isLayersControlVisible = updateLayersControl(map, mapId, isLayersControlVisible, newBaseLayers, layers.overlays, leafletLayers);
                }, true);

                // Watch for the overlay layers
                leafletScope.$watch('layers.overlays', function(newOverlayLayers, oldOverlayLayers) {
                    if(angular.equals(newOverlayLayers, oldOverlayLayers)) {
                        isLayersControlVisible = updateLayersControl(map, mapId, isLayersControlVisible, layers.baselayers, newOverlayLayers, leafletLayers);
                        return true;
                    }
                    // Delete layers from the array
                    for (var name in leafletLayers.overlays) {
                        if (!isDefined(newOverlayLayers[name]) || newOverlayLayers[name].doRefresh) {
                            // Remove from the map if it's on it
                            if (map.hasLayer(leafletLayers.overlays[name])) {
                                map.removeLayer(leafletLayers.overlays[name]);
                            }
                            // TODO: Depending on the layer type we will have to delete what's included on it
                            delete leafletLayers.overlays[name];

                            if (newOverlayLayers[name] && newOverlayLayers[name].doRefresh) {
                                newOverlayLayers[name].doRefresh = false;
                            }
                        }
                    }

                    // add new overlays
                    for (var newName in newOverlayLayers) {
                        if (!isDefined(leafletLayers.overlays[newName])) {
                            var testOverlayLayer = createLayer(newOverlayLayers[newName]);
                            if (!isDefined(testOverlayLayer)) {
                                // If the layer creation fails, continue to the next overlay
                                continue;
                            }
                            leafletLayers.overlays[newName] = testOverlayLayer;
                            if (newOverlayLayers[newName].visible === true) {
                                map.addLayer(leafletLayers.overlays[newName]);
                            }
                        }

                        // check for the .visible property to hide/show overLayers
                        if (newOverlayLayers[newName].visible && !map.hasLayer(leafletLayers.overlays[newName])) {
                            map.addLayer(leafletLayers.overlays[newName]);
                        } else if (newOverlayLayers[newName].visible === false && map.hasLayer(leafletLayers.overlays[newName])) {
                            map.removeLayer(leafletLayers.overlays[newName]);
                        }

                        //refresh heatmap data if present
                        if (newOverlayLayers[newName].visible && map._loaded && newOverlayLayers[newName].data && newOverlayLayers[newName].type === "heatmap") {
                            leafletLayers.overlays[newName].setData(newOverlayLayers[newName].data);
                            leafletLayers.overlays[newName].update();
                        }
                    }

                    // Only add the layers switch selector control if we have more than one baselayer + overlay
                    isLayersControlVisible = updateLayersControl(map, mapId, isLayersControlVisible, layers.baselayers, newOverlayLayers, leafletLayers);
                }, true);
            });
        }
    };
}]);

angular.module("leaflet-directive").directive('legend', ["$log", "$http", "leafletHelpers", "leafletLegendHelpers", function ($log, $http, leafletHelpers, leafletLegendHelpers) {
        return {
            restrict: "A",
            scope: false,
            replace: false,
            require: 'leaflet',

            link: function (scope, element, attrs, controller) {

                var isArray = leafletHelpers.isArray,
                    isDefined = leafletHelpers.isDefined,
                    isFunction = leafletHelpers.isFunction,
                    leafletScope = controller.getLeafletScope(),
                    legend = leafletScope.legend;

                var legendClass;
                var position;
                var leafletLegend;
                var type;

                leafletScope.$watch('legend', function (newLegend) {

                    if (isDefined(newLegend)) {

                        legendClass = newLegend.legendClass ? newLegend.legendClass : "legend";

                        position = newLegend.position || 'bottomright';

                        // default to arcgis
                        type = newLegend.type || 'arcgis'; 
                    }

                }, true);

                controller.getMap().then(function (map) {

                    leafletScope.$watch('legend', function (newLegend) {

                        if (!isDefined(newLegend)) {

                            if (isDefined(leafletLegend)) {
                                leafletLegend.removeFrom(map);
                                leafletLegend= null;
                            }

                            return;
                        }

                        if (!isDefined(newLegend.url) && (type === 'arcgis') && (!isArray(newLegend.colors) || !isArray(newLegend.labels) || newLegend.colors.length !== newLegend.labels.length)) {

                            $log.warn("[AngularJS - Leaflet] legend.colors and legend.labels must be set.");

                            return;
                        }

                        if (isDefined(newLegend.url)) {

                            $log.info("[AngularJS - Leaflet] loading legend service.");

                            return;
                        }

                        if (isDefined(leafletLegend)) {
                            leafletLegend.removeFrom(map);
                            leafletLegend= null;
                        }

                        leafletLegend = L.control({
                            position: position
                        });
                        if (type === 'arcgis') {
                            leafletLegend.onAdd = leafletLegendHelpers.getOnAddArrayLegend(newLegend, legendClass);
                        }
                        leafletLegend.addTo(map);

                    });

                    leafletScope.$watch('legend.url', function (newURL) {

                        if (!isDefined(newURL)) {
                            return;
                        }
                        $http.get(newURL)
                            .success(function (legendData) {

                                if (isDefined(leafletLegend)) {

                                    leafletLegendHelpers.updateLegend(leafletLegend.getContainer(), legendData, type, newURL);

                                } else {

                                    leafletLegend = L.control({
                                        position: position
                                    });
                                    leafletLegend.onAdd = leafletLegendHelpers.getOnAddLegend(legendData, legendClass, type, newURL);
                                    leafletLegend.addTo(map);
                                }

                                if (isDefined(legend.loadedData) && isFunction(legend.loadedData)) {
                                    legend.loadedData();
                                }
                            })
                            .error(function () {
                                $log.warn('[AngularJS - Leaflet] legend.url not loaded.');
                            });
                    });

                });
            }
        };
    }]);

angular.module("leaflet-directive").directive('markers',
    ["$log", "$rootScope", "$q", "leafletData", "leafletHelpers", "leafletMapDefaults", "leafletMarkersHelpers", "leafletMarkerEvents", "leafletIterators", "leafletWatchHelpers", "leafletDirectiveControlsHelpers", function ($log, $rootScope, $q, leafletData, leafletHelpers, leafletMapDefaults,
              leafletMarkersHelpers, leafletMarkerEvents, leafletIterators, leafletWatchHelpers,
              leafletDirectiveControlsHelpers) {
    //less terse vars to helpers
    var isDefined = leafletHelpers.isDefined,
        errorHeader = leafletHelpers.errorHeader,
        Helpers = leafletHelpers,
        isString = leafletHelpers.isString,
        addMarkerWatcher = leafletMarkersHelpers.addMarkerWatcher,
        updateMarker = leafletMarkersHelpers.updateMarker,
        listenMarkerEvents = leafletMarkersHelpers.listenMarkerEvents,
        addMarkerToGroup = leafletMarkersHelpers.addMarkerToGroup,
        createMarker = leafletMarkersHelpers.createMarker,
        deleteMarker = leafletMarkersHelpers.deleteMarker,
        $it = leafletIterators,
        _markersWatchOptions = leafletHelpers.watchOptions,
        maybeWatch = leafletWatchHelpers.maybeWatch,
        extendDirectiveControls = leafletDirectiveControlsHelpers.extend;

    var _getLMarker = function(leafletMarkers, name, maybeLayerName){
        if(!Object.keys(leafletMarkers).length) return;
        if(maybeLayerName && isString(maybeLayerName)){
            if(!leafletMarkers[maybeLayerName] || !Object.keys(leafletMarkers[maybeLayerName]).length)
                return;
            return leafletMarkers[maybeLayerName][name];
        }
        return leafletMarkers[name];
    };

    var _setLMarker = function(lObject, leafletMarkers, name, maybeLayerName){
        if(maybeLayerName && isString(maybeLayerName)){
            if(!isDefined(leafletMarkers[maybeLayerName]))
                leafletMarkers[maybeLayerName] = {};
            leafletMarkers[maybeLayerName][name] = lObject;
        }
        else
            leafletMarkers[name] = lObject;
        return lObject;
    };

    var _maybeAddMarkerToLayer = function(layerName, layers, model, marker, doIndividualWatch, map){

        if (!isString(layerName)) {
            $log.error(errorHeader + ' A layername must be a string');
            return false;
        }

        if (!isDefined(layers)) {
            $log.error(errorHeader + ' You must add layers to the directive if the markers are going to use this functionality.');
            return false;
        }

        if (!isDefined(layers.overlays) || !isDefined(layers.overlays[layerName])) {
            $log.error(errorHeader +' A marker can only be added to a layer of type "group"');
            return false;
        }
        var layerGroup = layers.overlays[layerName];
        if (!(layerGroup instanceof L.LayerGroup || layerGroup instanceof L.FeatureGroup)) {
            $log.error(errorHeader + ' Adding a marker to an overlay needs a overlay of the type "group" or "featureGroup"');
            return false;
        }

        // The marker goes to a correct layer group, so first of all we add it
        layerGroup.addLayer(marker);

        // The marker is automatically added to the map depending on the visibility
        // of the layer, so we only have to open the popup if the marker is in the map
        if (!doIndividualWatch && map.hasLayer(marker) && model.focus === true) {
            marker.openPopup();
        }
        return true;
    };
    //TODO: move to leafletMarkersHelpers??? or make a new class/function file (leafletMarkersHelpers is large already)
    var _addMarkers = function(markersToRender, oldModels, map, layers, leafletMarkers, leafletScope,
                               watchOptions, maybeLayerName, skips){
        for (var newName in markersToRender) {
            if(skips[newName])
                continue;

            if (newName.search("-") !== -1) {
                $log.error('The marker can\'t use a "-" on his key name: "' + newName + '".');
                continue;
            }

            var model = Helpers.copy(markersToRender[newName]);
            var pathToMarker = Helpers.getObjectDotPath(maybeLayerName? [maybeLayerName, newName]: [newName]);
            var maybeLMarker = _getLMarker(leafletMarkers,newName, maybeLayerName);
            if (!isDefined(maybeLMarker)) {
                //(nmccready) very important to not have model changes when lObject is changed
                //this might be desirable in some cases but it causes two-way binding to lObject which is not ideal
                //if it is left as the reference then all changes from oldModel vs newModel are ignored
                //see _destroy (where modelDiff becomes meaningless if we do not copy here)
                var marker = createMarker(model);
                var layerName = (model? model.layer : undefined) || maybeLayerName; //original way takes pref
                if (!isDefined(marker)) {
                    $log.error(errorHeader + ' Received invalid data on the marker ' + newName + '.');
                    continue;
                }
                _setLMarker(marker, leafletMarkers, newName, maybeLayerName);

                // Bind message
                if (isDefined(model.message)) {
                    marker.bindPopup(model.message, model.popupOptions);
                }

                // Add the marker to a cluster group if needed
                if (isDefined(model.group)) {
                    var groupOptions = isDefined(model.groupOption) ? model.groupOption : null;
                    addMarkerToGroup(marker, model.group, groupOptions, map);
                }

                // Show label if defined
                if (Helpers.LabelPlugin.isLoaded() && isDefined(model.label) && isDefined(model.label.message)) {
                    marker.bindLabel(model.label.message, model.label.options);
                }

                // Check if the marker should be added to a layer
                if (isDefined(model) && (isDefined(model.layer) || isDefined(maybeLayerName))){

                    var pass = _maybeAddMarkerToLayer(layerName, layers, model, marker,
                        watchOptions.individual.doWatch, map);
                    if(!pass)
                        continue; //something went wrong move on in the loop
                } else if (!isDefined(model.group)) {
                    // We do not have a layer attr, so the marker goes to the map layer
                    map.addLayer(marker);
                    if (!watchOptions.individual.doWatch && model.focus === true) {
                        marker.openPopup();
                    }
                }

                if (watchOptions.individual.doWatch) {
                    addMarkerWatcher(marker, pathToMarker, leafletScope, layers, map,
                        watchOptions.individual.doWatch);
                }

                listenMarkerEvents(marker, model, leafletScope, watchOptions.individual.doWatch, map);
                leafletMarkerEvents.bindEvents(marker, pathToMarker, model, leafletScope, layerName);
            }
            else {
                var oldModel = isDefined(oldModel)? oldModels[newName] : undefined;
                updateMarker(model, oldModel, maybeLMarker, pathToMarker, leafletScope, layers, map);
            }
        }
    };
    var _seeWhatWeAlreadyHave = function(markerModels, oldMarkerModels, lMarkers, isEqual, cb){
        var hasLogged = false,
            equals = false,
            oldMarker,
            newMarker;

        var doCheckOldModel =  isDefined(oldMarkerModels);
        for (var name in lMarkers) {
            if(!hasLogged) {
                $log.debug(errorHeader + "[markers] destroy: ");
                hasLogged = true;
            }

            if(doCheckOldModel){
                //might want to make the option (in watch options) to disable deep checking
                //ie the options to only check !== (reference check) instead of angular.equals (slow)
                newMarker = markerModels[name];
                oldMarker = oldMarkerModels[name];
                equals = angular.equals(newMarker,oldMarker) && isEqual;
            }
            if (!isDefined(markerModels) ||
                !Object.keys(markerModels).length ||
                !isDefined(markerModels[name]) ||
                !Object.keys(markerModels[name]).length ||
                equals) {
                if(cb && Helpers.isFunction(cb))
                    cb(newMarker, oldMarker, name);
            }
        }
    };
    var _destroy = function(markerModels, oldMarkerModels, lMarkers, map, layers){
        _seeWhatWeAlreadyHave(markerModels, oldMarkerModels, lMarkers, false,
            function(newMarker, oldMarker, lMarkerName){
                $log.debug(errorHeader + '[marker] is deleting marker: ' + lMarkerName);
                deleteMarker(lMarkers[lMarkerName], map, layers);
                delete lMarkers[lMarkerName];
            });
    };

    var _getNewModelsToSkipp =  function(newModels, oldModels, lMarkers){
        var skips = {};
        _seeWhatWeAlreadyHave(newModels, oldModels, lMarkers, true,
            function(newMarker, oldMarker, lMarkerName){
                $log.debug(errorHeader + '[marker] is already rendered, marker: ' + lMarkerName);
                skips[lMarkerName] = newMarker;
            });
        return skips;
    };

    return {
        restrict: "A",
        scope: false,
        replace: false,
        require: ['leaflet', '?layers'],

        link: function(scope, element, attrs, controller) {
            var mapController = controller[0],
                leafletScope  = mapController.getLeafletScope();

            mapController.getMap().then(function(map) {
                var leafletMarkers = {}, getLayers;

                // If the layers attribute is used, we must wait until the layers are created
                if (isDefined(controller[1])) {
                    getLayers = controller[1].getLayers;
                } else {
                    getLayers = function() {
                        var deferred = $q.defer();
                        deferred.resolve();
                        return deferred.promise;
                    };
                }

                var watchOptions = leafletScope.markersWatchOptions || _markersWatchOptions;

                // backwards compat
                if(isDefined(attrs.watchMarkers))
                    watchOptions.doWatch = watchOptions.individual.doWatch =
                        (!isDefined(attrs.watchMarkers) || Helpers.isTruthy(attrs.watchMarkers));

                var isNested = (isDefined(attrs.markersNested) && Helpers.isTruthy(attrs.markersNested));

                getLayers().then(function(layers) {
                    var _clean = function(models, oldModels){
                        if(isNested) {
                            $it.each(models, function(markerToMaybeDel, layerName) {
                                var oldModel = isDefined(oldModel)? oldModels[layerName] : undefined;
                                _destroy(markerToMaybeDel, oldModel, leafletMarkers[layerName], map, layers);
                            });
                            return;
                        }
                        _destroy(models, oldModels, leafletMarkers, map, layers);
                    };

                    var _create = function(models, oldModels){
                        _clean(models, oldModels);
                        var skips = null;
                        if(isNested) {
                            $it.each(models, function(markersToAdd, layerName) {
                                var oldModel = isDefined(oldModel)? oldModels[layerName] : undefined;
                                skips = _getNewModelsToSkipp(models[layerName], oldModel, leafletMarkers[layerName]);
                                _addMarkers(markersToAdd, oldModels, map, layers, leafletMarkers, leafletScope,
                                    watchOptions, layerName, skips);
                            });
                            return;
                        }
                        skips = _getNewModelsToSkipp(models, oldModels, leafletMarkers);
                        _addMarkers(models, oldModels, map, layers, leafletMarkers, leafletScope,
                            watchOptions, undefined, skips);
                    };
                    extendDirectiveControls(attrs.id, 'markers', _create, _clean);
                    leafletData.setMarkers(leafletMarkers, attrs.id);

                    maybeWatch(leafletScope,'markers', watchOptions, function(newMarkers, oldMarkers){
                        _create(newMarkers, oldMarkers);
                    });
                });
            });
        }
    };
}]);

angular.module("leaflet-directive").directive('maxbounds', ["$log", "leafletMapDefaults", "leafletBoundsHelpers", "leafletHelpers", function ($log, leafletMapDefaults, leafletBoundsHelpers, leafletHelpers) {
    return {
        restrict: "A",
        scope: false,
        replace: false,
        require: 'leaflet',

        link: function(scope, element, attrs, controller) {
            var leafletScope  = controller.getLeafletScope(),
                isValidBounds = leafletBoundsHelpers.isValidBounds,
                isNumber = leafletHelpers.isNumber;


            controller.getMap().then(function(map) {
                leafletScope.$watch("maxbounds", function (maxbounds) {
                    if (!isValidBounds(maxbounds)) {
                        // Unset any previous maxbounds
                        map.setMaxBounds();
                        return;
                    }
                    
                    var leafletBounds = leafletBoundsHelpers.createLeafletBounds(maxbounds);
                    if(isNumber(maxbounds.pad)) {
                      leafletBounds = leafletBounds.pad(maxbounds.pad);
                    }

                    map.setMaxBounds(leafletBounds);
                    if (!attrs.center) {
                        map.fitBounds(leafletBounds);
                    }
                });
            });
        }
    };
}]);

angular.module("leaflet-directive").directive('paths', ["$log", "$q", "leafletData", "leafletMapDefaults", "leafletHelpers", "leafletPathsHelpers", "leafletEvents", function ($log, $q, leafletData, leafletMapDefaults, leafletHelpers, leafletPathsHelpers, leafletEvents) {
    return {
        restrict: "A",
        scope: false,
        replace: false,
        require: ['leaflet', '?layers'],

        link: function(scope, element, attrs, controller) {
            var mapController = controller[0],
                isDefined = leafletHelpers.isDefined,
                isString = leafletHelpers.isString,
                leafletScope  = mapController.getLeafletScope(),
                paths     = leafletScope.paths,
                createPath = leafletPathsHelpers.createPath,
                bindPathEvents = leafletEvents.bindPathEvents,
                setPathOptions = leafletPathsHelpers.setPathOptions;

            mapController.getMap().then(function(map) {
                var defaults = leafletMapDefaults.getDefaults(attrs.id),
                    getLayers;

                // If the layers attribute is used, we must wait until the layers are created
                if (isDefined(controller[1])) {
                    getLayers = controller[1].getLayers;
                } else {
                    getLayers = function() {
                        var deferred = $q.defer();
                        deferred.resolve();
                        return deferred.promise;
                    };
                }

                if (!isDefined(paths)) {
                    return;
                }

                getLayers().then(function(layers) {

                    var leafletPaths = {};
                    leafletData.setPaths(leafletPaths, attrs.id);

                    // Should we watch for every specific marker on the map?
                    var shouldWatch = (!isDefined(attrs.watchPaths) || attrs.watchPaths === 'true');

                    // Function for listening every single path once created
                    var watchPathFn = function(leafletPath, name) {
                        var clearWatch = leafletScope.$watch("paths[\""+name+"\"]", function(pathData, old) {
                            if (!isDefined(pathData)) {
                                if (isDefined(old.layer)) {
                                    for (var i in layers.overlays) {
                                        var overlay = layers.overlays[i];
                                        overlay.removeLayer(leafletPath);
                                    }
                                }
                                map.removeLayer(leafletPath);
                                clearWatch();
                                return;
                            }
                            setPathOptions(leafletPath, pathData.type, pathData);
                        }, true);
                    };

                    leafletScope.$watchCollection("paths", function (newPaths) {

                        // Delete paths (by name) from the array
                        for (var name in leafletPaths) {
                            if (!isDefined(newPaths[name])) {
                                map.removeLayer(leafletPaths[name]);
                                delete leafletPaths[name];
                            }
                        }

                        // Create the new paths
                        for (var newName in newPaths) {
                            if (newName.search('\\$') === 0) {
                                continue;
                            }
                            if (newName.search("-") !== -1) {
                                $log.error('[AngularJS - Leaflet] The path name "' + newName + '" is not valid. It must not include "-" and a number.');
                                continue;
                            }

                            if (!isDefined(leafletPaths[newName])) {
                                var pathData = newPaths[newName];
                                var newPath = createPath(newName, newPaths[newName], defaults);

                                // bind popup if defined
                                if (isDefined(newPath) && isDefined(pathData.message)) {
                                    newPath.bindPopup(pathData.message);
                                }

                                // Show label if defined
                                if (leafletHelpers.LabelPlugin.isLoaded() && isDefined(pathData.label) && isDefined(pathData.label.message)) {
                                    newPath.bindLabel(pathData.label.message, pathData.label.options);
                                }

                                // Check if the marker should be added to a layer
                                if (isDefined(pathData) && isDefined(pathData.layer)) {

                                    if (!isString(pathData.layer)) {
                                        $log.error('[AngularJS - Leaflet] A layername must be a string');
                                        continue;
                                    }
                                    if (!isDefined(layers)) {
                                        $log.error('[AngularJS - Leaflet] You must add layers to the directive if the markers are going to use this functionality.');
                                        continue;
                                    }

                                    if (!isDefined(layers.overlays) || !isDefined(layers.overlays[pathData.layer])) {
                                        $log.error('[AngularJS - Leaflet] A marker can only be added to a layer of type "group"');
                                        continue;
                                    }
                                    var layerGroup = layers.overlays[pathData.layer];
                                    if (!(layerGroup instanceof L.LayerGroup || layerGroup instanceof L.FeatureGroup)) {
                                        $log.error('[AngularJS - Leaflet] Adding a marker to an overlay needs a overlay of the type "group" or "featureGroup"');
                                        continue;
                                    }

                                    // Listen for changes on the new path
                                    leafletPaths[newName] = newPath;
                                    // The path goes to a correct layer group, so first of all we add it
                                    layerGroup.addLayer(newPath);

                                    if (shouldWatch) {
                                        watchPathFn(newPath, newName);
                                    } else {
                                        setPathOptions(newPath, pathData.type, pathData);
                                    }
                                } else if (isDefined(newPath)) {
                                    // Listen for changes on the new path
                                    leafletPaths[newName] = newPath;
                                    map.addLayer(newPath);

                                    if (shouldWatch) {
                                        watchPathFn(newPath, newName);
                                    } else {
                                        setPathOptions(newPath, pathData.type, pathData);
                                    }
                                }

                                bindPathEvents(newPath, newName, pathData, leafletScope);
                            }
                        }
                    });
                });
            });
        }
    };
}]);

angular.module("leaflet-directive").directive('tiles', ["$log", "leafletData", "leafletMapDefaults", "leafletHelpers", function ($log, leafletData, leafletMapDefaults, leafletHelpers) {
    return {
        restrict: "A",
        scope: false,
        replace: false,
        require: 'leaflet',

        link: function(scope, element, attrs, controller) {
            var isDefined = leafletHelpers.isDefined,
                leafletScope  = controller.getLeafletScope(),
                tiles = leafletScope.tiles;

            if (!isDefined(tiles) && !isDefined(tiles.url)) {
                $log.warn("[AngularJS - Leaflet] The 'tiles' definition doesn't have the 'url' property.");
                return;
            }

            controller.getMap().then(function(map) {
                var defaults = leafletMapDefaults.getDefaults(attrs.id);
                var tileLayerObj;
                leafletScope.$watch("tiles", function(tiles) {
                    var tileLayerOptions = defaults.tileLayerOptions;
                    var tileLayerUrl = defaults.tileLayer;

                    // If no valid tiles are in the scope, remove the last layer
                    if (!isDefined(tiles.url) && isDefined(tileLayerObj)) {
                        map.removeLayer(tileLayerObj);
                        return;
                    }

                    // No leafletTiles object defined yet
                    if (!isDefined(tileLayerObj)) {
                        if (isDefined(tiles.options)) {
                            angular.copy(tiles.options, tileLayerOptions);
                        }

                        if (isDefined(tiles.url)) {
                            tileLayerUrl = tiles.url;
                        }

                        tileLayerObj = L.tileLayer(tileLayerUrl, tileLayerOptions);
                        tileLayerObj.addTo(map);
                        leafletData.setTiles(tileLayerObj, attrs.id);
                        return;
                    }

                    // If the options of the tilelayer is changed, we need to redraw the layer
                    if (isDefined(tiles.url) && isDefined(tiles.options) && !angular.equals(tiles.options, tileLayerOptions)) {
                        map.removeLayer(tileLayerObj);
                        tileLayerOptions = defaults.tileLayerOptions;
                        angular.copy(tiles.options, tileLayerOptions);
                        tileLayerUrl = tiles.url;
                        tileLayerObj = L.tileLayer(tileLayerUrl, tileLayerOptions);
                        tileLayerObj.addTo(map);
                        leafletData.setTiles(tileLayerObj, attrs.id);
                        return;
                    }

                    // Only the URL of the layer is changed, update the tiles object
                    if (isDefined(tiles.url)) {
                        tileLayerObj.setUrl(tiles.url);
                    }
                }, true);
            });
        }
    };
}]);

/*
    Create multiple similar directives for watchOptions to support directiveControl
    instead. (when watches are disabled)
    NgAnnotate does not work here due to the functional creation
*/
['markers', 'geojson'].forEach(function(name){
    angular.module("leaflet-directive").directive(name + 'WatchOptions', [
        '$log', '$rootScope', '$q', 'leafletData', 'leafletHelpers',
        function ($log, $rootScope, $q, leafletData, leafletHelpers) {

            var isDefined = leafletHelpers.isDefined,
                errorHeader = leafletHelpers.errorHeader,
                isObject = leafletHelpers.isObject,
                _watchOptions = leafletHelpers.watchOptions;

            return {
                restrict: "A",
                scope: false,
                replace: false,
                require: ['leaflet'],

                link: function (scope, element, attrs, controller) {
                    var mapController = controller[0],
                        leafletScope = mapController.getLeafletScope();

                    mapController.getMap().then(function () {
                        if (isDefined(scope[name + 'WatchOptions'])) {
                            if (isObject(scope[name + 'WatchOptions']))
                                angular.extend(_watchOptions, scope[name + 'WatchOptions']);
                            else
                                $log.error(errorHeader + '[' + name + 'WatchOptions] is not an object');
                            leafletScope[name + 'WatchOptions'] = _watchOptions;
                        }
                    });
                }
            };
    }]);
});

angular.module("leaflet-directive")
.factory('leafletEventsHelpersFactory', ["$rootScope", "$q", "$log", "leafletHelpers", function ($rootScope, $q, $log, leafletHelpers) {
        var safeApply = leafletHelpers.safeApply,
            isDefined = leafletHelpers.isDefined,
            isObject = leafletHelpers.isObject,
            isArray = leafletHelpers.isArray,
            errorHeader = leafletHelpers.errorHeader;

        var EventsHelper = function(rootBroadcastName, lObjectType){
            this.rootBroadcastName = rootBroadcastName;
            //used to path/key out certain properties based on the type , "markers", "geojson"
            this.lObjectType = lObjectType;
        };

        EventsHelper.prototype.getAvailableEvents = function(){return []};

        /*
         argument: name: Note this can be a single string or dot notation
         Example:
         markerModel : {
         m1: { lat:_, lon: _}
         }
         //would yield name of
         name = "m1"

         If nested:
         markerModel : {
         cars: {
         m1: { lat:_, lon: _}
         }
         }
         //would yield name of
         name = "cars.m1"
         */
        EventsHelper.prototype.genDispatchEvent = function(eventName, logic, leafletScope, lObject, name, model, layerName, extra) {
            var _this = this;
            return function (e) {
                var broadcastName = _this.rootBroadcastName + '.' + eventName;
                _this.fire(leafletScope, broadcastName, logic, e, e.target || lObject, model, name, layerName, extra);
            };
        };

        EventsHelper.prototype.fire = function(scope, broadcastName, logic, event, lObject, model, modelName, layerName, extra){
            // Safely broadcast the event
            safeApply(scope, function(){
                var toSend = {
                    leafletEvent: event,
                    leafletObject: lObject,
                    modelName: modelName,
                    model: model
                };
                if (isDefined(layerName))
                    angular.extend(toSend, {layerName: layerName});

                if (logic === "emit") {
                  scope.$emit(broadcastName, toSend);
                } else {
                    $rootScope.$broadcast(broadcastName, toSend);
                }
            });
        };

        EventsHelper.prototype.bindEvents = function (lObject, name, model, leafletScope, layerName, extra) {
            var events = [];
            var logic = 'emit';
            var _this = this;

            if (!isDefined(leafletScope.eventBroadcast)) {
                // Backward compatibility, if no event-broadcast attribute, all events are broadcasted
                events = this.getAvailableEvents();
            } else if (!isObject(leafletScope.eventBroadcast)) {
                // Not a valid object
                $log.error(errorHeader + "event-broadcast must be an object check your model.");
            } else {
                // We have a possible valid object
                if (!isDefined(leafletScope.eventBroadcast[_this.lObjectType])) {
                    // We do not have events enable/disable do we do nothing (all enabled by default)
                    events = this.getAvailableEvents();
                } else if (!isObject(leafletScope.eventBroadcast[_this.lObjectType])) {
                    // Not a valid object
                    $log.warn(errorHeader + 'event-broadcast.' + [_this.lObjectType]  + ' must be an object check your model.');
                } else {
                    // We have a possible valid map object
                    // Event propadation logic
                    if (isDefined(leafletScope.eventBroadcast[this.lObjectType].logic)) {
                        // We take care of possible propagation logic
                        if (leafletScope.eventBroadcast[_this.lObjectType].logic !== "emit" &&
                            leafletScope.eventBroadcast[_this.lObjectType].logic !== "broadcast")
                                $log.warn(errorHeader + "Available event propagation logic are: 'emit' or 'broadcast'.");
                    }
                    // Enable / Disable
                    var eventsEnable = false, eventsDisable = false;
                    if (isDefined(leafletScope.eventBroadcast[_this.lObjectType].enable) &&
                        isArray(leafletScope.eventBroadcast[_this.lObjectType].enable))
                            eventsEnable = true;
                    if (isDefined(leafletScope.eventBroadcast[_this.lObjectType].disable) &&
                        isArray(leafletScope.eventBroadcast[_this.lObjectType].disable))
                            eventsDisable = true;

                    if (eventsEnable && eventsDisable) {
                        // Both are active, this is an error
                        $log.warn(errorHeader + "can not enable and disable events at the same time");
                    } else if (!eventsEnable && !eventsDisable) {
                        // Both are inactive, this is an error
                        $log.warn(errorHeader + "must enable or disable events");
                    } else {
                        // At this point the object is OK, lets enable or disable events
                        if (eventsEnable) {
                            // Enable events
                            leafletScope.eventBroadcast[this.lObjectType].enable.forEach(function(eventName){
                                // Do we have already the event enabled?
                                if (events.indexOf(eventName) !== -1) {
                                    // Repeated event, this is an error
                                    $log.warn(errorHeader + "This event " + eventName + " is already enabled");
                                } else {
                                    // Does the event exists?
                                    if (_this.getAvailableEvents().indexOf(eventName) === -1) {
                                        // The event does not exists, this is an error
                                        $log.warn(errorHeader + "This event " + eventName + " does not exist");
                                    } else {
                                        // All ok enable the event
                                        events.push(eventName);
                                    }
                                }
                            });
                        } else {
                            // Disable events
                            events = this.getAvailableEvents();
                            leafletScope.eventBroadcast[_this.lObjectType].disable.forEach(function(eventName) {
                                var index = events.indexOf(eventName);
                                if (index === -1) {
                                    // The event does not exist
                                    $log.warn(errorHeader + "This event " + eventName + " does not exist or has been already disabled");

                                } else {
                                    events.splice(index, 1);
                                }
                            });
                        }
                    }
                }
            }

            events.forEach(function(eventName){
                lObject.on(eventName,_this.genDispatchEvent(eventName, logic, leafletScope, lObject, name, model, layerName, extra));
            });
          return logic;
        };

        return EventsHelper;
}])
.service('leafletEventsHelpers', ["leafletEventsHelpersFactory", function(leafletEventsHelpersFactory){
    return new leafletEventsHelpersFactory();
}]);

angular.module("leaflet-directive")
.factory('leafletGeoJsonEvents', ["$rootScope", "$q", "$log", "leafletHelpers", "leafletEventsHelpersFactory", "leafletLabelEvents", "leafletData", function ($rootScope, $q, $log, leafletHelpers,
  leafletEventsHelpersFactory, leafletLabelEvents, leafletData) {
    var safeApply = leafletHelpers.safeApply,
        isDefined = leafletHelpers.isDefined,
        Helpers = leafletHelpers,
        lblHelp = leafletLabelEvents,
        EventsHelper = leafletEventsHelpersFactory;


    var GeoJsonEvents = function(){
      EventsHelper.call(this,'leafletDirectiveGeoJson', 'geojson');
    };

    GeoJsonEvents.prototype =  new EventsHelper();


    GeoJsonEvents.prototype.genDispatchEvent = function(eventName, logic, leafletScope, lObject, name, model, layerName, extra) {
        var base = EventsHelper.prototype.genDispatchEvent.call(this, eventName, logic, leafletScope, lObject, name, model, layerName),
        _this = this;

        return function(e){
            if (eventName === 'mouseout') {
                if (extra.resetStyleOnMouseout) {
                    leafletData.getGeoJSON(extra.mapId)
                    .then(function(leafletGeoJSON){
                        //this is broken on nested needs to traverse or user layerName (nested)
                        var lobj = layerName? leafletGeoJSON[layerName]: leafletGeoJSON;
                        lobj.resetStyle(e.target);
                    });

                }
                safeApply(leafletScope, function() {
                    $rootScope.$broadcast(_this.rootBroadcastName + '.mouseout', e);
                });
            }
            base(e); //common
        };
    };

    GeoJsonEvents.prototype.getAvailableEvents = function(){ return [
        'click',
        'dblclick',
        'mouseover',
        'mouseout',
        ];
    };

    return new GeoJsonEvents();
}]);

angular.module("leaflet-directive")
.factory('leafletLabelEvents', ["$rootScope", "$q", "$log", "leafletHelpers", "leafletEventsHelpersFactory", function ($rootScope, $q, $log, leafletHelpers, leafletEventsHelpersFactory) {
    var Helpers = leafletHelpers,
    EventsHelper = leafletEventsHelpersFactory;
        var LabelEvents = function(){
          EventsHelper.call(this,'leafletDirectiveLabel', 'markers');
        };
        LabelEvents.prototype =  new EventsHelper();

        LabelEvents.prototype.genDispatchEvent = function(eventName, logic, leafletScope, lObject, name, model, layerName) {
            var markerName = name.replace('markers.', '');
            return EventsHelper.prototype
                .genDispatchEvent.call(this, eventName, logic, leafletScope, lObject, markerName, model, layerName);
        };

        LabelEvents.prototype.getAvailableEvents = function(){
            return [
                'click',
                'dblclick',
                'mousedown',
                'mouseover',
                'mouseout',
                'contextmenu'
            ];
        };

        LabelEvents.prototype.genEvents = function (eventName, logic, leafletScope, lObject, name, model, layerName) {
            var _this = this;
            var labelEvents = this.getAvailableEvents();
            var scopeWatchName = Helpers.getObjectArrayPath("markers." + name);
            labelEvents.forEach(function(eventName) {
                lObject.label.on(eventName, _this.genDispatchEvent(
                    eventName, logic, leafletScope, lObject.label, scopeWatchName, model, layerName));
            });
        };

        LabelEvents.prototype.bindEvents = function (lObject, name, model, leafletScope, layerName) {};

        return new LabelEvents();
}]);

angular.module("leaflet-directive")
.factory('leafletMapEvents', ["$rootScope", "$q", "$log", "leafletHelpers", "leafletEventsHelpers", function ($rootScope, $q, $log, leafletHelpers, leafletEventsHelpers) {
    var safeApply = leafletHelpers.safeApply,
        isDefined = leafletHelpers.isDefined,
        isObject = leafletHelpers.isObject,
        Helpers = leafletHelpers,
        errorHeader = leafletHelpers.errorHeader,
        fire = leafletEventsHelpers.fire;

    var _getAvailableMapEvents = function() {
        return [
            'click',
            'dblclick',
            'mousedown',
            'mouseup',
            'mouseover',
            'mouseout',
            'mousemove',
            'contextmenu',
            'focus',
            'blur',
            'preclick',
            'load',
            'unload',
            'viewreset',
            'movestart',
            'move',
            'moveend',
            'dragstart',
            'drag',
            'dragend',
            'zoomstart',
            'zoomend',
            'zoomlevelschange',
            'resize',
            'autopanstart',
            'layeradd',
            'layerremove',
            'baselayerchange',
            'overlayadd',
            'overlayremove',
            'locationfound',
            'locationerror',
            'popupopen',
            'popupclose',
            'draw:created',
            'draw:edited',
            'draw:deleted',
            'draw:drawstart',
            'draw:drawstop',
            'draw:editstart',
            'draw:editstop',
            'draw:deletestart',
            'draw:deletestop'
        ];
    };

    var _genDispatchMapEvent = function(scope, eventName, logic) {
        // (nmccready) We should consider passing mapId as an argument or using it from scope
        return function(e) {
            // Put together broadcast name
            // (nmccready) We should consider passing mapId joining mapId to the broadcastName to keep the event unique. Same should be done for all directives so we know what map it comes from.
            // problem with this is it will cause a minor bump and break backwards compat
            var broadcastName = 'leafletDirectiveMap.' + eventName;
            // Safely broadcast the event
            fire(scope, broadcastName, logic, e, e.target, scope)
        };
    };

    var _notifyCenterChangedToBounds = function(scope) {
        scope.$broadcast("boundsChanged");
    };

    var _notifyCenterUrlHashChanged = function(scope, map, attrs, search) {
        if (!isDefined(attrs.urlHashCenter)) {
            return;
        }
        var center = map.getCenter();
        var centerUrlHash = (center.lat).toFixed(4) + ":" + (center.lng).toFixed(4) + ":" + map.getZoom();
        if (!isDefined(search.c) || search.c !== centerUrlHash) {
            //$log.debug("notified new center...");
            scope.$emit("centerUrlHash", centerUrlHash);
        }
    };

    return {
        getAvailableMapEvents: _getAvailableMapEvents,
        genDispatchMapEvent: _genDispatchMapEvent,
        notifyCenterChangedToBounds: _notifyCenterChangedToBounds,
        notifyCenterUrlHashChanged: _notifyCenterUrlHashChanged
    };
}]);

angular.module("leaflet-directive")
.factory('leafletMarkerEvents', ["$rootScope", "$q", "$log", "leafletHelpers", "leafletEventsHelpersFactory", "leafletLabelEvents", function ($rootScope, $q, $log, leafletHelpers, leafletEventsHelpersFactory, leafletLabelEvents) {
    var safeApply = leafletHelpers.safeApply,
        isDefined = leafletHelpers.isDefined,
        Helpers = leafletHelpers,
        lblHelp = leafletLabelEvents,
        EventsHelper = leafletEventsHelpersFactory;

    var MarkerEvents = function(){
      EventsHelper.call(this,'leafletDirectiveMarker', 'markers');
    };

    MarkerEvents.prototype =  new EventsHelper();

    MarkerEvents.prototype.genDispatchEvent = function(eventName, logic, leafletScope, lObject, name, model, layerName) {
        var handle = EventsHelper.prototype
            .genDispatchEvent.call(this, eventName, logic, leafletScope, lObject, name, model, layerName);
        return function(e){
            // Broadcast old marker click name for backwards compatibility
            if (eventName === "click") {
                safeApply(leafletScope, function () {
                    $rootScope.$broadcast('leafletDirectiveMarkersClick', name);
                });
            } else if (eventName === 'dragend') {
                safeApply(leafletScope, function () {
                    model.lat = lObject.getLatLng().lat;
                    model.lng = lObject.getLatLng().lng;
                });
                if (model.message && model.focus === true) {
                    lObject.openPopup();
                }
            }
            handle(e); //common
        };
    };

    MarkerEvents.prototype.getAvailableEvents = function(){ return [
        'click',
        'dblclick',
        'mousedown',
        'mouseover',
        'mouseout',
        'contextmenu',
        'dragstart',
        'drag',
        'dragend',
        'move',
        'remove',
        'popupopen',
        'popupclose',
        'touchend',
        'touchstart',
        'touchmove',
        'touchcancel',
        'touchleave'
        ];
    };

    MarkerEvents.prototype.bindEvents = function (lObject, name, model, leafletScope, layerName) {
      var logic = EventsHelper.prototype.bindEvents.call(this,lObject, name, model, leafletScope, layerName);

      if (Helpers.LabelPlugin.isLoaded() && isDefined(lObject.label)) {
          lblHelp.genEvents(name, logic, leafletScope, lObject, model, layerName);
      }
    };

    return new MarkerEvents();
}]);

angular.module("leaflet-directive")
.factory('leafletPathEvents', ["$rootScope", "$q", "$log", "leafletHelpers", "leafletLabelEvents", "leafletEventsHelpers", function ($rootScope, $q, $log, leafletHelpers, leafletLabelEvents, leafletEventsHelpers) {
    var safeApply = leafletHelpers.safeApply,
        isDefined = leafletHelpers.isDefined,
        isObject = leafletHelpers.isObject,
        Helpers = leafletHelpers,
        errorHeader = leafletHelpers.errorHeader,
        lblHelp = leafletLabelEvents,
        fire = leafletEventsHelpers.fire;

    var _genDispatchPathEvent = function (eventName, logic, leafletScope, lObject, name, model, layerName) {
        return function (e) {
            var broadcastName = 'leafletDirectivePath.' + eventName;

            fire(leafletScope, broadcastName, logic, e, e.target || lObject, model, name, layerName);
        };
    };

    var _bindPathEvents = function (lObject, name, model, leafletScope) {
        var pathEvents = [],
            i,
            eventName,
            logic = "broadcast";

        if (!isDefined(leafletScope.eventBroadcast)) {
            // Backward compatibility, if no event-broadcast attribute, all events are broadcasted
            pathEvents = _getAvailablePathEvents();
        } else if (!isObject(leafletScope.eventBroadcast)) {
            // Not a valid object
            $log.error(errorHeader + "event-broadcast must be an object check your model.");
        } else {
            // We have a possible valid object
            if (!isDefined(leafletScope.eventBroadcast.path)) {
                // We do not have events enable/disable do we do nothing (all enabled by default)
                pathEvents = _getAvailablePathEvents();
            } else if (isObject(leafletScope.eventBroadcast.paths)) {
                // Not a valid object
                $log.warn(errorHeader + "event-broadcast.path must be an object check your model.");
            } else {
                // We have a possible valid map object
                // Event propadation logic
                if (leafletScope.eventBroadcast.path.logic !== undefined && leafletScope.eventBroadcast.path.logic !== null) {
                    // We take care of possible propagation logic
                    if (leafletScope.eventBroadcast.path.logic !== "emit" && leafletScope.eventBroadcast.path.logic !== "broadcast") {
                        // This is an error
                        $log.warn(errorHeader + "Available event propagation logic are: 'emit' or 'broadcast'.");
                    } else if (leafletScope.eventBroadcast.path.logic === "emit") {
                        logic = "emit";
                    }
                }
                // Enable / Disable
                var pathEventsEnable = false, pathEventsDisable = false;
                if (leafletScope.eventBroadcast.path.enable !== undefined && leafletScope.eventBroadcast.path.enable !== null) {
                    if (typeof leafletScope.eventBroadcast.path.enable === 'object') {
                        pathEventsEnable = true;
                    }
                }
                if (leafletScope.eventBroadcast.path.disable !== undefined && leafletScope.eventBroadcast.path.disable !== null) {
                    if (typeof leafletScope.eventBroadcast.path.disable === 'object') {
                        pathEventsDisable = true;
                    }
                }
                if (pathEventsEnable && pathEventsDisable) {
                    // Both are active, this is an error
                    $log.warn(errorHeader + "can not enable and disable events at the same time");
                } else if (!pathEventsEnable && !pathEventsDisable) {
                    // Both are inactive, this is an error
                    $log.warn(errorHeader + "must enable or disable events");
                } else {
                    // At this point the path object is OK, lets enable or disable events
                    if (pathEventsEnable) {
                        // Enable events
                        for (i = 0; i < leafletScope.eventBroadcast.path.enable.length; i++) {
                            eventName = leafletScope.eventBroadcast.path.enable[i];
                            // Do we have already the event enabled?
                            if (pathEvents.indexOf(eventName) !== -1) {
                                // Repeated event, this is an error
                                $log.warn(errorHeader + "This event " + eventName + " is already enabled");
                            } else {
                                // Does the event exists?
                                if (_getAvailablePathEvents().indexOf(eventName) === -1) {
                                    // The event does not exists, this is an error
                                    $log.warn(errorHeader + "This event " + eventName + " does not exist");
                                } else {
                                    // All ok enable the event
                                    pathEvents.push(eventName);
                                }
                            }
                        }
                    } else {
                        // Disable events
                        pathEvents = _getAvailablePathEvents();
                        for (i = 0; i < leafletScope.eventBroadcast.path.disable.length; i++) {
                            eventName = leafletScope.eventBroadcast.path.disable[i];
                            var index = pathEvents.indexOf(eventName);
                            if (index === -1) {
                                // The event does not exist
                                $log.warn(errorHeader + "This event " + eventName + " does not exist or has been already disabled");

                            } else {
                                pathEvents.splice(index, 1);
                            }
                        }
                    }
                }
            }
        }

        for (i = 0; i < pathEvents.length; i++) {
            eventName = pathEvents[i];
            lObject.on(eventName, _genDispatchPathEvent(eventName, logic, leafletScope, pathEvents, name));
        }

        if (Helpers.LabelPlugin.isLoaded() && isDefined(lObject.label)) {
            lblHelp.genEvents(name, logic, leafletScope, lObject, model);
        }
    };

    var _getAvailablePathEvents = function () {
        return [
            'click',
            'dblclick',
            'mousedown',
            'mouseover',
            'mouseout',
            'contextmenu',
            'add',
            'remove',
            'popupopen',
            'popupclose'
        ];
    };

    return {
        getAvailablePathEvents: _getAvailablePathEvents,
        bindPathEvents: _bindPathEvents
    };
}]);

}(angular));
(function(){
	var settings = {

	};
	var configFn = function(FacebookProvider, $httpProvider){

		$httpProvider.defaults.headers.post["Content-Type"] = "application/x-www-form-urlencoded";
	};

	configFn.$inject = ['FacebookProvider', '$httpProvider'];

	angular
		.module('pi', ['ngResource', 'facebook', 'pi.core', 'pi.core.app', 'pi.core.question', 'pi.core.article', 'pi.core.payment', 'pi.core.chat', 'pi.core.likes', 'pi.core.product'])
		.config(configFn)
		.provider('pi', [function(){
			var appId,
				appSecret;

			this.setAppId = function(value) {
				appId = value;
			}

			this.$get = [function(){
				return {
					getAppId: function() {
						return appId;
					}
				}
			}];
		}]);
})();
(function(){
	'use strict';

	angular
		.module('pi.ui-router', ['pi', 'ui.router']);

	angular
		.module('pi.core', ['pi']);

	angular
		.module('pi.core.user', ['pi.core']);

	angular
		.module('pi.core.likes', ['pi.core']);

	angular
		.module('pi.core.product', ['pi.core']);

	angular
		.module('pi.core.article', ['pi.core']);

	angular
		.module('pi.core.question', ['pi.core']);
})();
function getCookie(cname) {
   var name = cname + "=",
       ca = document.cookie.split(';'),
       i,
       c,
       ca_length = ca.length;
   for (i = 0; i < ca_length; i += 1) {
       c = ca[i];
       while (c.charAt(0) === ' ') {
           c = c.substring(1);
       }
       if (c.indexOf(name) !== -1) {
           return c.substring(name.length, c.length);
       }
   }
   return "";
}

function setCookie(variable, value, expires_seconds) {
   var d = new Date();
   d = new Date(d.getTime() + 1000 * expires_seconds);
   document.cookie = variable + '=' + value + '; expires=' + d.toGMTString() + ';';
}

angular
	.module('pi.chat', []);
(function(){
	angular
		.module('pi.form', []);
})();
(function(){
	angular.
		module('pi.ui-extensions', ['ui.router']);
})();
(function(){
  angular
      .module('pi.admin', []);

  angular
    .module('pi.admin')
    .config(['$stateProvider', function($stateProvider){
      $stateProvider
        .state('admin', {
          url: '/admin',
          controller: 'pi.admin.adminCtrl',
          controllerAs: 'ctrl',
          templateUrl: 'admin/admin.html'
        })
        .state('article-manage', {
          url: '/admin/article',
          controller: 'pi.admin.articleManageCtrl',
          controllerAs: 'ctrl',
          templateUrl: 'admin/article-manage.html'
        })
        .state('article-edit', {
          url: '/admin/article/:id',
          controller: 'pi.admin.articleEditCtrl',
          controllerAs: 'ctrl',
          templateUrl: 'admin/article-edit.html'
        })
        .state('event-manage', {
          url: '/admin/event',
          controller: 'pi.admin.eventManageCtrl',
          controllerAsl: 'ctrl',
          templateUrl: 'admin/event-manage.html'
        })
        .state('event-edit', {
          url: '/admin/event/:id',
          controller: 'pi.admin.eventEditCtrl',
          controllerAs: 'ctrl',
          templateUrl: 'admin/event-edit.html'
        });
    }]);
})();

(function(){
  angular
    .module('pi.auth', ['pi']);

  angular
    .module('pi.auth')
    .provider('piConfiguration', function(){
      var config = function(){
        var m = {};
        m.providers = ['basic'];
        m.loginUri = '/login';
        m.logoutUri = '/logout';

        return m;
      };

      var provider = function(){
        var me = config();
        var configs = {};
        configs['default'] = me;

        me.config = function(configName) {
          var c = configs[configName];
          if(!c) {
            c = config();
            configs[configName] = c;
          }
          return c;
        };

        me.$get = ['$q', function($q){
          var deferred = $q.defer();

          return function(configName) {
            return configs[configName];
          }
        }];

        return me;

      };

      return provider();
    })
    .controller('registerCtrl', ['$scope', 'piConfiguration', 'accountApi', function($scope, piConfiguration, accountApi){
      $scope.init = function(configName) {
        var config = piConfiguration(configName);
      }

      $scope.register = function(firstName, lastName, email, password, passwordConfirm, meta) {
        var req = {
          firstName: firstName,
          lastName: lastName,
          email: email,
          password: password
        };

        if(meta) {
          req = angular.extend(req, meta)
        }

        accountApi.register(req)
          .then(function(res){
            window.location = '/';
          }, function(res){
            alert('erro no login');
          });
      }
    }])
    .directive('piRegister', ['$document', function($document){
      return {
        controller: 'registerCtrl',
        controllerAs: 'ctrl',
        transclude: true,
        replace: true,
        template: '<div ng-transclude></div>',
        compile: function compile(tElement, tAttrs, transclude) {
           return {
              pre: function preLink(scope, elemt, attrs, controller){

              },
              post: function postLink(scope, elem, attrs, ctrl) {
                var btn = angular.element(elem[0].querySelector('[login-submit]')),
                    mail = angular.element(elem[0].querySelector('[login-email]')),
                    pw = angular.element(elem[0].querySelector('[login-password]'));

                    if(navigator.appVersion.indexOf("Trident") != -1){
                        terminal.addClass('damn-ie');
                    }

                    var config = attrs['piConfig'];
                    scope.init(config || 'default');

                    var mouseover = false;

                    elem.on('mouseover', function(){
                      mouseover = true;
                    });

                    btn.on('click', function(){
                      scope.login(mail.val(), pw.val());
                    })

                    elem.on('mouseleave', function(){
                      mouseover = false;
                    });
              }
            }
          }
    }
    }])
    .controller('loginCtrl', ['$scope', 'piConfiguration', 'accountApi', function($scope, piConfiguration, accountApi){
      $scope.init = function(configName) {
        var config = piConfiguration(configName);
      }

      $scope.login = function(email, password) {
        accountApi.login(email, password)
          .then(function(res){
            window.location = '/';
          }, function(res){
            alert('erro no login');
          });
      }
    }])
    .directive('piAuth', ['$document', function($document){
      return {
        controller: 'loginCtrl',
        controllerAs: 'ctrl',
        transclude: true,
        replace: true,
        template: '<div ng-transclude></div>',
        compile: function compile(tElement, tAttrs, transclude) {
           return {
              pre: function preLink(scope, elemt, attrs, controller){

              },
              post: function postLink(scope, elem, attrs, ctrl) {
                var btn = angular.element(elem[0].querySelector('[login-submit]')),
                    mail = angular.element(elem[0].querySelector('[login-email]')),
                    pw = angular.element(elem[0].querySelector('[login-password]'));

                    if(navigator.appVersion.indexOf("Trident") != -1){
                        terminal.addClass('damn-ie');
                    }

                    var config = attrs['piConfig'];
                    scope.init(config || 'default');

                    var mouseover = false;

                    elem.on('mouseover', function(){
                      mouseover = true;
                    });

                    btn.on('click', function(){
                      scope.login(mail.val(), pw.val());
                    })

                    elem.on('mouseleave', function(){
                      mouseover = false;
                    });
              }
            }
          }
    }
  }]);
})();

(function(){
	'use strict';

	angular
		.module('pi.core.app', ['pi.core']);

})();
(function(){
	angular
		.module('pi.core.chat', ['pi.core']);
})();
(function(){
	'use strict';

	angular
		.module('pi.core.event', ['pi.core']);

})();
(function(){
	'use strict';

	angular
		.module('pi.core.payment', ['pi.core']);

})();

/**
 *
 */
(function(){
	var settings = {};

	var flags = {
		sdk: false,
		ready: false
	};

	var provider = function(){
		
      this.setAppId = function(appId){
      	settings.appId = appId;
      };

      this.getAppId = function(){
      	return appId;
      };

      settings.locale = 'pt_PT';

      this.setLocale = function(locale) {
      	settings.locale = locale;
      };

      this.getLocal = function(){
      	return settings.locale;
      };
    
		settings.status = true;

		this.setStatus = function(status) {
		  settings.status = status;
		};

		this.getStatus = function() {
		  return settings.status;
		};

	settings.version = '2.0';
	this.setSdkVersion = function(version) {
		settings.version = version;
	};

	this.getSdkVersion = function(){
		return settings.version;
	};

	      /*
         * load SDK
         */
        settings.loadSDK = true;

        this.setLoadSDK = function(a) {
          settings.loadSDK = !!a;
        };

        this.getLoadSDK = function() {
          return settings.loadSDK;
        };

        /**
         * Custom option setting
         * key @type {String}
         * value @type {*}
         * @return {*}
         */
        this.setInitCustomOption = function(key, value) {
          if (!angular.isString(key)) {
            return false;
          }

          settings[key] = value;
          return settings[key];
        };

        /**
         * get init option
         * @param  {String} key
         * @return {*}
         */
        this.getInitOption = function(key) {
          // If key is not String or If non existing key return null
          if (!angular.isString(key) || !settings.hasOwnProperty(key)) {
            return false;
          }

          return settings[key];
        };

      this.shareDialog = function(title, content, url) {

      };

      this.like = function(postId) {
      	FB.ui(
		 {
		  method: 'share',
		  href: 'https://developers.facebook.com/docs/'
		}, function(response){});
      };

      this.getComments = function(url) {

      };

      var getFn = function($q, $rootScope, $timeout, $window){

      		/**
      		 * The NgFacebook class is retrieved from Facebook Service request
      		 */
      		function NgFacebook(){
      			this.appId = settings.appId;
      		}

      		NgFacebook.prototype.isReady = function(){
      			return flags.ready;
      		};

      		
      };

      this.$get = [
      	'$q',
      	'$rootScope',
      	'$timeout',
      	'$window', getFn];

	};

	angular
		.module('pi')
		.value('fbSettings', settings)
		.value('fbFlags', flags)

})();
/**
 * Pi Provider
 *
 * The main module provider
 */
(function(){
	
	/**
	 * Global settings
	 *
	 * Settings that don't belong to a specific module are stored here
	 */	
 	var settings = { };

	var providerFn = function(){

		/**
		 * OAuth Provider
		 */
		settings.oAuthProviders =  [];

		this.getAuthProviders = function(){
			return settings.oAuthProviders;
		};

		this.addOAuthProvider = function(provider, appId) {
			settings.oAuthProviders.push({
				key: provider,
				appId: appId
			});
		};

		this.hasOAuthProvider = function(provider){
			angular.forEach(settings.oAuthProviders, function(value, key) {
				if(value.key == provider)  {
					return true;
				}
			});
			return false;
		};

		this.getOAuthAppId = function(provider){
			angular.forEach(settings.oAuthProviders, function(value, key) {
				if(value.key == provider) {
					return value.appId;
				}
			});

			return null;
		};


		/**
		 * Rest API
		 */
		settings.apiBaseUrl = '/api';

		this.getApiBaseUrl = function(){
			return settings.apiBaseUrl;
		};

		this.setApiBaseUrl = function(url){
			settings.apiBaseUrl = url;
		};

		/**
		 * Module version
		 */

		settings.version = '0.1';

		this.getVersion = function(){
			return settings.version;
		};

		this.setVersion = function(version) {
			settings.version = version;
		};

		/**
		 * Pi Modules
		 */
		settings.modules = [];

		this.getModules = function(){
			return settings.modules;
		};

		this.addModule = function(module) {
			settings.modules.push(module);
		};

		this.hasModule = function(module) {
			var ex = false;
			angular.forEach(settings.modules, function(value, vakey) {
				if(value === module) {
					ex = true;
				};
			});
			
			return ex;
		};

		var getFn = function(piSettings){

		};


		this.$get = [
		'piSettings', getFn];

        return this;
	};
	angular
        .module('pi')
        .value('piSettings', settings)
		.provider('piApp', providerFn);
})();
(function(){
  angular
    .module('pi.admin')
    .controller('pi.admin.adminCtrl', ['$rootScope', function($rootScope){

    }]);
})();

(function(){
  angular
    .module('pi.admin')
    .controller('pi.admin.articleEditCtrl', ['pi.core.article.articleSvc', '$scope', function(articleSvc, $scope){

    }]);
})();

(function(){
  angular
    .module('pi.admin')
    .controller('pi.admin.articleManageCtrl', ['pi.core.article.articleSvc', '$scope', function(articleSvc, $scope){

    }]);
})();

(function(){
  angular
    .module('pi.admin')
    .controller('pi.admin.eventEditCtrl', ['pi.core.app.eventSvc', '$scope', function(eventSvc, $scope){

    }]);
})();

(function(){
  angular
    .module('pi.admin')
    .controller('pi.admin.eventManageCtrl', ['pi.core.app.eventSvc', '$scope', function(eventSvc, $scope){

    }]);
})();

(function(){
  var piAlertStack = function(piStack)
  {
    var stack = {};
    var alertsOpened = piStack.create();

    var open = function(instance, alert)
    {
      alertsOpened.add(instance, alert);
    };

    var close = function(instance, result) {
      alertsOpened.remove(instance);
    }

    var dismiss = function(instance, reason)
    {
      alertsOpened.remove(instance);
    };

    var top = function(){
      return alertsOpened.top();;
    }

    return {
      open: open,
      dismiss: dmiss,
      close: close,
      top: top
    }
  };
  piAlertStack.inject = ['piStack'];

  var piAlert = function(piAlertStack, $q) {

    var piAlertProvider = {
      options: {
        relative: true
      },
    $get: ['$injector', '$rootScope', '$q', '$http', '$templateCache', '$controller', 'piAlertStack',
    function ($injector, $rootScope, $q, $http, $templateCache, $controller, $modalStack) {
      var piAlert = {};

      function getTemplatePromise(options) {
        return options.template ? $q.when(options.template) :
          $http.get(options.templateUrl, {cache: $templateCache}).then(function (result) {
            return result.data;
          });
      }

      function getResolvePromises(resolves) {
        var promisesArr = [];
        angular.forEach(resolves, function (value, key) {
          if (angular.isFunction(value) || angular.isArray(value)) {
            promisesArr.push($q.when($injector.invoke(value)));
          }
        });
        return promisesArr;
      }
        piAlert.open = function(alertOptions) {
            var alertResultDererred = $q.defer(),
                alertOpenedDeferred = $q.defer(),
                instance = {
                  result: modalResultDeferred.promise,
                  opened: modalOpenendDeferred.promise,
                  close: function(result) {
                    piAlertStack.close(instance, result);
                  },
                  dismiss: function(reason) {
                    piAlertStack.dismiss(instane, reason);
                  }
                };
            modal
            piAlertStack.open(instance, alert);
        };

        alertOptions = angular.extend({}, alertProvider.options, alertOptions);
        alertOptions.resolve = alertOptions.resolve || {};

        if(!modalOptions.template && !modalOptions.templateUrl) {
          throw new Error('One of template or templateUrl options is required.');
        }

        var tplAndResolvePromise = $q
        .all([getTemplatePromise(alertOptions)])
        .concat(getResolvePromises(alertOptions.resolve));
    }]
};
    angular
      .module('pi')
      .provider('piAlert', piAlert)
      .factory('piAlertStack', piAlertStack);
  };

  piAlert.$inject = ['piAlertStack', '$q'];

  piAlertContainer = function(){
      var link = function(scope, elem, attrs)
      {
        scope.close = function(evt)
        {
          evt.preventDefault();
          evt.stopPropagation();
          var alert = piAlertStack.getTop();
          //if (alert && alert.value.backdrop && modal.value.backdrop != 'static' && (evt.target === evt.currentTarget)) {
          $modalStack.dismiss(modal.key, 'backdrop click');
        };
      };

      return {
        restrict: 'EA',
        templateUrl: 'pi/alert-container.html'
      }
  };

})();

(function(){
	'use strict';

	var chat = function(){
		var appKey = '',
			appSecret = '',
			appId = '',
			inbox = [];

		var receiveMessage = function(sender, message, datetime){

		}

		var sendMessage = function(sender, message){

		}

		return {
			setAppKey: function(value){
				appKey = value;
			},
			setAppSecret: function(value){
				appSecret = value;
			},
			setAppId: function(value){
				appId = value;
			},
			$get: function(){

				return {

				}
			}
		}
	}

	var chatWindow = function(){
		var controller = function(){

		};

		return {
			templateUrl: '/html/pi/chat-window.html',
			controller: controller,
			controllerAs: 'chatWindowCtrl'
		}
	}

	var chatMessage = function(){
		return {
			templateUrl: '/html/pi/chat-message.html',
		}
	}

	var chatMessagePreview = function(){
		return {
			templateUrl: '/html/pi/chat-message-preview.html'
		}
	}

	angular
		.module('pi.chat')
		.directive
})();
(function() {
    angular
        .module('pi')
        .factory('pi.core.placeSvc', ['piHttp', function (piHttp) {

            this.post= function (dto) {
                return piHttp.post('/place', dto);
            }

            this.find = function () {
                return piHttp.get('/place');
            }

            this.get = function (id) {
                return piHttp.get('/place/' + id);
            }


            return this;

        }]);
})();
(function(){
  angular
    .module('pi.ui-router')
    .factory('pi.ui-router.stateUtils', ['$stateParams', function($stateParams){
      return {
        getModelFromStateParams: function(names, model){

            angular.forEach(names, function(value){
                if(!_.isUndefined($stateParams[value])) {
                    model[value] = $stateParams[value];
                }
            });

            return model;
        }
      }
    }]);
})();

(function(){

	var AccountRecover = function(AccountRecoverService)
	{
		var linkFn = function(scope, elem, attrs)
		{
			scope.submit = function()
			{
				var successFn = function(res)
					{
						scope.onSuccessFn(res);
					},
					errorFn = function(res)
					{
						scope.onError(res);
					};

				AccountRecoverService.requestRecover(scope.email)
					.then(successFn, errorFn);
			};

			scope.cancel = function()
			{

			};
		};

		return {
			scope: {
				'piConfig': '=piConfig',
				'onSuccess': '=onSuccess',
				'onError': '=onError'
			},
			link: linkFn
		};
	};

	AccountRecover.$inject = ['AccountRecoverService'];

	var AccountRecoverService = function($http, $q, modalSvc)
	{
		this.requestRecover = function(email)
		{
			var deferred = $q.defer(),
				successFn = function(res)
				{
					deferred.resolve(res.data);
				},
				errorFn = function(res)
				{
					deferred.reject(res);
				};
			$http.post('/api/account/recover')
				.then(successFn, errorFn, {email: email});

			return deferred.promise;
		};

		this.sendRecover = function(email, token, password, passwordConfirm)
		{
			var deferred = $q.defer(),
				model = {
					password: password,
					passwordConfirm: passwordConfirm,
					token: token,
					email: email
				},
				successFn = function(res)
				{
					deferred.resolve(res.data);
				},
				errorFn = function(res)
				{
					deferred.reject(res);
				};

			$http.post('/api/accouunt/recover/send', model)
				.then(successFn, errorFn);

			return deferred.promise;
		};

		return this;
	};

	AccountRecoverService.$inject = ['$http', '$q', 'modalSvc'];

	angular
		.module('pi')
		.directive('piAccountRecover', AccountRecover)
		.factory('AccountRecoverService', AccountRecoverService);
})();
(function(){
  angular
    .module('pi')
    .directive('bindHtmlCompile', ['$compile', function ($compile) {
        return {
            restrict: 'A',
            link: function (scope, element, attrs) {
                scope.$watch(function () {
                    return scope.$eval(attrs.bindHtmlCompile);
                }, function (value) {
                    // Incase value is a TrustedValueHolderType, sometimes it
                    // needs to be explicitly called into a string in order to
                    // get the HTML string.
                    element.html(value && value.toString());
                    // If scope is provided use it, otherwise use parent scope
                    var compileScope = scope;
                    if (attrs.bindHtmlScope) {
                        compileScope = scope.$eval(attrs.bindHtmlScope);
                    }
                    $compile(element.contents())(compileScope);
                });
            }
        };
    }]);
})();

(function(){
	var PiBreadcrumb = function(PiBreadcrumbService)
	{
		var link = function(scope, elem, attrs)
		{
			scope.current = PiBreadcrumbService.current;
		}
		return {
			templateUrl: '/html/pi/breadcrumb.html',
			link: link
		}
	};

	PiBreadcrumb.$inject = ['piBreadcrumbService'];

	var PiBreadcrumbService = function($rootScope)
	{
		var _current = {name: 'First', image: null};
		var uiStateGenerated = true;

		var set = function(name, image){
			_current.name = name;

			if(!_.isNull(image)){
				_current.image = image;
			}
		};
		if(uiStateGenerated) {
			$rootScope.$on('$stateChangeStart',
			function(event, toState, toParams, fromState, fromParams){
				_current.name = toState.name;
			});
		}
		var current = function()
		{

			return ;
		};
		return {
			set: set,
			current: _current
		};
	};

	PiBreadcrumbService.$inject = ['$rootScope'];

	angular
		.module('pi')
		.factory('piBreadcrumbService', PiBreadcrumbService)
		.directive('piBreadcrumb', PiBreadcrumb);
})();
(function(){
	'use strict';
	var piCommentResource = function($resource) {
		return {
			create: function(namespace, id) {
				return $resource('/comment/' + namespace + '/' + id,
		            {},
		            {
		            'query': {
		                method: 'GET',
		                transformResponse: function(res) {
		                    return angular.fromJson(res).comments || [];
		                },
		                isArray: true
		            }
		        });
			}
		}
	};
	piCommentResource.$inject = ['$resource'];

	var piCommentWindow = function(piCommentResource) {
		

		var link = function(scope, elem, attrs) {
			
			
			
		}

		var ctrl = function($scope, $q) {
			var resource = piCommentResource.create($scope.namespace, $scope.id);

			$scope.comments = resource.query({});
			
			this.send = function(message) {
                var deferred = $q.defer();
				resource.save({message: message, id: $scope.id}, function(res){
                    $scope.comments.push(res.comment);
                    deferred.resolve(res);
                });
                return deferred.promise;
			}
		};
		return {
			controller: ctrl,
			link: link,
			scope: {
				namespace: '@',
				id: '@'
			},
			templateUrl: 'html/pi/comment-window.html'
		}
	};
	piCommentWindow.$inject = ['piCommentResource', '$q'];

	var piCommentMessage = function() {
		
		return {
			templateUrl: 'html/pi/comment-message.html',
			replace: true,
			scope: {
				'comment': '='
			}
		}
	};

	var piCommentForm = function() {
		var link = function(scope, elem, attrs, piCommentWindow) {
			scope.send = function() {
				piCommentWindow.send(scope.message)
                    .then(function(res){
                        scope.message = '';
                    });
			}
		};

		return {
			templateUrl: 'html/pi/comment-form.html',
			require: '^piCommentWindow',
			link: link
		}
	};

	var piCommentReplyForm = function() {
		return {
			templateUrl: 'html/pi/comment-reply-form.html'
		}
	};

	angular
		.module('pi')
		.factory('piCommentResource', piCommentResource)
		.directive('piCommentWindow', piCommentWindow)
		.directive('piCommentMessage', piCommentMessage)
		.directive('piCommentForm', piCommentForm)
		.directive('piCommentReplyForm', piCommentReplyForm);
})();
(function(){

	var piFormMaker = function(){
		var link = function(scope, elem, attrs, ctrl){

		}
		return {
			templateUrl: '/html/pi/form-maker.html',
			link: linkFn
		}
	};

	angular
		.module('pi')
		.directive('piFormMaker', piFormMaker);
})();
/**
 * @ng-doc directive
 * @name gist
 * @description
 *
 * Directive to embed a iframe from GitHub Gist service.
 * Original directive: https://gist.github.com/tleunen/5277011
 */
(function(){
	var directiveFn = function() { 
	    return function(scope, elm, attrs) {
	        var gistId = attrs.gistId;

	        var iframe = document.createElement('iframe');
	        iframe.setAttribute('width', '100%');
	        iframe.setAttribute('frameborder', '0');
	        iframe.id = "gist-" + gistId;
	        elm[0].appendChild(iframe);

	        var iframeHtml = '<html><head><base target="_parent"><style>table{font-size:12px;}</style></head><body onload="parent.document.getElementById(\'' + iframe.id + '\').style.height=document.body.scrollHeight + \'px\'"><scr' + 'ipt type="text/javascript" src="https://gist.github.com/' + gistId + '.js"></sc'+'ript></body></html>';

	        var doc = iframe.document;
	        if (iframe.contentDocument) doc = iframe.contentDocument;
	        else if (iframe.contentWindow) doc = iframe.contentWindow.document;

	        doc.open();
	        doc.writeln(iframeHtml);
	        doc.close();
	    };
	 };

	 angular
	 	.module('pi')
	 	.directive('gist', directiveFn);
})();
(function(){
  var PiMetaDirective = function(FieldsMetaService, $parse)
  {
      return {
        templateUrl: '/html/pi/meta.html',
        scope: {
          'piConfig': '=piConfig',
          'piMeta': '=piMeta'
        },
        link: function(scope, elem, attrs)
        {
          scope.viewEdit = false;
          scope.viewAdd = false;
          scope.viewAddAvailable = false;
          scope.metaAddCurrent = {};
          scope.metaSelectAddCurrent = {};
          scope.metaSelectCurrent = [];
          scope.metaSelectEditCurrent = {};
          scope.metaAdd = [];
          scope.metaType = '';
          var service = undefined;
          var config = {};

          if(!_.isUndefined(scope.piConfig))
          {
            config = scope.piConfig;
            if(_.isArray(config.defaults))
            {
              service = new FieldsMetaService(config.defaults);
            } else {
              service = new FieldsMetaService();
            }
          } else {
            service = new FieldsMetaService();
            config = {};
          }

          scope.meta = service.meta;
          scope.available = service.available;

          scope.addModel = {};

          scope.viewEditNewSelect = false;
          scope.viewEditSelect = false;

          scope.piMeta = service.meta;
          scope.metaEdit = scope.piMeta[0];

          scope.getPlaceholderText = function(obj, defaultPlaceholder){
            if(!_.isUndefined(obj.placeholder)){
              return obj.placeholder;
            }
            return defaultPlaceholder;
          }

          scope.addEntry = function()
          {
            var model = scope.metaAddCurrent;
            if(scope.metaType != '')
              model.metaType = scope.metaType;

              service.addObj(angular.copy(model));
              scope.metaAddCurrent = {};
              scope.viewAdd = false;
              scope.metaType = '';
          }

          scope.editSelectOpt = function(item)
          {
            scope.metaSelectEditCurrent = {
              displayNisplay:item.displayName,
              value: item.value
            };
            scope.viewEditNewSelect = true;
          };

          scope.editSelectEntry = function()
          {

          };

          scope.cancelEditSelect = function()
          {
            scope.viewEditNewSelect = false;
            scope.metaSelectEditCurrent = {};
          }

          scope.addSelectEntry = function()
          {
            scope.metaSelectCurrent.push(scope.metaSelectAddCurrent);
            scope.metaSelectAddCurrent = {};
          }

          scope.addSelect = function()
          {
            service.addObj({metaType: 'select', values: scope.metaSelectCurrent, key: scope.metaSelectCurrentKey, displayName: scope.metaSelectCurrentKey});
            scope.viewEditNewSelect = false;
            scope.metaSelectCurrent = [];
            scope.metaType = '';
            scope.metaSelectCurrentKey = '';
          }

          scope.change = function(item, model) {
            scope.metaEdit = angular.extend({}, item);
            scope.viewEdit = true;
          }

          scope.add = function(item, model){
            scope.viewEdit = false;
            scope.viewAdd = true;
            scope.metaAddCurrent = angular.copy(item);
            scope.metaType = item.metaType || '';
          }

          scope.goAdd = function()
          {
            scope.viewEdit = false;
            scope.viewAdd = true;
            scope.metaType = '';
          }

          scope.cancelAdd = function()
          {
            scope.viewAdd = false;
            scope.metaType = '';
          }

          scope.saveMeta = function() {
            angular.forEach(scope.piMeta, function(value, key) {
              if(value.key == scope.metaEdit.key) {
                scope.piMeta[key] = angular.extend({}, scope.metaEdit);
              }
            });
            scope.viewEdit = false;
          }

          scope.removeMeta = function(metaKey){
            if(_.isUndefined(metaKey))
            metaKey = scope.metaEdit.key;

            angular.forEach(scope.piMeta, function(value, key) {
              if(value.key == metaKey) {
                scope.piMeta.splice(key, 1);
              }
            });
            scope.viewEdit = {};
            scope.viewEdit = false;
            scope.metaEdit = {};
          };

          scope.cancelEdit = function(){
            scope.viewEdit = false;
            scope.metaEdit = {};
          }
        }
      }
  };
  PiMetaDirective.$inject = ['FieldsMetaService', '$parse'];

  angular
      .module('pi')
      .directive('piMeta', PiMetaDirective);
})();

(function(){
  angular
    .module('pi')
    .directive('ngPrism', ['$interpolate', function($interpolate){
            return {
                restrict: 'AEC',
                template: '<pre><code ng-transclude></code></pre>',
                replace: true,
                transclude: true,
                link: function (scope, elm) {
                    var tmp = $interpolate(elm.find('code').text())(scope);
                    elm.find('code').html(Prism.highlightElement(tmp).value);
                }
            };
        }]);
})();

(function(){

    /**
     * @name Partition Filter
     *
     * @description
     * Published at StackOveflow 
     * http://stackoverflow.com/questions/21644493/how-to-split-the-ng-repeat-data-with-three-columns-using-bootstrap
     */
    var Partition = function() {
    var cache = {}; // holds old arrays for difference repeat scopes
    var filter = function(newArr, size, scope) {
      var i,
        oldLength = 0,
        newLength = 0,
        arr = [],
        id = scope.$id,
        currentArr = cache[id];
      if (!newArr) return;

      if (currentArr) {
        for (i = 0; i < currentArr.length; i++) {
          oldLength += currentArr[i].length;
        }
      }
      if (newArr.length == oldLength) {
        return currentArr; // so we keep the old object and prevent rebuild (it blurs inputs)
      } else {
        for (i = 0; i < newArr.length; i += size) {
          arr.push(newArr.slice(i, i + size));
        }
        cache[id] = arr;
        return arr;
      }
    };
    return filter;
  }; 

  angular
    .module('pi')
    .filter('partition', Partition);
})();
(function(){
  "use strict";

  var piContentCtrl = function($scope)
  {
     var ctrl = this;
        ctrl.model = $scope.model = {view: 'normal'};

     var normalView = function()
     {
       $scope.model.view = "normal";
       ctrl.model.view = "normal";
       $scope.$broadcast('view',{"name":'normal'})
     };

     ctrl.getView = $scope.getView = function()
     {
       return $scope.view;
     }

     ctrl.viewEdit = $scope.viewEdit = function()
     {
         $scope.model.view = "edit";
         ctrl.model.view = "edit";
         $scope.$broadcast('view',{"name":'edit'})
     };

     ctrl.endEdit = $scope.endEdit = function()
     {
       normalView();
     };

     ctrl.cancelEdit = $scope.cancelEdit = function()
     {
       normalView();
     };
   };

  var piContent = function(){

       var linkFn = function(scope, elem, attrs)
       {
           elem.addClass('pi-content');

           if(scope.piContentEditable){
               elem.addClass('pi-content-editable');
           }

           elem.on('mouseenter', function(){
               elem.addClass('pi-content--hover');
           });

           elem.on('mouseleave', function(){
               elem.removeClass('pi-content--hover');
           });

           scope.$on('view', function(event, args){
             if(args.name == 'normal'){
               elem.removeClass('pi-content--edit');
             } else if(args.name == 'edit') {
               elem.addClass('pi-content--edit');
             }
           });

       };

       return {
           link: linkFn,
           restrict: 'A',
           controller: 'PiContentCtrl',
           scope: true
       }
   };

   var piContentView = function()
   {
       var linkFn = function(scope, elem, attrs, piContentCtrl)
       {
         scope.$on('view', function(event, args){
           if(args.name == 'normal'){
               elem.removeClass('hide');
           } else if(args.name == 'edit'){
               elem.addClass('hide');
           }
         });

         scope.ctrl = piContentCtrl;
         elem.addClass('pi-content-view');
       }
       return {
           link: linkFn,
           restrict: 'A',
           require: '^piContent',
           scope: {
             'view': '@'
           }
       }
   };

   var piContentEditable = function()
   {
       var linkFn = function(scope, elem, attrs, piContentCtrl)
       {
         elem.addClass('hide');

         scope.$on('view', function(event, args){
           if(args.name == 'edit'){
               elem.removeClass('hide');
           } else if(args.name == 'normal'){
               elem.addClass('hide');
           }
         });
           elem.addClass('pi-content-editable');
       }
       return {
           link: linkFn,
           restrict: 'A',
           require: '^piContent',
           scope: {
             'view': '='
           }
       }
   };

   var piContentEdit = function()
   {
       var linkFn = function(scope, elem, attrs, piContentCtrl)
       {
           elem.addClass('pi-content-edit');

           elem.bind('click', function(){
               piContentCtrl.viewEdit();
           })
       }
       return {
           link: linkFn,
           restrict: 'A',
           require: '^piContent'
       }
   };

   var piContentEditableCancel = function()
   {
       var linkFn = function(scope, elem, attrs, piContentCtrl)
       {
           elem.addClass('pi-content-editable-cancel');

           elem.bind('click', function(){
               piContentCtrl.cancelEdit();
           })
       }
       return {
           link: linkFn,
           restrict: 'A',
           require: '^piContent'
       }
   };
   var piContentEditableSubmit = function()
   {
       var linkFn = function(scope, elem, attrs, piContentCtrl)
       {
           elem.addClass('pi-content-editable-submit');

           elem.bind('click', function(){
               scope.onSubmit();
               piContentCtrl.endEdit();
           })
       }
       return {
           link: linkFn,
           restrict: 'A',
           require: '^piContent',
           scope: {
             'onSubmit': '&'
           }
       }
   };

   angular
    .module('pi')
      .controller('PiContentCtrl', piContentCtrl)
      .directive('piContent', piContent)
      .directive('piContentView', piContentView)
      .directive('piContentEditable', piContentEditable)
      .directive('piContentEditableCancel', piContentEditableCancel)
      .directive('piContentEditableSubmit', piContentEditableSubmit)
      .directive('piContentEdit', piContentEdit);
})();


/**
 * @ng-doc directive
 * @name scrollToId
 * @dependencies jquery jquery.animate
 *
 * @description
 * Scroll to an element by his id, animating the window
 *
 * @example
 * <a id="firstSection">First Section</a>
 * <a scroll-to-id scroll-to="firstSection">Scroll to first section</a>
 */
(function(){
	var fn =  function() {                                                      
	    return {                                                                                 
	        restrict: 'A',                                                                       
	        scope: {                                                                             
	            scrollTo: "@"                                                                    
	        },                                                                                   
	        link: function(scope, $elm,attr) {

	        	$elm.on('click', function() {                                                    
	                $('html,body').animate({scrollTop: $(scope.scrollTo).offset().top }, "slow");
	            });
	        }                
	    };
    };
})();
var INTEGER_REGEXP = /^\-?\d*$/;

(function(){
  var PiSeoValidator = function(SeoValidator)
  {


    var linkFn = function(scope, elem, attrs, ctrl)
    {
      ctrl.$parsers.unshift(function(viewValue) {
       if (INTEGER_REGEXP.test(viewValue)) {
         // it is valid
         ctrl.$setValidity('integer', true);
         return viewValue;
       } else {
         // it is invalid, return undefined (no model update)
         ctrl.$setValidity('integer', false);
         return undefined;
       }
     });
    };

    return {
      require: 'ngModel', // Validation is run agains the ng-model
      link: linkFn
    };
  };

  PiSeoValidator.$inject = ['SeoValidator'];

  angular
    .module('pi')
    .directive('piSeoValidator', PiSeoValidator);
})();

(function(){
    'use strict';
    var UploadThumbnail = function(Upload, piHttp){

        var linkFn = function(scope, elem, attrs, ngModel){
            var self = this;


            //scope.thumbnailSrc = _.isString(ngModel.$viewValue) ? ngModel.$viewValue : 'http://fitting.pt/dist/images/event-thumbnail.jpg';
            attrs.$observe('ngModel', function(value){ // Got ng-model bind path here
              scope.$watch(value,function(newValue){ // Watch given path for changes
                  scope.thumbnailSrc = _.isString(ngModel.$viewValue) ? ngModel.$viewValue : 'http://fitting.pt/dist/images/event-thumbnail.jpg';
              });
           });

            scope.$watch('files', function () {
                scope.upload(scope.files);
            });

            scope.upload = function (files) {

                if (files && files.length) {
                    for (var i = 0; i < files.length; i++) {
                        var file = files[i];
                        var url = '/filesystem';

                        Upload.upload({
                            url: url,
                            fields: {},
                            file: file
                        }).progress(function (evt) {
                            scope.uploadProgress = parseInt(100.0 * evt.loaded / evt.total);
                        }).success(function (data, status, headers, config) {
                            ngModel.$setViewValue(data.uri);
                            scope.thumbnailSrc = data.uri;
                        });
                    }
                }
            };


            scope.getTemplate = function(){
                if(!_.isUndefined(attrs.piTemplate)){
                    return attrs.piTemplate;
                }

                return 'html/upload-thumbnail.html';
            }
        };

        return {
            require: '^ngModel',
            scope: {

            },
            link: linkFn,
            template: '<ng-include class="upload-thumbnail" src="getTemplate()"></ng-include>'
        }
    };

    UploadThumbnail.$inject = ['Upload', 'piHttp'];

    angular
        .module('pi')
        .directive('uploadThumbnail', UploadThumbnail);

})();
(function(){

	var piFileManager = function(){



		return {

			$get: {

			}
		}
	}

	var piUploadService = function(){

		var upload = function(file, uploadDto){

		}
		return {
			upload: upload
		}
	}

	var piFileDashboard = function(){

		return {
			templateUrl: '/html/pi/file-dashboard.html'
		}
	}
	var piFileUpload = function(){

		var link = function(scope, elem, attr){

		}

		var controller = function($scope){
			this.upload = function(){

			}
		}
		return {
			link: link,
			controller: controller,
			controllerAs: 'ctrl'
		}
	}

	var  piFileUploadArea = function(){

		return {
			templateUrl: '/html/pi/file-upload-area.html'
		}
	}

	var piFileUploadBrowse = function(){
		return {
			templateUrl: '/html/pi/file-upload-browser.html'
		}
	}

	var piFileEditCard = function(){
		return {
			templateUrl: '/html/pi/file-edit-card.html'
		}
	}

	var piFileCard = function(){
		return {
			templateUrl: '/html/pi/file-card.html'
		}
	}

	
})();
/**
 * Filter to reverse a list
 * @ngdoc filter
 * @name reserve
 * @kind function
 *
 * @description
 * Reverse a array without replacing the original array since slice is used to return the array 
 *
 * @return {Array}
 *
 * @example
 * <div ng-repeat="verses in bibles.kingJames | reverse">
 * 	<em ng-bind="verse.number"></em> <span ng-bind="verse.message"></span>
 * </div>
 */
(function(){
	
	var reverseFilter = function(){

	  return function(items) {
	    return items ? items.slice().reverse() : [];
	  };

	};

	angular.module('pi')
		.filter('reverse', reverseFilter);
})();
(function(){
		'use strict';
    /**
     * @ngdoc directive
     * @name Pi Form
     * @description Directory to create a form
     */
	var piForm = function(){

        var compileFn = function(cElement, cAttrs, transclude) {

            var preFn = function(scope, pElement, pAttrs, pController) {

                },
                postFn = function(scope, pElement, pAttrs, pController) {

                };

            return {
                pre: preFn,
                post: postFn
            }
        };

				var controller = function($scope, $injector, $http, piStack)
		    {
		      if(_.isUndefined($scope.httpMethod)) {
		        $scope.httpMethod = 'POST';
		      }

		      var isService = !_.isUndefined($scope.serviceApp) && !_.isUndefined($scope.serviceUri);
		      $scope.model = {};

		      this.submit = function()
		      {
		        if(isService) {
		          serviceHandler();
		        } else if(isHttp) {
		          httpHandler();
		        } else {

		        }
		      };

		      this.setPreventSave = function()
		      {
		        $scope.$on('tentar mudar pagina', function(){
		          // mostrar modal que retorna uma promessa a ver se muda de página ou ão
		        });
		      };

		      var serviceHandler = function(dto)
		      {
		        var service = piServiceResolver.get($scope.serviceUri);
		        if(_.isNull(service)) {
		          // error
		        }
		        ServiceBroker.executeRequest($scope.serviceRequest, $scope.httpMethod, request)
		        .then(function(res) {
		            scope.onSuccess();
		          }, function(res) {
		            scope.onFailure();
		          });

		      };

		      var httpHandler = function(dto)
		      {
		        $http[$scope.httpMethod]($scope.httpUri, dto)
		          .then(function(res) {
		            scope.onSuccess();
		          }, function(res) {
		            scope.onFailure();
		          });
		      };
		    };
				controller.$inject = ['$scope', '$injector', '$http', 'piStack'];
        return {
            compile: compileFn,
						controller: controller,
						controllerAs: 'piFormCtrl'
        };
    };

    var piFormGroup = function($compile){
        var controllerFn = function($scope, $element, $attrs){

						var guide;

            this.focus = function(){
							if($attrs.piFormGuide){
								guide = $compile('<div class="fit-form__guide">' + $attrs.piFormGuide + '</div>')($scope);
								$element.append(guide);
							}
							// show help guide

                // show all labels with hide attr on form group
            };

            this.blur = function(){
								if(guide){
									guide.remove();
								}
                // hide all la
                // bels with hide attr  on form group
            }
        }
        return {
            controller: controllerFn,
						controllerAs: 'piFormGroupCtrl',
						require: '^piForm'
        }
    };
		piFormGroup.$inject = ['$compile'];

    var piFormFooter = function(){
        return {};
    };

    var piFormControl = function(piFormConfig){
        var compileFn = function(cElement, cAttrs) {

            var preFn = function(scope, pElement, pAttrs, parentCtrl) {
						//	if(piFormConfig.applyPiClasses && !pElement.hasClass('pi-form__control'))
								pElement.addClass('pi-form__control');

              var focusFn = function(fElement) {
                  parentCtrl.focus();
              };
              pElement.on('focus', focusFn);

							var blurFn = function(fElement){
								parentCtrl.blur();
							}
							pElement.on('blur', blurFn)
            },
            postFn = function(scope, pElement, pAttrs) {

            };

            return {
                pre: preFn,
                post: postFn
            }
        };
        return {
            compile: compileFn,
						restrict: 'EA',
						require: '^piFormGroup',
        }
    };
		piFormControl.$inject = ['piFormConfig'];

    var piFormLabel = function(){

        var compileFn = function(cElement, cAttrs, transclude) {

            var preFn = function(scope, pElement, pAttrs, pController) {
                    if(_.isNull(pAttrs.piHideFocus) && pAttrs.piHideFocus == true) {
                        cElement.css('display', 'none');
                    }
                },
                postFn = function(scope, pElement, pAttrs, pController) {

                };

            return {
                pre: preFn,
                post: postFn
            }
        };

        return {
            restrict: 'EAC',
            compile: compileFn
        };
    }

		var piFormClear = function()
	  {


	  };

	  var piFormSubmit = function()
	  {
	    var link = function(scope, elem, attrs, piFormCtrl)
	    {
	      var canSubmit = true;
	      var submit = function()
	      {
	        if(!canSubmit) return;
	        canSubmit = !canSubmit;
	        piFormCtrl.submit().success(function() {
	          canSubmit = true;
	        });
	      };
	      elem.bind('click', function(res) {
	        submit();
	      });
	      elem.bind('touch', function(res) {
	        submit();
	      });

	    }
	  }

	  /**
	   * @ng-doc directive
	   * Form Prevent Save
	   *
	   * Prevent a page from changing or some action that clear the form without user confirmation
	   */
	  var piFormPreventSave = function()
	  {
	    var link = function(scope, elem, attrs, piFormCtrl)
	    {
	        piFormCtrl.setPreventSave();
	    };

	    return {
	      restrict: 'A',
	      require: '^piForm',
	      link: link
	    }
	  };

		var piFormConfig = function(){
			var _applyPiClasses = true;

			return {
				setApplyPiClasses: function(value) {
					_applyPiClasses = value;
				},
				$get: function(){
					applyPiClasses: _applyPiClasses
				}
			}
		};

    angular
        .module('pi.form')
				.provider('piFormConfig', piFormConfig)
        .directive('piForm', piForm)
        .directive('piFormGroup', piFormGroup)
				.directive('piFormControl', piFormControl)
        .directive('piFormLabel', piFormLabel)
        .directive('piFormFooter', piFormFooter);

})();

(function(){
	var fn = function(apiException){

		var svc = function(response) {
			this.response = response;

			this.handle = function() {
				if(_.isUndefined(this.response || _.isUndefined(this.response.data))) {
					throw apiException.badRequest;
				}

				if(this.response.statusCode >= 400) {
					
				}

				this.success = true;
				return this.response.data;
			};
		};

		return {
			service: svc,
			setProvider: function(dependency) {
				svc.setHandler(dependency);
			}
		}
	};

	angular
        .module('pi')
		.constant('apiException', {
			badRequest: 502,
			notFound: 404,
			notAuthorize: 501,
			ok: 200
		})
		.factory('apiResponseProvider', ['apiException', fn]);
})();
(function(){
    angular
        .module('pi')
        .directive('piLayerHover', ['piLayer', '$timeout', 'piLayerStack', function(piLayer, $timeout, piLayerStack){

            return {
                link: function(scope, elem, attrs) {

                    var waiting = false,
                        waitingShow = false,
                        instance = null,
                        showTimer = null;

                    elem.on('mouseenter', function(){
                        waitingShow = true;

                        var topPos  = elem.offset().top;
                        var leftPos = elem.offset().left;

                        showTimer  = $timeout(function(){
                            waitingShow = false;
                            instance = piLayer.open({
                                namespace: scope.piNamespace,
                                entity: scope.piEntity,
                                top: topPos,
                                left: leftPos,
                                width: elem.width()
                            })
                        }, 700);


                    });

                    var clearFn = function(){
                        if(waitingShow) {
                            $timeout.cancel(showTimer)
                        }
                        waiting = true;
                        $timeout(function(){
                            scope.$apply(function(){
                                if(!_.isNull(instance)) {
                                    instance.close();
                                }
                            });
                        }, 3000)
                    }
                    elem.on('mouseleave', clearFn);
                    elem.on('blur', clearFn);
                },
                scope: {
                    piNamespace: '=',
                    piEntity: '='
                }
            }
        }])
        .directive('piLayerWindow', ['piLayerStack', function(piLayerStack){

            return {

                controller: function($scope){
                    $scope.visible = false;
                    $scope.current = piLayerStack.getTop();

                    $scope.closeCurrent = function(){
                        piLayerStack.dismiss($scope.current);
                        if(piLayerStack.length() > 0) {
                            $scope.current = piLayerStack.getTop();
                        } else {
                            $scope.current = null;
                            $scope.visible = false;
                        }
                    };

                    piLayerStack.onAdded(function(layer, opts){
                        currentLayer = layer;
                        if(!_.isUndefined($scope.current)) {
                            $scope.closeCurrent();
                        }

                        $scope.$apply(function(){
                            $scope.visible = true;
                            $scope.current = opts.entity;
                            $scope.top = opts.top;

                            $scope.left = opts.left - opts.width;
                        });
                    });


                }
            }
        }])
        .factory('piLayer', ['piLayerStack', '$q', function(piLayerStack, $q){
            this.open = function(opts) {
                var resultDeferred = $q.defer(),
                    openDeferred = $q.defer(),
                    instance = {
                        result: resultDeferred.promise,
                        opened: openDeferred.promise,
                        close: function(result) {
                            piLayerStack.close(instance);
                        },
                        dismiss: function(reason) {
                            piLayerStack.dismiss(instance);
                        }
                    };

                piLayerStack.open(instance, opts);

                return instance;
            };

            return this;
        }])
        .factory('piLayerStack', ['piStack', function(piStack){
            var stack = {};
            var callable;
            var layersVisibled = piStack.create();

            var open = function(instance, opts) {
                layersVisibled.add(instance, opts);
                if(!_.isUndefined(callable)){
                    callable(instance, opts);
                }

                return instance;
            }

            var close = function(instance) {
                layersVisibled.remove(instance);
            }

            var dismiss = function(instance) {
                layersVisibled.remove(instance);
            }

            var getTop = function() {
                return layersVisibled.top();
            }

            var getLength = function(){
                return layersVisibled.length();
            }

            return {
                length: getLength,
                open: open,
                onAdded: function(c) {
                    return callable = c;
                },
                length: function(){
                    return layersVisibled.length();
                },
                dismiss: dismiss,
                close: close,
                getTop: getTop
            }
        }]);
})();
(function(){
  var piModalStack = function(piStack)
  {
    var stack = {};
    var modalsOpened = piStack.create();

    var open = function(instance, modal)
    {
      modalsOpened.add(instance, modal);
    };

    var close = function(instance, result){
        modalsOpened.remove(instance);
    };

    var dismiss = function(instance, reason) {
      modalsOpened.remove(instance);
    };

    return {
        open: open,
        close: close,
        dismiss: dismiss
    }
  };

  piModalStack.$inject = ['piStack'];

  var piModal = function(piModalStack, $q)
  {
      this.open = function(modal)
      {
        var modalResultDeferred = $q.defer(),
            modalOpenedDeferred = $q.defer(),
            instance = {
              result: modalResultDeferred.promise,
              opened: modalOpenedDeferred.promise,
              close: function (result) {
                piModalStack.close(instance, result);
              },
              dismiss: function (reason) {
                piModalStack.dismiss(instance, reason);
              }
            };
        piModalStack.open(instance, modal);
      };

      return this;
  };

  piModal.$inject = ['piModalStack', '$q'];

  /**
   * Directive that handles the priority with z-index
   */
  var piModalBack = function($compile)
  {
    var ctrl = function() {

    };
    ctrl.$inject = [];

    return {
      templateUrl: 'pi/modal-back.html',
      controllerAs: 'ctrl',
      controller: ctrl
    }
  };

  var piModalWindow = function(piModalStack, $timeout) {
    var link = function(scope, elem, attrs) {
        scope.windowClass = attrs.windowClass;

        $timeout(function(){
          $scope.animate = true;
          elem[0].focus();
        });

        scope.close = function(evt) {
          var modal = $modalStack.getTop();
          if(modal && modal.value.backdrop){
            
          }
        }
    };
    return {
      restruct: 'EA',
      scope: {
        index: '@',
        animate: '='
      },
      replace: true,
      transclude: true,
      templateUrl: 'pi/modal-window.html',
      link: link
    }
  };

  piModalBack.$inject = ['$compile'];
})();

/**
 * @ng-doc service
 * @name ApiIsAuthorService
 *
 * @description
 * This service assumes an Pi based API is being used
 * An entity response from API may contain an author property
 * In such cases you can use this service to verify if a user is author of the entity
 * In the following example, we store the authenticated user id in $rootScope
 *
 * @example
 * var isAuthor = ApiIsAuthorService(response, $rootScope.userId)
 *
 */

(function(){
  "use strict";

  var ApiIsAuthorService = function()
  {
    /**
     * The response object expected may be: (in order of preference for performance)
     * - String with Id
     * - Author DTO, ie: {displayName: 'Jesus', id: 1}
     * - HTTP Response data object, ie: {code: 200, data: { author: { displayName: 'Jesus', id: 1}}}
     * - Object containing an property named author
     * @param entityId THE Id
     * @param res response object
     * @return boolean
     */
    var isAuthor = function(entityId, res){
      if(_.isNull(res)){
        return false;
      } else if(_.isString(res)){
        return entityId == res;
      }
      else if(res.id){
        return entityId == res.id;
      }
      else if(res.data && res.data.author && res.data.author.id)
      {
        return entityId == res.data.author.id;
      }
      else if(res.author && res.author.id) {
        return entityId == res.author.id;
      }

      return false;
    }

    return {
      isAuthor: isAuthor
    }

  };

  angular
    .module('pi')
    .factory('ApiIsAuthorService', ApiIsAuthorService);
})();

(function(){
	var TestService = function(ServiceBase){
		var service = new ServiceBase('TestService');

		return service;
	};

	TestService.$inject = ['ServiceBase'];

	angular
		.module('pi')
		.factory('TestService', TestService);

	var TestAppHost = function(AppHost) {
		var config = {
			'appName': 'test'
		};
		
		return new AppHost(config);
	};

	TestAppHost.$inject = ['AppHost'];

	var AppHost = function($log, ServiceBroker){

		var fn = function(configs) {

			var self = this;
			this.appName = configs.appName || 'default';
			this.mode = configs.mode || 'production';
			this.plugins = [];

			this.init = function()
			{
				var services = discoveryServices();
				self.registerService(services);
			};
			this.setConfigs = function(configs)
			{
				if(!_.isUndefined(configs['appName'])) {
					self.appName = configs.appName;
				}
				if(!_.isUndefined(configs['mode'])) {
					self.mode = configs.mode;
				}

				self.configs = configs;
			};

			this.getConfigs = function()
			{
				return self.configs;
			}

			this.registerService = function(service)
			{
				return ServiceBroker.register(service);
			};

			this.execute = function(requestType, method, requestDto)
			{
				return ServiceBroker.executeRequest(requestType, method, requestDto);
			};

			var discoveryServices = function()
			{
				return [
					{
						id: "serverId",
						endpoint: '/api/user',
						requestsTypes: [
							{
								name: 'GetUser',
								methods: ['GET'],
								roles: []
							},
							'PutUser',
							'DeleteUser'
						]
					},
					{
						id: "serverId2",
						endpoint: '/api/group'
					}
				];
			};
		};

		return fn;
	};

	AppHost.$inject = ['$log'];

	angular
		.module('pi')
		.factory('AppHost', AppHost)
		.factory('TestAppHost', TestAppHost);
})();
(function(){
	var FieldsMetaService = function()
	{
      var fn = function(defaultMeta)
      {
				metaDefault = _.isArray(defaultMeta) ? defaultMeta : [];

					var meta = [];

					var addMeta = function(value, key)
          {
            meta.push({
              value: value,
              key: key
            });
          };

					var addObj = function(obj)
					{
						meta.push(obj);
					}

          var removeMeta = function(value)
          {

          };

          return {
              add: addMeta,
							addObj: addObj,
              remove: removeMeta,
              meta: meta,
							available: metaDefault
          }
      };

      return fn;
  };

  angular
    .module('pi')
    .factory('FieldsMetaService', FieldsMetaService);
})();

(function(){
	var ServiceBase = function($resource, $q, MessageBroker) {
		var fn = function(serviceName)
		{
			this.serviceName = serviceName;
			this.requests	 = 0;
			this.currentRequest = undefined;
			this.httpBusy = false;
			this.MessageBroker = MessageBroker;
		};

		fn.prototype.update = function(first_argument) {
			// body...
		};

		fn.prototype.get = function(id) {
			
		};

		fn.prototype.remove = function(id) {
			// body...
		};

		fn.prototype.query = function() {
			// body...
		};

		return fn;
	};

	ServiceBase.$inject = ['$resource', '$q', 'MessageBroker'];

	angular
		.module('pi')
		.factory('ServiceBase', ServiceBase)
})();
(function(){

	var ServiceBroker = function($log, ServiceRunner) 
	{
		var services = [];
		/* Map the Service Request Type and the Service index
		 */
		var servicesMap = {};
		var self = this;

		this.register = function(serviceType)
		{
			var register = function(service)
			{
				var index = services.push(service);
				angular.forEach(service.requestsTypes, function(requestType, typeIndex){
					servicesMap[serviceType] = index;
				});
			}
			
			if(_.isArray(serviceType))
			{
				angular.forEach(serviceType, function(value, key) {
					register(value);
				});
			} else {
				register(serviceType);
			}
		};

		this.unregister = function(serviceType)
		{

		};

		/**
		 * Execute a request
		 * @param  {[type]} requestType [description]
		 * @param  {[type]} method      [description]
		 * @param  {[type]} requestDto  [description]
		 * @return {promise}             [description]
		 */
		this.executeRequest = function(requestType, method, requestDto)
		{
			var service = services[servicesMap[requestType]];
			var runner = new ServiceRunner(service, requestType, requestDto);
			
			return runner.execute(method);
		};

	};
	ServiceBroker.$inject = ['$log', 'ServiceRunner'];

	angular
		.module('pi')
		.factory('ServiceBroker', ServiceBroker);
})();
(function(){
	var ServiceConsumer = function($log) 
	{
		this.send = function()
		{

		};
	};
	ServiceConsumer.$inject = ['$log'];

	angular
		.module('pi')
		.factory('ServiceConsumer', ServiceConsumer)
})();
(function(){

	/**
	 * Service Request
	 */

	var PiServiceRequest = function()
	{
		var fn = function()
		{
			/**
			 * Unique identifier for the Service
			 * @type {[type]}
			 */
			this.id = undefined;
			this.externalId = undefined;
			this.attributes = []
		};

		fn.prototype.AddAttribute = function(objectOrArray) {
			if(_.isArray(objectOrArray))
			{
				this.attributes = objectOrArray;
			} 
			else if(_.isObject(objectOrArray))
			{
				this.attributes.push(objectOrArray);
			}
		};

		fn.prototype.Attributes = function() {
			return this.attributes;
		};

		return fn;
	};

	angular
		.module('pi')
		.factory('piServiceRequest)', PiServiceRequest);
})();
(function(){

	var ServiceRunner = function($http, $q){

		var fn = function(service, requestType, requestDto)
		{
			if(!_.isObject(service) || !_.isObject(requestType))
			{
				return false;
			}
			var self = this;

			this.execute = function(httpMethod)
			{
				var deferred = $q.defer(),
					success = function(response) 
					{
						deferred.resolve(res.data);
					},
					error = function(resposne)
					{
						deferred.reject(response);
					};

				$http({
					method: httpMethod,
					data: requestDto,
					url: service.endpoint
				})
				.then(success, error);

				return deferred.promise;
			};
			
		};

		return fn;
	};
	ServiceRunner.$inject = ['$http', '$q'];

	angular
		.module('pi')
		.factory('ServiceRunner', ServiceRunner);

})();
(function(){

	 var fn = function(){
	 	return {
	      createNew: function () {
	        var stack = [];

	        return {
	          add: function (key, value) {
	            stack.push({
	              key: key,
	              value: value
	            });
	          },
	          get: function (key) {
	            for (var i = 0; i < stack.length; i++) {
	              if (key == stack[i].key) {
	                return stack[i];
	              }
	            }
	          },
	          keys: function() {
	            var keys = [];
	            for (var i = 0; i < stack.length; i++) {
	              keys.push(stack[i].key);
	            }
	            return keys;
	          },
	          top: function () {
	            return stack[stack.length - 1];
	          },
	          remove: function (key) {
	            var idx = -1;
	            for (var i = 0; i < stack.length; i++) {
	              if (key == stack[i].key) {
	                idx = i;
	                break;
	              }
	            }
	            return idx != -1 ? stack.splice(idx, 1)[0] : false;
	          },
	          removeTop: function () {
	            return stack.splice(stack.length - 1, 1)[0];
	          },
	          length: function () {
	            return stack.length;
	          }
	        };
	      }
	    };
	 };

	 angular
	 	.module('pi')
	 	.factory('StackedMap', fn)
})();

(function(){

	var UpdateBuilder = function($log){
		var fn = function(){
			this.current = undefined;
			this.request = {};
			var self = this;

			this.field = function(field) {
				self.current = field;
				return self;
			};

			this.set = function(value) {
				self.request[self.current] = value;
				self.current = undefined;
				$log.debug('field ' + self.current + ' set ' + value);
				return self;
			};

			this.getRequest = function(){
				return self.request;
			};
		};

		return fn;
	};

	UpdateBuilder.$inject = ['$log'];

	angular
		.module('pi')
		.factory('UpdateBuilder', UpdateBuilder);
})();

(function(){
	
	var svcFn = function($rootScope){

		var svc = function(model){
			var self = this;
			this.model = model;
			
			this.get = function(){
				return self.model;
			};

		};

		svc.prototype.build = function(skip, take) {
			
			if(_.isUndefined(this.model.skip)) {
				this.model.skip = _.isUndefined(skip) ? 0 : skip;
			}

			if(_.isUndefined(this.model.take)) {
				this.model.take = _.isUndefined(take) ? 40 : take;
			}
		};

		return svc;		
	};

	angular
		.module('pi')
		.factory('queryModelFactory', ['$rootScope', svcFn]);
})();
(function(){
	var commonUtils = function(){

		this.capitalizeFirstLetter = function(string) {
			return string.charAt(0).toUpperCase() + string.slice(1);
		};

		this.randomText =  function(counter)
		{
	    var text = "";
	    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

	    for( var i=0; i < counter; i++ )
	        text += possible.charAt(Math.floor(Math.random() * possible.length));

	    return text;
		};

		return this;
	};


	angular
		.module('pi')
		.factory('commonUtils', commonUtils);
})();

(function(){
	var pagingFn = function(){

        var svc = function(queryFnName){
            this.queryFnName = queryFnName;
            this.observerCallbacks = [];

            this.modelQuery = {
                current: 1,
                limit: 20,
                count: 0
            };

            var self = this;


            this.registerObserver = function(callback){
                self.observerCallbacks.push(callback);
            };

            this.notifyObservers = function() {
                angular.forEach(self.observerCallbacks, function(callback) {
                    callback();
                });
            };

        };

        svc.prototype.update = function(){
            this[this.queryFnName]();
        };

        svc.prototype.dataNext = function(){
            this.modelQuery.current++;
            this.bids = [];

            return this.queryFnName();

        };

        svc.prototype.dataPrevious = function(){
            this.modelQuery.current--;
            this.bids = [];

            this[this.queryFnName]();
        };

        return svc;
    };

    angular
    	.module('pi')
    	.factory('dataPagingBase', pagingFn)
})();
/**
(function(){

	var fn = function($q){
		var modals = [];

		var add = function(modalObj) {
			
		};

		var templatePath, 
			setTemplatePath = function(path) {

		};

		var getFn = function(){
			return {
				getTemplatePath: function(){
					return templatePath;
				}
			}
		};
		getFn.$inject = [];


		return {
			setTemplatePath: setTemplatePath,
			$get: getFn
		}

		
	};

	fn.$inject = ['$q'];

	angular
		.module('pi')
		.provider('ModalService', fn);
})();
*/
(function(){
	'use strict';

	/**
	 * @ng-doc service
	 * @name piHttp
	 *
	 * This service is a wrapper for angular $http service
	 * http://stackoverflow.com/questions/23968129/limiting-http-interceptor-to-specific-domain
	 */
	 angular
	 	.module('pi')
		.provider('piHttp', [
			function () {
				var self = this;
				this.baseUrl = '';
				this.token = null;

				var formatUrl = function(url) {
					return self.baseUrl + url;
				}

				var getFn = function($http) {

					var s = this;

					// Augments the request configuration object
					// with OAuth specific stuff (e.g. some header)
					function getAugmentedConfig(cfg) {
						var config  = cfg || {};
						config.headers = config.headers || {};
						//config.headers.someHeaderName = 'some-header-value';
						return config;
					}

					// The service object to be returned (`$http` wrapper)


					// Create wrappers for methods WITHOUT data
					['delete', 'get', 'head', 'jsonp'].forEach(function (method) {
						s[method] = function (url, config) {
						    var config = getAugmentedConfig(config);
						    return $http[method](formatUrl(url), config);
						};
					});

					// Create wrappers for methods WITH data
					['post', 'put'].forEach(function (method) {
						s[method] = function (url, data, config) {
						    var config = getAugmentedConfig(config);
						    return $http[method](formatUrl(url), data, config);
						};
					});

					// Return the service object
					return this;
				};
				getFn.$inject = ['$http'];

				this.$get = getFn;

				this.setBaseUrl = function(url) {
					self.baseUrl = url;
				}

				this.setAuth = function(token) {
					self.token = token;
				}
			}
		]);
})();

(function(){
  "use strict";

  var piPromptConfirmationStack = function(piStack) {
    var stack = piStack.create();

    var open = function(instance, prompt)
    {
      stack.add(instance, prompt);
    };

    var confirm = function(instance, result)
    {
      stack.remove(instance);
    };

    var dismiss = function(instance, reason)
    {
      stack.remove(instance);
    };

  };

  piPromptConfirmationStack.$inject = ['piStack'];

  /**
   * @ng-doc service
   * @name Prompt Confirmation
   * @description
   * This service allow you to prompt user before commiting an action
   * @todo
   * - implement a provider for prompt modal, alert, etc
   */
  var promtConfirmation = function(piPromptConfirmationStack)
  {
    this.prompt = function(messageOrObject) {
      var config;
      if(_.isObject(messageOrObject)) {
          config = angular.copy(messageOrObject);
      } else {
        config = {
          message: _.isString(messageOrObject) ? messageOrObject : 'Tens a certeza que pretendes continuar?'
        }
      }

      var resultDeferred = $q.defer(),
          openedDeferred = $q.defer(),
          instance = {
            result: resultDeferred,
            opened: openedDeferred,
            dismiss: function() {
              piPromptConfirmationStack.dismiss(instance);
            }
          };

      piPromptConfirmationStack.open(instance, config);
    };

    return this;
  };

  promtConfirmation.$inject = ['piPromptConfirmationStack'];
})();

(function(){
  var piStack = function() {

    return {
      create: function(){
        var stack = [];

        return {
          add: function (key, value) {
            stack.push({
              key: key,
              value: value
            });
          },
          get: function (key) {
            for (var i = 0; i < stack.length; i++) {
              if (key == stack[i].key) {
                return stack[i];
              }
            }
          },
          keys: function() {
            var keys = [];
            for (var i = 0; i < stack.length; i++) {
              keys.push(stack[i].key);
            }
            return keys;
          },
          top: function () {
            return stack[stack.length - 1];
          },
          remove: function (key) {
            var idx = -1;
            for (var i = 0; i < stack.length; i++) {
              if (key == stack[i].key) {
                idx = i;
                break;
              }
            }
            return stack.splice(idx, 1)[0];
          },
          removeTop: function () {
            return stack.splice(stack.length - 1, 1)[0];
          },
          length: function () {
            return stack.length;
          }
        };
      }
    }
  };
  piStack.$inject = [];

  angular
    .module('pi')
    .factory('piStack', piStack);
})();

(function(){
	
	var registerFactory = function($http, $q){

		this.register = function(registerModel) {
			var model = registerModel;
				deferred = $q.defer(),
				successFn = function(res) {
					deferred.resolve(res.data);
				},
				errorFn = function(res) {
					deferred.reject(res);
				},
				httpObj = {
					method: 'POST',
					url: '/api/register',
					data: model
				};

			$http(httpObj)
				.then(successFn, errorFn);

			return deferred.promise;
		};
	};

	angular	
		.module('pi')
		.service('piRegisterService', registerFactory);
})();
/**
 * @author Gui <guilhermecardoso@volupio.com>
 * @ng-doc service
 * @name SEO Validator
 *
 * @description
 * Helper class to validate SEO
 * Functions started with "validate" will be used agains validateObject() with common properties array
 */
 var seoValidationResult = {
 	message: '',
 	error: false
 };

(function(){
	var SeoValidator = function(commonUtils, $log){
		var self = this,
			commonProperties = ['title', 'content', 'url', 'excerpt'];

    var createError = function(property, message)
    {
      return {
        key: property,
        value: message
      };

    };

    var validators = {
        validateTitle: function(title) {
    			if(title.length < 10 || title.length > 70) {
            return createError('title', 'Title length should be between 30 and 70');
    			}
          return true;
    		},
        validateContent: function(content) {

          if(content.length < 30 || content.length > 70) {
            return createError('content', 'Title length should be between 30 and 70');
          }
          return true;
    		},
        validateExcerpt: function(excerpt){
          if(excerpt.length < 10 || excerpt.length > 50) {
            return createError('excerpt', 'Title length should be between 30 and 70');
          }
          return true;
    		},
        validateUrl: function(url){
          if(url.length < 10 || url.length > 70) {
            return createError('url', 'Title length should be between 30 and 70');
          }
          return true;
    		}
    };
    this.validateTitle = validators.validateTitle;
    this.validateContext = validators.validateContent;
    this.validateExcerpt = validators.validateExcerpts;
    this.validateUrl = validators.validateUrl;
		/*
		 * Runs all the validation functions of the service agains the object
		 * The existence of the properties is checked, and the object must have the regular properties: title, content, url, etc
		 */
		this.validateObject = function(obj) {
			var results = [];

      angular.forEach(commonProperties, function(prop, key) {
				if(prop in obj) {
					/*var fnName = String('validate' + commonUtils.capitalizeFirstLetter(prop)),
            obj[prop],
            validators[fnName](val);

          if(!_.isUndefined(res) && res === 'true');
          {
            results.push(res);
          }*/
				}
			});

      if(results.length >= 0)
      {
        return {
          error: true,
          validation: results
        }
      }

      return true;
		};

    return this;
	};

  SeoValidator.$inject = ['commonUtils', '$log'];

	angular
		.module('pi')
		.factory('SeoValidator', SeoValidator);
})();

(function(){
	/**
	 * @ng-doc overview
	 * @name pi template editor
	 * 
	 * @description
	 * template editor for pi based apps
	 * the editor store dom with angular directives in jsonml
	 */

	 var svcFn = function(){

	 	/**
	 	 * @param bodyJson the jsonml retrieved from database
	 	 */
	 	var main = function(bodyJson) {
	 		this.toolBar = {
	 			items: [],
	 			version: '0.0.1'
	 		};
	 	}

	 };


	 var directive = function($compile){
	 	var compileFn = function(element, attributes) {
	 		var preFn = function(scope, element, attributes, controller) {

	 				},
	 				postFn = function(scope, iElement, attributes, controller) {
	 					$compile(iElement)(scope);
	 				};

	 		return {
	 			pre: preFn,
	 			post: postFn
	 		}
	 	}
 		return {
 			compile: compileFn
 		}
	 };
})();
(function(){
	
	var configFn = function($provide) {

		// use $state.forceReload() to reload the current state
		// delegate cames from SO http://stackoverflow.com/questions/21714655/angular-js-angular-ui-router-reloading-current-state-refresh-data
		$provide.decorator('$state', function($delegate, $stateParams) {
	        $delegate.forceReload = function() {
	            return $delegate.go($delegate.current, $stateParams, {
	                reload: true,
	                inherit: false,
	                notify: true
	            });
	        };
	        return $delegate;
	    });
	};
	angular
		.module('pi.ui-extensions')
		.config(['$provide', configFn]);
})();
(function(){

	var svc = function($state, $rootScope, $window) {

	  var history = [];

	  angular.extend(this, {
	    push: function(state, params) {
	      history.push({ state: state, params: params });
	    },
	    all: function() {
	      return history;
	    },
	    go: function(step) {
	      // TODO:
	      // (1) Determine # of states in stack with URLs, attempt to
	      //    shell out to $window.history when possible
	      // (2) Attempt to figure out some algorthim for reversing that,
	      //     so you can also go forward

	      var prev = this.previous(step || -1);
	      return $state.go(prev.state, prev.params);
	    },
	    previous: function(step) {
	      return history[history.length - Math.abs(step || 1)];
	    },
	    back: function() {
	      return this.go(-1);
	    }
	  });

	};

	svc.$inject = ['$state', '$rootScope', '$window'];

	var directiveFn = function($history){
		
		var linkFn = function(scope, elem, attrs) {
			elem.on('click', function(){
				$history.back();
			});
		};

		return {
			link: linkFn,
			restrict: 'A'
		}
	};

	directiveFn.$inject = ['$history'];

	angular
		.module('pi.ui-extensions')
		.directive('piUiBack', directiveFn)
		.service('$history', svc);
})();
(function(){

	var runFn = function($rootScope, $history, $state) {
	
		$rootScope.$on("$stateChangeSuccess", function(event, to, toParams, from, fromParams) {
			if (!from.abstract) {
				$history.push(from, fromParams);
			}
	  	});

	  	$history.push($state.current, $state.params);
	};

	runFn.$inject = ['$rootScope', '$history', '$state'];

	angular
		.module('pi.ui-extensions')
		.run(runFn)
})();
(function(){
	'use strict';

	angular
		.module('pi.core.app')
		.factory('pi.core.app.appSvc', ['piHttp', function(piHttp){

			this.post = function(model){
				return piHttp.post('/api/application', model);
			}

			this.get = function(id, model) {
				return piHttp.get('/api/application/' + id, model);
			}

			this.find = function(model) {
				return piHttp.get('/api/application', model);
			}

			this.put = function(id, model){
				return piHttp.post('/api/application/' + id, model);
			}

			return this;
		}]);

})();
(function(){
	angular
		.module('pi.core.article')
		.factory('pi.core.article.articleCategorySvc', ['piHttp', function(piHttp){

			this.post = function(model){
				return piHttp.post('/article-category', model);
			}

			this.remove = function(id){
				return piHttp.post('/article-category-remove/' + id);
			}

			this.get = function(id, model) {
				return piHttp.get('/article-category/' + id, model);
			}

			this.find = function(model) {
				return piHttp.get('/article-category', {params: model});
			};

			this.put = function(id, model) {
				return piHttp.post('/article-serie/' + id, model);
			};

			return this;
		}]);
})();

(function(){
	angular
		.module('pi.core.article')
		.factory('pi.core.article.articleSerieSvc', ['piHttp', function(piHttp){

			this.post = function(model){
				return piHttp.post('/article-serie', model);
			}

			this.remove = function(id) {
				return piHttp.post('/article-serie-remove/' + id);
			}

			this.put = function(id, model) {
				return piHttp.post('/article-serie/' + id, model);
			}

			this.get = function(id, model) {
				return piHttp.get('/article-serie/' + id, model);
			}

			this.find = function(model) {
				return piHttp.get('/article-serie', {params: model});
			};
			return this;
		}]);
})();

(function(){
	angular
		.module('pi.core.article')
		.factory('pi.core.article.articleSvc', ['piHttp', function(piHttp){

			this.post = function(model){
				return piHttp.post('/article', model);
			}

			this.remove = function(id) {
				return piHttp.post('/article-remove/' + id);
			}

			this.put = function(id, model) {
				return piHttp.post('/article/' + id, model);
			}

			this.get = function(id, model) {
				return piHttp.get('/article/' + id, model);
			}

			this.find = function(model) {
				return piHttp.get('/article', {params: model});
			};
			return this;
		}]);
})();

(function(){

	angular
		.module('pi.core.chat')
		.factory('pi.core.chat.inboxSvc', ['piHttp', '$rootScope', function(piHttp, $rootScope){

			this.post = function(model){
				return piHttp.post('/api/inbox', model);
			}

			this.get = function(id) {
				var model = {};
				model.fromId = id;
				model.toId = $rootScope.userId;
				return piHttp.post('/api/inbox-view', model);
			}

			return this;
		}]);
})();
(function(){
	'use strict';

	angular
		.module('pi.core.app')
		.factory('pi.core.app.eventSvc', ['piHttp', function(piHttp){

			this.post = function(model){
				return piHttp.post('/api/event', model);
			}

			this.get = function(id, model) {
				return piHttp.get('/api/event/' + id, model);
			}

			this.find = function(model) {
				return piHttp.get('/api/event', model);
			};

			this.remove = function(id) {
				return piHttp.post('/api/event-remove/' + id);
			};

			return this;
		}]);

		angular
			.module('pi.core.app')
			.factory('pi.core.app.eventSubSvc', ['piHttp', function(piHttp){
				
				this.post = function(model) {
					return piHttp.post('/api/event-subscription', model);
				}

				this.get = function(id, model) {
					return piHttp.get('/api/event-subscription/' + id);
				}

				this.find = function(model) {
					return piHttp.get('/api/event-subscription', model);
				}

				this.remove = function(id) {
					return piHttp.post('/api/event-subscription-remove/' + id);
				};

				return this;
			}]);

		angular
			.module('pi.core.app')
			.factory('pi.core.app.eventAttendSvc', ['piHttp', function(piHttp){
				
				this.post = function(model) {
					return piHttp.post('/api/event-attend', model);
				}

				this.get = function(id, model) {
					return piHttp.get('/api/event-attend/' + id);
				}

				this.find = function(model) {
					return piHttp.get('/api/event-attend', model);
				}

				return this;
			}]);
})();
(function(){
    angular
        .module('pi.core.likes')
        .directive('piLikes', [function(){

            var ctrl = function(likesSvc, $scope) {
                var self = this,
                    loaded = false;

                $scope.$watch('entityId', function(current) {
                    if(!current) return;
                    self.entityId = current;
                    if(!loaded) {
                        self.get();
                        loaded = true;
                    }
                });

                $scope.$watch('entityNamespace', function(current) {
                    if(!current) return;
                    self.entityNamespace = current;
                });

                this.get = function() {
                    likesSvc.get(self.entityNamespace, self.entityId)
                        .then(function (res) {
                            self.users = res.data.likes;
                        });
                };


                this.like = function(){
                    likesSvc.like(self.entityNamespace, self.entityId);
                }
            }


            return {
                templateUrl: 'html/pi/likes.tpl.html',
                controller: ['pi.core.likes.likesSvc', '$scope', ctrl],
                controllerAs: 'ctrl',
                scope: {
                    entityId: '=',
                    entityNamespace: '='
                }
            }
        }]);
})();
(function(){
	angular
		.module('pi.core.likes')
		.factory('pi.core.likes.likesSvc', ['piHttp', function(piHttp){

            this.get = function(namespace, id) {
                return piHttp.get('/like/' + namespace + '/' + id);
            };

            this.hasLiked = function(namespace, id) {

            }

            this.like = function(namespace, id) {
                return piHttp.post('/like/' + namespace + '/' + id);
            }

            return this;

        }]);
})();
(function(){
	'use strict';

	angular
		.module('pi.core.app')
		.factory('pi.core.payment.paymentSvc', ['piHttp', function(piHttp){

			this.post = function(model){
				return piHttp.post('/api/payment/report', model);
			}

			this.get = function(id, model) {
				return piHttp.get('/api/payment/report/' + id, model);
			}

			this.find = function(model) {
				return piHttp.get('/api/payment/report', model);
			};

			return this;
		}]);
})();
(function(){
	angular
		.module('pi.core.payment')
		.factory('pi.core.payment.paymentMethod', [function(){
			var svc = [
				{ byBankTransferInAdvance: 1 },
				{ byInvoice: 2 },
				{ cash: 3 },
				{ checkInAdvance: 4 },
				{ cod: 5 },
				{ directDebit: 6 },
				{ googleCheckout: 7 },
				{ payPal: 8 },
				{ paySwarm: 9 }
			];
			return svc;
		}]);
})();
(function(){
	
	angular
		.module('pi.core.product')
		.directive('piPriceSpecifications', ['$log', function($log){
			return {

				link: function(scope, elem, attrs, ngModel) {
					scope.view = 'home';
					var modelDefault = {
							eligibleQuantity: null,
							eligibleTransactionVolume: null,
							minPrice: null,
							maxPrice: null,
							price: null,
							priceCurreny: 'EURO',
							validFrom: null,
							validThrough: null,
							valueAddedTaxIncluded: null
						};

					scope.model = {};
					scope.items = [];
			
					scope.setPrice = function() {
						var value = ngModel.$viewValue;
						value.push(scope.model);
						ngModel.$setViewValue(value);	
						scope.items.push(scope.model);

						scope.model = angular.copy(modelDefault);
						scope.view = 'home';
					}

					scope.edit = function(index) {
						scope.editIndex = index;
						scope.editModel = scope.items[index];
						scope.view = 'edit';
					}

					scope.save = function() {
						ngModel.$viewValue[scope.editIndex] = scope.editModel;
						scope.items[scope.editIndex] = scope.editModel;

						scope.view = 'home';
					}

					attrs.$observe('ngModel', function(value){
			        	scope.$watch(value, function(newValue){ 
			        			try {
			        				ngModel.$setViewValue(_.isObject(ngModel.$viewValue) ? ngModel.$viewValue : [modelDefault]);	
			        			} catch(err) {
			        				$log.info('piPriceSpecification couldnt set the ngModel, the default is used. Error: ' + err);
			        				ngModel.$setViewValue([modelDefault]);
			        			}
			                    
			            });
			        });

			        scope.model = angular.copy(modelDefault);
				},
				scope: {
					'piPriceSpecifications': '@'
				},
				require: '^ngModel',
				templateUrl: 'html/pi/price-specification.tpl.html'
			}
		}]);
})();
(function(){
	angular
		.module('pi.core.product')
		.factory('pi.core.product.businessEntity', [function(){
			var svc = [
				{ key: 'Business', value: 1 },
				{ key: 'Enduser', value: 2 },
				{ key: 'PublicInstitution', value: 3 },
				{ key: 'Reseller', value: 4 }
			];
			return svc;
		}]);
})();
(function(){
	angular
		.module('pi.core.product')
		.factory('pi.core.product.businessFunction', [function(){
			var svc = [
				{ key: 'ConstructionInstallation', value: 1 },
				{ key: 'Dispose', value: 2 },
				{ key: 'LeaseOut', value: 3 },
				{ key: 'Maintain', value: 4 },
				{ key: 'ProvideService', value: 5 },
				{ key: 'Repair', value: 6 },
				{ key: 'Sell', value: 7 },
				{ key: 'Buy', value: 8 }
			];
			return svc;
		}]);
})();
(function(){
	angular
		.module('pi.core.product')
		.factory('pi.core.product.deliveryMethod', [function(){
			var svc = [
				{ key: 'Direct Download', value: 1 },
				{ key: 'Freight', value: 2 },
				{ key: 'Mail', value: 3 },
				{ key: 'Own Fleet', value: 4 },
				{ key: 'PickUp Mode', value: 5 },
				{ key: 'DHL', value: 6 },
				{ key: 'Federal Express', value: 7 },
				{ key: 'UPS', value: 8 }
			];
			return svc;
		}]);
})();
(function(){
	angular
		.module('pi.core.product')
		.factory('pi.core.product.itemCondition', [function(){
			var svc = [
				{ key: 'Discontinued', value: 1 },
				{ key: 'InStock', value: 2 },
				{ key: 'InStoreOnly', value: 3 },
				{ key: 'LimitedAvailability', value: 4 },
				{ key: 'OnlineOnly', value: 5 },
				{ key: 'PutOfStock', value: 6 },
				{ key: 'PreOrder', value: 7 },
				{ key: 'SoldOut', value: 8 }
			];
			return svc;
		}]);
})();
(function(){
	angular
		.module('pi.core.product')
		.factory('pi.core.product.offerStatus', [function(){
			var svc = [
				{ damagedCondition: 1 },
				{ newCondition: 2 },
				{ refurbishedCondition: 3 },
				{ usedCondition: 4 }
			];
			return svc;
		}]);
})();
(function(){
	angular
		.module('pi.core.product')
		.factory('pi.core.product.productSvc', ['piHttp', function(piHttp){

			this.post = function(model){
				return piHttp.post('/product', model);
			}

			this.get = function(id, model) {
				return piHttp.get('/product/' + id, model);
			}

			this.find = function(model) {
				return piHttp.get('/product', model);
			};

			this.postOffer = function(productId, model) {
				return piHttp.post('/product-offer/' + productId, model);
			}

			return this;
		}]);
})();
(function(){
	angular
		.module('pi.core.question')
		.factory('pi.core.question.questionCategorySvc', ['piHttp', function(piHttp){

			this.post = function(model){
				return piHttp.post('/question-category', model);
			}

			this.remove = function(id){
				return piHttp.post('/question-category-remove/' + id);
			}

			this.get = function(id, model) {
				return piHttp.get('/question-category/' + id, model);
			}

			this.find = function(model) {
				return piHttp.get('/question-category', {params: model});
			};
			return this;
		}]);
})();

(function(){
	angular
		.module('pi.core.question')
		.factory('pi.core.question.questionSvc', ['piHttp', function(piHttp){

			this.post = function(model){
				return piHttp.post('/question', model);
			}

			this.remove = function(id) {
				return piHttp.post('/question-remove/' + id);
			}

			this.put = function(id, model) {
				return piHttp.post('/question/' + id, model);
			}

			this.get = function(id, model) {
				return piHttp.get('/question/' + id, model);
			}

			this.find = function(model) {
				return piHttp.get('/question', {params: model});
			};
			return this;
		}]);
})();

(function(){
	angular
		.module('pi.core.user')
		.factory('pi.core.user.userSvc', ['piHttp', function(piHttp){

			this.post = function(model){
				return piHttp.post('/user', model);
			}

			this.remove = function(id) {
				return piHttp.post('/user-remove/' + id);
			}

			this.put = function(id, model) {
				return piHttp.post('/user/' + id, model);
			}

			this.get = function(id, model) {
				return piHttp.get('/user/' + id, model);
			}

			this.find = function(model) {
				return piHttp.get('/user', {params: model});
			};
			return this;
		}]);
})();

(function(){
	
	var apiFn = function(){
		this.get = function(articleId) {
			var httpObj = {
				method: 'GET',
				url: '/api/blog/article/' + articleId
			};

			return $http(httpObj);
		};

		this.post = function(blogId, model) {
			model.blogId = blogId;

			var httpObj = {
				method: 'POST',
				url: '/api/blog/article',
				data: model
			};

			return $http(httpObj);
		};

		this.put = function(articleId, model) {
			var httpObj = {
				method: 'POST',
				url: '/api/blog/article/:id',
				data: model
			};

			return $http(httpObj);
		};

		this.remove = function(articleId) {
			var httpObj = {
				method: 'DELETE',
				url: '/api/blog/article/' + articleId
			};

			return $http(httpObj);
		};
	};

	var blogArticleResource = function($resource) {
		return $resource('/api/blog/article/:id');
	};
	blogArticleResource.$inject = ['$resource'];

	angular
		.module('pi')
		.factory('blogArticleResource', blogArticleResource)
		.service('blogArticleApi', ['$rootScope', '$q', '$http', apiFn]);

})();
/**
 * @ng-doc service
 * @name blogArticleCreateService
 *
 * @description
 * Create a new Article
 *
 * @dependencies blogApi
 */
(function(){
	
	var createService = function(blogApi){

		var fn = function(blogId) {
			this.blogId = blogId;
			this.model = {};
		};

		/*
		 * Title is validated agains the API to check titles already in use
		 */
		fn.prototype.slugIsValid = function(){
			if(blogApi.validateSlugTitle(this.model.title) == false) {

			};
		};

		fn.prototype.validateSeo = function(){

		};

		fn.prototype.create = function(){
			return blogApi.createArticle(this.model);
		};

		return fn;
	};

	createService.$inject = ['blogApi'];

	angular
		.module('pi')
		.factory('articleCreateService', createService);

})();
(function(){
	var apiFn = function($rootScope, $http, $q){
		this.get = function(id){
			var httpObj = {
				method: 'GET',
				url: '/api/blog/' + id
			};

			return $http(httpObj);
		};

		this.post = function(model) {
			var httpObj = {
				method: 'POST',
				url: '/api/blog',
				data: model
			};

			return $http(httpObj);
		};

		this.put = function(blogId, model) {
			var httpObj = {
				method: 'POST',
				url: '/api/blog/' + blogId,
				datA: datA
			};

			return $http(httpObj);
		};

		this.remove = function(blogId) {
			var httpObj = {
				method: 'DELETE',
				url: '/api/blog/' + blogId
			};

			return $http(httpObj);
		};
	};

	angular
		.module('pi')
		.service('blogApi', ['$rootScope', '$http', '$q', apiFn]);
})();
(function(){
	var directiveFn = function() {
		var linkFn = function(scope, element, attrs, blogApi) {
			scope.model = {};

			scope.submit = function(){
				
				blogApi
					.post(scope.model)
					.then(successFn, errorFn);
			};
		};

		return {
			link: linkFn,
			replace: false
		}
	};

	angular
		.module('piBlogCreate', [''])
})();
(function(){
	var svcFn = function($http, $q, $rootScope, piHttp) {

        /**
         * Login
         *
         * @param email
         * @param password
         * @returns {*}
         */
        this.login = function(email, password) {
            return piHttp.post('/login', {
                    email: email,
                    password: password
                })
        };

        /**
         * register new account
         * @param model
         * @returns {*}
         */
		this.register = function(model){
			return piHttp.post('/api/account', model)
		};

        /**
         * Request a recover link to email
         * @param email
         * @returns {*}
         */
        this.recoverFromEmail = function(email) {
            return piHttp.post('/api/account/recover', {
                    email: email
                });
        };

        /**
         * Update account credentials
         * @param email User email or nick handle
         * @param currentPassword Current password
         * @param newPassword New password
         * @param newPasswordConfirm Confirmation of new password
         * @returns {*}
         */
        this.updatePassword = function(email, currentPassword, newPassword, newPasswordConfirm) {
            return piHttp.post('/api/account/password', 
                {
                    email: email,
                    currentPassword: currentPassword,
                    newPassword: newPassword,
                    newPasswordConfirm: newPasswordConfirm
                });
        };

	};

	angular
		.module('pi')
		.service('accountApi', ['$http', '$q', '$rootScope', 'piHttp', svcFn]);
	})();
(function(){
  var service = function($http, $q) {

    /**
     * @ngdoc function
     * @name Login
     * @description
     *
     * Try to authenticate using a username and password
     * If the authentication is confirmed, a token is returned to consume the API
     */
    this.login = function(username, password) {

      var deferred = $q.defer(),
          successFn = function(res) {
            deferred.resolve(res.data);
          },
          errorFn = function(res) {
            deferred.reject(res);
          },
          request = {
            email: username,
            password: password
          },
          httpObj = {
            url: '/login',
            method: 'POST',
            data: request
          };

          $http(httpObj)
            .then(sucessFn, errorFn);

      return deferred.promise;
    };

    /**
     * @ngdoc function
     * @name Domain Black List
     * @description
     *
     * A list of domains blocked from Pi network
     * Those domains have been banned and cannot register or login
     */
    this.domainBlackList = ['gov.pt'];
  };
})();

(function(){
    var svcFn = function(accountApi, $q) {

        this.recover = function(email){

            var deferred = $q.defer(),
                successFn = function(res){
                    deferred.resolve(res.data);
                },
                errorFn = function(res) {
                    deferred.reject(res);
                };

            accountApi
                .recoverFromEmail(email)
                .then(successFn, errorFn);

            return deferred.promise;
        };
    };

    var directiveFn = function(recoverSvc){
        var linkFn = function(scope, element, attrs) {

            scope.recover = function(){

                var successFn = function(res){
                        scope.onSuccess(res);
                    },
                    errorFn = function(res) {
                        scope.onError(res);
                    };

                recoverSvc
                    .recover(scope.email)
                    .then(successFn, errorFn);
            };
        };

        return {
            link: linkFn,
            replace: false,
            scope: {
                'onSuccess': '&',
                'onError': '&'            }
        }
    };

    var directiveSubmit = function()
    {
        var linkFn = function(scope, element, attrs, parentCtrl)
        {
            element.bind('click', function(){
                parentCtrl.recover();
            })
        };

        return {
            replace: false,
            link: linkFn
        }
    };

    angular
        .module('pi')
        .service('recoverSvc', ['accountApi', '$q', svcFn])
        .directive('piAccountRecover', ['recoverSvc', directiveFn])
        .directive('piAccountRecoverSubmit', directiveSubmit);
})();

(function(){
	var svcFn = function(accountApi, $q) {

		this.basic = function(email, password, passwordConfirm, requestModel) {

			if(_.isUndefined(requestModel) && !_.isObject(requestModel)) {
				requestModel = {};
			}
			requestModel.email = email;
			requestModel.password = password;

			var deferred = $q.defer(),
				successFn = function(res) {
					deferred.resolve(res.data);
				},
				errorFn = function(res) {
					deferred.reject(res.data);
				};

            accountApi.register(requestModel)
				.then(successFn, errorFn);

			return deferred.promise;
		};

	};

	var directiveFn = function(registerSvc){
		
		var linkFn = function(scope, element, attrs) {
			
			var disposeFn = function(){

			};

			element.on('$destroy', disposeFn);

			scope.account = {};

			scope.submit = function(){
				var model = {};
				registerSvc.basic(scope.account.email, scope.account.password, model);
			};

		};
		return {
			link: linkFn,
			scope: {
				'account': ''
			},
			replace: false
		}
	};

	angular
		.module('pi')
		.service('registerSvc', ['accountApi', '$q', svcFn])
		.directive('piRegister', ['registerSvc', directiveFn]);

})();


(function(){

	var svcFn = function($http, $q){
		/**
		 * Create a new forum
		 *
		 * @param model Request model
		 * @param parentId The forum parent id. If null or undefined, the forum is created as a Parent
		 */
		this.create = function(model, parentId) {

			var data = angular.copy(model);
			if(!_.isUndefined(parentId)) {
				data.parentId = parentId;
			}

			var deferred = $q.defer(),
				successFn = function(res) {
					deferred.resolve(res.data);
				},
				errorFn = function(res) {
					deferred.reject(res.data);
				},
				httpObj = {
					method: 'POST',
					url: '/api/community/forum',
					data: data
				};

			$http(httpObj)
				.then(successFn, errorFn);

			return deferred.promise;
		};

		this.updateInformation = function(forumId, model) {
			var data = angular.copy(model);
			data.id = forumId;

			var deferred = $q.defer(),
				successFn = function(res) {
					deferred.resolve(res.data);
				},
				errorFn = function(res) {
					deferred.reject(res);
				},
				httpObj = {
					method: 'POST',
					url: '/api/community/forum/info',
					data: data
				};

			$http(httpObj)
				.then(successFn, errorFn);

			return deferred.promise;
		};

		this.remove = function(forumId, reason) {
			var data = {
					id: forumId
				},
				deferred = $q.defer(),
				succesFn = function(res) {
					deferred.resolve(res.data);
				},
				errorFn = function(res) {
					deferred.reject(res);
				},
				httpObj = {
					method: 'DELETE',
					url: '/api/community/forum',
					data: data
				};

			$http(httpObj)
				.then(successFn, errorFn);

			return deferred.promise;
		};

		angular
			.module('pi')
			.service('forumApi', ['$http', '$q', svcFn]);
	};
});
/**
 * @license AngularJS v1.2.28
 * (c) 2010-2014 Google, Inc. http://angularjs.org
 * License: MIT
 */
(function(window, angular, undefined) {'use strict';

var $resourceMinErr = angular.$$minErr('$resource');

// Helper functions and regex to lookup a dotted path on an object
// stopping at undefined/null.  The path must be composed of ASCII
// identifiers (just like $parse)
var MEMBER_NAME_REGEX = /^(\.[a-zA-Z_$][0-9a-zA-Z_$]*)+$/;

function isValidDottedPath(path) {
  return (path != null && path !== '' && path !== 'hasOwnProperty' &&
      MEMBER_NAME_REGEX.test('.' + path));
}

function lookupDottedPath(obj, path) {
  if (!isValidDottedPath(path)) {
    throw $resourceMinErr('badmember', 'Dotted member path "@{0}" is invalid.', path);
  }
  var keys = path.split('.');
  for (var i = 0, ii = keys.length; i < ii && obj !== undefined; i++) {
    var key = keys[i];
    obj = (obj !== null) ? obj[key] : undefined;
  }
  return obj;
}

/**
 * Create a shallow copy of an object and clear other fields from the destination
 */
function shallowClearAndCopy(src, dst) {
  dst = dst || {};

  angular.forEach(dst, function(value, key){
    delete dst[key];
  });

  for (var key in src) {
    if (src.hasOwnProperty(key) && !(key.charAt(0) === '$' && key.charAt(1) === '$')) {
      dst[key] = src[key];
    }
  }

  return dst;
}

/**
 * @ngdoc module
 * @name ngResource
 * @description
 *
 * # ngResource
 *
 * The `ngResource` module provides interaction support with RESTful services
 * via the $resource service.
 *
 *
 * <div doc-module-components="ngResource"></div>
 *
 * See {@link ngResource.$resource `$resource`} for usage.
 */

/**
 * @ngdoc service
 * @name $resource
 * @requires $http
 *
 * @description
 * A factory which creates a resource object that lets you interact with
 * [RESTful](http://en.wikipedia.org/wiki/Representational_State_Transfer) server-side data sources.
 *
 * The returned resource object has action methods which provide high-level behaviors without
 * the need to interact with the low level {@link ng.$http $http} service.
 *
 * Requires the {@link ngResource `ngResource`} module to be installed.
 *
 * @param {string} url A parametrized URL template with parameters prefixed by `:` as in
 *   `/user/:username`. If you are using a URL with a port number (e.g.
 *   `http://example.com:8080/api`), it will be respected.
 *
 *   If you are using a url with a suffix, just add the suffix, like this:
 *   `$resource('http://example.com/resource.json')` or `$resource('http://example.com/:id.json')`
 *   or even `$resource('http://example.com/resource/:resource_id.:format')`
 *   If the parameter before the suffix is empty, :resource_id in this case, then the `/.` will be
 *   collapsed down to a single `.`.  If you need this sequence to appear and not collapse then you
 *   can escape it with `/\.`.
 *
 * @param {Object=} paramDefaults Default values for `url` parameters. These can be overridden in
 *   `actions` methods. If any of the parameter value is a function, it will be executed every time
 *   when a param value needs to be obtained for a request (unless the param was overridden).
 *
 *   Each key value in the parameter object is first bound to url template if present and then any
 *   excess keys are appended to the url search query after the `?`.
 *
 *   Given a template `/path/:verb` and parameter `{verb:'greet', salutation:'Hello'}` results in
 *   URL `/path/greet?salutation=Hello`.
 *
 *   If the parameter value is prefixed with `@` then the value for that parameter will be extracted
 *   from the corresponding property on the `data` object (provided when calling an action method).  For
 *   example, if the `defaultParam` object is `{someParam: '@someProp'}` then the value of `someParam`
 *   will be `data.someProp`.
 *
 * @param {Object.<Object>=} actions Hash with declaration of custom action that should extend
 *   the default set of resource actions. The declaration should be created in the format of {@link
 *   ng.$http#usage_parameters $http.config}:
 *
 *       {action1: {method:?, params:?, isArray:?, headers:?, ...},
 *        action2: {method:?, params:?, isArray:?, headers:?, ...},
 *        ...}
 *
 *   Where:
 *
 *   - **`action`** – {string} – The name of action. This name becomes the name of the method on
 *     your resource object.
 *   - **`method`** – {string} – Case insensitive HTTP method (e.g. `GET`, `POST`, `PUT`,
 *     `DELETE`, `JSONP`, etc).
 *   - **`params`** – {Object=} – Optional set of pre-bound parameters for this action. If any of
 *     the parameter value is a function, it will be executed every time when a param value needs to
 *     be obtained for a request (unless the param was overridden).
 *   - **`url`** – {string} – action specific `url` override. The url templating is supported just
 *     like for the resource-level urls.
 *   - **`isArray`** – {boolean=} – If true then the returned object for this action is an array,
 *     see `returns` section.
 *   - **`transformRequest`** –
 *     `{function(data, headersGetter)|Array.<function(data, headersGetter)>}` –
 *     transform function or an array of such functions. The transform function takes the http
 *     request body and headers and returns its transformed (typically serialized) version.
 *     By default, transformRequest will contain one function that checks if the request data is
 *     an object and serializes to using `angular.toJson`. To prevent this behavior, set
 *     `transformRequest` to an empty array: `transformRequest: []`
 *   - **`transformResponse`** –
 *     `{function(data, headersGetter)|Array.<function(data, headersGetter)>}` –
 *     transform function or an array of such functions. The transform function takes the http
 *     response body and headers and returns its transformed (typically deserialized) version.
 *     By default, transformResponse will contain one function that checks if the response looks like
 *     a JSON string and deserializes it using `angular.fromJson`. To prevent this behavior, set
 *     `transformResponse` to an empty array: `transformResponse: []`
 *   - **`cache`** – `{boolean|Cache}` – If true, a default $http cache will be used to cache the
 *     GET request, otherwise if a cache instance built with
 *     {@link ng.$cacheFactory $cacheFactory}, this cache will be used for
 *     caching.
 *   - **`timeout`** – `{number|Promise}` – timeout in milliseconds, or {@link ng.$q promise} that
 *     should abort the request when resolved.
 *   - **`withCredentials`** - `{boolean}` - whether to set the `withCredentials` flag on the
 *     XHR object. See
 *     [requests with credentials](https://developer.mozilla.org/en/http_access_control#section_5)
 *     for more information.
 *   - **`responseType`** - `{string}` - see
 *     [requestType](https://developer.mozilla.org/en-US/docs/DOM/XMLHttpRequest#responseType).
 *   - **`interceptor`** - `{Object=}` - The interceptor object has two optional methods -
 *     `response` and `responseError`. Both `response` and `responseError` interceptors get called
 *     with `http response` object. See {@link ng.$http $http interceptors}.
 *
 * @returns {Object} A resource "class" object with methods for the default set of resource actions
 *   optionally extended with custom `actions`. The default set contains these actions:
 *   ```js
 *   { 'get':    {method:'GET'},
 *     'save':   {method:'POST'},
 *     'query':  {method:'GET', isArray:true},
 *     'remove': {method:'DELETE'},
 *     'delete': {method:'DELETE'} };
 *   ```
 *
 *   Calling these methods invoke an {@link ng.$http} with the specified http method,
 *   destination and parameters. When the data is returned from the server then the object is an
 *   instance of the resource class. The actions `save`, `remove` and `delete` are available on it
 *   as  methods with the `$` prefix. This allows you to easily perform CRUD operations (create,
 *   read, update, delete) on server-side data like this:
 *   ```js
 *   var User = $resource('/user/:userId', {userId:'@id'});
 *   var user = User.get({userId:123}, function() {
 *     user.abc = true;
 *     user.$save();
 *   });
 *   ```
 *
 *   It is important to realize that invoking a $resource object method immediately returns an
 *   empty reference (object or array depending on `isArray`). Once the data is returned from the
 *   server the existing reference is populated with the actual data. This is a useful trick since
 *   usually the resource is assigned to a model which is then rendered by the view. Having an empty
 *   object results in no rendering, once the data arrives from the server then the object is
 *   populated with the data and the view automatically re-renders itself showing the new data. This
 *   means that in most cases one never has to write a callback function for the action methods.
 *
 *   The action methods on the class object or instance object can be invoked with the following
 *   parameters:
 *
 *   - HTTP GET "class" actions: `Resource.action([parameters], [success], [error])`
 *   - non-GET "class" actions: `Resource.action([parameters], postData, [success], [error])`
 *   - non-GET instance actions:  `instance.$action([parameters], [success], [error])`
 *
 *   Success callback is called with (value, responseHeaders) arguments. Error callback is called
 *   with (httpResponse) argument.
 *
 *   Class actions return empty instance (with additional properties below).
 *   Instance actions return promise of the action.
 *
 *   The Resource instances and collection have these additional properties:
 *
 *   - `$promise`: the {@link ng.$q promise} of the original server interaction that created this
 *     instance or collection.
 *
 *     On success, the promise is resolved with the same resource instance or collection object,
 *     updated with data from server. This makes it easy to use in
 *     {@link ngRoute.$routeProvider resolve section of $routeProvider.when()} to defer view
 *     rendering until the resource(s) are loaded.
 *
 *     On failure, the promise is resolved with the {@link ng.$http http response} object, without
 *     the `resource` property.
 *
 *     If an interceptor object was provided, the promise will instead be resolved with the value
 *     returned by the interceptor.
 *
 *   - `$resolved`: `true` after first server interaction is completed (either with success or
 *      rejection), `false` before that. Knowing if the Resource has been resolved is useful in
 *      data-binding.
 *
 * @example
 *
 * # Credit card resource
 *
 * ```js
     // Define CreditCard class
     var CreditCard = $resource('/user/:userId/card/:cardId',
      {userId:123, cardId:'@id'}, {
       charge: {method:'POST', params:{charge:true}}
      });

     // We can retrieve a collection from the server
     var cards = CreditCard.query(function() {
       // GET: /user/123/card
       // server returns: [ {id:456, number:'1234', name:'Smith'} ];

       var card = cards[0];
       // each item is an instance of CreditCard
       expect(card instanceof CreditCard).toEqual(true);
       card.name = "J. Smith";
       // non GET methods are mapped onto the instances
       card.$save();
       // POST: /user/123/card/456 {id:456, number:'1234', name:'J. Smith'}
       // server returns: {id:456, number:'1234', name: 'J. Smith'};

       // our custom method is mapped as well.
       card.$charge({amount:9.99});
       // POST: /user/123/card/456?amount=9.99&charge=true {id:456, number:'1234', name:'J. Smith'}
     });

     // we can create an instance as well
     var newCard = new CreditCard({number:'0123'});
     newCard.name = "Mike Smith";
     newCard.$save();
     // POST: /user/123/card {number:'0123', name:'Mike Smith'}
     // server returns: {id:789, number:'0123', name: 'Mike Smith'};
     expect(newCard.id).toEqual(789);
 * ```
 *
 * The object returned from this function execution is a resource "class" which has "static" method
 * for each action in the definition.
 *
 * Calling these methods invoke `$http` on the `url` template with the given `method`, `params` and
 * `headers`.
 * When the data is returned from the server then the object is an instance of the resource type and
 * all of the non-GET methods are available with `$` prefix. This allows you to easily support CRUD
 * operations (create, read, update, delete) on server-side data.

   ```js
     var User = $resource('/user/:userId', {userId:'@id'});
     User.get({userId:123}, function(user) {
       user.abc = true;
       user.$save();
     });
   ```
 *
 * It's worth noting that the success callback for `get`, `query` and other methods gets passed
 * in the response that came from the server as well as $http header getter function, so one
 * could rewrite the above example and get access to http headers as:
 *
   ```js
     var User = $resource('/user/:userId', {userId:'@id'});
     User.get({userId:123}, function(u, getResponseHeaders){
       u.abc = true;
       u.$save(function(u, putResponseHeaders) {
         //u => saved user object
         //putResponseHeaders => $http header getter
       });
     });
   ```
 *
 * You can also access the raw `$http` promise via the `$promise` property on the object returned
 *
   ```
     var User = $resource('/user/:userId', {userId:'@id'});
     User.get({userId:123})
         .$promise.then(function(user) {
           $scope.user = user;
         });
   ```

 * # Creating a custom 'PUT' request
 * In this example we create a custom method on our resource to make a PUT request
 * ```js
 *    var app = angular.module('app', ['ngResource', 'ngRoute']);
 *
 *    // Some APIs expect a PUT request in the format URL/object/ID
 *    // Here we are creating an 'update' method
 *    app.factory('Notes', ['$resource', function($resource) {
 *    return $resource('/notes/:id', null,
 *        {
 *            'update': { method:'PUT' }
 *        });
 *    }]);
 *
 *    // In our controller we get the ID from the URL using ngRoute and $routeParams
 *    // We pass in $routeParams and our Notes factory along with $scope
 *    app.controller('NotesCtrl', ['$scope', '$routeParams', 'Notes',
                                      function($scope, $routeParams, Notes) {
 *    // First get a note object from the factory
 *    var note = Notes.get({ id:$routeParams.id });
 *    $id = note.id;
 *
 *    // Now call update passing in the ID first then the object you are updating
 *    Notes.update({ id:$id }, note);
 *
 *    // This will PUT /notes/ID with the note object in the request payload
 *    }]);
 * ```
 */
angular.module('ngResource', ['ng']).
  factory('$resource', ['$http', '$q', function($http, $q) {

    var DEFAULT_ACTIONS = {
      'get':    {method:'GET'},
      'save':   {method:'POST'},
      'query':  {method:'GET', isArray:true},
      'remove': {method:'DELETE'},
      'delete': {method:'DELETE'}
    };
    var noop = angular.noop,
        forEach = angular.forEach,
        extend = angular.extend,
        copy = angular.copy,
        isFunction = angular.isFunction;

    /**
     * We need our custom method because encodeURIComponent is too aggressive and doesn't follow
     * http://www.ietf.org/rfc/rfc3986.txt with regards to the character set (pchar) allowed in path
     * segments:
     *    segment       = *pchar
     *    pchar         = unreserved / pct-encoded / sub-delims / ":" / "@"
     *    pct-encoded   = "%" HEXDIG HEXDIG
     *    unreserved    = ALPHA / DIGIT / "-" / "." / "_" / "~"
     *    sub-delims    = "!" / "$" / "&" / "'" / "(" / ")"
     *                     / "*" / "+" / "," / ";" / "="
     */
    function encodeUriSegment(val) {
      return encodeUriQuery(val, true).
        replace(/%26/gi, '&').
        replace(/%3D/gi, '=').
        replace(/%2B/gi, '+');
    }


    /**
     * This method is intended for encoding *key* or *value* parts of query component. We need a
     * custom method because encodeURIComponent is too aggressive and encodes stuff that doesn't
     * have to be encoded per http://tools.ietf.org/html/rfc3986:
     *    query       = *( pchar / "/" / "?" )
     *    pchar         = unreserved / pct-encoded / sub-delims / ":" / "@"
     *    unreserved    = ALPHA / DIGIT / "-" / "." / "_" / "~"
     *    pct-encoded   = "%" HEXDIG HEXDIG
     *    sub-delims    = "!" / "$" / "&" / "'" / "(" / ")"
     *                     / "*" / "+" / "," / ";" / "="
     */
    function encodeUriQuery(val, pctEncodeSpaces) {
      return encodeURIComponent(val).
        replace(/%40/gi, '@').
        replace(/%3A/gi, ':').
        replace(/%24/g, '$').
        replace(/%2C/gi, ',').
        replace(/%20/g, (pctEncodeSpaces ? '%20' : '+'));
    }

    function Route(template, defaults) {
      this.template = template;
      this.defaults = defaults || {};
      this.urlParams = {};
    }

    Route.prototype = {
      setUrlParams: function(config, params, actionUrl) {
        var self = this,
            url = actionUrl || self.template,
            val,
            encodedVal;

        var urlParams = self.urlParams = {};
        forEach(url.split(/\W/), function(param){
          if (param === 'hasOwnProperty') {
            throw $resourceMinErr('badname', "hasOwnProperty is not a valid parameter name.");
          }
          if (!(new RegExp("^\\d+$").test(param)) && param &&
               (new RegExp("(^|[^\\\\]):" + param + "(\\W|$)").test(url))) {
            urlParams[param] = true;
          }
        });
        url = url.replace(/\\:/g, ':');

        params = params || {};
        forEach(self.urlParams, function(_, urlParam){
          val = params.hasOwnProperty(urlParam) ? params[urlParam] : self.defaults[urlParam];
          if (angular.isDefined(val) && val !== null) {
            encodedVal = encodeUriSegment(val);
            url = url.replace(new RegExp(":" + urlParam + "(\\W|$)", "g"), function(match, p1) {
              return encodedVal + p1;
            });
          } else {
            url = url.replace(new RegExp("(\/?):" + urlParam + "(\\W|$)", "g"), function(match,
                leadingSlashes, tail) {
              if (tail.charAt(0) == '/') {
                return tail;
              } else {
                return leadingSlashes + tail;
              }
            });
          }
        });

        // strip trailing slashes and set the url
        url = url.replace(/\/+$/, '') || '/';
        // then replace collapse `/.` if found in the last URL path segment before the query
        // E.g. `http://url.com/id./format?q=x` becomes `http://url.com/id.format?q=x`
        url = url.replace(/\/\.(?=\w+($|\?))/, '.');
        // replace escaped `/\.` with `/.`
        config.url = url.replace(/\/\\\./, '/.');


        // set params - delegate param encoding to $http
        forEach(params, function(value, key){
          if (!self.urlParams[key]) {
            config.params = config.params || {};
            config.params[key] = value;
          }
        });
      }
    };


    function resourceFactory(url, paramDefaults, actions) {
      var route = new Route(url);

      actions = extend({}, DEFAULT_ACTIONS, actions);

      function extractParams(data, actionParams){
        var ids = {};
        actionParams = extend({}, paramDefaults, actionParams);
        forEach(actionParams, function(value, key){
          if (isFunction(value)) { value = value(); }
          ids[key] = value && value.charAt && value.charAt(0) == '@' ?
            lookupDottedPath(data, value.substr(1)) : value;
        });
        return ids;
      }

      function defaultResponseInterceptor(response) {
        return response.resource;
      }

      function Resource(value){
        shallowClearAndCopy(value || {}, this);
      }

      forEach(actions, function(action, name) {
        var hasBody = /^(POST|PUT|PATCH)$/i.test(action.method);

        Resource[name] = function(a1, a2, a3, a4) {
          var params = {}, data, success, error;

          /* jshint -W086 */ /* (purposefully fall through case statements) */
          switch(arguments.length) {
          case 4:
            error = a4;
            success = a3;
            //fallthrough
          case 3:
          case 2:
            if (isFunction(a2)) {
              if (isFunction(a1)) {
                success = a1;
                error = a2;
                break;
              }

              success = a2;
              error = a3;
              //fallthrough
            } else {
              params = a1;
              data = a2;
              success = a3;
              break;
            }
          case 1:
            if (isFunction(a1)) success = a1;
            else if (hasBody) data = a1;
            else params = a1;
            break;
          case 0: break;
          default:
            throw $resourceMinErr('badargs',
              "Expected up to 4 arguments [params, data, success, error], got {0} arguments",
              arguments.length);
          }
          /* jshint +W086 */ /* (purposefully fall through case statements) */

          var isInstanceCall = this instanceof Resource;
          var value = isInstanceCall ? data : (action.isArray ? [] : new Resource(data));
          var httpConfig = {};
          var responseInterceptor = action.interceptor && action.interceptor.response ||
                                    defaultResponseInterceptor;
          var responseErrorInterceptor = action.interceptor && action.interceptor.responseError ||
                                    undefined;

          forEach(action, function(value, key) {
            if (key != 'params' && key != 'isArray' && key != 'interceptor') {
              httpConfig[key] = copy(value);
            }
          });

          if (hasBody) httpConfig.data = data;
          route.setUrlParams(httpConfig,
                             extend({}, extractParams(data, action.params || {}), params),
                             action.url);

          var promise = $http(httpConfig).then(function (response) {
            var data = response.data,
              promise = value.$promise;

            if (data) {
              // Need to convert action.isArray to boolean in case it is undefined
              // jshint -W018
              if (angular.isArray(data) !== (!!action.isArray)) {
                throw $resourceMinErr('badcfg',
                    'Error in resource configuration. Expected ' +
                    'response to contain an {0} but got an {1}',
                  action.isArray ? 'array' : 'object',
                  angular.isArray(data) ? 'array' : 'object');
              }
              // jshint +W018
              if (action.isArray) {
                value.length = 0;
                forEach(data, function (item) {
                  if (typeof item === "object") {
                    value.push(new Resource(item));
                  } else {
                    // Valid JSON values may be string literals, and these should not be converted
                    // into objects. These items will not have access to the Resource prototype
                    // methods, but unfortunately there
                    value.push(item);
                  }
                });
              } else {
                shallowClearAndCopy(data, value);
                value.$promise = promise;
              }
            }

            value.$resolved = true;

            response.resource = value;

            return response;
          }, function(response) {
            value.$resolved = true;

            (error||noop)(response);

            return $q.reject(response);
          });

          promise = promise.then(
              function(response) {
                var value = responseInterceptor(response);
                (success||noop)(value, response.headers);
                return value;
              },
              responseErrorInterceptor);

          if (!isInstanceCall) {
            // we are creating instance / collection
            // - set the initial promise
            // - return the instance / collection
            value.$promise = promise;
            value.$resolved = false;

            return value;
          }

          // instance call
          return promise;
        };


        Resource.prototype['$' + name] = function(params, success, error) {
          if (isFunction(params)) {
            error = success; success = params; params = {};
          }
          var result = Resource[name].call(this, params, this, success, error);
          return result.$promise || result;
        };
      });

      Resource.bind = function(additionalParamDefaults){
        return resourceFactory(url, extend({}, paramDefaults, additionalParamDefaults), actions);
      };

      return Resource;
    }

    return resourceFactory;
  }]);


})(window, window.angular);

/*
---
name: Facebook Angularjs

description: Provides an easier way to make use of Facebook API with Angularjs

license: MIT-style license

authors:
  - Ciul

requires: [angular]
provides: [facebook]

...
*/
(function(window, angular, undefined) {
  'use strict';

  // Module global settings.
  var settings = {};

  // Module global flags.
  var flags = {
    sdk: false,
    ready: false
  };

  // Module global loadDeferred
  var loadDeferred;

  /**
   * Facebook module
   */
  angular.module('facebook', []).

    // Declare module settings value
    value('settings', settings).

    // Declare module flags value
    value('flags', flags).

    /**
     * Facebook provider
     */
    provider('Facebook', [
      function() {

        /**
         * Facebook appId
         * @type {Number}
         */
        settings.appId = null;

        this.setAppId = function(appId) {
          settings.appId = appId;
        };

        this.getAppId = function() {
          return settings.appId;
        };

        /**
         * Locale language, english by default
         * @type {String}
         */
        settings.locale = 'en_US';

        this.setLocale = function(locale) {
          settings.locale = locale;
        };

        this.getLocale = function() {
          return settings.locale;
        };

        /**
         * Set if you want to check the authentication status
         * at the start up of the app
         * @type {Boolean}
         */
        settings.status = true;

        this.setStatus = function(status) {
          settings.status = status;
        };

        this.getStatus = function() {
          return settings.status;
        };

        /**
         * Adding a Channel File improves the performance of the javascript SDK,
         * by addressing issues with cross-domain communication in certain browsers.
         * @type {String}
         */
        settings.channelUrl = null;

        this.setChannel = function(channel) {
          settings.channelUrl = channel;
        };

        this.getChannel = function() {
          return settings.channelUrl;
        };

        /**
         * Enable cookies to allow the server to access the session
         * @type {Boolean}
         */
        settings.cookie = true;

        this.setCookie = function(cookie) {
          settings.cookie = cookie;
        };

        this.getCookie = function() {
          return settings.cookie;
        };

        /**
         * Parse XFBML
         * @type {Boolean}
         */
        settings.xfbml = true;

        this.setXfbml = function(enable) {
          settings.xfbml = enable;
        };

        this.getXfbml = function() {
          return settings.xfbml;
        };

        /**
         * Auth Response
         * @type {Object}
         */

        this.setAuthResponse = function(obj) {
          settings.authResponse = obj || true;
        };

        this.getAuthResponse = function() {
          return settings.authResponse;
        };

        /**
         * Frictionless Requests
         * @type {Boolean}
         */
        settings.frictionlessRequests = false;

        this.setFrictionlessRequests = function(enable) {
          settings.frictionlessRequests = enable;
        };

        this.getFrictionlessRequests = function() {
          return settings.frictionlessRequests;
        };

        /**
         * HideFlashCallback
         * @type {Object}
         */
        settings.hideFlashCallback = null;

        this.setHideFlashCallback = function(obj) {
          settings.hideFlashCallback = obj || null;
        };

        this.getHideFlashCallback = function() {
          return settings.hideFlashCallback;
        };

        /**
         * Custom option setting
         * key @type {String}
         * value @type {*}
         * @return {*}
         */
        this.setInitCustomOption = function(key, value) {
          if (!angular.isString(key)) {
            return false;
          }

          settings[key] = value;
          return settings[key];
        };

        /**
         * get init option
         * @param  {String} key
         * @return {*}
         */
        this.getInitOption = function(key) {
          // If key is not String or If non existing key return null
          if (!angular.isString(key) || !settings.hasOwnProperty(key)) {
            return false;
          }

          return settings[key];
        };

        /**
         * load SDK
         */
        settings.loadSDK = true;

        this.setLoadSDK = function(a) {
          settings.loadSDK = !!a;
        };

        this.getLoadSDK = function() {
          return settings.loadSDK;
        };

        /**
         * SDK version
         */
        settings.version = 'v2.0';

        this.setSdkVersion = function(version) {
          settings.version = version;
        };

        this.getSdkVersion = function() {
          return settings.version;
        };

        /**
         * Init Facebook API required stuff
         * This will prepare the app earlier (on settingsuration)
         * @arg {Object/String} initSettings
         * @arg {Boolean} _loadSDK (optional, true by default)
         */
        this.init = function(initSettings, _loadSDK) {
          // If string is passed, set it as appId
          if (angular.isString(initSettings)) {
            settings.appId = initSettings || settings.appId;
          }

          // If object is passed, merge it with app settings
          if (angular.isObject(initSettings)) {
            angular.extend(settings, initSettings);
          }

          // Set if Facebook SDK should be loaded automatically or not.
          if (angular.isDefined(_loadSDK)) {
            settings.loadSDK = !!_loadSDK;
          }
        };

        /**
         * This defined the Facebook service
         */
        this.$get = [
          '$q',
          '$rootScope',
          '$timeout',
          '$window',
          function($q, $rootScope, $timeout, $window) {
            /**
             * This is the NgFacebook class to be retrieved on Facebook Service request.
             */
            function NgFacebook() {
              this.appId = settings.appId;
            }

            /**
             * Ready state method
             * @return {Boolean}
             */
            NgFacebook.prototype.isReady = function() {
              return flags.ready;
            };

            NgFacebook.prototype.login = function () {

              var d = $q.defer(),
                  args = Array.prototype.slice.call(arguments),
                  userFn,
                  userFnIndex; // Converts arguments passed into an array

                // Get user function and it's index in the arguments array, to replace it with custom function, allowing the usage of promises
                angular.forEach(args, function(arg, index) {
                  if (angular.isFunction(arg)) {
                    userFn = arg;
                    userFnIndex = index;
                  }
                });

                // Replace user function intended to be passed to the Facebook API with a custom one
                // for being able to use promises.
                if (angular.isFunction(userFn) && angular.isNumber(userFnIndex)) {
                  args.splice(userFnIndex, 1, function(response) {
                    $timeout(function() {
                      if (angular.isUndefined(response.error)) {
                        d.resolve(response);
                      } else {
                        d.reject(response);
                      }

                      if (angular.isFunction(userFn)) {
                        userFn(response);
                      }
                    });
                  });
                }

                if (this.isReady()) {
                  $window.FB.login.apply($window.FB, args);
                } else {
                  $timeout(function() {
                    d.reject("Facebook.login() called before Facebook SDK has loaded.");
                  });
                }

                return d.promise;
            };

            /**
             * Map some asynchronous Facebook sdk methods to NgFacebook
             */
            angular.forEach([
              'logout',
              'api',
              'ui',
              'getLoginStatus'
            ], function(name) {
              NgFacebook.prototype[name] = function() {

                var d = $q.defer(),
                    args = Array.prototype.slice.call(arguments), // Converts arguments passed into an array
                    userFn,
                    userFnIndex;

                // Get user function and it's index in the arguments array, to replace it with custom function, allowing the usage of promises
                angular.forEach(args, function(arg, index) {
                  if (angular.isFunction(arg)) {
                    userFn = arg;
                    userFnIndex = index;
                  }
                });

                // Replace user function intended to be passed to the Facebook API with a custom one
                // for being able to use promises.
                if (angular.isFunction(userFn) && angular.isNumber(userFnIndex)) {
                  args.splice(userFnIndex, 1, function(response) {
                    $timeout(function() {

                      if (response && typeof response.error === 'undefined') {
                        d.resolve(response);
                      } else {
                        d.reject(response);
                      }

                      if (angular.isFunction(userFn)) {
                        userFn(response);
                      }
                    });
                  });
                }

                $timeout(function() {
                  // Call when loadDeferred be resolved, meaning Service is ready to be used.
                  loadDeferred.promise.then(function() {
                    $window.FB[name].apply(FB, args);
                  }, function() {
                    throw 'Facebook API could not be initialized properly';
                  });
                });

                return d.promise;
              };
            });

            /**
             * Map Facebook sdk XFBML.parse() to NgFacebook.
             */
            NgFacebook.prototype.parseXFBML = function() {

              var d = $q.defer();

              $timeout(function() {
                // Call when loadDeferred be resolved, meaning Service is ready to be used
                loadDeferred.promise.then(function() {
                  $window.FB.XFBML.parse();
                  d.resolve();
                }, function() {
                  throw 'Facebook API could not be initialized properly';
                });
              });

              return d.promise;
            };

            /**
             * Map Facebook sdk subscribe method to NgFacebook. Renamed as subscribe
             * Thus, use it as Facebook.subscribe in the service.
             */
            NgFacebook.prototype.subscribe = function() {

              var d = $q.defer(),
                  args = Array.prototype.slice.call(arguments), // Get arguments passed into an array
                  userFn,
                  userFnIndex;

              // Get user function and it's index in the arguments array, to replace it with custom function, allowing the usage of promises
              angular.forEach(args, function(arg, index) {
                if (angular.isFunction(arg)) {
                  userFn = arg;
                  userFnIndex = index;
                }
              });

              // Replace user function intended to be passed to the Facebook API with a custom one
              // for being able to use promises.
              if (angular.isFunction(userFn) && angular.isNumber(userFnIndex)) {
                args.splice(userFnIndex, 1, function(response) {
                  $timeout(function() {

                    if (response && typeof response.error === 'undefined') {
                      d.resolve(response);
                    } else {
                      d.reject(response);
                    }

                    if (angular.isFunction(userFn)) {
                      userFn(response);
                    }
                  });
                });
              }

              $timeout(function() {
                // Call when loadDeferred be resolved, meaning Service is ready to be used
                loadDeferred.promise.then(function() {
                  $window.FB.Event.subscribe.apply(FB, args);
                }, function() {
                  throw 'Facebook API could not be initialized properly';
                });
              });

              return d.promise;
            };

            /**
             * Map Facebook sdk unsubscribe method to NgFacebook. Renamed as unsubscribe
             * Thus, use it as Facebook.unsubscribe in the service.
             */
            NgFacebook.prototype.unsubscribe = function() {

              var d = $q.defer(),
                  args = Array.prototype.slice.call(arguments), // Get arguments passed into an array
                  userFn,
                  userFnIndex;

              // Get user function and it's index in the arguments array, to replace it with custom function, allowing the usage of promises
              angular.forEach(args, function(arg, index) {
                if (angular.isFunction(arg)) {
                  userFn = arg;
                  userFnIndex = index;
                }
              });

              // Replace user function intended to be passed to the Facebook API with a custom one
              // for being able to use promises.
              if (angular.isFunction(userFn) && angular.isNumber(userFnIndex)) {
                args.splice(userFnIndex, 1, function(response) {
                  $timeout(function() {

                    if (response && typeof response.error === 'undefined') {
                      d.resolve(response);
                    } else {
                      d.reject(response);
                    }

                    if (angular.isFunction(userFn)) {
                      userFn(response);
                    }
                  });
                });
              }

              $timeout(function() {
                // Call when loadDeferred be resolved, meaning Service is ready to be used
                loadDeferred.promise.then(
                  function() {
                    $window.FB.Event.unsubscribe.apply(FB, args);
                  },
                  function() {
                    throw 'Facebook API could not be initialized properly';
                  }
                );
              });

              return d.promise;
            };

            return new NgFacebook(); // Singleton
          }
        ];

      }
    ]).

    /**
     * Module initialization
     */
    run([
      '$rootScope',
      '$q',
      '$window',
      '$timeout',
      function($rootScope, $q, $window, $timeout) {
        // Define global loadDeffered to notify when Service callbacks are safe to use
        loadDeferred = $q.defer();

        var loadSDK = settings.loadSDK;
        delete(settings['loadSDK']); // Remove loadSDK from settings since this isn't part from Facebook API.

        /**
         * Define fbAsyncInit required by Facebook API
         */
        $window.fbAsyncInit = function() {
          // Initialize our Facebook app
          $timeout(function() {
            if (!settings.appId) {
              throw 'Missing appId setting.';
            }

            FB.init(settings);

            // Set ready global flag
            flags.ready = true;


            /**
             * Subscribe to Facebook API events and broadcast through app.
             */
            angular.forEach({
              'auth.login': 'login',
              'auth.logout': 'logout',
              'auth.prompt': 'prompt',
              'auth.sessionChange': 'sessionChange',
              'auth.statusChange': 'statusChange',
              'auth.authResponseChange': 'authResponseChange',
              'xfbml.render': 'xfbmlRender',
              'edge.create': 'like',
              'edge.remove': 'unlike',
              'comment.create': 'comment',
              'comment.remove': 'uncomment'
            }, function(mapped, name) {
              FB.Event.subscribe(name, function(response) {
                $timeout(function() {
                  $rootScope.$broadcast('Facebook:' + mapped, response);
                });
              });
            });

            // Broadcast Facebook:load event
            $rootScope.$broadcast('Facebook:load');

            loadDeferred.resolve(FB);
          });
        };

        /**
         * Inject Facebook root element in DOM
         */
        (function addFBRoot() {
          var fbroot = document.getElementById('fb-root');

          if (!fbroot) {
            fbroot = document.createElement('div');
            fbroot.id = 'fb-root';
            document.body.insertBefore(fbroot, document.body.childNodes[0]);
          }

          return fbroot;
        })();

        /**
         * SDK script injecting
         */
         if(loadSDK) {
          (function injectScript() {
            var src           = '//connect.facebook.net/' + settings.locale + '/sdk.js',
                script        = document.createElement('script');
                script.id     = 'facebook-jssdk';
                script.async  = true;

            // Prefix protocol
            if (['file', 'file:'].indexOf($window.location.protocol) !== -1) {
              src = 'https:' + src;
            }

            script.src = src;
            script.onload = function() {
              flags.sdk = true; // Set sdk global flag
            };

            document.getElementsByTagName('head')[0].appendChild(script); // // Fix for IE < 9, and yet supported by lattest browsers
          })();
        }
      }
    ]);

})(window, angular);

/*
---
name: Phonegap Facebook Angularjs

description: Provides a dependency for Phonegap projects.

license: MIT-style license

authors:
  - Ciul

requires: [angular, facebook]
provides: [angular-facebook-phonegap]

...
*/
(function(window, angular, undefined) {
  'use strict';

  angular.module('facebook').

      /**
       * Phonegap run code block
       * This loads the SDK  from a local javascript file on deviceready event,
       * as demanded by Facebook API documentation.
       */
      run([
        'settings',
        'flags',
       function(settings, flags) {

        // Local javascript file that contains the Facebook SDK.
        var localSDKSrc = angular.isDefined(settings.localSDK) ? settings.localSDK : null;
        if (angular.isString(localSDKSrc)) {
          if (localSDKSrc.search('.js') === -1) {
            localSDKSrc = localSDKSrc + '.js';
          }
          // Remove it from settings since it's not an API expected property.
          delete(settings['localSDK']);
        }

        // Phonegap deviceready event fired!, now load Facebook SDK
        function onReady() {
          if (!angular.isString(localSDKSrc)) {
            throw 'Missing localSDK setting pointing to the local javascript file with the Facebook SDK';
          }

          var src           = localSDKSrc,
              script        = document.createElement('script');
              script.id     = 'facebook-jssdk';
              script.async  = true;

          script.src = src;
          script.onload = function() {
            flags.sdk = true; // Set sdk global flag
          };

          document.getElementsByTagName('head')[0].appendChild(script); // // Fix for IE < 9, and yet supported by lattest browsers
        }

        document.addEventListener("deviceready", onReady, false);
       }
      ]);

})(window, angular);