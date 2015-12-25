var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
function getMiddle(pol) {
    var start = pol.getLatLngs()[0];
    var end = pol.getLatLngs()[1];
    return new L.LatLng(start.lat + ((end.lat - start.lat) / 2), start.lng + ((end.lng - start.lng) / 2));
}
function distance(latLngStart, latLngEnd) {
    var R = 6371000; // meter
    var Phi1 = latLngStart.lat * (Math.PI / 180);
    var Phi2 = latLngEnd.lat * (Math.PI / 180);
    var DeltaPhi = (latLngEnd.lat - latLngStart.lat) * (Math.PI / 180);
    var DeltaLambda = (latLngEnd.lng - latLngStart.lng) * (Math.PI / 180);
    var a = Math.sin(DeltaPhi / 2) * Math.sin(DeltaPhi / 2)
        + Math.cos(Phi1) * Math.cos(Phi2) * Math.sin(DeltaLambda / 2)
            * Math.sin(DeltaLambda / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c;
    return d;
}
var MarkerType;
(function (MarkerType) {
    MarkerType[MarkerType["Harbour"] = 0] = "Harbour";
    MarkerType[MarkerType["Dummy"] = 1] = "Dummy";
    MarkerType[MarkerType["Waypoint"] = 2] = "Waypoint";
    MarkerType[MarkerType["WeatherStation"] = 3] = "WeatherStation";
})(MarkerType || (MarkerType = {}));
var MapPoint = (function () {
    function MapPoint(latLng, markerType) {
        var _this = this;
        this.latitude = ko.observable(latLng.lat);
        this.longitude = ko.observable(latLng.lng);
        this.latLng = new L.LatLng(latLng.lat, latLng.lng);
        this.latitude.subscribe(function (value) {
            if (_this.latLng.lat !== value) {
                _this.latLng.lat = value;
            }
        });
        this.longitude.subscribe(function (value) {
            if (_this.latLng.lng !== value) {
                _this.latLng.lng = value;
            }
        });
        this.markerType = markerType;
        var options = {
            draggable: true
        };
        if (markerType === MarkerType.Dummy) {
            options.opacity = 0.5;
        }
        if (markerType === MarkerType.Waypoint || markerType === MarkerType.Dummy) {
            options.icon = new L.Icon({
                iconUrl: "/content/waypointhandle.png",
                iconSize: new L.Point(10, 10, true),
                className: "waypoint"
            });
        }
        var marker = new L.Marker(this.latLng, options);
        marker.addTo(model.map);
        marker.waypoint = this;
        this.marker = marker;
        marker.addEventListener("drag", function (e) {
            _this.setLatLng(_this.marker.getLatLng());
        });
    }
    MapPoint.prototype.setLatLng = function (latLng) {
        this.latLng.lat = latLng.lat;
        this.latLng.lng = latLng.lng;
        this.latitude(latLng.lat);
        this.longitude(latLng.lng);
        this.redraw();
    };
    MapPoint.prototype.redraw = function () {
        this.marker.setLatLng(this.latLng);
    };
    MapPoint.prototype.centerOnMap = function () {
        model.map.setView(this.latLng);
    };
    MapPoint.prototype.removeFromMap = function () {
        model.map.removeLayer(this.marker);
    };
    MapPoint.prototype.isDummy = function () {
        return this.markerType === MarkerType.Dummy;
    };
    return MapPoint;
})();
var Waypoint = (function (_super) {
    __extends(Waypoint, _super);
    function Waypoint(latLng, markerType) {
        var _this = this;
        _super.call(this, latLng, markerType);
        this.latLng.polylines = new Array();
        this.latLng.waypoint = this;
        this.waypointNumber = ko.observable();
        this.latitude.subscribe(function (value) {
            if (_this.latLng.lat !== value) {
                _this.redraw();
            }
        });
        this.longitude.subscribe(function (value) {
            if (_this.latLng.lng !== value) {
                _this.redraw();
            }
        });
        this.polylines = new Array();
        if (markerType === MarkerType.Waypoint || markerType === MarkerType.Dummy) {
            model.waypointMarkers.push(this.marker);
            this.marker.point = model.map.latLngToContainerPoint(this.latLng);
        }
        this.marker.addEventListener("click", function (e) {
            if (_this.markerType === MarkerType.Dummy)
                _this.convertFromDummyHandle();
            if (model.getMapMode() === MapMode.RouteDrawing) {
                if (!_this.isInPolyline(model.drawingPolyline)) {
                    _this.addToPolyline(model.drawingPolyline);
                    removeFromPolyline(model.drawingPolyline, model.drawingLatLng);
                    addDummyHandle(model.drawingPolyline);
                    model.drawingPolyline = undefined;
                    model.drawingLatLng = undefined;
                }
                else {
                    removePolyline(model.drawingPolyline);
                    model.drawingPolyline = undefined;
                    model.drawingLatLng = undefined;
                }
            }
        });
        this.marker.addEventListener("dblclick", function (e) {
            model.drawingPolyline = model.addPolyline(_this);
            model.drawingLatLng = new L.LatLng(e.latlng.lat, e.latlng.lng);
            model.drawingPolyline.addLatLng(model.drawingLatLng);
        });
        if (this.markerType === MarkerType.Dummy)
            this.marker.addOneTimeEventListener("drag", function (e) {
                _this.convertFromDummyHandle();
            });
    }
    Waypoint.prototype.redraw = function () {
        _super.prototype.redraw.call(this);
        for (var i = 0; i < this.polylines.length; i++)
            redrawPolyline(this.polylines[i]);
    };
    Waypoint.prototype.convertFromDummyHandle = function () {
        this.marker.setOpacity(1);
        splitPolyline(this.polylines[0]);
        this.markerType = MarkerType.Waypoint;
    };
    Waypoint.prototype.isInPolyline = function (polyline) {
        for (var _i = 0, _a = this.polylines; _i < _a.length; _i++) {
            var currentPolyline = _a[_i];
            if (polyline === currentPolyline)
                return true;
        }
        return false;
    };
    Waypoint.prototype.removeFromMap = function () {
        if (this.markerType !== MarkerType.Dummy)
            for (var _i = 0, _a = this.polylines; _i < _a.length; _i++) {
                var polyline = _a[_i];
                removePolyline(polyline);
            }
        _super.prototype.removeFromMap.call(this);
    };
    Waypoint.prototype.addToPolyline = function (polyline) {
        if (this.isInPolyline(polyline))
            return false;
        if (polyline.dummyHandle !== this) {
            polyline.waypoints.push(this);
            polyline.addLatLng(this.latLng);
            polyline.redraw();
        }
        this.latLng.polylines.push(polyline);
        this.polylines.push(polyline);
        return true;
    };
    Waypoint.prototype.removeFromPolyline = function (polyline) {
        if (!this.isInPolyline(polyline))
            return false;
        removeFromArray(polyline.waypoints, this);
        removeFromArray(this.polylines, polyline);
        removeFromArray(this.latLng.polylines, polyline);
        removeFromArray(polyline.getLatLngs(), this.latLng);
        polyline.redraw();
        if (false && this.polylines.length <= 1 && this.removeIfHasZeroOrOnePolylines())
            this.removeFromMap();
        return true;
    };
    Waypoint.prototype.removeIfHasZeroOrOnePolylines = function () {
        return true;
    };
    return Waypoint;
})(MapPoint);
function splitPolyline(polyline) {
    if (polyline.waypoints.length === 2 && polyline.dummyHandle instanceof Waypoint) {
        var w1 = polyline.waypoints[0];
        var w2 = polyline.dummyHandle;
        var w3 = polyline.waypoints[1];
        w2.removeFromPolyline(polyline);
        polyline.dummyHandle = undefined;
        w2.addToPolyline(polyline);
        w3.removeFromPolyline(polyline);
        addDummyHandle(polyline);
        addDummyHandle(model.addPolyline([w2, w3]));
        return;
    }
    throw new Error("Cannot split polyline. Polyline has no dummy handle or less or more than 2 waypoints");
}
function removePolyline(polyline) {
    for (var _i = 0, _a = polyline.waypoints; _i < _a.length; _i++) {
        var waypoint = _a[_i];
        waypoint.removeFromPolyline(polyline);
    }
    if (polyline.dummyHandle !== undefined) {
        polyline.dummyHandle.removeFromPolyline(polyline);
        polyline.dummyHandle.removeFromMap();
    }
    model.map.removeLayer(polyline);
}
function addDummyHandle(polyline) {
    if (polyline.dummyHandle === undefined) {
        polyline.dummyHandle = new Waypoint(getMiddle(polyline), MarkerType.Dummy);
        polyline.dummyHandle.addToPolyline(polyline);
    }
}
function redrawPolyline(polyline) {
    var middleLatLng = getMiddle(polyline);
    if (polyline.dummyHandle === undefined)
        addDummyHandle(polyline);
    if (polyline.dummyHandle.longitude() !== middleLatLng.lng || polyline.dummyHandle.latitude() !== middleLatLng.lat)
        polyline.dummyHandle.setLatLng(middleLatLng);
    else
        polyline.redraw();
}
function removeFromPolyline(polyline, latLng) {
    removeFromArray(polyline.getLatLngs(), latLng);
    polyline.redraw();
}
function removeFromArray(arr, obj) {
    var tmpArr = new Array();
    for (var _i = 0; _i < arr.length; _i++) {
        var item = arr[_i];
        if (item !== obj)
            tmpArr.push(item);
    }
    if (tmpArr.length === arr.length)
        return false;
    while (arr.pop()) {
    }
    while (tmpArr.length > 0) {
        arr.push(tmpArr.shift());
    }
    return true;
}
var Harbour = (function (_super) {
    __extends(Harbour, _super);
    function Harbour(name, arg2, longitude) {
        _super.call(this, arg2 instanceof L.LatLng ? arg2 : new L.LatLng(arg2, longitude), MarkerType.Harbour);
        this.name = ko.observable(name);
        this.description = ko.observable("");
    }
    Harbour.prototype.removeIfHasZeroOrOnePolylines = function () {
        return false;
    };
    return Harbour;
})(Waypoint);
var MapMode;
(function (MapMode) {
    MapMode[MapMode["View"] = 0] = "View";
    MapMode[MapMode["RouteDrawing"] = 1] = "RouteDrawing";
})(MapMode || (MapMode = {}));
var SailingMapViewModel = (function () {
    function SailingMapViewModel() {
        var _this = this;
        this.removeHarbour = function () {
            _this.selectedHarbour().removeFromMap();
            _this.harbours.remove(_this.selectedHarbour());
        };
        this.centerWaypoint = function (harbour) {
            harbour.centerOnMap();
        };
        this.selectHarbour = function (harbour) {
            _this.selectedHarbour(harbour);
        };
        this.removePolyline = function (polyline) {
            _this.map.removeLayer(polyline);
            _this.drawingPolyline = undefined;
        };
        L.mapbox.accessToken = "pk.eyJ1IjoiZGFuaWVsLWt1b24iLCJhIjoiY2lldnVtY29iMDBiOHQxbTBvZzBqZWl6cCJ9.UEc2YqH59pB1YTpv22vg8A";
        this.map = L.mapbox.map("map", "mapbox.streets")
            .setView([51, 10], 9);
        this.map.addEventListener("mousemove", function (e) {
            if (_this.getMapMode() === MapMode.RouteDrawing) {
                _this.drawingLatLng.lat = e.latlng.lat;
                _this.drawingLatLng.lng = e.latlng.lng;
                _this.drawingPolyline.redraw();
            }
            for (var _i = 0, _a = _this.waypointMarkers; _i < _a.length; _i++) {
                var marker = _a[_i];
                if (marker.point.distanceTo(e.containerPoint) < 100)
                    marker.setOpacity(marker.waypoint.isDummy() ? 0.5 : 1);
                else
                    marker.setOpacity(0.1);
            }
        });
        this.map.addEventListener("click", function (e) {
            if (_this.getMapMode() === MapMode.RouteDrawing) {
                var waypoint = new Waypoint(e.latlng, MarkerType.Waypoint);
                waypoint.addToPolyline(_this.drawingPolyline);
                addDummyHandle(_this.drawingPolyline);
                removeFromPolyline(_this.drawingPolyline, _this.drawingLatLng);
                _this.drawingPolyline = _this.addPolyline(waypoint);
                _this.drawingLatLng = new L.LatLng(e.latlng.lat, e.latlng.lng);
                _this.drawingPolyline.addLatLng(_this.drawingLatLng);
            }
        });
        this.map.addEventListener("dblclick", function (e) {
            if (_this.getMapMode() === MapMode.RouteDrawing) {
                e.originalEvent.cancelBubble = true;
                e.originalEvent.preventDefault();
                e.originalEvent.stopPropagation();
                _this.drawingPolyline.addLatLng(e.latlng);
                _this.drawingLatLng = e.latlng;
            }
        });
        $(document).keyup(function (e) {
            if (_this.getMapMode() === MapMode.RouteDrawing) {
                if (e.keyCode === 27) {
                    _this.removePolyline(_this.drawingPolyline);
                }
            }
        });
        this.map.addEventListener("move", function (e) {
            for (var _i = 0, _a = _this.waypointMarkers; _i < _a.length; _i++) {
                var marker = _a[_i];
                marker.point = _this.map.latLngToContainerPoint(marker.getLatLng());
            }
        });
        this.map.addEventListener("zoom", function (e) {
            for (var _i = 0, _a = _this.waypointMarkers; _i < _a.length; _i++) {
                var marker = _a[_i];
                marker.point = _this.map.latLngToContainerPoint(marker.getLatLng());
            }
        });
        this.harbours = ko.observableArray();
        this.selectedHarbour = ko.observable();
        this.selectedWaypoint = ko.observable();
        this.editingHarbour = ko.observable();
        this.editingWaypoint = ko.observable();
        this.waypointMarkers = new Array();
    }
    SailingMapViewModel.prototype.addHarbour = function () {
        var harbour = new Harbour("Hafen " + this.harbours.length, this.map.getCenter());
        this.harbours.push(harbour);
    };
    SailingMapViewModel.prototype.copyHarbour = function (h1, h2) {
        this.copyWaypoint(h1, h2);
        h2.name(h1.name());
        h2.description(h1.description());
    };
    SailingMapViewModel.prototype.copyWaypoint = function (w1, w2) {
        w2.waypointNumber(w1.waypointNumber());
        w2.latitude(w1.latitude());
        w2.longitude(w1.longitude());
    };
    SailingMapViewModel.prototype.addPolyline = function (arg) {
        var polyline = new L.Polyline([]);
        polyline.addTo(this.map);
        polyline.waypoints = new Array();
        if (arg !== undefined)
            if (arg instanceof Waypoint)
                arg.addToPolyline(polyline);
            else
                for (var _i = 0, _a = arg; _i < _a.length; _i++) {
                    var waypoint = _a[_i];
                    waypoint.addToPolyline(polyline);
                }
        return polyline;
    };
    SailingMapViewModel.prototype.getMapMode = function () {
        if (this.drawingPolyline !== undefined && this.drawingLatLng !== undefined)
            return MapMode.RouteDrawing;
        return MapMode.View;
    };
    return SailingMapViewModel;
})();
var model = new SailingMapViewModel();
ko.applyBindings(model);
//# sourceMappingURL=Map.js.map