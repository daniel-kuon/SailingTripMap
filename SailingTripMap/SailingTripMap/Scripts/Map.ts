function getMiddle(pol: L.Polyline): L.LatLng {
    const start = pol.getLatLngs()[0];
    const end = pol.getLatLngs()[1];
    return new L.LatLng(start.lat + ((end.lat - start.lat) / 2), start.lng + ((end.lng - start.lng) / 2));
}

function distance(latLngStart: L.LatLng, latLngEnd: L.LatLng) {
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

enum MarkerType {
    Harbour,
    Dummy,
    Waypoint,
    WeatherStation
}

abstract class MapPoint {
    constructor(latLng: L.LatLng, markerType: MarkerType) {
        this.latitude = ko.observable<number>(latLng.lat);
        this.longitude = ko.observable<number>(latLng.lng);
        this.latLng = new L.LatLng(latLng.lat, latLng.lng);
        this.latitude.subscribe((value) => {
            if (this.latLng.lat !== value) {
                this.latLng.lat = value;
            }
        });
        this.longitude.subscribe((value) => {
            if (this.latLng.lng !== value) {
                this.latLng.lng = value;
            }
        });
        this.markerType = markerType;
        const options: L.MarkerOptions = {
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
        const marker = new L.Marker(this.latLng, options);
        marker.addTo(model.map);
        marker.waypoint = this;
        this.marker = marker;
        marker.addEventListener("drag", (e: L.LeafletMouseEvent) => {
            this.setLatLng(this.marker.getLatLng());
        });

    }

    setLatLng(latLng: L.LatLng): void {
        this.latLng.lat = latLng.lat;
        this.latLng.lng = latLng.lng;
        this.latitude(latLng.lat);
        this.longitude(latLng.lng);
        this.redraw();
    }

    redraw(): void {
        this.marker.setLatLng(this.latLng);
    }

    centerOnMap() {
        model.map.setView(this.latLng);
    }

    removeFromMap() {
        model.map.removeLayer(this.marker);
    }

    isDummy(): boolean {
        return this.markerType === MarkerType.Dummy;
    }

    latitude: KnockoutObservable<number>;
    longitude: KnockoutObservable<number>;
    latLng: L.LatLng;
    protected markerType: MarkerType;
    protected marker: L.Marker;
}

class Waypoint extends MapPoint {
    constructor(latLng: L.LatLng, markerType: MarkerType) {
        super(latLng, markerType);
        this.latLng.polylines = new Array();
        this.latLng.waypoint = this;
        this.waypointNumber = ko.observable<number>();
        this.latitude.subscribe((value) => {
            if (this.latLng.lat !== value) {
                this.redraw();
            }
        });
        this.longitude.subscribe((value) => {
            if (this.latLng.lng !== value) {
                this.redraw();
            }
        });
        this.polylines = new Array<L.Polyline>();
        if (markerType === MarkerType.Waypoint || markerType === MarkerType.Dummy) {
            model.waypointMarkers.push(this.marker);
            this.marker.point = model.map.latLngToContainerPoint(this.latLng);
        }
        this.marker.addEventListener("click", (e: L.LeafletMouseEvent) => {
            if (this.markerType === MarkerType.Dummy)
                this.convertFromDummyHandle();
            if (model.getMapMode() === MapMode.RouteDrawing) {
                if (!this.isInPolyline(model.drawingPolyline)) {
                    this.addToPolyline(model.drawingPolyline);
                    removeFromPolyline(model.drawingPolyline, model.drawingLatLng);
                    addDummyHandle(model.drawingPolyline);
                    model.drawingPolyline = undefined;
                    model.drawingLatLng = undefined;
                } else {
                    removePolyline(model.drawingPolyline);
                    model.drawingPolyline = undefined;
                    model.drawingLatLng = undefined;
                }
            }
        });
        this.marker.addEventListener("dblclick", (e: L.LeafletMouseEvent) => {
            model.drawingPolyline = model.addPolyline(this);
            model.drawingLatLng = new L.LatLng(e.latlng.lat, e.latlng.lng);
            model.drawingPolyline.addLatLng(model.drawingLatLng);
        });
        if (this.markerType === MarkerType.Dummy)
            this.marker.addOneTimeEventListener("drag", (e: L.LeafletMouseEvent) => {
                this.convertFromDummyHandle();
            });
    }

    redraw(): void {
        super.redraw();
        for (let i = 0; i < this.polylines.length; i++)
            redrawPolyline(this.polylines[i]);
    }

    private convertFromDummyHandle() {
        this.marker.setOpacity(1);
        splitPolyline(this.polylines[0]);
        this.markerType = MarkerType.Waypoint;
    }

    isInPolyline(polyline: L.Polyline): boolean {
        for (const currentPolyline of this.polylines) {
            if (polyline === currentPolyline)
                return true;
        }
        return false;
    }

    removeFromMap() {
        if (this.markerType !== MarkerType.Dummy)
            for (let polyline of this.polylines)
                removePolyline(polyline);
        super.removeFromMap();
    }

    addToPolyline(polyline: L.Polyline): boolean {
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
    }

    removeFromPolyline(polyline: L.Polyline): boolean {
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
    }

    removeIfHasZeroOrOnePolylines(): boolean {
        return true;
    }

    waypointNumber: KnockoutObservable<number>;
    private polylines: L.Polyline[];
}

function splitPolyline(polyline: L.Polyline) {
    if (polyline.waypoints.length === 2 && polyline.dummyHandle instanceof Waypoint) {
        const w1 = polyline.waypoints[0];
        const w2 = polyline.dummyHandle;
        const w3 = polyline.waypoints[1];
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


function removePolyline(polyline: L.Polyline) {
    for (let waypoint of polyline.waypoints) {
        waypoint.removeFromPolyline(polyline);
    }
    if (polyline.dummyHandle !== undefined) {
        polyline.dummyHandle.removeFromPolyline(polyline);
        polyline.dummyHandle.removeFromMap();
    }
    model.map.removeLayer(polyline);
}

function addDummyHandle(polyline: L.Polyline) {
    if (polyline.dummyHandle === undefined) {
        polyline.dummyHandle = new Waypoint(getMiddle(polyline), MarkerType.Dummy);
        polyline.dummyHandle.addToPolyline(polyline);
    }
}

function redrawPolyline(polyline: L.Polyline) {
    const middleLatLng = getMiddle(polyline);
    if (polyline.dummyHandle === undefined)
        addDummyHandle(polyline);
    if (polyline.dummyHandle.longitude() !== middleLatLng.lng || polyline.dummyHandle.latitude() !== middleLatLng.lat)
        polyline.dummyHandle.setLatLng(middleLatLng);
    else
        polyline.redraw();
}

function removeFromPolyline(polyline: L.Polyline, latLng: L.LatLng) {
    removeFromArray(polyline.getLatLngs(), latLng);
    polyline.redraw();
}

function removeFromArray<T>(arr: T[], obj: T): boolean {
    const tmpArr = new Array<T>();
    for (let item of arr) {
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

class Harbour extends Waypoint {
    constructor(name: string, latitude: number, longitude: number);
    constructor(name: string, latLng: L.LatLng);
    constructor(name: string, arg2: number|L.LatLng, longitude?: number) {
        super(arg2 instanceof L.LatLng ? <L.LatLng>arg2 : new L.LatLng(<number>arg2, longitude), MarkerType.Harbour);
        this.name = ko.observable<string>(name);
        this.description = ko.observable<string>("");
    }

    name: KnockoutObservable<string>;
    description: KnockoutObservable<string>;

    removeIfHasZeroOrOnePolylines(): boolean {
        return false;
    }
}

enum MapMode {
    View,
    RouteDrawing
}

declare namespace L {
    export interface Polyline extends Path {

        waypoints: Array<Waypoint>;
        dummyHandle: Waypoint;
    }

    export interface LatLng {
        polylines: Polyline[];
        waypoint: Waypoint;
    }

    export interface Marker {
        waypoint: MapPoint;
        point: L.Point;
    }

    export interface CircleMarker {
        waypoint: Waypoint;
    }

    export interface PathOptions {
        draggable: boolean;
    }
}

class SailingMapViewModel {
    drawingPolyline: L.Polyline;
    map: L.Map;
    waypointMarkers: L.Marker[];
    harbours: KnockoutObservableArray<Harbour>;
    selectedHarbour: KnockoutObservable<Harbour>;
    selectedWaypoint: KnockoutObservable<Waypoint>;
    editingHarbour: KnockoutObservable<Harbour>;
    editingWaypoint: KnockoutObservable<Waypoint>;

    constructor() {
        L.mapbox.accessToken = "pk.eyJ1IjoiZGFuaWVsLWt1b24iLCJhIjoiY2lldnVtY29iMDBiOHQxbTBvZzBqZWl6cCJ9.UEc2YqH59pB1YTpv22vg8A";
        this.map = L.mapbox.map("map", "mapbox.streets")
            .setView([51, 10], 9);
        this.map.addEventListener("mousemove", (e: L.LeafletMouseEvent) => {
            if (this.getMapMode() === MapMode.RouteDrawing) {
                this.drawingLatLng.lat = e.latlng.lat;
                this.drawingLatLng.lng = e.latlng.lng;
                this.drawingPolyline.redraw();
            }
            for (let marker of this.waypointMarkers) {
                if (marker.point.distanceTo(e.containerPoint) < 100)
                    marker.setOpacity(marker.waypoint.isDummy() ? 0.5 : 1);
                else
                    marker.setOpacity(0.1);
            }
        });
        this.map.addEventListener("click", (e: L.LeafletMouseEvent) => {
            if (this.getMapMode() === MapMode.RouteDrawing) {
                const waypoint = new Waypoint(e.latlng, MarkerType.Waypoint);
                waypoint.addToPolyline(this.drawingPolyline);
                addDummyHandle(this.drawingPolyline);
                removeFromPolyline(this.drawingPolyline, this.drawingLatLng);
                this.drawingPolyline = this.addPolyline(waypoint);
                this.drawingLatLng = new L.LatLng(e.latlng.lat, e.latlng.lng);
                this.drawingPolyline.addLatLng(this.drawingLatLng);
            }
        });

        this.map.addEventListener("dblclick", (e: L.LeafletMouseEvent) => {
            if (this.getMapMode() === MapMode.RouteDrawing) {
                e.originalEvent.cancelBubble = true;
                e.originalEvent.preventDefault();
                e.originalEvent.stopPropagation();
                this.drawingPolyline.addLatLng(e.latlng);
                this.drawingLatLng = e.latlng;
            }
        });
        $(document).keyup((e: JQueryKeyEventObject) => {
            if (this.getMapMode() === MapMode.RouteDrawing) {
                if (e.keyCode === 27) {
                    this.removePolyline(this.drawingPolyline);
                }
            }
        });
        this.map.addEventListener("move", (e: L.LeafletMouseEvent) => {
            for (let marker of this.waypointMarkers) {
                marker.point = this.map.latLngToContainerPoint(marker.getLatLng());
            }
        });
        this.map.addEventListener("zoom", (e: L.LeafletMouseEvent) => {
            for (let marker of this.waypointMarkers) {
                marker.point = this.map.latLngToContainerPoint(marker.getLatLng());
            }
        });
        this.harbours = ko.observableArray<Harbour>();
        this.selectedHarbour = ko.observable<Harbour>();
        this.selectedWaypoint = ko.observable<Waypoint>();

        this.editingHarbour = ko.observable<Harbour>();
        this.editingWaypoint = ko.observable<Waypoint>();
        this.waypointMarkers = new Array();
    }

    addHarbour(): void {
        const harbour = new Harbour(`Hafen ${this.harbours.length}`, this.map.getCenter());
        this.harbours.push(harbour);
    }

    removeHarbour = () => {
        this.selectedHarbour().removeFromMap();
        this.harbours.remove(this.selectedHarbour());
    };
    centerWaypoint = (harbour: Harbour) => {
        harbour.centerOnMap();
    };
    selectHarbour = (harbour: Harbour) => {
        this.selectedHarbour(harbour);
    };

    copyHarbour(h1: Harbour, h2: Harbour): void {
        this.copyWaypoint(h1, h2);
        h2.name(h1.name());
        h2.description(h1.description());
    }

    copyWaypoint(w1: Waypoint, w2: Waypoint) {
        w2.waypointNumber(w1.waypointNumber());
        w2.latitude(w1.latitude());
        w2.longitude(w1.longitude());
    }

    addPolyline(waypoint?: Waypoint): L.Polyline;
    addPolyline(waypoints?: Waypoint[]): L.Polyline;
    addPolyline(arg?): L.Polyline {
        const polyline = new L.Polyline([]);
        polyline.addTo(this.map);
        polyline.waypoints = new Array();
        if (arg !== undefined)
            if (arg instanceof Waypoint)
            (<Waypoint>arg).addToPolyline(polyline);
            else
                for (let waypoint of <Waypoint[]>arg) {
                    waypoint.addToPolyline(polyline);
                }
        return polyline;
    }

    drawingLatLng: L.LatLng;
    drawingSourceWaypoint: Waypoint;
    drawingTargetWaypoint: Waypoint;
    removePolyline = (polyline: L.Polyline) => {
        this.map.removeLayer(polyline);
        this.drawingPolyline = undefined;
    };

    getMapMode(): MapMode {
        if (this.drawingPolyline !== undefined && this.drawingLatLng !== undefined)
            return MapMode.RouteDrawing;
        return MapMode.View;
    }
}


var model = new SailingMapViewModel();
ko.applyBindings(model);