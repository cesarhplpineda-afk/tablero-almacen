/* ===== Estado y utilidades ===== */
const STORAGE_KEY = "tablero_almacen_v2";
const HOY = () => new Date().toISOString().slice(0,10);

function uid(p){ return p + "_" + Math.random().toString(36).slice(2,9); }
function clamp0(n){ n = Math.round(Number(n)); return isNaN(n) || n < 0 ? 0 : n; }
function pct(num, den){ if(!den || den <= 0) return 0; return Math.min(100, Math.round((num/den)*100)); }
function horaActual(){ return new Date().getHours(); }
function colorPct(p){ if(p >= 90) return "var(--green)"; if(p >= 60) return "var(--amber)"; return "var(--red)"; }
function fmtHora(iso){
  if(!iso) return "sin actualizar";
  const d = new Date(iso);
  return d.toLocaleTimeString("es-MX", {hour:"2-digit", minute:"2-digit"});
}
function barra(p){ return `<div class="bar"><div style="width:${p}%;background:${colorPct(p)}"></div></div>`; }

function estadoDefault(){
  return {
    turno: "1er turno",
    actualizado: null,
    picking: {
      metaTurno: 0,
      metaHora: 0,
      avanceTurno: 0,
      avanceDia: 0,
      horas: {}
    },
    camionetas: {
      metaTurno: 0,
      metaHora: 0,
      avanceTurno: 0,
      avanceDia: 0,
      horas: {}
    },
    albaranes: [],
    embarques: {
      unidades: []
    },
    ferretero: {
      meta: 55,
      etapas: { pronostico:0, programadas:0, liberadas:0, surtiendo:0, cargando:0, cerradas:0 },
      camionetas: [],
      horas: {}
    },
    ciclos: {
      passSet: false,
      passHash: null,
      embarques: {},
      ferreteroCamioneta: {},
      ferreteroTurno: 0
    }
  };
}

let estado = estadoDefault();
let unlocked = false;

const ETAPAS_EMBARQUE = ["programado","liberado","surtiendo","armando","armado","compactado","cargado"];
const ETAPAS_EMBARQUE_LABEL = {
  programado:"Programado", liberado:"Liberado", surtiendo:"Surtiendo",
  armando:"Armando", armado:"Armado", compactado:"Compactado", cargado:"Cargado"
};
const ETAPAS_SFOR = ["pronostico","programadas","liberadas","surtiendo","cargando","cerradas"];
const ETAPAS_SFOR_LABEL = {
  pronostico:"Pronostico", programadas:"Programadas", liberadas:"Liberadas",
  surtiendo:"Surtiendo", cargando:"Cargando", cerradas:"Cerradas"
};

/* ===== Persistencia (Firestore) ===== */
let aplicandoRemoto = false;

function cargarEstado(){
  // La suscripción en tiempo real se inicia desde firebase-app.js
  // Esta función queda como no-op por compatibilidad.
}

async function guardarEstado(silencioso){
  estado.actualizado = new Date().toISOString();
  try{
    await window.tableroDB.guardar(estado);
    document.getElementById("updatedAt").textContent = "actualizado " + fmtHora(estado.actualizado);
    if(!silencioso) mostrarToast("Guardado");
    if(estadoRemotoPendiente && estadoRemotoPendiente.actualizado !== estado.actualizado){
      aplicarEstadoRemoto(estadoRemotoPendiente);
    }
  }catch(e){
    mostrarToast("Sin conexion, reintenta");
  }
}

function iniciarPolling(){
  window.tableroDB.suscribirse((nuevo) => {
    if(!nuevo){
      renderAll();
      return;
    }
    if(nuevo.actualizado === estado.actualizado) return;
    const escribiendo = document.activeElement &&
      (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "SELECT");
    if(escribiendo){
      mostrarToast("Hay cambios nuevos. Guarda y reabre para verlos.");
      estadoRemotoPendiente = nuevo;
      return;
    }
    aplicarEstadoRemoto(nuevo);
  });
}

let estadoRemotoPendiente = null;

