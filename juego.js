let jugador;
let enemigo;
let teclas;
let interfaz;
let textoEstado;

let vidaJugador = 100;
let vidaEnemigo = 100;
let furia = 0;

let ataqueActual = null;
let bloqueando = false;
let combateTerminado = false;

// Pose de victoria del ganador.
let ganadorFinal = null;
let victoriaIniciada = false;
let victoriaDesde = 0;

let ultimaPulsacionAbajo = -Infinity;
let comboEspecialHasta = -Infinity;

const BASE_MS = 30;
const CELDA = 256;      // tamaño de cada cuadro de la hoja (antes 128)
// Tamaño de los luchadores. Con 1.8, Diamante mide ~280 px de alto (casi 40 % de la pantalla).
// Prueba 1.6 (más pequeño) o 2.0 (más grande) si quieres ajustarlo.
const ESCALA = 1.8;

// Todo lo que se mide en píxeles (alcances, cajas, velocidad) se ajusta con esta proporción.
// Las distancias originales estaban pensadas para la escala 1.25.
const PROPORCION = ESCALA / 1.25;
const VELOCIDAD = 300 * PROPORCION;
// El piso del fondo ocupa aprox. y=500..637; los pies se apoyan hacia su zona media.
const SUELO_Y = 600;

// Cuadro de la animación "ataque_especial" en el que aparecen los pinchos.
const CUADRO_PINCHOS = 170;

const ATAQUES = {
    golpe_1: {
        dano: 8,
        alcance: 95,
        desde: 32,
        hasta: 37
    },
    patada: {
        dano: 12,
        alcance: 115,
        desde: 19,
        hasta: 23
    },
    salto_ataque: {
        dano: 14,
        alcance: 115,
        desde: 99,
        hasta: 108
    },
    ataque_especial: {
        dano: 25,
        alcance: 180, // ya no se usa: el daño lo hacen los pinchos
        desde: 174,   // pinchos completamente fuera
        hasta: 181
    }
};

const configuracion = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    parent: "juego",
    backgroundColor: "#173526",

    // Los sprites ahora están reducidos con suavizado, así que se ven mejor sin pixelArt.
    pixelArt: false,
    antialias: true,

    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },

    physics: {
        default: "arcade",
        arcade: {
            gravity: { y: 1200 },
            debug: false
        }
    },

    scene: {
        preload: cargar,
        create: crear,
        update: actualizar
    }
};

const juego = new Phaser.Game(configuracion);

// --------------------------------------------------
// CARGAR RECURSOS
// --------------------------------------------------

function cargar() {
    this.load.spritesheet(
        "diamante",
        "assets/diamante_spritesheet_animaciones.png",
        {
            frameWidth: CELDA,
            frameHeight: CELDA
        }
    );

    this.load.json(
        "animacionesDiamante",
        "assets/diamante_animaciones.json"
    );

    // Fondo del escenario (1024x576, se estira a 1280x720).
    this.load.image("fondo", "assets/fondo.png");
}

// --------------------------------------------------
// CREAR ANIMACIONES
// --------------------------------------------------

function crearAnimaciones(escena) {
    const datos = escena.cache.json.get("animacionesDiamante");

    const convertir = (lista) => lista.map((f) => ({
        key: "diamante",
        frame: f.frame,
        duration: Math.max(0, f.duration_ms - BASE_MS)
    }));

    // Crea todas las animaciones del JSON:
    // idle, patada, golpe_1..3, salto_*, ataque_*, bloqueo_inicio, bloqueo,
    // golpeado, caida, tumbado, pinchos, etc.
    for (const [nombre, animacion] of Object.entries(datos.animations)) {
        if (escena.anims.exists(nombre)) continue;

        escena.anims.create({
            key: nombre,
            frames: convertir(animacion.frames),
            frameRate: 1000 / BASE_MS,
            repeat: animacion.loop ? -1 : 0
        });
    }

    if (!escena.anims.exists("correr")) {
        escena.anims.create({
            key: "correr",
            frames: convertir(
                datos.animations.embestida.frames.slice(3, 22)
            ),
            frameRate: 1000 / BASE_MS,
            repeat: -1
        });
    }
}

// --------------------------------------------------
// CREAR LUCHADOR
// --------------------------------------------------

