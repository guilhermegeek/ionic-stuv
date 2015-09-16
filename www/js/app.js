(function(){
	/*
	 * Templates are cached with gulp-angular-templatecache on templates module
	 * We need to create it
	 */
	angular
		.module('templates', []);

	angular
		.module('stuv', [
			'stuv.core',
			'templates',
			'ionic',
			'ngCordova',
            'leaflet-directive',

            'pi',
            'pi.core',
            'pi.core.app'
			])
		.config(['$stateProvider', function($stateProvider){

			$stateProvider
				.state('home', {
					url: '/',
					controller: 'stuv.core.homeCtrl',
					controllerAs: 'ctrl',
					templateUrl: 'core/home.tpl.html'
				})
				.state('webcam', {
					url: '/webcam',
					controller: 'stuv.core.webcamCtrl',
					controllerAs: 'ctrl',
					templateUrl: 'core/webcam.tpl.html'
				})
				.state('register-stop', {
					url: '/',
					controller: 'stuv.core.registerStopCtrl',
					templateUrl: 'core/register-stop.tpl.html'
				})
				.state('bus-schedules', {
					url: '/bus-schedules/:id',
					controller: 'stuv.core.busSchedulesCtrl',
					templateUrl: 'core/bus-schedules.tpl.html'
				})
                .state('event-list', {
                    url: '/event-list',
                    controller: 'stuv.core.eventListCtrl',
                    controllerAs: 'ctrl',
                    templateUrl: 'core/event-list.tpl.html'
                })
                .state('event-view', {
                    url: '/event-view/:id',
                    controller: 'stuv.core.eventViewCtrl',
                    templateUrl: 'core/event-view.tpl.html'
                })
				.state('support', {
					url: '/support',
					controller: 'stuv.core.supportCtrl',
					templateUrl: 'core/support.tpl.html'
				})
                .state('place-list', {
                    url: '/sitios',
                    controller: 'stuv.core.placesListCtrl',
                    templateUrl: 'core/places-list.tpl.html'
                });
		}])
		.run(['$ionicPlatform', '$cordovaGeolocation', '$state', 'stuv.core.setupSvc', function($ionicPlatform, $cordovaGeolocation, $state, setupSvc){

			$ionicPlatform.ready(function() {
			    // Hide the accessory bar by default (remove this to show the accessory bar above the keyboard
			    // for form inputs)
			    if(window.cordova && window.cordova.plugins && window.cordova.plugins.Keyboard) {
			      cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
			    }
			    if(window.StatusBar) {
			      StatusBar.styleDefault();
			    }

                setupSvc.reset();
                $state.transitionTo('home');
		  	});
		}]);
})();
(function(){
	angular
		.module('stuv.core', ['ngCordova']);
})();
(function(){
	angular	
		.module('stuv.core')
		.controller('stuv.core.busSchedulesCtrl', ['stuv.core.stuvSvc', '$scope', '$ionicModal', '$stateParams', function(stuvSvc, $scope, $ionicModal, $stateParams){
			
			$scope.line = $stateParams.id;

			var getFormatedCords = function() {
				var coords = [];

				angular.forEach($scope.stations, function(value, key){
					coords.push(value.location);
				});

				return coords;
			};

            $scope.openModalRoute = function(trip)
            {
                stuvSvc.openModalRoute($scope.line, $scope.viewSchedule, trip);
            }

			$scope.getNearest = function(from){
				var coords = getFormatedCords();
				var n = geolib.findNearest(from, coords, 1);
				$scope.nearest = $scope.stations[parseInt(n.key)];
			}

			$scope.getDistance = function(from) {
				return geolib.getDistance($scope.stations[0].location, from) / 1000;
			};
			
			var holidays = [new Date("01/06/2015"), new Date("01/26/2015")];

			function isWeekday(date) {
				var day = date.getDay();
				return day !=0 && day !=6;
			}

			var currentDate = new Date();
			var now = new moment();

			$scope.isAvailable = function(time) {
				//var date = currentDate.getFullYear() + "-" + currentDate.getMonth() + "-" + currentDate.getDay() + ;
				var before = new moment(now.format('YYYY-MM-DD') + " " + time, "YYYY-MM-DD HH:mm");
				
				return $scope.viewSchedule === $scope.schedule && now.isBefore(before);
			}

			if(_.contains(holidays, currentDate) || currentDate.getDay() === 0) {
				$scope.schedule = 2;
				$scope.viewSchedule = 2;
			} else if(currentDate.getDay() === 6) {
				$scope.schedule = 1;
				$scope.viewSchedule = 1;
			} else {
				$scope.schedule = 0;
				$scope.viewSchedule = 0;
			}

			$scope.stations = [
				{ name: 'Rossio', location: {latitude: 40.681565, longitude: -7.927381}},
				{ name: 'Abraveses', location: {latitude: 40.696208, longitude: -7.932960}}
			];
			$scope.lines = stuvSvc.lines;
		}])
})();
(function(){
    angular
        .module('stuv.core')
        .controller('stuv.core.eventViewCtrl', ['pi.core.app.eventSvc', '$scope', '$stateParams', function(eventSvc, $scope, $stateParams){
           var self = this;
            $scope.id = $stateParams.id;

            eventSvc.get($stateParams.id)
                .then(function(res){
                    $scope.event = res.data.event;
                })

        }])
        .controller('stuv.core.eventListCtrl', ['pi.core.app.eventSvc', '$scope', function(eventSvc, $scope){

            eventSvc.find()
                .then(function(res){
                    $scope.events = res.data.events;
                });
        /*$scope.events = [
        {
        	id: 1,
        	title: 'Palco Banco BIC',
        	excerpt: 'Grande abertura',
        	thumbnailSrc: 'http://www.feirasaomateus.pt/agenda/xs/hgw5xt45jr40c08so0.jpg',
        	doorTime: '18:30',
        	doorDate: '07/08/2015'
        },
        {
        	id: 2,
        	title: 'Palco Banco BIC',
        	excerpt: 'DJ\'S RFM Dance Floor - Kura',
        	thumbnailSrc: 'http://www.feirasaomateus.pt/agenda/xs/8pjkydgxzs84owcw8k.jpg',
        	doorTime: '22:00',
        	doorDate: '08/08/2015'
        },
    	{
        	id: 3,
        	title: 'Palco Banco BIC',
        	excerpt: 'Banda Do Mar',
        	thumbnailSrc: 'http://www.feirasaomateus.pt/agenda/xs/akkjaplcxz4000cww.jpg',
        	doorTime: '22:00',
        	doorDate: '09/08/2015'
        },
    	{
        	id: 4,
        	title: 'Palco Banco BIC',
        	excerpt: 'Ranco Folclórico "As Bacacinhas de Santiago"',
        	thumbnailSrc: 'http://www.feirasaomateus.pt/agenda/xs/6qnutvr18x0k4ww0g8.jpg',
        	doorTime: '21:00',
        	doorDate: '10/08/2015'
        },
    	{
        	id: 5,
        	title: 'Palco Banco BIC',
        	excerpt: 'Grupo de Cantares Flamiam',
        	thumbnailSrc: 'http://www.feirasaomateus.pt/agenda/xs/6qnutvr18x0k4ww0g8.jpg',
        	doorTime: '21:00',
        	doorDate: '10/08/2015'
        },
    	{
        	id: 6,
        	title: 'Palco Banco BIC',
        	excerpt: 'Diogo André',
        	thumbnailSrc: 'http://www.feirasaomateus.pt/agenda/xs/6qnutvr18x0k4ww0g8.jpg',
        	doorTime: '21:00',
        	doorDate: '11/08/2015'
        },
    	{
        	id: 7,
        	title: 'Palco Banco BIC',
        	excerpt: 'Miss Emigrante',
        	thumbnailSrc: 'http://www.feirasaomateus.pt/agenda/xs/xioy0vky0usokgowk8.jpg',
        	doorTime: '22:00',
        	doorDate: '11/08/2015'
        },
    	{
        	id: 8,
        	title: 'Palco Banco BIC',
        	excerpt: 'Agir',
        	thumbnailSrc: 'http://www.feirasaomateus.pt/agenda/xs/104wvmple3i8ww84c8.jpg',
        	doorTime: '22:00',
        	doorDate: '12/08/2015'
        },
    	{
        	id: 9,
        	title: 'Palco Banco BIC',
        	excerpt: 'António Zambujo',
        	thumbnailSrc: 'http://www.feirasaomateus.pt/agenda/xs/1gdfqnyc4y00ggg40w.jpg',
        	doorTime: '22:00',
        	doorDate: '13/08/2015'
        },
    	{
        	id: 10,
        	title: 'Palco Banco BIC',
        	excerpt: 'Pedro Abrunhosa',
        	thumbnailSrc: 'http://www.feirasaomateus.pt/agenda/xs/18yevt58dq2sggoc4k.jpg',
        	doorTime: '22:00',
        	doorDate: '14/08/2015'
        },
    	{
        	id: 11,
        	title: 'Palco Banco BIC',
        	excerpt: 'Tony Carrreira',
        	thumbnailSrc: 'http://www.feirasaomateus.pt/agenda/xs/2wc4878ddo2s0808s.jpg',
        	doorTime: '22:00',
        	doorDate: '15/08/2015'
        },
    	{
        	id: 12,
        	title: 'Palco Banco BIC',
        	excerpt: 'Festival Internacional de Folclore',
        	thumbnailSrc: 'http://www.feirasaomateus.pt/agenda/xs/21140lof0y00gwwgc8.jpg',
        	doorTime: '22:00',
        	doorDate: '16/08/2015'
        },
    	{
        	id: 12,
        	title: 'Palco Banco BIC',
        	excerpt: 'Grupo de Cavaquinhos de Passos de Silgueiros',
        	thumbnailSrc: 'http://www.feirasaomateus.pt/agenda/xs/21140lof0y00gwwgc8.jpg',
        	doorTime: '22:00',
        	doorDate: '17/08/2015'
        },
        {
        	id: 13,
        	title: 'Palco Banco BIC',
        	excerpt: 'The Greyhound James Band',
        	thumbnailSrc: 'http://www.feirasaomateus.pt/agenda/xs/wm825umhteogkosoc0.jpg',
        	doorTime: '22:00',
        	doorDate: '18/08/2015'
        },
        {
        	id: 14,
        	title: 'Palco Banco BIC',
        	excerpt: 'Noite de Fado - Mara Pedro',
        	thumbnailSrc: 'http://www.feirasaomateus.pt/agenda/xs/cx2vcf301dwgooo4w.jpg',
        	doorTime: '22:00',
        	doorDate: '19/08/2015'
        }

        ]*/
        }]);
})();
(function(){
	angular
		.module('stuv.core')
		.controller('stuv.core.homeCtrl', ['$scope', 'stuv.core.stuvSvc', 'leafletData', 'stuv.core.setupSvc', function($scope, stuvSvc, leafletData, setupSvc){

            angular.extend($scope, {
                center: {
                    lat: 40.704472,
                    lng: -7.949354,
                    zoom: 8
                },
                markers: {
                    main_marker: {
                        lat: 40.676032,
                        lng: -7.949354,
                        focus: true,
                        //message: "Hey, drag me if you want",
                        title: "Marker",
                        draggable: true,
                        label: {
                            message: "Hey, drag me if you want",
                            options: {
                                noHide: true
                            }
                        }
                    }
                }
            });

            var getFormatedCords = function() {
				var coords = [];

				angular.forEach($scope.stations, function(value, key){
					coords.push(value.location);
				});

				return coords;
			}

			stuvSvc.getNearest()
				.then(function(res){
					$scope.nearest = res;
				});

			$scope.getDistance = function(from) {
				return geolib.getDistance($scope.stations[0].location, from) / 1000;
			};

			$scope.lines = stuvSvc.lines;

			$scope.stations = stuvSvc.stations;
		}]);
})();
(function(){
    angular
        .module('stuv.core')
        .controller('stuv.core.placesListCtrl', ['pi.core.placeSvc', '$scope', function(placesSvc, $scope){

            placesSvc.find()
                .then(function(res){
                    $scope.places = res.data.places;
                })
        }])
})();
(function(){
	angular
		.module('stuv.core')
		.controller('stuv.core.registerStopCtrl', ['stuv.core.stuvSvc', '$scope', function(stuvSvc, $scope){
			$scope.stations = stuvSvc.stations;
		}]);
})();
(function(){
    angular
        .module('stuv.core')
        .factory('stuv.core.setupSvc', ['$cordovaSQLite', function($cordovaSQLite){

            var reset = function() {
                /*
                 "INSERT INTO route (short_name,number) VALUES ('Rossio - Rio de Loba - Rossio',1), ('AV. 25 DE ABRIL – PARADINHA – AV. 25 DE ABRIL',2), ('ROSSIO – VILA NOVA DO CAMPO – ROSSIO',3), ('AV. A. SAMPAIO – P. MEDRONHOSA – AV. A. SAMPAIO',4), ('ROSSIO – ESC/ TRAVASSÓS CIMA – ROSSIO',5), (6,'ROSSIO – ORGENS / STO.ESTÊVÃO – S.MARTINHO – ROSSIO',6), ('ROSSIO- MOURE MADALENA - ROSSIO',7), ('ROSSIO – MOURE CARVALHAL – ROSSIO',8), (9,'ROSSIO–CASAL PÓVOA–MUNDÃO(ESC)–CAVERNÃES– MUNDÃO(ESC)–CASAL PÓVOA-ROSSIO',9), (10,'ROSSIO – VISO SUL – ROSSIO',10), (11,'ROSSIO – FRAGOSELA – ROSSIO',11), (12,'CENTRAL CAMIONAGEM – TEIVAS - VILA CHÃ SÁ – TEIVAS - CENTRAL CAMIONAGEM',12), (13,'C.CAMIONAGEM – COIMBRÕES – C.CAMIONAGEM',13), (14,'C.CAMIONAGEM-S.J.LOUROSA-OL.BARREIROS-S.J.LOUROSA- C.CAMIONAGEM',14), (15,'C.CAMIONAGEM – VILA CHÃ SÁ – C.CAMIONAGEM',15), (16,'C.CAMIONAGEM – FIGUEIRÓ – C.CAMIONAGEM ( COUTO DE CIMA )',16), (17,'ROSSIO – QUEIRELA - ROSSIO',17), (18,'ROSSIO-PAÇÔ-LUSTOSA-PIAGET-PAÇÔ-ROSSIO',18), (19,'C.CAMIONAGEM-TORREDEITA-REAL FARMINHÃO- TORREDEITA-C.CAMIONAGEM',19), (20,'ROSSIO-B.NORAD-BIGAS-ROSSIO',20), (21,'ROSSIO-OLIVEIRA CIMA-ROSSIO',21), (22,'AGUIEIRA – FAIL – AGUIEIRA (VIA HOSPITAL)',22), (23,'C.CAMIONAGEM-TORREDEITA-BOALDEIA-TORREDEITA- C.CAMIONAGEM',23), (24,'ROSSIO-PEREIRA-SILGUEIROS-GUMIEI-CASAL-RIBAFEITA- CASAL-GUMIEI-SILGUEIROS-PEREIRA-ROSSIO',24);",
                 "INSERT INTO stop_times (trip_id,arrival_time,departure_time,stop_id,stop_sequence) VALUES (1,1,'07:00','07:01',47,NULL), (2,1,'07:10','07:11',1,''), (3,2,'07:25','',47,NULL), (4,3,'07:30','07:31',47,NULL), (5,3,'07:50','07:51',1,''), (6,4,'08:10','',47,NULL), (7,5,'08:15','08:16',47,''), (8,5,'08:35','08:36',1,''), (9,6,'08:55','',47,'');",
                 "INSERT INTO stops (station_name,parent_station,latitude,longitude) VALUES (1,'Rio de Loba',NULL,NULL,NULL), (2,'Av. 25 de Abril',NULL,NULL,NULL), (3,'Paradinha',NULL,NULL,NULL), (4,'Vila Nova Campo',NULL,NULL,NULL), (5,'Av. Alberto Sampaio',NULL,NULL,NULL), (6,'Póvoa Medronhosa',NULL,NULL,NULL), (7,'Sarzedelo',NULL,NULL,NULL), (8,'Esc/Travassós Cima',NULL,NULL,NULL), (9,'Orgens/Sto. Estevão',NULL,NULL,NULL), (10,'Sto. Martinho',NULL,NULL,NULL), (11,'Moure Madalena',NULL,NULL,NULL), (12,'Moure Carvalhal',NULL,NULL,NULL), (13,'Casal Póvoa',NULL,NULL,NULL), (14,'Mundão (Esc)',NULL,NULL,NULL), (15,'Cavernães',NULL,NULL,NULL), (16,'Mundão (Esc)',NULL,NULL,NULL), (17,'Viso Sul',NULL,NULL,NULL), (18,'Fragosela',NULL,NULL,NULL), (19,'Teivas',NULL,NULL,NULL), (20,'Teivas',NULL,NULL,NULL), (21,'Vila Chã Sá',NULL,NULL,NULL), (22,'C. Camionagem',NULL,NULL,NULL), (23,'Qta. Galo',NULL,NULL,NULL), (24,'Coimbrões',NULL,NULL,NULL), (25,'S. J. Lourosa',NULL,NULL,NULL), (26,'Ol. Barreiros',NULL,NULL,NULL), (27,'Figueiró',NULL,NULL,NULL), (28,'Masgalos',NULL,NULL,NULL), (29,'Coutocima',NULL,NULL,NULL), (30,'Queirela',NULL,NULL,NULL), (31,'Paço',NULL,NULL,NULL), (32,'Lustuosa',NULL,NULL,NULL), (33,'Piaget',NULL,NULL,NULL), (34,'Torredeita',NULL,NULL,NULL), (35,'Real Farminhão',NULL,NULL,NULL), (36,'B. Norad',NULL,NULL,NULL), (37,'Bigas',NULL,NULL,NULL), (38,'Oliveira Cima',NULL,NULL,NULL), (39,'Hospital',NULL,NULL,NULL), (40,'Fail',NULL,NULL,NULL), (41,'Boaldeia',NULL,NULL,NULL), (42,'Pereira',NULL,NULL,NULL), (43,'Silgueiros',NULL,NULL,NULL), (44,'Gumiei',NULL,NULL,NULL), (45,'Casal',NULL,NULL,NULL), (46,'Ribafeita',NULL,NULL,NULL), (47,'Rossio',NULL,NULL,NULL);",
                 "INSERT INTO trip (route_id,direction_id) VALUES (1,1,0), (2,1,1), (3,1,0), (4,1,1), (5,1,0), (6,1,1);"


                 "INSERT INTO stop_times (trip_id,arrival_time,departure_time,stop_id,stop_sequence) VALUES (1,1,'07:00','07:01',47,NULL), (2,1,'07:10','07:11',1,''), (3,2,'07:25','',47,NULL), (4,3,'07:30','07:31',47,NULL), (5,3,'07:50','07:51',1,''), (6,4,'08:10','',47,NULL), (7,5,'08:15','08:16',47,''), (8,5,'08:35','08:36',1,''), (9,6,'08:55','',47,'');",
                 "INSERT INTO stops (station_name,parent_station,latitude,longitude) VALUES (1,'Rio de Loba',NULL,NULL,NULL), (2,'Av. 25 de Abril',NULL,NULL,NULL), (3,'Paradinha',NULL,NULL,NULL), (4,'Vila Nova Campo',NULL,NULL,NULL), (5,'Av. Alberto Sampaio',NULL,NULL,NULL), (6,'Póvoa Medronhosa',NULL,NULL,NULL), (7,'Sarzedelo',NULL,NULL,NULL), (8,'Esc/Travassós Cima',NULL,NULL,NULL), (9,'Orgens/Sto. Estevão',NULL,NULL,NULL), (10,'Sto. Martinho',NULL,NULL,NULL), (11,'Moure Madalena',NULL,NULL,NULL), (12,'Moure Carvalhal',NULL,NULL,NULL), (13,'Casal Póvoa',NULL,NULL,NULL), (14,'Mundão (Esc)',NULL,NULL,NULL), (15,'Cavernães',NULL,NULL,NULL), (16,'Mundão (Esc)',NULL,NULL,NULL), (17,'Viso Sul',NULL,NULL,NULL), (18,'Fragosela',NULL,NULL,NULL), (19,'Teivas',NULL,NULL,NULL), (20,'Teivas',NULL,NULL,NULL), (21,'Vila Chã Sá',NULL,NULL,NULL), (22,'C. Camionagem',NULL,NULL,NULL), (23,'Qta. Galo',NULL,NULL,NULL), (24,'Coimbrões',NULL,NULL,NULL), (25,'S. J. Lourosa',NULL,NULL,NULL), (26,'Ol. Barreiros',NULL,NULL,NULL), (27,'Figueiró',NULL,NULL,NULL), (28,'Masgalos',NULL,NULL,NULL), (29,'Coutocima',NULL,NULL,NULL), (30,'Queirela',NULL,NULL,NULL), (31,'Paço',NULL,NULL,NULL), (32,'Lustuosa',NULL,NULL,NULL), (33,'Piaget',NULL,NULL,NULL), (34,'Torredeita',NULL,NULL,NULL), (35,'Real Farminhão',NULL,NULL,NULL), (36,'B. Norad',NULL,NULL,NULL), (37,'Bigas',NULL,NULL,NULL), (38,'Oliveira Cima',NULL,NULL,NULL), (39,'Hospital',NULL,NULL,NULL), (40,'Fail',NULL,NULL,NULL), (41,'Boaldeia',NULL,NULL,NULL), (42,'Pereira',NULL,NULL,NULL), (43,'Silgueiros',NULL,NULL,NULL), (44,'Gumiei',NULL,NULL,NULL), (45,'Casal',NULL,NULL,NULL), (46,'Ribafeita',NULL,NULL,NULL), (47,'Rossio',NULL,NULL,NULL);",
                 "INSERT INTO trip (route_id,direction_id) VALUES (1,1,0), (2,1,1), (3,1,0), (4,1,1), (5,1,0), (6,1,1);"
                 */
                var queries = [
                    "INSERT INTO route (short_name,number) VALUES ('Rossio - Rio de Loba - Rossio',1)"
                ];

                var getDb = function() {
                    if (window.cordova) {
                        return $cordovaSQLite.openDB("my.db"); //device
                    } else {
                        return window.openDatabase("my.db", '1', 'my', 1024 * 1024 * 100); // browser
                    }
                };
                var db = getDb();
                db.transaction(function(tx) {
                    var tables = ['route', 'stop_times', 'stop', 'trip'];

                    angular.forEach(tables, function(value){
                        tx.executeSql('DROP TABLE IF EXISTS ' + value);
                    });

                    var tables = [
                        'CREATE TABLE trip (id INTEGER PRIMARY KEY, route_id INTEGER, direction_id NUMERIC);',
                        'CREATE TABLE stops (id INTEGER PRIMARY KEY, station_name TEXT NOT NULL, parent_station	INTEGER, latitude NUMERIC, longitude NUMERIC);',
                        'CREATE TABLE stop_times (id INTEGER PRIMARY KEY, trip_id INTEGER, arrival_time	TEXT, departure_time TEXT, stop_id INTEGER, stop_sequence TEXT);',
                        'CREATE TABLE route (id INTEGER PRIMARY KEY, short_name	TEXT, number INTEGER);',
                        'CREATE TABLE holiday (id INTEGER PRIMARY KEY, description TEXT, when TEXT);'
                    ];
                    var list = function(object) {
                        for(var key in object) {
                            console.log(key);
                        }
                    }

                    angular.forEach(tables, function(value){
                        tx.executeSql(value, function(tx, res) {

                        }, function(e) {
                            console.log(tables);
                            console.log('TABLE - BEGIN');
                            console.log("ERROR: " + list(e));
                            console.log('TABLE - END');
                        });
                    });

                    angular.forEach(queries, function(value){
                        tx.executeSql(value, function(tx, res) {
                            console.log("insertId: " + res.insertId + " -- probably 1");
                            console.log("rowsAffected: " + res.rowsAffected + " -- should be 1");

                        }, function(e) {
                            console.log('QUERY - BEGIN');
                            console.log("ERROR: " + list(e));
                            console.log('QUERY - END');
                        });
                    });
                });
            };

            return {
                reset: reset
            }
        }]);
})();
(function(){
	angular
		.module('stuv.core.stationViewCtrl', [function(){

		}]);
})();
(function(){
    angular
        .module('stuv.core')
        .factory('stuv.core.stuvSvc', ['$cordovaGeolocation', '$q', '$rootScope', '$ionicModal', function($cordovaGeolocation, $q, $rootScope, $ionicModal){

            var getFormatedCords = function() {
                var coords = [];

                angular.forEach(stations, function(value, key){
                    coords.push(value.location);
                });

                return coords;
            }

            var $scope = $rootScope.$new();

            $ionicModal.fromTemplateUrl('core/schedule-modal.tpl.html', {
                scope: $scope,
                animation: 'slide-in-up'
            }).then(function(modal) {
                $scope.modal = modal;
                $scope.closeModal = closeModal;
            });

            var openModal = function(line, schedule, trip) {
                $scope.route = lines[line].schedules[schedule].routes[trip];
                $scope.modal.show();
            };

            var closeModal = function() {
                $scope.modal.hide();
            };

            var nearest = {};

            var getNearest = function(from) {
                var def = $q.defer();

                $cordovaGeolocation
                    .getCurrentPosition()
                    .then(function (position) {
                        var lat  = position.coords.latitude
                        var long = position.coords.longitude
                        var from = {latitude: lat, longitude: long};
                        var coords = getFormatedCords();
                        var n = geolib.findNearest(from, coords, 1);
                        nearest = stations[parseInt(n.key)];
                        def.resolve(nearest);
                    }, function(err) {
                        // error
                    });
                return def.promise;
            };

            var init = function() {
            };

            var stations = [
                { id: 0, name: 'Rio de Loba', location: {latitude: 40.676032, longitude: -7.923519}},
                { id: 1, name: 'Rossio', location: {latitude: 40.681565, longitude: -7.927381}},
                { id: 2, name: 'Av. Alberto Sampaio', location: {latitude: 40.696208, longitude: -7.932960}},
                { id: 3, name: 'Marzovelos', location: {latitude: 40.704472, longitude: -7.949354}},
                { id: 4, name: 'P. Medronhosa', location: {latitude: 40.704472, longitude: -7.949354}},
                { id: 5, name: 'Sarzedelo', location: {latitude: 40.704472, longitude: -7.949354}},
                { id: 6, name: 'Trav. Cima', location: {latitude: 40.704472, longitude: -7.949354}}
            ];

            var lines = [{
                number: 1,
                name: 'Nº 1 ROSSIO-RIO LOBA-ROSSIO',
                schedules: [
                    {
                        name: "Dias Úteis",
                        type: 'businessDay',
                        routes: [
                            {
                                departure: '07:10',
                                departureStation: stations[1],
                                arrive: '07:25',
                                arriveStation: stations[0],
                                routes: [
                                    {
                                        departure: '07:10',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '07:25',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '07:30',
                                departureStation: stations[0],
                                arrive: '07:50',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '07:30',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '07:50',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '08:10',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '08:15',
                                departureStation: stations[0],
                                arrive: '08:35',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '08:15',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '08:35',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '08:55',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '08:55',
                                departureStation: stations[0],
                                arrive: '09:10',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '08:55',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '09:10',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '09:30',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '09:30',
                                departureStation: stations[0],
                                arrive: '09:45',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '09:30',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '09:45',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '10:00',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '10:30',
                                departureStation: stations[0],
                                arrive: '10:40',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '10:30',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '10:40',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '10:55',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '12:00',
                                departureStation: stations[0],
                                arrive: '12:15',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '12:00',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '12:15',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '12:35',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '12:35',
                                departureStation: stations[0],
                                arrive: '12:50',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '12:35',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '12:50',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '13:10',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '13:10',
                                departureStation: stations[0],
                                arrive: '13:25',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '13:10',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '13:25',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '13:45',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '13:45',
                                departureStation: stations[0],
                                arrive: '14:00',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '13:45',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '14:00',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '14:20',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '15:30',
                                departureStation: stations[0],
                                arrive: '15:45',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '15:30',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '15:45',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '16:00',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '16:35',
                                departureStation: stations[0],
                                arrive: '16:50',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '16:35',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '16:50',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '17:10',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '17:15',
                                departureStation: stations[0],
                                arrive: '17:30',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '17:15',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '17:30',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '17:55',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '18:00',
                                departureStation: stations[0],
                                arrive: '18:15',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '18:00',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '18:15',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '18:35',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '18:35',
                                departureStation: stations[0],
                                arrive: '18:50',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '18:35',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '18:50',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '19:10',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '19:15',
                                departureStation: stations[0],
                                arrive: '19:30',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '19:15',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '19:30',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '19:45',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '19:50',
                                departureStation: stations[0],
                                arrive: '20:05',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '19:50',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '20:05',
                                        departureStation: stations[1]
                                    }]
                            }
                        ]
                    },
                    {
                        name: "Sábados",
                        type: 'weekend',
                        routes: [
                            {
                                departure: '07:40',
                                departureStation: stations[0],
                                arrive: '07:55',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '07:40',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '07:55',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '08:15',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '08:15',
                                departureStation: stations[0],
                                arrive: '08:30',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '08:15',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '08:30',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '08:50',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '08:50',
                                departureStation: stations[0],
                                arrive: '09:05',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '08:50',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '09:05',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '09:25',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '10:25',
                                departureStation: stations[0],
                                arrive: '10:40',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '10:25',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '10:40',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '11:00',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '11:35',
                                departureStation: stations[0],
                                arrive: '11:50',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '11:35',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '11:50',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '12:10',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '13:10',
                                departureStation: stations[0],
                                arrive: '13:25',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '13:10',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '13:25',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '13:45',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '14:10',
                                departureStation: stations[0],
                                arrive: '14:25',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '14:10',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '14:25',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '14:40',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '18:25',
                                departureStation: stations[0],
                                arrive: '18:40',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '18:25',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '18:40',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '18:55',
                                        departureStation: stations[0]
                                    }]
                            }
                        ]
                    },
                    {
                        name: "Feriados",
                        type: 'holiday',
                        routes: [
                            {
                                departure: '07:10',
                                departureStation: stations[1],
                                arrive: '07:25',
                                arriveStation: stations[0],
                                routes: [
                                    {
                                        departure: '07:10',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '07:25',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '07:30',
                                departureStation: stations[0],
                                arrive: '07:50',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '07:30',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '07:50',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '08:10',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '08:15',
                                departureStation: stations[0],
                                arrive: '08:35',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '08:15',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '08:35',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '08:55',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '08:55',
                                departureStation: stations[0],
                                arrive: '09:10',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '08:55',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '09:10',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '09:30',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '09:30',
                                departureStation: stations[0],
                                arrive: '09:45',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '09:30',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '09:45',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '10:00',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '10:30',
                                departureStation: stations[0],
                                arrive: '10:40',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '10:30',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '10:40',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '10:55',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '12:00',
                                departureStation: stations[0],
                                arrive: '12:15',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '12:00',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '12:15',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '12:35',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '12:35',
                                departureStation: stations[0],
                                arrive: '12:50',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '12:35',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '12:50',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '13:10',
                                        departureStation: stations[0]
                                    }]
                            },
                            {
                                departure: '13:10',
                                departureStation: stations[0],
                                arrive: '13:25',
                                arriveStation: stations[1],
                                routes: [
                                    {
                                        departure: '13:10',
                                        departureStation: stations[0]
                                    },
                                    {
                                        departure: '13:25',
                                        departureStation: stations[1]
                                    },
                                    {
                                        departure: '13:45',
                                        departureStation: stations[0]
                                    }]
                            }
                        ]
                    }]
            },
            {
                number: 4,
                name: 'Nº 4 AV.A.SAMPAIO-P.MEDRONHOSA-AV.A.SAMPAIO',
                schedules: [
                    {
                        name: "Dias Úteis",
                        type: 'businessDay',
                        routes: [
                            {
                                departure: '07:40',
                                departureStation: stations[5],
                                arrive: '08:05',
                                arriveStation: stations[2],
                                routes: [
                                    {
                                        departure: '07:40',
                                        departureStation: stations[5]
                                    },
                                    {
                                        departure: '07:45',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '07:55',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '08:05',
                                        departureStation: stations[2]
                                    }]
                            },
                            {
                                departure: '08:10',
                                departureStation: stations[2],
                                arrive: '08:30',
                                arriveStation: stations[4],
                                routes: [
                                    {
                                        departure: '08:10',
                                        departureStation: stations[2]
                                    },
                                    {
                                        departure: '08:20',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '08:30',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '08:40',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '08:50',
                                        departureStation: stations[2]
                                    }]
                            },
                            {
                                departure: '09:00',
                                departureStation: stations[2],
                                arrive: '09:25',
                                arriveStation: stations[5],
                                routes: [
                                    {
                                        departure: '09:00',
                                        departureStation: stations[2]
                                    },
                                    {
                                        departure: '09:10',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '09:20',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '09:25',
                                        departureStation: stations[5]
                                    },
                                    {
                                        departure: '09:30',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '09:40',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '09:50',
                                        departureStation: stations[2]
                                    }]
                            },
                            {
                                departure: '10:20',
                                departureStation: stations[2],
                                arrive: '10:40',
                                arriveStation: stations[4],
                                routes: [
                                    {
                                        departure: '10:20',
                                        departureStation: stations[2]
                                    },
                                    {
                                        departure: '10:30',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '10:40',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '10:50',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '11:00',
                                        departureStation: stations[2]
                                    }]
                            },
                            {
                                departure: '12:05',
                                departureStation: stations[2],
                                arrive: '12:20',
                                arriveStation: stations[4],
                                routes: [
                                    {
                                        departure: '12:05',
                                        departureStation: stations[2]
                                    },
                                    {
                                        departure: '12:10',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '12:20',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '12:30',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '12:40',
                                        departureStation: stations[2]
                                    }]
                            },
                            {
                                departure: '12:40',
                                departureStation: stations[2],
                                arrive: '13.05',
                                arriveStation: stations[5],
                                routes: [
                                    {
                                        departure: '12:40',
                                        departureStation: stations[2]
                                    },
                                    {
                                        departure: '12:50',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '13:00',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '13:05',
                                        departureStation: stations[5]
                                    },
                                    {
                                        departure: '13:10',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '13:20',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '13:30',
                                        departureStation: stations[2]
                                    }]
                            },
                            {
                                departure: '13:40',
                                departureStation: stations[2],
                                arrive: '14:00',
                                arriveStation: stations[4],
                                routes: [
                                    {
                                        departure: '13:40',
                                        departureStation: stations[2]
                                    },
                                    {
                                        departure: '13:50',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '14:00',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '14:10',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '14:20',
                                        departureStation: stations[2]
                                    }]
                            },
                            {
                                departure: '16:30',
                                departureStation: stations[2],
                                arrive: '16:55',
                                arriveStation: stations[5],
                                routes: [
                                    {
                                        departure: '16:30',
                                        departureStation: stations[2]
                                    },
                                    {
                                        departure: '16:40',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '16:50',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '16:55',
                                        departureStation: stations[5]
                                    },
                                    {
                                        departure: '17:00',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '17:10',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '17:20',
                                        departureStation: stations[2]
                                    }]
                            },
                            {
                                departure: '17:25',
                                departureStation: stations[2],
                                arrive: '07:45',
                                arriveStation: stations[4],
                                routes: [
                                    {
                                        departure: '17:25',
                                        departureStation: stations[2]
                                    },
                                    {
                                        departure: '17:35',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '17:45',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '17:55',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '18:05',
                                        departureStation: stations[2]
                                    }]
                            },
                            {
                                departure: '18:10',
                                departureStation: stations[2],
                                arrive: '18:35',
                                arriveStation: stations[5],
                                routes: [
                                    {
                                        departure: '18:10',
                                        departureStation: stations[2]
                                    },
                                    {
                                        departure: '18:20',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '18:30',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '18:35',
                                        departureStation: stations[5]
                                    },
                                    {
                                        departure: '18:40',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '18:50',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '19.00',
                                        departureStation: stations[2]
                                    }]
                            },
                            {
                                departure: '19:15',
                                departureStation: stations[2],
                                arrive: '19:35',
                                arriveStation: stations[5],
                                routes: [
                                    {
                                        departure: '19:15',
                                        departureStation: stations[2]
                                    },
                                    {
                                        departure: '19:25',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '19:30',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '19:35',
                                        departureStation: stations[5]
                                    }]
                            }
                        ]
                    },
                    {
                        name: "Sábados",
                        type: 'weekend',
                        routes: [
                            {
                                departure: '07:25',
                                departureStation: stations[2],
                                arrive: '07:40',
                                arriveStation: stations[5],
                                routes: [
                                    {
                                        departure: '07:25',
                                        departureStation: stations[2]
                                    },
                                    {
                                        departure: '07:30',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '07:35',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '07:40',
                                        departureStation: stations[5]
                                    },
                                    {
                                        departure: '07:45',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '07:50',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '08:00',
                                        departureStation: stations[2]
                                    }]
                            },
                            {
                                departure: '08:30',
                                departureStation: stations[2],
                                arrive: '08:40',
                                arriveStation: stations[4],
                                routes: [
                                    {
                                        departure: '08:30',
                                        departureStation: stations[2]
                                    },
                                    {
                                        departure: '08:35',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '08:40',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '08:45',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '08:55',
                                        departureStation: stations[2]
                                    }]
                            },
                            {
                                departure: '11:05',
                                departureStation: stations[2],
                                arrive: '11:20',
                                arriveStation: stations[4],
                                routes: [
                                    {
                                        departure: '11:05',
                                        departureStation: stations[2]
                                    },
                                    {
                                        departure: '11:15',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '11:20',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '11:25',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '11:35',
                                        departureStation: stations[2]
                                    }]
                            },
                            {
                                departure: '12:40',
                                departureStation: stations[2],
                                arrive: '12:55',
                                arriveStation: stations[5],
                                routes: [
                                    {
                                        departure: '12:40',
                                        departureStation: stations[2]
                                    },
                                    {
                                        departure: '12:45',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '12:50',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '12:55',
                                        departureStation: stations[5]
                                    },
                                    {
                                        departure: '13:00',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '13:05',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '13:10',
                                        departureStation: stations[4]
                                    }]
                            },
                            {
                                departure: '13:40',
                                departureStation: stations[2],
                                arrive: '13:50',
                                arriveStation: stations[4],
                                routes: [
                                    {
                                        departure: '13:40',
                                        departureStation: stations[2]
                                    },
                                    {
                                        departure: '13:45',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '13:50',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '13:55',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '14:05',
                                        departureStation: stations[2]
                                    }]
                            },
                            {
                                departure: '16:55',
                                departureStation: stations[2],
                                arrive: '17:10',
                                arriveStation: stations[4],
                                routes: [
                                    {
                                        departure: '16:55',
                                        departureStation: stations[2]
                                    },
                                    {
                                        departure: '17:00',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '17:10',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '17:15',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '17:25',
                                        departureStation: stations[2]
                                    }]
                            }
                        ]
                    },
                    {
                        name: "Feriados",
                        type: 'holiday',
                        routes: [
                            {
                                departure: '09:00',
                                departureStation: stations[2],
                                arrive: '09:10',
                                arriveStation: stations[4],
                                routes: [
                                    {
                                        departure: '09:00',
                                        departureStation: stations[2]
                                    },
                                    {
                                        departure: '09:05',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '09:10',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '09:15',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '09:25',
                                        departureStation: stations[2]
                                    }]
                            },
                            {
                                departure: '11:45',
                                departureStation: stations[2],
                                arrive: '11:55',
                                arriveStation: stations[4],
                                routes: [
                                    {
                                        departure: '11:45',
                                        departureStation: stations[2]
                                    },
                                    {
                                        departure: '11:50',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '11:55',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '12:00',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '12:10',
                                        departureStation: stations[2]
                                    }]
                            },
                            {
                                departure: '13:10',
                                departureStation: stations[2],
                                arrive: '13:20',
                                arriveStation: stations[4],
                                routes: [
                                    {
                                        departure: '13:10',
                                        departureStation: stations[2]
                                    },
                                    {
                                        departure: '13:15',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '13:20',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '13:25',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '13:35',
                                        departureStation: stations[2]
                                    }]
                            },
                            {
                                departure: '17:00',
                                departureStation: stations[2],
                                arrive: '07:15',
                                arriveStation: stations[4],
                                routes: [
                                    {
                                        departure: '17:00',
                                        departureStation: stations[2]
                                    },
                                    {
                                        departure: '17:05',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '17:15',
                                        departureStation: stations[4]
                                    },
                                    {
                                        departure: '17:20',
                                        departureStation: stations[3]
                                    },
                                    {
                                        departure: '17:30',
                                        departureStation: stations[2]
                                    }]
                            }
                        ]
                    }]
            }];

            init();
            return {
                start: init,
                stations: stations,
                lines: lines,
                nearest: nearest,
                getNearest: getNearest,
                openModalRoute: function(line, schedule, trip) {
                    return openModal(line, schedule, trip);
                }
            }
        }])
})();
(function(){
	angular
		.module('stuv.core')
		.controller('stuv.core.supportCtrl', [function(){

		}]);
})();
(function(){
	angular
		.module('stuv.core')
		.controller('stuv.core.webcamCtrl', ['$scope', 'stuv.core.stuvSvc', 'leafletData', 'stuv.core.setupSvc', '$timeout', function($scope, stuvSvc, leafletData, setupSvc, $timeout){
			var self = this;
			this.webcamSrc = 'http://abss.dyndns.info/viseu.jpg' + '?' + new Date().getTime();;
			
			var reloadImg = function(){
				self.webcamSrc = 'http://abss.dyndns.info/viseu.jpg' + '?' + new Date().getTime();;
			}
			reloadImg();

			$timeout(function(){
				reloadImg();
				$scope.$apply();
			}, 3000);

		}]);
})();