function aplicarEstadoRemoto(nuevo){
  const wasUnlocked = unlocked;
  estado = Object.assign(estadoDefault(), nuevo);
  estado.picking = Object.assign(estadoDefault().picking, nuevo.picking || {});
  estado.camionetas = Object.assign(estadoDefault().camionetas, nuevo.camionetas || {});
  estado.ferretero = Object.assign(estadoDefault().ferretero, nuevo.ferretero || {});
  estado.ciclos = Object.assign(estadoDefault().ciclos, nuevo.ciclos || {});
  if(!Array.isArray(estado.albaranes)) estado.albaranes = [];
  if(!estado.embarques || !Array.isArray(estado.embarques.unidades)) estado.embarques = {unidades:[]};
  unlocked = wasUnlocked;
  estadoRemotoPendiente = null;
  renderAll();
}

let toastTimer = null;
function mostrarToast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
}

/* ===== Navegación ===== */
document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if(!btn) return;
  document.querySelectorAll("#tabs button").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-" + btn.dataset.view).classList.add("active");
});

/* ===== Modulo simple (Picking / Camionetas): meta turno + meta hora ===== */
function renderSimpleHora(tipo, titulo, unidad){
  const d = estado[tipo];
  const h = horaActual();
  const avanceHoraActual = d.horas[h] || 0;
  const pTurno = pct(d.avanceTurno, d.metaTurno);

  let html = "";
  html += `<div class="card">
    <h2>${titulo} — avance del turno</h2>
    <div class="row"><span class="big" style="color:${colorPct(pTurno)}">${d.avanceTurno}</span><span class="label">de ${d.metaTurno} ${unidad}</span></div>
    ${barra(pTurno)}
    <div class="row" style="margin-top:8px"><span class="sub">acumulado del dia</span><span class="sub">${d.avanceDia} ${unidad}</span></div>
  </div>`;

  html += `<div class="card">
    <h2>Metas</h2>
    <div class="grid2">
      <div><label>Meta del turno</label><input type="number" min="0" id="${tipo}-metaTurno" value="${d.metaTurno}"></div>
      <div><label>Meta por hora</label><input type="number" min="0" id="${tipo}-metaHora" value="${d.metaHora}"></div>
    </div>
    <p class="smallnote">La meta por hora se sugiere sola segun la meta del turno, pero la puedes ajustar a mano.</p>
  </div>`;

  html += `<div class="card">
    <h2>Captura — hora ${h}:00</h2>
    <div class="row"><span class="label">Avance de esta hora</span><span class="label">meta ${d.metaHora}</span></div>
    <div class="flexrow" style="margin-top:8px">
      <button class="stepbtn" data-action="hora-menos" data-tipo="${tipo}">-</button>
      <input type="number" min="0" id="${tipo}-horaInput" value="${avanceHoraActual}" style="text-align:center;font-size:18px;font-weight:700">
      <button class="stepbtn primary" data-action="hora-mas" data-tipo="${tipo}">+</button>
    </div>
    ${barra(pct(avanceHoraActual, d.metaHora))}
  </div>`;

  html += renderHistorialHoras(tipo, unidad);

  html += `<button class="primary" style="width:100%" data-action="guardar-${tipo}">Guardar cambios</button>`;

  document.getElementById("view-" + tipo).innerHTML = html;

  document.getElementById(`${tipo}-metaTurno`).addEventListener("change", e => {
    estado[tipo].metaTurno = clamp0(e.target.value);
  });
  document.getElementById(`${tipo}-metaHora`).addEventListener("change", e => {
    estado[tipo].metaHora = clamp0(e.target.value);
  });
  document.getElementById(`${tipo}-horaInput`).addEventListener("change", e => {
    estado[tipo].horas[h] = clamp0(e.target.value);
    recalcAvanceTurno(tipo);
  });
  document.querySelector(`[data-action="hora-mas"][data-tipo="${tipo}"]`).addEventListener("click", async () => {
    estado[tipo].horas[h] = clamp0((estado[tipo].horas[h] || 0) + 1);
    estado[tipo].avanceDia = clamp0(estado[tipo].avanceDia + 1);
    recalcAvanceTurno(tipo);
    await guardarEstado(true);
    renderSimpleHora(tipo, titulo, unidad);
  });
  document.querySelector(`[data-action="hora-menos"][data-tipo="${tipo}"]`).addEventListener("click", async () => {
    const actual = estado[tipo].horas[h] || 0;
    if(actual <= 0) return;
    estado[tipo].horas[h] = actual - 1;
    estado[tipo].avanceDia = clamp0(estado[tipo].avanceDia - 1);
    recalcAvanceTurno(tipo);
    await guardarEstado(true);
    renderSimpleHora(tipo, titulo, unidad);
  });
  document.querySelector(`[data-action="guardar-${tipo}"]`).addEventListener("click", async () => {
    await guardarEstado();
    renderAll();
  });
}