function crearLuchador(escena, x) {
    const luchador = escena.physics.add.sprite(
        x,
        SUELO_Y - 200,
        "diamante",
        0
    );

    luchador.setOrigin(0.5, 1);
    luchador.setScale(ESCALA);
    luchador.setCollideWorldBounds(true);

    // Caja de colisión (en píxeles de la celda de 256).
    luchador.body.setSize(72, 156);
    luchador.body.setOffset(92, 96);

    // Tiempo hasta el que el luchador está aturdido por un golpe.
    luchador.aturdidoHasta = 0;

    return luchador;
}

// --------------------------------------------------
// CREAR ESCENA
// --------------------------------------------------

function crear() {
    vidaJugador = 100;
    vidaEnemigo = 100;
    furia = 0;

    ataqueActual = null;
    bloqueando = false;
    combateTerminado = false;

    ganadorFinal = null;
    victoriaIniciada = false;

    ultimaPulsacionAbajo = -Infinity;
    comboEspecialHasta = -Infinity;

    this.physics.world.setBounds(0, 0, 1280, SUELO_Y);

    this.add.image(640, 360, "fondo")
        .setDisplaySize(1280, 720)
        .setDepth(-10); // detrás de luchadores e interfaz

    crearAnimaciones(this);

    jugador = crearLuchador(this, 400);
    enemigo = crearLuchador(this, 880);

    enemigo.setTint(0xff8080);
    enemigo.setImmovable(true);
    enemigo.setDragX(900); // frena el retroceso al recibir un golpe

    this.physics.add.collider(jugador, enemigo);

    teclas = this.input.keyboard.addKeys({
        left: "LEFT",
        right: "RIGHT",
        up: "UP",
        down: "DOWN",
        golpe: "Z",
        patada: "X",
        reiniciar: "R"
    });

    this.input.keyboard.addCapture([
        Phaser.Input.Keyboard.KeyCodes.LEFT,
        Phaser.Input.Keyboard.KeyCodes.RIGHT,
        Phaser.Input.Keyboard.KeyCodes.UP,
        Phaser.Input.Keyboard.KeyCodes.DOWN
    ]);

    jugador.play("idle");
    enemigo.play("idle");

    interfaz = this.add.graphics().setDepth(100);

    textoEstado = this.add.text(40, 110, "", {
        fontFamily: "Arial",
        fontSize: "20px",
        color: "#ffffff"
    }).setDepth(100);

    this.add.text(
        40,
        150,
        "← → Mover | ↑ Saltar | ↓ Bloquear | Z Golpe | X Patada\n" +
        "En el aire: X Ataque aéreo | ↓ ↓ Z Especial con furia llena",
        {
            fontFamily: "Arial",
            fontSize: "20px",
            color: "#ffffff",
            lineSpacing: 8
        }
    ).setDepth(100);

    dibujarInterfaz();
}

// --------------------------------------------------
// VIDA Y FURIA
// --------------------------------------------------

function dibujarInterfaz() {
    interfaz.clear();

    // Marcos de vida.
    interfaz.fillStyle(0xffffff);
    interfaz.fillRect(38, 28, 404, 34);
    interfaz.fillRect(838, 28, 404, 34);

    // Fondos de vida.
    interfaz.fillStyle(0x242424);
    interfaz.fillRect(40, 30, 400, 30);
    interfaz.fillRect(840, 30, 400, 30);

    // Vida del jugador.
    interfaz.fillStyle(0x44dd88);
    interfaz.fillRect(40, 30, vidaJugador * 4, 30);

    // Vida del rival.
    const anchoRival = vidaEnemigo * 4;

    interfaz.fillStyle(0xff7777);
    interfaz.fillRect(1240 - anchoRival, 30, anchoRival, 30);

    // Barra de furia.
    interfaz.fillStyle(0xffffff);
    interfaz.fillRect(38, 73, 304, 24);

    interfaz.fillStyle(0x242424);
    interfaz.fillRect(40, 75, 300, 20);

    interfaz.fillStyle(furia === 100 ? 0xccff44 : 0x33ccff);
    interfaz.fillRect(40, 75, furia * 3, 20);

    textoEstado.setText(
        "Vida: " + vidaJugador +
        " | Rival: " + vidaEnemigo +
        " | Furia: " + furia + "/100" +
        (furia === 100 ? " — ¡Especial disponible!" : "")
    );
}

// --------------------------------------------------
// INICIAR ATAQUE
// --------------------------------------------------

