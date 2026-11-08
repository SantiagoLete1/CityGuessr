const CIUDAD = JSON.parse(document.body.dataset.ciudad);
const MAPILLARY_TOKEN = document.body.dataset.token;

const MARGEN_GRADOS = 0.004;
const CANDIDATAS_POR_CONSULTA = 100;
const MAX_INTENTOS = 10;

const DISTANCIA_PERFECTA_METROS = 15;
const DISTANCIA_MAXIMA_METROS = 5000;
const PUNTAJE_MAXIMO = 5000;
const ESCALA_DECAIMIENTO_METROS = 1000;

const CENTRO_CIUDAD = [
    (CIUDAD.norte + CIUDAD.sur) / 2,
    (CIUDAD.oeste + CIUDAD.este) / 2,
];
const ZOOM_INICIAL = 11;

const btnAdivinar = document.getElementById("btn-adivinar");
const btnNueva = document.getElementById("btn-nueva");

let visor;
let minimapa;
let capaRonda;
let ubicacionReal = null;
let marcadorJugador = null;
let adivinado = false;
let siguienteUbicacion = null;

function puntoAleatorio() {
    return {
        lat: CIUDAD.sur + Math.random() * (CIUDAD.norte - CIUDAD.sur),
        lng: CIUDAD.oeste + Math.random() * (CIUDAD.este - CIUDAD.oeste),
    };
}

async function buscarImagen(punto) {
    const bbox = [
        punto.lng - MARGEN_GRADOS,
        punto.lat - MARGEN_GRADOS,
        punto.lng + MARGEN_GRADOS,
        punto.lat + MARGEN_GRADOS,
    ].join(",");

    const params = new URLSearchParams({
        access_token: MAPILLARY_TOKEN,
        bbox: bbox,
        fields: "id,computed_geometry,is_pano",
        limit: CANDIDATAS_POR_CONSULTA,
    });

    const respuesta = await fetch(`https://graph.mapillary.com/images?${params}`);
    if (!respuesta.ok) {
        throw new Error(`Mapillary respondió ${respuesta.status}`);
    }

    const { data } = await respuesta.json();
    const panoramas = (data || []).filter((imagen) => imagen.is_pano);
    if (panoramas.length === 0) {
        return null;
    }
    return panoramas[Math.floor(Math.random() * panoramas.length)];
}

async function encontrarUbicacionValida() {
    for (let i = 0; i < MAX_INTENTOS; i++) {
        const imagen = await buscarImagen(puntoAleatorio());
        if (imagen) {
            return imagen;
        }
    }
    return null;
}

function calcularPuntaje(distanciaMetros) {
    if (distanciaMetros <= DISTANCIA_PERFECTA_METROS) {
        return PUNTAJE_MAXIMO;
    }
    if (distanciaMetros >= DISTANCIA_MAXIMA_METROS) {
        return 0;
    }
    return Math.round(PUNTAJE_MAXIMO * Math.exp(-distanciaMetros / ESCALA_DECAIMIENTO_METROS));
}

function formatearDistancia(metros) {
    return metros < 1000
        ? `${Math.round(metros)} m`
        : `${(metros / 1000).toFixed(2)} km`;
}

function iniciarMinimapa() {
    minimapa = L.map("minimapa", { zoomControl: true }).setView(CENTRO_CIUDAD, ZOOM_INICIAL);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
    }).addTo(minimapa);

    capaRonda = L.layerGroup().addTo(minimapa);

    minimapa.on("click", (e) => colocarMarcador(e.latlng));

    new ResizeObserver(() => minimapa.invalidateSize()).observe(
        document.getElementById("minimapa")
    );
}

function colocarMarcador(latlng) {
    if (adivinado) {
        return;
    }
    if (marcadorJugador) {
        marcadorJugador.setLatLng(latlng);
    } else {
        marcadorJugador = L.marker(latlng).addTo(capaRonda);
    }
    btnAdivinar.disabled = false;
}

function adivinar() {
    if (!marcadorJugador || !ubicacionReal || adivinado) {
        return;
    }
    adivinado = true;

    const posicionJugador = marcadorJugador.getLatLng();
    const distancia = ubicacionReal.distanceTo(posicionJugador);
    const puntaje = calcularPuntaje(distancia);

    L.circleMarker(ubicacionReal, {
        radius: 9,
        color: "#16a34a",
        fillColor: "#22c55e",
        fillOpacity: 1,
    }).addTo(capaRonda);

    L.polyline([ubicacionReal, posicionJugador], {
        color: "#f1f5f9",
        weight: 3,
        dashArray: "6 8",
    }).addTo(capaRonda);

    document.getElementById("minimapa").classList.add("minimapa--resultado");
    btnAdivinar.hidden = true;
    minimapa.invalidateSize();
    minimapa.fitBounds(L.latLngBounds([ubicacionReal, posicionJugador]), { padding: [50, 50] });

    document.getElementById("resultado-puntaje").textContent = `${puntaje} puntos`;
    document.getElementById("resultado-distancia").textContent =
        `Estabas a ${formatearDistancia(distancia)} de la ubicación real`;
    document.getElementById("resultado").hidden = false;
}

function precargarSiguiente() {
    siguienteUbicacion = encontrarUbicacionValida().catch((error) => {
        console.error(error);
        return null;
    });
}

function iniciarRonda(imagen) {
    const [lng, lat] = imagen.computed_geometry.coordinates;
    ubicacionReal = L.latLng(lat, lng);

    if (visor) {
        visor.moveTo(imagen.id).catch(console.error);
    } else {
        const { Viewer } = mapillary;
        visor = new Viewer({
            accessToken: MAPILLARY_TOKEN,
            container: "panorama",
            imageId: imagen.id,
        });
    }

    precargarSiguiente();
}

function reiniciarInterfaz() {
    capaRonda.clearLayers();
    marcadorJugador = null;
    adivinado = false;

    document.getElementById("minimapa").classList.remove("minimapa--resultado");
    document.getElementById("resultado").hidden = true;
    btnAdivinar.disabled = true;
    btnAdivinar.hidden = false;

    minimapa.invalidateSize();
    minimapa.setView(CENTRO_CIUDAD, ZOOM_INICIAL);
}

async function nuevaRonda() {
    btnNueva.disabled = true;
    btnNueva.textContent = "Cargando...";
    try {
        const imagen = (await siguienteUbicacion) || (await encontrarUbicacionValida());
        if (!imagen) {
            alert("No se pudo encontrar una ubicación. Probá de nuevo.");
            return;
        }
        reiniciarInterfaz();
        iniciarRonda(imagen);
    } catch (error) {
        console.error(error);
        alert("Error al cargar la ronda. Revisá la consola (F12).");
    } finally {
        btnNueva.disabled = false;
        btnNueva.textContent = "Jugar de nuevo";
    }
}

async function initGame() {
    iniciarMinimapa();

    try {
        const imagen = await encontrarUbicacionValida();
        if (!imagen) {
            alert("No se pudo encontrar una ubicación. Recargá la página.");
            return;
        }
        iniciarRonda(imagen);
    } catch (error) {
        console.error(error);
        alert("Error al cargar el juego. Revisá la consola (F12).");
    }
}

btnAdivinar.addEventListener("click", adivinar);
btnNueva.addEventListener("click", nuevaRonda);
initGame();