function recalcAvanceTurno(tipo){
  const horas = estado[tipo].horas;
  let total = 0;
  Object.keys(horas).forEach(h => { total += (horas[h] || 0); });
  estado[tipo].avanceTurno = total;
}

function renderHistorialHoras(tipo, unidad){
  const horas = estado[tipo].horas;
  const keys = Object.keys(horas).map(Number).sort((a,b) => a-b);
  if(keys.length === 0) return "";
  let html = `<div class="card"><h2>Historial por hora</h2>`;
  keys.forEach(h => {
    const v = horas[h];
    const p = pct(v, estado[tipo].metaHora);
    html += `<div class="row" style="padding:5px 0;border-bottom:1px solid var(--border)">
      <span class="sub">${h}:00</span>
      <span class="sub" style="color:${colorPct(p)}">${v} ${unidad} (${p}%)</span>
    </div>`;
  });
  html += `</div>`;
  return html;
}

/* ===== Albaranes: rezago + hoy ===== */
function renderAlbaranes(){
  const lista = estado.albaranes;
  const hoy = HOY();
  const rezago = lista.filter(a => a.fecha !== hoy);
  const deHoy = lista.filter(a => a.fecha === hoy);
  const totalAvance = lista.length ? Math.round(lista.reduce((s,a) => s + (a.avance||0), 0) / lista.length) : 0;

  let html = `<div class="card">
    <h2>Resumen del turno</h2>
    <div class="grid2">
      <div><div class="big">${rezago.length}</div><div class="label">rezago (ayer/antier)</div></div>
      <div><div class="big">${deHoy.length}</div><div class="label">de hoy</div></div>
    </div>
    <div class="row" style="margin-top:10px"><span class="label">Avance promedio</span><span class="label" style="color:${colorPct(totalAvance)}">${totalAvance}%</span></div>
    ${barra(totalAvance)}
  </div>`;

  html += `<button class="primary" style="width:100%;margin-bottom:10px" data-action="add-albaran">Agregar albaran</button>`;

  if(rezago.length){
    html += `<h2 style="font-size:12px;color:var(--text2);margin:10px 0 6px">Rezago — se queda para trabajar</h2>`;
    rezago.forEach(a => { html += renderAlbaranRow(a); });
  }
  if(deHoy.length){
    html += `<h2 style="font-size:12px;color:var(--text2);margin:14px 0 6px">De hoy</h2>`;
    deHoy.forEach(a => { html += renderAlbaranRow(a); });
  }
  if(!lista.length){
    html += `<p class="smallnote">Aun no hay albaranes capturados en este turno.</p>`;
  }

  document.getElementById("view-albaranes").innerHTML = html;

  document.querySelector('[data-action="add-albaran"]').addEventListener("click", async () => {
    estado.albaranes.push({ id: uid("alb"), folio: "", fecha: hoy, movimientos: 0, avance: 0 });
    await guardarEstado(true);
    renderAlbaranes();
  });

  document.querySelectorAll(".albaran-row").forEach(row => {
    const id = row.dataset.id;
    const a = lista.find(x => x.id === id);
    if(!a) return;
    row.querySelector(".alb-folio").addEventListener("change", e => { a.folio = e.target.value; });
    row.querySelector(".alb-fecha").addEventListener("change", e => { a.fecha = e.target.value; });
    row.querySelector(".alb-mov").addEventListener("change", e => { a.movimientos = clamp0(e.target.value); });
    row.querySelector(".alb-avance").addEventListener("change", e => {
      a.avance = Math.min(100, clamp0(e.target.value));
    });
    row.querySelector(".alb-del").addEventListener("click", async () => {
      estado.albaranes = estado.albaranes.filter(x => x.id !== id);
      await guardarEstado(true);
      renderAlbaranes();
    });
  });

  const saveBtn = document.createElement("button");
  saveBtn.className = "primary";
  saveBtn.style.width = "100%";
  saveBtn.style.marginTop = "10px";
  saveBtn.textContent = "Guardar cambios";
  saveBtn.addEventListener("click", async () => { await guardarEstado(); renderAll(); });
  document.getElementById("view-albaranes").appendChild(saveBtn);
}