function atacar(nombreAnimacion) {
    if (ataqueActual || combateTerminado) return;

    const datos = ATAQUES[nombreAnimacion];

    if (!datos || !jugador.scene.anims.exists(nombreAnimacion)) {
        return;
    }

    if (nombreAnimacion === "ataque_especial") {
        if (furia < 100) return;

        furia = 0;
        dibujarInterfaz();
    }

    bloqueando = false;
    jugador.clearTint();

    ataqueActual = {
        ...datos,
        alcance: datos.alcance * PROPORCION,
        nombre: nombreAnimacion,
        acerto: false,
        efecto: null,
        direccion: jugador.flipX ? -1 : 1
    };

    if (jugador.body.onFloor()) {
        jugador.setVelocityX(0);
    }

    jugador.once("animationcomplete-" + nombreAnimacion, () => {
        ataqueActual = null;
    });

    jugador.play(nombreAnimacion);
}

// --------------------------------------------------
// PINCHOS DEL ATAQUE ESPECIAL
// --------------------------------------------------

// Los pinchos son un sprite aparte que aparece delante del luchador,
// a la misma distancia que en el GIF original.
function lanzarPinchos() {
    const escena = jugador.scene;
    const datos = escena.cache.json.get("animacionesDiamante");
    const info = datos.effects.pinchos;

    // Conversión de píxeles del GIF original a píxeles de pantalla.
    const k = datos.native_to_cell_scale * ESCALA;
    const dir = ataqueActual.direccion;

    const efecto = escena.add.sprite(
        jugador.x + dir * info.offset_x_native * k,
        jugador.y + info.offset_y_native * k,
        "diamante",
        217
    );

    efecto.setOrigin(0.5, 1);
    efecto.setScale(ESCALA);
    efecto.setFlipX(dir === -1);
    efecto.setDepth(5);

    efecto.play("pinchos");
    efecto.once("animationcomplete", () => efecto.destroy());

    ataqueActual.efecto = efecto;
}

function comprobarEspecial(cuadro) {
    // 1) Crear los pinchos cuando la animación llega a su cuadro.
    if (!ataqueActual.efecto && cuadro >= CUADRO_PINCHOS) {
        lanzarPinchos();
    }

    // 2) Hacer daño mientras los pinchos están en pie.
    const efecto = ataqueActual.efecto;

    if (
        !efecto || !efecto.active || ataqueActual.acerto ||
        cuadro < ataqueActual.desde || cuadro > ataqueActual.hasta
    ) {
        return;
    }

    const cajaPinchos = new Phaser.Geom.Rectangle(
        efecto.x - 90 * PROPORCION,
        efecto.y - 170 * PROPORCION,
        180 * PROPORCION,
        170 * PROPORCION
    );

    const cajaRival = new Phaser.Geom.Rectangle(
        enemigo.body.x,
        enemigo.body.y,
        enemigo.body.width,
        enemigo.body.height
    );

    if (Phaser.Geom.Intersects.RectangleToRectangle(cajaPinchos, cajaRival)) {
        ataqueActual.acerto = true;
        recibirDano(enemigo, ataqueActual.dano, ataqueActual.direccion);
    }
}

// --------------------------------------------------
// DETECTAR IMPACTOS
// --------------------------------------------------

function comprobarImpacto() {
    if (!ataqueActual) return;

    const cuadro = Number(jugador.frame.name);

    if (ataqueActual.nombre === "ataque_especial") {
        comprobarEspecial(cuadro);
        return;
    }

    if (ataqueActual.acerto) return;

    if (
        cuadro < ataqueActual.desde ||
        cuadro > ataqueActual.hasta
    ) {
        return;
    }

    const cuerpo = jugador.body;
    const esAereo = ataqueActual.nombre === "salto_ataque";

    const cajaAtaque = new Phaser.Geom.Rectangle(
        ataqueActual.direccion === 1
            ? cuerpo.right
            : cuerpo.left - ataqueActual.alcance,
        cuerpo.top + 10 * PROPORCION,
        ataqueActual.alcance,
        cuerpo.height - 20 * PROPORCION + (esAereo ? 50 * PROPORCION : 0)
    );

    const cajaRival = new Phaser.Geom.Rectangle(
        enemigo.body.x,
        enemigo.body.y,
        enemigo.body.width,
        enemigo.body.height
    );

    if (!Phaser.Geom.Intersects.RectangleToRectangle(
        cajaAtaque,
        cajaRival
    )) {
        return;
    }

    // Se guardan los datos antes de golpear: si el golpe termina el combate,
    // ataqueActual puede cambiar durante recibirDano().
    const ataque = ataqueActual;

    ataque.acerto = true;

    recibirDano(enemigo, ataque.dano, ataque.direccion);

    // Los ataques normales acertados recargan la furia.
    if (ataque.nombre !== "ataque_especial") {
        furia = Math.min(100, furia + 10);
    }

    dibujarInterfaz();
}