function renderAlbaranRow(a){
  const p = a.avance || 0;
  return `<div class="card albaran-row" data-id="${a.id}">
    <div class="grid2">
      <div><label>Folio</label><input class="alb-folio" value="${a.folio||""}" placeholder="Numero de albaran"></div>
      <div><label>Fecha</label><input class="alb-fecha" type="date" value="${a.fecha}"></div>
    </div>
    <div class="grid2" style="margin-top:8px">
      <div><label>Movimientos</label><input class="alb-mov" type="number" min="0" value="${a.movimientos||0}"></div>
      <div><label>Avance %</label><input class="alb-avance" type="number" min="0" max="100" value="${p}"></div>
    </div>
    ${barra(p)}
    <button class="ghost deleteBtn alb-del" style="width:100%;margin-top:8px">Eliminar</button>
  </div>`;
}

/* ===== Trailers / Tortones: unidades con 7 etapas ===== */
function renderEmbarques(){
  const unidades = estado.embarques.unidades;
  let html = `<button class="primary" style="width:100%;margin-bottom:10px" data-action="add-unidad">Agregar trailer o torton</button>`;

  if(!unidades.length){
    html += `<p class="smallnote">No hay unidades activas. Agrega un trailer o torton para empezar a capturar sus etapas.</p>`;
  }

  unidades.forEach(u => { html += renderUnidadCard(u); });

  document.getElementById("view-embarques").innerHTML = html;

  document.querySelector('[data-action="add-unidad"]').addEventListener("click", async () => {
    const nueva = {
      id: uid("unidad"), tipo: "Trailer", folio: "", etapas: {}
    };
    ETAPAS_EMBARQUE.forEach(e => nueva.etapas[e] = 0);
    estado.embarques.unidades.push(nueva);
    await guardarEstado(true);
    renderEmbarques();
  });

  unidades.forEach(u => {
    const card = document.querySelector(`[data-unidad="${u.id}"]`);
    if(!card) return;
    card.querySelector(".un-tipo").addEventListener("change", e => { u.tipo = e.target.value; });
    card.querySelector(".un-folio").addEventListener("change", e => { u.folio = e.target.value; });
    ETAPAS_EMBARQUE.forEach(et => {
      const inp = card.querySelector(`[data-etapa="${et}"]`);
      if(inp) inp.addEventListener("change", e => {
        u.etapas[et] = Math.min(100, clamp0(e.target.value));
        renderEmbarques();
      });
    });
    card.querySelector(".un-del").addEventListener("click", async () => {
      estado.embarques.unidades = estado.embarques.unidades.filter(x => x.id !== u.id);
      await guardarEstado(true);
      renderEmbarques();
    });
  });

  const saveBtn = document.createElement("button");
  saveBtn.className = "primary";
  saveBtn.style.width = "100%";
  saveBtn.style.marginTop = "10px";
  saveBtn.textContent = "Guardar cambios";
  saveBtn.addEventListener("click", async () => { await guardarEstado(); renderAll(); });
  document.getElementById("view-embarques").appendChild(saveBtn);
}

function etapaActivaPct(u){
  let activa = "programado", valor = 0;
  for(let i = ETAPAS_EMBARQUE.length - 1; i >= 0; i--){
    const e = ETAPAS_EMBARQUE[i];
    if(u.etapas[e] > 0){ activa = e; valor = u.etapas[e]; break; }
  }
  return { etapa: activa, valor };
}