// --------------------------------------------------
// REACCIÓN AL GOLPE
// --------------------------------------------------

// direccion: 1 si el golpe viene desde la izquierda, -1 desde la derecha.
function reaccionarGolpe(objetivo, direccion) {
    const escena = objetivo.scene;

    // Un golpe interrumpe cualquier ataque en curso del objetivo.
    if (objetivo === jugador) {
        ataqueActual = null;
    }

    objetivo.aturdidoHasta = escena.time.now + 450;

    // Retroceso con un pequeño salto.
    objetivo.setVelocityX(direccion * 280);
    objetivo.setVelocityY(-280);

    objetivo.play("golpeado");
}

// Esta función también servirá cuando añadamos ataques del enemigo.
function recibirDano(objetivo, cantidad, direccion = 1) {
    if (combateTerminado) return;

    if (objetivo === jugador) {
        if (bloqueando) {
            // El bloqueo reduce el daño un 70 % y apenas empuja.
            const dano = Math.max(1, Math.round(cantidad * 0.3));

            vidaJugador = Math.max(0, vidaJugador - dano);

            jugador.setVelocityX(direccion * 120);
            jugador.setTintFill(0x88ccff);

            jugador.scene.time.delayedCall(80, () => {
                if (jugador.active) jugador.clearTint();
            });
        } else {
            vidaJugador = Math.max(0, vidaJugador - cantidad);
            reaccionarGolpe(jugador, direccion);
        }
    } else {
        vidaEnemigo = Math.max(0, vidaEnemigo - cantidad);

        reaccionarGolpe(enemigo, direccion);

        objetivo.setTintFill(0xffffff);

        objetivo.scene.time.delayedCall(100, () => {
            if (objetivo.active) objetivo.setTint(0xff8080);
        });
    }

    dibujarInterfaz();

    if (vidaJugador === 0) {
        terminarCombate(false);
    } else if (vidaEnemigo === 0) {
        terminarCombate(true);
    }
}

// --------------------------------------------------
// FINALIZAR COMBATE
// --------------------------------------------------

function terminarCombate(ganoJugador) {
    combateTerminado = true;
    bloqueando = false;

    jugador.clearTint();

    const perdedor = ganoJugador ? enemigo : jugador;
    const ganador = ganoJugador ? jugador : enemigo;

    // Quien pierde sale despedido hacia atrás; el otro se queda quieto.
    const haciaAtras = perdedor.x < ganador.x ? -1 : 1;

    ganador.setVelocityX(0);
    perdedor.setVelocityX(haciaAtras * 220);
    perdedor.setVelocityY(-320);

    // Elimina posibles callbacks de ataque en ambos luchadores.
    [perdedor, ganador].forEach((luchador) => {
        luchador.removeAllListeners("animationcomplete-golpe_1");
        luchador.removeAllListeners("animationcomplete-patada");
        luchador.removeAllListeners("animationcomplete-salto_ataque");
        luchador.removeAllListeners("animationcomplete-ataque_especial");
    });

    // El ganador hará su pose de victoria cuando esté en el suelo,
    // pasado un instante para que se vea la caída del rival.
    ganadorFinal = ganador;
    victoriaIniciada = false;
    victoriaDesde = jugador.scene.time.now + 600;

    perdedor.once("animationcomplete-caida", () => {
        perdedor.setFrame(189); // primer cuadro de "tumbado"
    });

    perdedor.play("caida");

    jugador.scene.add.text(
        640,
        270,
        (ganoJugador ? "¡Ganaste!" : "Has perdido") +
        "\nPulsa R para reiniciar",
        {
            fontFamily: "Arial",
            fontSize: "36px",
            color: "#ffffff",
            align: "center"
        }
    ).setOrigin(0.5).setDepth(100);
}

// --------------------------------------------------
// ACTUALIZAR
// --------------------------------------------------

function actualizar(tiempo) {
    // Al terminar: el perdedor termina de caer y se frena al tocar el suelo.
    if (combateTerminado) {
        // Si el ganador estaba atacando, ese ataque se corta aquí
        // (no en terminarCombate, que se llama en pleno golpe).
        ataqueActual = null;

        // Pose de victoria del ganador (animación "pose_final", en bucle).
        if (
            !victoriaIniciada &&
            tiempo >= victoriaDesde &&
            ganadorFinal.body.onFloor()
        ) {
            victoriaIniciada = true;
            ganadorFinal.setVelocityX(0);
            ganadorFinal.clearTint();
            ganadorFinal.play("pose_final");
        }

        [jugador, enemigo].forEach((p) => {
            if (p.body.onFloor() && !p.anims.isPlaying) {
                p.setVelocityX(0);
            }
        });

        if (Phaser.Input.Keyboard.JustDown(teclas.reiniciar)) {
            this.scene.restart();
        }
        return;
    }

    // Enemigo: mientras está aturdido se ve la animación de golpe;
    // después vuelve a su guardia.
    if (tiempo >= enemigo.aturdidoHasta) {
        enemigo.play("idle", true);
    }

    // Leer las pulsaciones una vez por actualización.
    const pulsaAbajo = Phaser.Input.Keyboard.JustDown(teclas.down);
    const pulsaGolpe = Phaser.Input.Keyboard.JustDown(teclas.golpe);
    const pulsaPatada = Phaser.Input.Keyboard.JustDown(teclas.patada);
    const pulsaSalto = Phaser.Input.Keyboard.JustDown(teclas.up);

    // Registrar la combinación ↓ ↓.
    // Cada pulsación requiere soltar y volver a pulsar la tecla.
    if (pulsaAbajo) {
        if (tiempo - ultimaPulsacionAbajo <= 350) {
            comboEspecialHasta = tiempo + 400;
            ultimaPulsacionAbajo = -Infinity;
        } else {
            ultimaPulsacionAbajo = tiempo;
            comboEspecialHasta = -Infinity;
        }
    }

    comprobarImpacto();

    if (combateTerminado) return;

    const enSuelo = jugador.body.onFloor();

    // Jugador aturdido: no controla nada hasta recuperarse.
    if (tiempo < jugador.aturdidoHasta) {
        return;
    }

    // No interrumpir un ataque con otra acción.
    if (ataqueActual) {
        if (enSuelo) jugador.setVelocityX(0);
        return;
    }

    jugador.setFlipX(jugador.x > enemigo.x);
    enemigo.setFlipX(enemigo.x > jugador.x);

    // Especial: ↓ ↓ Z con furia completa.
    if (
        enSuelo &&
        pulsaGolpe &&
        tiempo <= comboEspecialHasta &&
        furia === 100
    ) {
        comboEspecialHasta = -Infinity;
        atacar("ataque_especial");
        return;
    }

    // Bloquear manteniendo ↓ en el suelo.
    // Se usa el muro de cristal: sube (bloqueo_inicio) y se mantiene (bloqueo).
    bloqueando = enSuelo && teclas.down.isDown;

    if (bloqueando) {
        jugador.setVelocityX(0);

        const clave = jugador.anims.currentAnim?.key;

        if (clave !== "bloqueo_inicio" && clave !== "bloqueo") {
            jugador.play("bloqueo_inicio");
        } else if (clave === "bloqueo_inicio" && !jugador.anims.isPlaying) {
            jugador.play("bloqueo");
        }
        return;
    }

    jugador.clearTint();

    // Movimiento.
    let moviendose = false;

    jugador.setVelocityX(0);

    if (teclas.left.isDown) {
        jugador.setVelocityX(-VELOCIDAD);
        moviendose = true;
    } else if (teclas.right.isDown) {
        jugador.setVelocityX(VELOCIDAD);
        moviendose = true;
    }

    // Saltar. Si se pulsa X a la vez, inicia el ataque aéreo.
    if (pulsaSalto && enSuelo) {
        jugador.setVelocityY(-650);

        if (pulsaPatada) {
            atacar("salto_ataque");
        } else {
            jugador.play("salto_voltereta");
        }

        return;
    }

    // X durante el salto: ataque aéreo.
    if (!enSuelo && pulsaPatada) {
        atacar("salto_ataque");
        return;
    }

    // Ataques terrestres.
    if (enSuelo && pulsaGolpe) {
        comboEspecialHasta = -Infinity;
        atacar("golpe_1");
        return;
    }

    if (enSuelo && pulsaPatada) {
        atacar("patada");
        return;
    }

    // Animaciones de movimiento y reposo.
    if (!enSuelo) {
        if (jugador.anims.currentAnim?.key !== "salto_voltereta") {
            jugador.play("salto_voltereta");
        }
    } else if (moviendose) {
        jugador.play("correr", true);
    } else {
        jugador.play("idle", true);
    }
}