function renderUnidadCard(u){
  const act = etapaActivaPct(u);
  let html = `<div class="card unit-card" data-unidad="${u.id}">
    <div class="grid2">
      <div><label>Tipo</label><select class="un-tipo">
        <option ${u.tipo==="Trailer"?"selected":""}>Trailer</option>
        <option ${u.tipo==="Torton"?"selected":""}>Torton</option>
      </select></div>
      <div><label>Folio / referencia</label><input class="un-folio" value="${u.folio||""}" placeholder="ej. T-104"></div>
    </div>
    <div class="row" style="margin-top:8px">
      <span class="sub">Etapa actual</span>
      <span class="pill" style="background:var(--panel2);color:var(--text)">${ETAPAS_EMBARQUE_LABEL[act.etapa]} ${act.valor}%</span>
    </div>
    <div class="stage-grid">`;
  ETAPAS_EMBARQUE.forEach(e => {
    html += `<div class="stage-chip">
      <div class="nm">${ETAPAS_EMBARQUE_LABEL[e]}</div>
      <input data-etapa="${e}" type="number" min="0" max="100" value="${u.etapas[e]||0}" style="margin-top:4px">
    </div>`;
  });
  html += `</div>
    <button class="ghost deleteBtn un-del" style="width:100%;margin-top:10px">Eliminar unidad</button>
  </div>`;
  return html;
}

/* ===== Ferretero (rutas ferreteras tipo SFOR) ===== */
function renderFerretero(){
  const f = estado.ferretero;
  const h = horaActual();
  const horaActualVal = f.horas[h] || {};

  let html = `<div class="card">
    <h2>Meta del dia</h2>
    <input type="number" min="0" id="fer-meta" value="${f.meta}">
  </div>`;

  html += `<div class="card"><h2>Parametros — hora ${h}:00</h2>`;
  ETAPAS_SFOR.forEach(e => {
    const v = f.etapas[e] || 0;
    const p = pct(v, f.meta);
    html += `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--border)">
      <span class="label">${ETAPAS_SFOR_LABEL[e]}</span>
      <input data-sfor="${e}" type="number" min="0" value="${v}" style="width:80px;text-align:right">
    </div>`;
  });
  html += `</div>`;

  html += `<div class="card">
    <h2><i class="ti ti-chart-bar" style="margin-right:5px"></i>Avance general vs meta</h2>
    <div style="position:relative;height:220px">
      <canvas id="chart-sfor"></canvas>
    </div>
  </div>`;

  html += `<button class="primary" style="width:100%;margin-bottom:10px" data-action="add-camioneta">Agregar camioneta</button>`;

  f.camionetas.forEach(c => { html += renderCamionetaFerretero(c); });

  html += `<button class="primary" style="width:100%;margin-top:6px" data-action="guardar-fer">Guardar cambios</button>`;

  document.getElementById("view-ferretero").innerHTML = html;

  if(window.chartSfor){ try{ window.chartSfor.destroy(); }catch(e){} }
  const ctxSfor = document.getElementById("chart-sfor");
  if(ctxSfor){
    const valores = ETAPAS_SFOR.map(e => f.etapas[e] || 0);
    const colores = valores.map(v => colorHexPct(pct(v, f.meta)));
    window.chartSfor = new Chart(ctxSfor, {
      type: "bar",
      data: {
        labels: ETAPAS_SFOR.map(e => ETAPAS_SFOR_LABEL[e]),
        datasets: [{
          data: valores,
          backgroundColor: colores,
          borderRadius: 6,
          maxBarThickness: 28
        }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display:false } },
        scales: {
          x: { beginAtZero:true, suggestedMax: f.meta, grid:{ color:"#eef0f3" }, ticks:{ font:{ size:11 } } },
          y: { grid:{ display:false }, ticks:{ font:{ size:11, weight:600 } } }
        }
      }
    });
  }

  document.getElementById("fer-meta").addEventListener("change", e => { f.meta = clamp0(e.target.value); });
  document.querySelectorAll("[data-sfor]").forEach(inp => {
    inp.addEventListener("change", e => { f.etapas[inp.dataset.sfor] = clamp0(e.target.value); });
  });
  document.querySelector('[data-action="add-camioneta"]').addEventListener("click", async () => {
    f.camionetas.push({ id: uid("cam"), folio: "", etapas: {} });
    ETAPAS_SFOR.forEach(e => { f.camionetas[f.camionetas.length-1].etapas[e] = 0; });
    await guardarEstado(true);
    renderFerretero();
  });
  f.camionetas.forEach(c => {
    const card = document.querySelector(`[data-camioneta="${c.id}"]`);
    if(!card) return;
    card.querySelector(".cam-folio").addEventListener("change", e => { c.folio = e.target.value; });
    ETAPAS_SFOR.forEach(e => {
      const inp = card.querySelector(`[data-cetapa="${e}"]`);
      if(inp) inp.addEventListener("change", ev => { c.etapas[e] = Math.min(100, clamp0(ev.target.value)); });
    });
    card.querySelector(".cam-del").addEventListener("click", async () => {
      f.camionetas = f.camionetas.filter(x => x.id !== c.id);
      await guardarEstado(true);
      renderFerretero();
    });
  });
  document.querySelector('[data-action="guardar-fer"]').addEventListener("click", async () => {
    await guardarEstado();
    renderAll();
  });
}

function renderCamionetaFerretero(c){
  let html = `<div class="card unit-card" data-camioneta="${c.id}">
    <label>Camioneta / folio</label>
    <input class="cam-folio" value="${c.folio||""}" placeholder="ej. CAM-12">
    <div class="stage-grid">`;
  ETAPAS_SFOR.forEach(e => {
    html += `<div class="stage-chip">
      <div class="nm">${ETAPAS_SFOR_LABEL[e]}</div>
      <input data-cetapa="${e}" type="number" min="0" max="100" value="${c.etapas[e]||0}" style="margin-top:4px">
    </div>`;
  });
  html += `</div>
    <button class="ghost deleteBtn cam-del" style="width:100%;margin-top:10px">Eliminar camioneta</button>
  </div>`;
  return html;
}

/* ===== Tiempos ciclo (protegido con clave) ===== */
async function simpleHash(str){
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

function renderCiclos(){
  const c = estado.ciclos;
  if(!unlocked){
    if(!c.passSet){
      renderCiclosCrearClave();
    } else {
      renderCiclosPedirClave();
    }
    return;
  }
  renderCiclosContenido();
}

function renderCiclosCrearClave(){
  let html = `<div class="lockbox">
    <p class="label">Esta seccion es solo para ti. Crea una clave para protegerla.</p>
    <input type="password" id="nueva-clave" placeholder="Crea tu clave" style="margin-top:10px">
    <button class="primary" style="width:100%;margin-top:10px" id="btn-crear-clave">Crear clave y entrar</button>
  </div>`;
  document.getElementById("view-ciclos").innerHTML = html;
  document.getElementById("btn-crear-clave").addEventListener("click", async () => {
    const val = document.getElementById("nueva-clave").value;
    if(!val){ mostrarToast("Escribe una clave"); return; }
    estado.ciclos.passHash = await simpleHash(val);
    estado.ciclos.passSet = true;
    unlocked = true;
    await guardarEstado(true);
    renderCiclos();
  });
}

function renderCiclosPedirClave(){
  let html = `<div class="lockbox">
    <p class="label">Seccion protegida. Escribe tu clave para entrar.</p>
    <input type="password" id="clave-input" placeholder="Tu clave" style="margin-top:10px">
    <button class="primary" style="width:100%;margin-top:10px" id="btn-entrar">Entrar</button>
  </div>`;
  document.getElementById("view-ciclos").innerHTML = html;
  document.getElementById("btn-entrar").addEventListener("click", async () => {
    const val = document.getElementById("clave-input").value;
    const hash = await simpleHash(val);
    if(hash === estado.ciclos.passHash){
      unlocked = true;
      renderCiclos();
    } else {
      mostrarToast("Clave incorrecta");
    }
  });
  document.getElementById("clave-input").addEventListener("keydown", e => {
    if(e.key === "Enter") document.getElementById("btn-entrar").click();
  });
}

function renderCiclosContenido(){
  const c = estado.ciclos;
  let html = `<div class="card"><h2>Trailers / tortones — tiempo ciclo por etapa (minutos)</h2>`;
  ETAPAS_EMBARQUE.forEach(e => {
    const v = c.embarques[e] || 0;
    html += `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--border)">
      <span class="label">${ETAPAS_EMBARQUE_LABEL[e]}</span>
      <input data-cicloemb="${e}" type="number" min="0" value="${v}" style="width:80px;text-align:right">
    </div>`;
  });
  html += `</div>`;

  html += `<div class="card"><h2>Ferretero — tiempo ciclo por camioneta (minutos)</h2>`;
  if(!estado.ferretero.camionetas.length){
    html += `<p class="smallnote">Agrega camionetas en la pestaña Ferretero para poder ponerles tiempo ciclo.</p>`;
  }
  estado.ferretero.camionetas.forEach(cam => {
    const v = c.ferreteroCamioneta[cam.id] || 0;
    html += `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--border)">
      <span class="label">${cam.folio || "Sin folio"}</span>
      <input data-ciclocam="${cam.id}" type="number" min="0" value="${v}" style="width:80px;text-align:right">
    </div>`;
  });
  html += `</div>`;

  html += `<div class="card"><h2>Ferretero — tiempo ciclo por turno (minutos)</h2>
    <input type="number" min="0" id="ciclo-turno" value="${c.ferreteroTurno || 0}">
  </div>`;

  html += `<button class="primary" style="width:100%" id="btn-guardar-ciclos">Guardar cambios</button>
  <button class="ghost" style="width:100%;margin-top:8px" id="btn-salir-ciclos">Salir de esta seccion</button>`;

  document.getElementById("view-ciclos").innerHTML = html;

  document.querySelectorAll("[data-cicloemb]").forEach(inp => {
    inp.addEventListener("change", e => { c.embarques[inp.dataset.cicloemb] = clamp0(e.target.value); });
  });
  document.querySelectorAll("[data-ciclocam]").forEach(inp => {
    inp.addEventListener("change", e => { c.ferreteroCamioneta[inp.dataset.ciclocam] = clamp0(e.target.value); });
  });
  document.getElementById("ciclo-turno").addEventListener("change", e => { c.ferreteroTurno = clamp0(e.target.value); });
  document.getElementById("btn-guardar-ciclos").addEventListener("click", async () => {
    await guardarEstado();
  });
  document.getElementById("btn-salir-ciclos").addEventListener("click", () => {
    unlocked = false;
    renderCiclos();
  });
}

/* ===== Resumen general ===== */
let chartsResumen = [];

function destruirChartsResumen(){
  chartsResumen.forEach(c => { try{ c.destroy(); }catch(e){} });
  chartsResumen = [];
}

function colorHexPct(p){
  if(p >= 90) return "#16a34a";
  if(p >= 60) return "#d97706";
  return "#dc2626";
}

function crearDona(canvasId, p, sizePx){
  const ctx = document.getElementById(canvasId);
  if(!ctx) return null;
  const color = colorHexPct(p);
  const chart = new Chart(ctx, {
    type: "doughnut",
    data: {
      datasets: [{
        data: [p, 100 - p],
        backgroundColor: [color, "#eef0f3"],
        borderWidth: 0
      }]
    },
    options: {
      cutout: "72%",
      responsive: false,
      plugins: { legend: { display:false }, tooltip: { enabled:false } },
      animation: { duration: 500 }
    }
  });
  chartsResumen.push(chart);
  return chart;
}

function moduloMini(id, icono, titulo, pct_, sub, franjaColor, bgIcono, colorIcono){
  return `<div class="card" style="text-align:center;padding:14px 10px;border-top:3px solid ${franjaColor}">
    <div style="width:40px;height:40px;margin:0 auto 6px;background:${bgIcono};border-radius:10px;display:flex;align-items:center;justify-content:center">
      <i class="ti ${icono}" style="font-size:22px;color:${colorIcono}"></i>
    </div>
    <div style="position:relative;width:72px;height:72px;margin:0 auto 6px">
      <canvas id="${id}" width="72" height="72"></canvas>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800">${pct_}%</div>
    </div>
    <div style="font-size:12px;font-weight:700;color:var(--text)">${titulo}</div>
    <div class="sub" style="margin-top:2px">${sub}</div>
  </div>`;
}

function renderResumen(){
  const pPick = pct(estado.picking.avanceTurno, estado.picking.metaTurno);
  const pCam = pct(estado.camionetas.avanceTurno, estado.camionetas.metaTurno);
  const hoy = HOY();
  const albRezago = estado.albaranes.filter(a => a.fecha !== hoy).length;
  const albHoy = estado.albaranes.filter(a => a.fecha === hoy).length;
  const albAvance = estado.albaranes.length ? Math.round(estado.albaranes.reduce((s,a)=>s+(a.avance||0),0)/estado.albaranes.length) : 0;
  const unidadesActivas = estado.embarques.unidades.length;
  const unidadesAvgPct = unidadesActivas ? Math.round(estado.embarques.unidades.reduce((s,u) => {
    const vals = ETAPAS_EMBARQUE.map(e => u.etapas[e]||0);
    return s + Math.max(...vals, 0);
  }, 0) / unidadesActivas) : 0;
  const fPct = pct(estado.ferretero.etapas.cerradas, estado.ferretero.meta);

  const general = Math.round((pPick + albAvance + unidadesAvgPct + pCam + fPct) / 5);

  let html = `<div class="card">
    <h2><i class="ti ti-clock" style="margin-right:5px"></i>Turno actual</h2>
    <select id="sel-turno">
      <option ${estado.turno==="1er turno"?"selected":""}>1er turno</option>
      <option ${estado.turno==="2do turno"?"selected":""}>2do turno</option>
      <option ${estado.turno==="3er turno"?"selected":""}>3er turno</option>
    </select>
  </div>`;

  html += `<div class="card" style="text-align:center;padding:22px 16px">
    <div class="label" style="margin-bottom:4px">Avance general del turno</div>
    <div style="position:relative;width:160px;height:160px;margin:8px auto">
      <canvas id="dona-general" width="160" height="160"></canvas>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <span style="font-size:34px;font-weight:800;line-height:1;color:${colorPct(general)}">${general}%</span>
        <span class="sub" style="margin-top:4px">promedio de 5 areas</span>
      </div>
    </div>
  </div>`;

  html += `<div class="grid2">`;
  html += moduloMini("dona-picking", "ti-package", "Picking", pPick, estado.picking.avanceTurno+"/"+estado.picking.metaTurno, "var(--accent)", "var(--red-bg)", "var(--accent)");
  html += moduloMini("dona-albaranes", "ti-file-text", "Albaranes", albAvance, albRezago+" rezago, "+albHoy+" hoy", "var(--truper-amarillo)", "var(--amber-bg)", "#b45309");
  html += moduloMini("dona-camionetas", "ti-truck-delivery", "Camionetas", pCam, estado.camionetas.avanceTurno+"/"+estado.camionetas.metaTurno, "var(--accent)", "var(--red-bg)", "var(--accent)");
  html += moduloMini("dona-ferretero", "ti-tool", "Ferretero", fPct, estado.ferretero.etapas.cerradas+"/"+estado.ferretero.meta, "var(--truper-amarillo)", "var(--amber-bg)", "#b45309");
  html += `</div>`;

  html += `<div class="card" style="border-top:3px solid var(--accent)">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:48px;height:48px;flex:0 0 auto;background:var(--red-bg);border-radius:12px;display:flex;align-items:center;justify-content:center">
        <i class="ti ti-truck" style="font-size:26px;color:var(--accent)"></i>
      </div>
      <div style="flex:1">
        <div class="row"><span class="label">Trailers / tortones activos</span><span class="big" style="font-size:20px">${unidadesActivas}</span></div>
        <div class="sub" style="margin-top:2px">avance promedio de etapa: ${unidadesAvgPct}%</div>
      </div>
    </div>
    ${barra(unidadesAvgPct)}
  </div>`;

  document.getElementById("view-resumen").innerHTML = html;
  document.getElementById("turnoTitle").innerHTML = '<i class="ti ti-building-warehouse" style="margin-right:6px;color:var(--accent)"></i>Tablero de Almacen SFOR <span style="color:#9ca3af;font-weight:500;font-size:13px"> — ' + estado.turno + '</span>';

  document.getElementById("sel-turno").addEventListener("change", async e => {
    estado.turno = e.target.value;
    await guardarEstado(true);
    renderResumen();
  });

  destruirChartsResumen();
  crearDona("dona-general", general, 160);
  crearDona("dona-picking", pPick, 84);
  crearDona("dona-albaranes", albAvance, 84);
  crearDona("dona-camionetas", pCam, 84);
  crearDona("dona-ferretero", fPct, 84);
}

/* ===== Render general y arranque ===== */
function renderAll(){
  renderResumen();
  renderSimpleHora("picking", "Picking", "movimientos");
  renderAlbaranes();
  renderEmbarques();
  renderSimpleHora("camionetas", "Camionetas", "unidades");
  renderFerretero();
  renderCiclos();
  if(estado.actualizado){
    document.getElementById("updatedAt").textContent = "actualizado " + fmtHora(estado.actualizado);
  }
}

window.iniciarTablero = function(){
  iniciarPolling();
};
